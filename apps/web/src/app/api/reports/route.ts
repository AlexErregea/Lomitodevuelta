import { NextResponse, type NextRequest } from 'next/server';
import {
  createReportRequestSchema,
  type CreateReportResponse,
  type ScoredCandidate,
} from '@lomito/shared';
import type { ReferenceReport } from '@lomito/matching';
import { PRIVACY_VERSION } from '@/content/privacidad-v1';
import { apiError } from '@/lib/api-response';
import { searchCandidates } from '@/lib/candidates';
import { hashContactValue, maskContactValue, normalizeContactValue } from '@/lib/contact';
import { requireEnv } from '@/lib/env';
import { recordEvent } from '@/lib/events';
import { toWkt } from '@/lib/geo';
import { buildManageUrl, generateManageToken, hashManageToken } from '@/lib/manage-token';
import { loadActiveMatchingConfig } from '@/lib/matching-config';
import { enqueueManageLinkNotification } from '@/lib/notifications';
import {
  WINDOWS,
  clientIp,
  consumeRateLimits,
  contactBucket,
  humanizeWait,
  ipBucket,
  loadRateLimitConfig,
} from '@/lib/rate-limit';
import { PHOTOS_BUCKET, supabaseAdmin } from '@/lib/supabase-admin';
import { verifyTurnstile } from '@/lib/turnstile';
import { runVisionPipeline } from '@/lib/vision-pipeline';

// ============================================================================
// POST /api/reports — el corazón del Flujo B (y base del A): foto(s) →
// pipeline de visión en paralelo → alta → búsqueda inmediata de candidatos.
// Regla de oro (ADR-0003): si la IA falla, el reporte SE CREA igual con
// embedding_status 'pending' y pg_cron lo completa — jamás se pierde.
// ============================================================================

/** El pipeline puede tardar ~20 s; margen para no cortar en Vercel. */
export const maxDuration = 60;

/** Solo rutas que dictó /api/uploads/sign: el cliente no referencia otras. */
const PHOTO_PATH_PATTERN = /^citizen\/\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|webp)$/;

/** Retención LFPDPPP (security-privacy.md §5): vigencia inicial de 60 días. */
const REPORT_TTL_DAYS = 60;

/** Cubeta del circuit breaker: una sola para toda la plataforma. */
const GLOBAL_REPORTS_BUCKET = 'global:reports:day';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('validation_error', 'El cuerpo debe ser JSON.');
  }
  const parsed = createReportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      'validation_error',
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  const input = parsed.data;
  if (!input.photoPaths.every((p) => PHOTO_PATH_PATTERN.test(p))) {
    return apiError('validation_error', 'photoPaths contiene rutas no emitidas por /api/uploads/sign.');
  }

  const db = supabaseAdmin();

  // ---- Defensas anti-abuso (S3-A) ------------------------------------------
  // Van ANTES de firmar lecturas, llamar a la IA o escribir nada: esta ruta es
  // la única del sistema que gasta dinero real por request, y el crédito de
  // los proveedores es prepago (un pico no genera una factura, genera un
  // apagón del pipeline). Orden deliberado: primero lo barato (una consulta a
  // la base), después la llamada de red a Cloudflare.
  const ip = clientIp(request);
  const contactValueHash = hashContactValue(input.contact.channel, input.contact.value);

  // Los umbrales viven en system_config: ajustarlos durante una prueba en campo
  // o el día del lanzamiento es un UPDATE, no un despliegue.
  const limits = await loadRateLimitConfig();
  const limit = await consumeRateLimits([
    {
      key: ipBucket('report-hour', ip),
      windowSeconds: WINDOWS.reportsPerIpHour,
      limit: limits.reportsPerIpHour,
    },
    {
      key: ipBucket('report-day', ip),
      windowSeconds: WINDOWS.reportsPerIpDay,
      limit: limits.reportsPerIpDay,
    },
    {
      key: contactBucket('report-day', contactValueHash),
      windowSeconds: WINDOWS.reportsPerContactDay,
      limit: limits.reportsPerContactDay,
    },
    {
      key: GLOBAL_REPORTS_BUCKET,
      windowSeconds: WINDOWS.globalReportsDay,
      limit: limits.maxReportsPerDay,
    },
  ]);
  if (!limit.allowed) {
    const isGlobal = limit.blockedKey === GLOBAL_REPORTS_BUCKET;
    await recordEvent({
      eventType: 'report_throttled',
      payload: { reason: isGlobal ? 'global_cap' : 'rate_limit', report_type: input.reportType },
    });
    // El tope global no es culpa de quien reporta: se le habla distinto y se
    // le responde 503, no 429 (api-contracts.md §5).
    if (isGlobal) {
      return apiError(
        'service_unavailable',
        'Estamos recibiendo muchísimos reportes ahora mismo y pausamos las altas por unas horas para no dejar el servicio sin funcionar. Por favor inténtalo más tarde: tu perro sigue siendo prioridad.',
        { 'Retry-After': String(limit.retryAfterSeconds) },
      );
    }
    return apiError(
      'rate_limited',
      `Ya recibimos varios reportes desde aquí. Vuelve a intentarlo ${humanizeWait(limit.retryAfterSeconds)}. Si necesitas reportar más perros, escríbenos.`,
      { 'Retry-After': String(limit.retryAfterSeconds) },
    );
  }

  const turnstile = await verifyTurnstile(input.turnstileToken, ip);
  if (!turnstile.ok) {
    await recordEvent({
      eventType: 'report_throttled',
      payload: { reason: 'turnstile', detail: turnstile.reason ?? null },
    });
    return apiError(
      'validation_error',
      'No pudimos verificar que eres una persona. Recarga la página e inténtalo de nuevo.',
    );
  }

  // Configuración activa del matching y zona de operación (MVP: CDMX).
  const config = await loadActiveMatchingConfig();
  const { data: zone } = await db
    .from('zones')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .single();
  if (!zone) return apiError('internal_error', 'No hay zona de operación activa.');

  // URLs firmadas de LECTURA con TTL corto, solo para alimentar las APIs de
  // visión (el bucket es privado; nada de esto se expone al cliente).
  const { data: signedReads, error: signError } = await db.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrls(input.photoPaths, 300);
  const photoUrls = (signedReads ?? [])
    .map((s) => s.signedUrl)
    .filter((u): u is string => Boolean(u));
  if (signError || photoUrls.length !== input.photoPaths.length) {
    return apiError('validation_error', 'Alguna foto no existe en Storage. Vuelve a subirla.');
  }

  await recordEvent({ eventType: 'photo_uploaded', payload: { count: input.photoPaths.length } });

  // ---- Pipeline de visión (nunca lanza: devuelve errores por separado) ----
  const vision = await runVisionPipeline(photoUrls, config.embeddingModelVersion);
  const pipelineComplete = vision.extraction !== null && vision.embeddings.every((e) => e !== null);

  // Control de contenido (ADR-0009): "no es un perro" es el único auto-bloqueo.
  const blockedNotADog = vision.extraction !== null && !vision.extraction.isDog;

  // Los datos del usuario (Flujo A) SIEMPRE ganan sobre los de la IA.
  const attributes = { ...vision.extraction?.attributes, ...input.attributes };
  const distinctiveMarks =
    input.distinctiveMarks ?? (vision.extraction?.distinctiveMarks || null);
  const marksTags = vision.extraction?.marksTags ?? [];

  // ---- Alta del reporte -----------------------------------------------------
  const manageToken = generateManageToken();
  const expiresAt = new Date(Date.now() + REPORT_TTL_DAYS * 24 * 3600 * 1000).toISOString();

  const { data: dog, error: dogError } = await db
    .from('dogs')
    .insert({
      report_type: input.reportType,
      attributes,
      distinctive_marks: distinctiveMarks,
      // Solo llega del Flujo A; en el B queda null y la ficha usa su titular genérico.
      pet_name: input.petName ?? null,
      marks_tags: marksTags,
      geo_point: toWkt(input.geo),
      address_text: input.addressText ?? null,
      zone_id: zone.id,
      event_date: input.eventDate,
      finder_note: input.finderNote ?? null,
      is_sensitive: vision.extraction?.isSensitive ?? false,
      manage_token_hash: hashManageToken(manageToken),
      embedding_status: pipelineComplete ? 'done' : 'pending',
      embedding_attempts: 1,
      embedding_last_error: vision.errors.length ? vision.errors.join(' | ') : null,
      moderation_status: blockedNotADog ? 'blocked' : 'approved',
      moderation_reason: blockedNotADog ? 'auto: la imagen no contiene un perro' : null,
      expires_at: expiresAt,
    })
    .select('id')
    .single();
  if (dogError || !dog) {
    console.error(JSON.stringify({ msg: 'dog_insert_failed', error: dogError?.message }));
    return apiError('internal_error', 'No se pudo crear el reporte. Intenta de nuevo.');
  }

  const photoRows = input.photoPaths.map((path, i) => {
    const embedding = vision.embeddings[i] ?? null;
    return {
      dog_id: dog.id,
      storage_path: path,
      is_primary: i === 0,
      is_sensitive: vision.extraction?.isSensitive ?? false,
      quality_score: i === 0 ? (vision.extraction?.qualityScore ?? null) : null,
      embedding: embedding ? `[${Array.from(embedding).join(',')}]` : null,
      embedding_model_version: embedding ? config.embeddingModelVersion : null,
    };
  });
  const { error: photosError } = await db.from('dog_photos').insert(photoRows);
  if (photosError) {
    console.error(JSON.stringify({ msg: 'photos_insert_failed', error: photosError.message }));
    return apiError('internal_error', 'No se pudieron registrar las fotos.');
  }

  const contactValue = normalizeContactValue(input.contact.channel, input.contact.value);
  const { data: contact, error: contactError } = await db
    .from('contacts')
    .insert({
      dog_id: dog.id,
      channel: input.contact.channel,
      value: contactValue,
      value_hash: contactValueHash,
      display_mask: maskContactValue(input.contact.channel, input.contact.value),
      // La versión EXACTA del aviso publicado que el usuario aceptó (LFPDPPP).
      consent_version: PRIVACY_VERSION,
    })
    .select('id')
    .single();
  if (contactError || !contact) {
    console.error(JSON.stringify({ msg: 'contact_insert_failed', error: contactError?.message }));
    return apiError('internal_error', 'No se pudo registrar el contacto.');
  }

  // ---- Embudo (observability.md §2) ----------------------------------------
  await recordEvent({
    eventType: vision.errors.length === 0 ? 'extraction_done' : 'extraction_failed',
    dogId: dog.id,
    payload: {
      latency_ms: vision.latencyMs,
      embedding_model: config.embeddingModelVersion,
      errors: vision.errors,
      // Distingue "el proveedor nos frenó" de "la inferencia falló": sin esto,
      // un problema de cupo se lee en las métricas como un pipeline roto.
      throttled: vision.throttled,
    },
  });
  await recordEvent({
    eventType: 'report_created',
    dogId: dog.id,
    payload: { report_type: input.reportType, zone: zone.id },
  });

  // ---- Búsqueda inmediata (capas 1+2) --------------------------------------
  let candidates: ScoredCandidate[] = [];
  if (!blockedNotADog) {
    const reference: ReferenceReport = {
      dogId: dog.id,
      reportType: input.reportType,
      attributes,
      marksTags,
      eventDate: input.eventDate,
      bestPhotoQuality: vision.extraction?.qualityScore ?? null,
    };
    try {
      candidates = await searchCandidates(reference, config.params);
    } catch (err) {
      // La búsqueda nunca tira el alta: el matching proactivo (capa 3) cubrirá.
      console.error(JSON.stringify({ msg: 'candidate_search_failed', error: String(err) }));
    }
    await recordEvent({
      eventType: 'candidates_shown',
      dogId: dog.id,
      payload: { count: candidates.length, max_score: candidates[0]?.totalScore ?? null },
    });
  }

  // ---- Enlace de gestión por WhatsApp (ADR-0006/0008) ----------------------
  const baseUrl = requireEnv('APP_BASE_URL');
  const manageUrl = buildManageUrl(baseUrl, dog.id, manageToken);
  await enqueueManageLinkNotification({
    dogId: dog.id,
    contactId: contact.id,
    channel: input.contact.channel,
    to: contactValue,
    manageUrl,
  });

  const response: CreateReportResponse = {
    reportId: dog.id,
    petName: input.petName ?? null,
    manageUrl,
    extracted: vision.extraction
      ? {
          attributes: vision.extraction.attributes,
          marksTags: vision.extraction.marksTags,
          qualityScore: vision.extraction.qualityScore,
        }
      : null,
    candidates,
    shareUrl: `${baseUrl}/r/${dog.id}`,
  };
  return NextResponse.json(response, { status: 201 });
}

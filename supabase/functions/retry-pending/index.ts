// ============================================================================
// Edge Function: retry-pending — red de seguridad del pipeline (ADR-0003)
// ----------------------------------------------------------------------------
// Disparador: pg_cron cada 5 minutos (con EDGE_WEBHOOK_SECRET en la cabecera).
// Regla de oro: una inferencia fallida jamás pierde un reporte.
//   1. dogs con embedding_status pending/failed y attempts < máx → reintenta
//      embedding + extracción con backoff lineal (attempts × 5 min).
//   2. notifications queued/failed con attempts < máx → reintenta el envío;
//      manage_link regenera el token (solo se guarda el hash, ADR-0006);
//      al agotar intentos, fallback a email vía Resend si hay (ADR-0008).
// ============================================================================

import { adminClient, PHOTOS_BUCKET } from '../_shared/db.ts';
import { optionalEnv, requireEnv } from '../_shared/env.ts';
import { buildManageUrl, generateManageToken, hashManageToken } from '../_shared/manage-token.ts';
import { isWhatsAppPaused } from '../_shared/notify.ts';
import { embedImage, extractAttributes, isThrottleError, type ExtractionResult } from '../_shared/vision.ts';
import { sendWhatsAppTemplate } from '../_shared/whatsapp.ts';

const MAX_EMBEDDING_ATTEMPTS = 5;
const MAX_NOTIFICATION_ATTEMPTS = 3;
const BATCH_SIZE = 10;
/** Backoff lineal entre reintentos de visión: attempts × este intervalo. */
const RETRY_SPACING_MS = 5 * 60 * 1000;
/**
 * Tiempo total que esta invocación puede pasar esperando a que se libere el
 * cupo de Replicate. Respetar el `retry_after` de un 429 arregla el reintento
 * (antes se reintentaba de inmediato y volvía a chocar), pero no puede comerse
 * el reloj de la función: agotado el presupuesto, el resto queda para el
 * siguiente tick del cron, que llega en 5 minutos.
 */
const MAX_THROTTLE_WAIT_MS = 40_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'Secreto inválido.' } }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.headers.get('authorization') !== `Bearer ${requireEnv('EDGE_WEBHOOK_SECRET')}`) {
    return unauthorized();
  }

  const db = adminClient();
  const summary = {
    dogsProcessed: 0,
    dogsCompleted: 0,
    dogsThrottled: 0,
    notificationsSent: 0,
    errors: [] as string[],
  };
  /** Presupuesto de espera compartido por todos los reportes de esta corrida. */
  let throttleWaitLeftMs = MAX_THROTTLE_WAIT_MS;

  // -------------------------------------------------------------------------
  // 1) Reintentos del pipeline de visión
  // -------------------------------------------------------------------------
  const { data: activeParams } = await db
    .from('matching_params')
    .select('embedding_model_version')
    .eq('is_active', true)
    .single();
  const modelVersion = activeParams?.embedding_model_version as string | undefined;

  const { data: pendingDogs } = await db
    .from('dogs')
    .select('id, attributes, distinctive_marks, marks_tags, embedding_attempts, updated_at')
    .in('embedding_status', ['pending', 'failed'])
    .lt('embedding_attempts', MAX_EMBEDDING_ATTEMPTS)
    .is('deleted_at', null)
    .order('updated_at', { ascending: true })
    .limit(BATCH_SIZE);

  for (const dog of pendingDogs ?? []) {
    // Backoff lineal: no martillar al proveedor caído en cada tick del cron.
    const ageMs = Date.now() - new Date(dog.updated_at as string).getTime();
    if (ageMs < (dog.embedding_attempts as number) * RETRY_SPACING_MS) continue;
    if (!modelVersion) break;
    summary.dogsProcessed++;

    await db.from('dogs').update({ embedding_status: 'processing' }).eq('id', dog.id);
    const errors: string[] = [];
    /** Este reporte chocó con el cupo del proveedor, no con un fallo real. */
    let throttled = false;
    try {
      const { data: photos } = await db
        .from('dog_photos')
        .select('id, storage_path, embedding, is_primary, quality_score')
        .eq('dog_id', dog.id)
        .order('is_primary', { ascending: false });

      let extraction: ExtractionResult | null = null;
      const primary = (photos ?? []).find((p) => p.is_primary) ?? (photos ?? [])[0];
      // quality_score null en la foto primaria = la extracción nunca completó.
      const needsExtraction = primary && primary.quality_score === null;

      for (const photo of photos ?? []) {
        const { data: signed } = await db.storage
          .from(PHOTOS_BUCKET)
          .createSignedUrl(photo.storage_path as string, 300);
        if (!signed) {
          errors.push(`foto ${photo.id}: no se pudo firmar la URL`);
          continue;
        }
        if (photo.embedding === null) {
          // Un throttle se espera y se reintenta UNA vez con el retraso que el
          // propio proveedor pide; antes se reintentaba al instante y volvía a
          // chocar, quemando un intento del reporte por nada.
          for (let pass = 0; pass < 2; pass++) {
            try {
              const vector = await embedImage(signed.signedUrl);
              await db
                .from('dog_photos')
                .update({ embedding: `[${vector.join(',')}]`, embedding_model_version: modelVersion })
                .eq('id', photo.id);
              break;
            } catch (err) {
              if (!isThrottleError(err)) {
                errors.push(`embedding foto ${photo.id}: ${String(err)}`);
                break;
              }
              const waitMs = Math.min(err.retryAfterSeconds * 1000, throttleWaitLeftMs);
              if (pass === 1 || waitMs <= 0) {
                // Sigue frenado o se acabó el presupuesto de espera: este
                // reporte se queda como estaba y lo retoma el próximo tick.
                throttled = true;
                errors.push(`embedding foto ${photo.id}: ${String(err)}`);
                break;
              }
              throttleWaitLeftMs -= waitMs;
              await sleep(waitMs);
            }
          }
        }
        // La extracción es de OTRO proveedor (Anthropic) y no comparte cupo:
        // se intenta aunque Replicate esté frenado. Por eso el corte va aquí y
        // no dentro del bloque de la embedding.
        if (needsExtraction && photo.id === primary?.id && extraction === null) {
          try {
            extraction = await extractAttributes(signed.signedUrl);
          } catch (err) {
            errors.push(`extracción: ${String(err)}`);
          }
        }
        if (throttled) break; // las demás fotos recibirían el mismo 429
      }

      if (extraction) {
        // Los datos ya presentes (usuario o extracción previa) SIEMPRE ganan.
        const existingAttrs = (dog.attributes ?? {}) as Record<string, unknown>;
        const blockedNotADog = !extraction.isDog;
        await db
          .from('dogs')
          .update({
            attributes: { ...extraction.attributes, ...existingAttrs },
            distinctive_marks: (dog.distinctive_marks as string | null) ?? (extraction.distinctiveMarks || null),
            marks_tags: (dog.marks_tags as string[])?.length ? dog.marks_tags : extraction.marksTags,
            is_sensitive: extraction.isSensitive,
            ...(blockedNotADog
              ? { moderation_status: 'blocked', moderation_reason: 'auto: la imagen no contiene un perro' }
              : {}),
          })
          .eq('id', dog.id);
        if (primary) {
          await db
            .from('dog_photos')
            .update({ quality_score: extraction.qualityScore, is_sensitive: extraction.isSensitive })
            .eq('id', primary.id);
        }
      }

      // ¿Quedó todo completo? (todas las fotos con embedding y extracción resuelta)
      const { data: photosAfter } = await db
        .from('dog_photos')
        .select('id, embedding, is_primary, quality_score')
        .eq('dog_id', dog.id);
      const complete =
        (photosAfter ?? []).every((p) => p.embedding !== null) &&
        (photosAfter ?? []).some((p) => p.is_primary && p.quality_score !== null);

      // Un throttle NO gasta un intento. La regla de oro del ADR-0003 es que
      // una inferencia fallida jamás pierde un reporte, y hasta hoy la violaba
      // el caso más tonto: cinco 429 seguidos dejaban el reporte en 'failed'
      // con los intentos agotados, fuera de esta consulta para siempre —
      // invisible para el matching aunque el proveedor se recuperara en un
      // minuto. Frenar no es fallar: el estado vuelve a 'pending' y el cron lo
      // retoma indefinidamente hasta que haya cupo.
      const throttledOnly = throttled && !complete;
      const nextAttempts = throttledOnly
        ? (dog.embedding_attempts as number)
        : (dog.embedding_attempts as number) + 1;

      await db
        .from('dogs')
        .update({
          embedding_status: complete ? 'done' : throttledOnly ? 'pending' : 'failed',
          embedding_attempts: nextAttempts,
          embedding_last_error: errors.length ? errors.join(' | ') : null,
        })
        .eq('id', dog.id);

      if (throttledOnly) summary.dogsThrottled++;

      await db.from('events').insert({
        event_type: errors.length === 0 ? 'extraction_done' : 'extraction_failed',
        actor_type: 'system',
        dog_id: dog.id,
        payload: { retry: true, attempts: nextAttempts, throttled, errors },
      });

      if (complete) {
        summary.dogsCompleted++;
        // El matching proactivo (on-report-created) lo dispara el trigger de BD
        // dogs_proactive_matching al ver embedding_status → 'done' (migración 9).
      }
    } catch (err) {
      summary.errors.push(`dog ${dog.id}: ${String(err)}`);
      await db
        .from('dogs')
        .update({
          embedding_status: 'failed',
          embedding_attempts: (dog.embedding_attempts as number) + 1,
          embedding_last_error: String(err),
        })
        .eq('id', dog.id);
    }
  }

  // -------------------------------------------------------------------------
  // 2) Reintentos de notificaciones (+ fallback email al agotar intentos)
  // -------------------------------------------------------------------------
  const { data: pendingNotifications } = await db
    .from('notifications')
    .select('id, idempotency_key, template_key, channel, attempts, recipient_contact_id')
    .in('status', ['queued', 'failed'])
    .lt('attempts', MAX_NOTIFICATION_ATTEMPTS)
    .limit(BATCH_SIZE);

  // El kill-switch tiene que valer también aquí: si el presupuesto se agotó,
  // los mensajes que quedaron en cola NO pueden colarse por la puerta de atrás
  // del reintento (S3-A.4). Se quedan encolados hasta que el mes cambie o el
  // fundador reactive; el fallback a email sigue funcionando.
  const whatsappPaused = await isWhatsAppPaused(db);

  for (const notification of pendingNotifications ?? []) {
    if (notification.channel === 'whatsapp' && whatsappPaused) continue;
    const { data: contact } = await db
      .from('contacts')
      .select('id, dog_id, channel, value')
      .eq('id', notification.recipient_contact_id)
      .single();
    if (!contact) continue;

    try {
      if (notification.channel === 'whatsapp' && notification.template_key === 'manage_link') {
        // El enlace jamás entregado no es reconstruible (solo hay hash):
        // token nuevo, hash nuevo, URL nueva (ADR-0006).
        const token = generateManageToken();
        await db
          .from('dogs')
          .update({ manage_token_hash: await hashManageToken(token) })
          .eq('id', contact.dog_id);
        const manageUrl = buildManageUrl(requireEnv('APP_BASE_URL'), contact.dog_id as string, token);
        const providerMessageId = await sendWhatsAppTemplate(contact.value as string, 'manage_link', {
          manage_url: manageUrl,
        });
        await db
          .from('notifications')
          .update({
            status: 'sent',
            provider_message_id: providerMessageId,
            sent_at: new Date().toISOString(),
            attempts: (notification.attempts as number) + 1,
            error: null,
          })
          .eq('id', notification.id);
        summary.notificationsSent++;
      } else if (notification.channel === 'email') {
        await sendManageLinkEmail(db, notification, contact);
        summary.notificationsSent++;
      }
    } catch (err) {
      const attempts = (notification.attempts as number) + 1;
      await db
        .from('notifications')
        .update({ status: 'failed', attempts, error: String(err) })
        .eq('id', notification.id);
      // Al agotar WhatsApp: fallback a email si el mismo reporte dio email (ADR-0008).
      if (attempts >= MAX_NOTIFICATION_ATTEMPTS && notification.channel === 'whatsapp') {
        const { data: emailContact } = await db
          .from('contacts')
          .select('id')
          .eq('dog_id', contact.dog_id)
          .eq('channel', 'email')
          .maybeSingle();
        if (emailContact) {
          await db.from('notifications').insert({
            idempotency_key: `${notification.idempotency_key}:email-fallback`,
            recipient_contact_id: emailContact.id,
            channel: 'email',
            template_key: notification.template_key,
            status: 'queued',
          });
        }
      }
    }
  }

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

/** Envío del enlace de gestión por email (Resend, ADR-0008 fallback). */
async function sendManageLinkEmail(
  db: ReturnType<typeof adminClient>,
  notification: { id: string; attempts: number; template_key: string },
  contact: { dog_id: string; value: string },
): Promise<void> {
  const apiKey = optionalEnv('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY no configurada.');
  const token = generateManageToken();
  await db.from('dogs').update({ manage_token_hash: await hashManageToken(token) }).eq('id', contact.dog_id);
  const manageUrl = buildManageUrl(requireEnv('APP_BASE_URL'), contact.dog_id, token);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: optionalEnv('RESEND_FROM') ?? 'LomitoDeVuelta <onboarding@resend.dev>',
      to: contact.value,
      subject: 'Tu enlace para gestionar tu reporte — LomitoDeVuelta',
      html: `<p>Guarda este enlace: es la única llave para editar, renovar o cerrar tu reporte.</p><p><a href="${manageUrl}">${manageUrl}</a></p><p>Nunca lo compartas: quien lo tenga puede gestionar tu reporte.</p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Resend respondió ${response.status}: ${await response.text()}`);
  const body = (await response.json()) as { id?: string };
  await db
    .from('notifications')
    .update({
      status: 'sent',
      provider_message_id: body.id ?? null,
      sent_at: new Date().toISOString(),
      attempts: notification.attempts + 1,
      error: null,
    })
    .eq('id', notification.id);
}

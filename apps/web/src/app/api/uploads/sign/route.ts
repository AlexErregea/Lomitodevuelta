import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { signUploadRequestSchema, type SignUploadResponse } from '@lomito/shared';
import { apiError } from '@/lib/api-response';
import {
  WINDOWS,
  clientIp,
  consumeRateLimits,
  humanizeWait,
  ipBucket,
  loadRateLimitConfig,
} from '@/lib/rate-limit';
import { PHOTOS_BUCKET, supabaseAdmin } from '@/lib/supabase-admin';

// ============================================================================
// POST /api/uploads/sign — URL firmada de subida directa a Storage.
// El SERVIDOR dicta la ruta (el cliente jamás elige dónde escribe) y el
// bucket es privado: subir aquí no publica nada (security-privacy.md §7).
//
// Es la puerta más barata de tocar del sistema (no cuesta inferencia, pero sí
// escribe en Storage), así que lleva su propio rate limit por IP: sin él,
// alguien puede llenar el bucket sin crear un solo reporte.
// ============================================================================

/** TTL corto: la subida ocurre inmediatamente después de pedir la firma. */
const UPLOAD_TTL_SECONDS = 120;

const EXTENSION_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('validation_error', 'El cuerpo debe ser JSON.');
  }
  const parsed = signUploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('validation_error', parsed.error.issues.map((i) => i.message).join('; '));
  }

  const limits = await loadRateLimitConfig();
  const limit = await consumeRateLimits([
    {
      key: ipBucket('upload', clientIp(request)),
      windowSeconds: WINDOWS.uploadSignsPerIpHour,
      limit: limits.uploadSignsPerIpHour,
    },
  ]);
  if (!limit.allowed) {
    return apiError(
      'rate_limited',
      `Estás subiendo muchas fotos seguidas. Vuelve a intentarlo ${humanizeWait(limit.retryAfterSeconds)}.`,
      { 'Retry-After': String(limit.retryAfterSeconds) },
    );
  }

  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const storagePath = `citizen/${yyyy}/${mm}/${randomUUID()}.${EXTENSION_BY_TYPE[parsed.data.contentType]}`;

  const { data, error } = await supabaseAdmin()
    .storage.from(PHOTOS_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (error || !data) {
    console.error(JSON.stringify({ msg: 'sign_upload_failed', error: error?.message }));
    return apiError('internal_error', 'No se pudo preparar la subida. Intenta de nuevo.');
  }

  const response: SignUploadResponse = {
    uploadUrl: data.signedUrl,
    storagePath: data.path,
    expiresAt: new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000).toISOString(),
  };
  return NextResponse.json(response, { status: 200 });
}

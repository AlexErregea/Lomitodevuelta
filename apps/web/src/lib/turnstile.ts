import { optionalEnv } from './env';

// ============================================================================
// Cloudflare Turnstile — CAPTCHA invisible (ADR-0009 §4: la fricción se pone
// en el script, no en la persona). Filtra automatización barata sin pedirle
// nada al usuario real, que es el criterio del producto: quien acaba de perder
// a su perro no debe resolver acertijos de semáforos.
//
// Todo aquí está condicionado a las llaves: sin TURNSTILE_SECRET_KEY el sitio
// se comporta exactamente como antes de esta función. Eso permite desplegar el
// código hoy y encender la defensa el día que las llaves existan, sin tocar
// código ni redesplegar.
// ============================================================================

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** ¿Hay llave secreta en este entorno? Si no, la verificación es un no-op. */
export function turnstileEnabled(): boolean {
  return Boolean(optionalEnv('TURNSTILE_SECRET_KEY'));
}

/**
 * Valida el token del widget contra Cloudflare.
 *
 * Falla abierto si Cloudflare no responde: un outage de un tercero no puede
 * dejar sin reportar a alguien que perdió a su perro. Las demás defensas
 * (rate limit, circuit breaker, tope por destino) siguen puestas.
 */
export async function verifyTurnstile(
  token: string | undefined,
  remoteIp: string,
): Promise<{ ok: boolean; reason?: string }> {
  const secret = optionalEnv('TURNSTILE_SECRET_KEY');
  if (!secret) return { ok: true };
  if (!token) return { ok: false, reason: 'missing_token' };

  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret,
        response: token,
        ...(remoteIp && remoteIp !== 'unknown' ? { remoteip: remoteIp } : {}),
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      console.error(JSON.stringify({ msg: 'turnstile_http_error', status: response.status }));
      return { ok: true };
    }
    const body = (await response.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (body.success) return { ok: true };
    return { ok: false, reason: (body['error-codes'] ?? []).join(',') || 'rejected' };
  } catch (err) {
    console.error(JSON.stringify({ msg: 'turnstile_unreachable', error: String(err) }));
    return { ok: true };
  }
}

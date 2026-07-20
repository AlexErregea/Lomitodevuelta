import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { requireEnv } from './env';

// ============================================================================
// Token de gestión (ADR-0006): los ciudadanos no tienen cuenta; gestionan su
// reporte con un enlace firmado. En la base vive SOLO el hash del token
// (HMAC-SHA256 con pepper del servidor), como una contraseña: un volcado de
// la tabla no permite gestionar reportes ajenos.
// ============================================================================

/** Genera un token aleatorio de 256 bits, apto para URL. */
export function generateManageToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hash HMAC-SHA256 del token con el pepper del servidor (MANAGE_TOKEN_PEPPER). */
export function hashManageToken(token: string): string {
  return createHmac('sha256', requireEnv('MANAGE_TOKEN_PEPPER')).update(token).digest('hex');
}

/** Compara en tiempo constante el token recibido contra el hash almacenado. */
export function verifyManageToken(token: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashManageToken(token), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

/** Enlace de gestión completo (se muestra UNA vez y se envía por WhatsApp). */
export function buildManageUrl(baseUrl: string, reportId: string, token: string): string {
  return `${baseUrl}/r/${reportId}/gestionar?t=${token}`;
}

import { requireEnv } from './env.ts';

// ============================================================================
// Tokens de gestión en Deno (ADR-0006), espejo de apps/web/src/lib/
// manage-token.ts pero con Web Crypto. Se usa cuando retry-pending debe
// REGENERAR un enlace: la base guarda solo el hash, así que un enlace jamás
// entregado no se puede reconstruir — se emite un token nuevo (el anterior,
// que nadie recibió, queda inválido) y se reenvía.
// ============================================================================

export function generateManageToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export async function hashManageToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(requireEnv('MANAGE_TOKEN_PEPPER')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(token));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function buildManageUrl(baseUrl: string, reportId: string, token: string): string {
  return `${baseUrl}/r/${reportId}/gestionar?t=${token}`;
}

/**
 * Enlace del aviso de coincidencia: el panel del PROPIO reporte, no la ficha
 * de la contraparte (que es anónima y no puede pedir nada). Misma ruta que el
 * enlace de gestión —así encaja con la plantilla ya aprobada en Meta— pero con
 * `m`, que hace que el token se valide contra ese match y no contra el reporte:
 * permiso solo para responder esta coincidencia, sin acceso a editar ni borrar.
 */
export function buildMatchUrl(
  baseUrl: string,
  reportId: string,
  matchId: string,
  token: string,
): string {
  return `${baseUrl}/r/${reportId}/gestionar?m=${matchId}&t=${token}`;
}

import { createHash } from 'node:crypto';
import type { ContactChannel } from '@lomito/shared';

// ============================================================================
// Tratamiento del contacto — EL dato personal del sistema (security-privacy.md
// §1.3): el valor real solo vive en `contacts.value` (service_role); todo lo
// demás usa el hash (dedupe/rate-limit) o la máscara (cualquier UI).
// ============================================================================

/** Normaliza para dedupe: trim, minúsculas (email) y solo dígitos+prefijo (tel). */
export function normalizeContactValue(channel: ContactChannel, value: string): string {
  const trimmed = value.trim();
  if (channel === 'email') return trimmed.toLowerCase();
  // WhatsApp: E.164 — conserva el '+' inicial y descarta separadores visuales.
  return `+${trimmed.replace(/[^\d]/g, '')}`;
}

/** sha256 del valor normalizado: permite dedupe y rate-limit sin exponer el dato. */
export function hashContactValue(channel: ContactChannel, value: string): string {
  return createHash('sha256').update(normalizeContactValue(channel, value)).digest('hex');
}

/** Máscara para UI: "•• •• 1234" (tel) o "j•••@dominio.com" (email). */
export function maskContactValue(channel: ContactChannel, value: string): string {
  const normalized = normalizeContactValue(channel, value);
  if (channel === 'whatsapp') {
    const last4 = normalized.slice(-4);
    return `•• •• ${last4}`;
  }
  const [local, domain] = normalized.split('@');
  if (!local || !domain) return '•••';
  return `${local.slice(0, 1)}•••@${domain}`;
}

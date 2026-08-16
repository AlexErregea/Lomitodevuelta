import { describe, expect, it } from 'vitest';
import { createReportRequestSchema } from '@lomito/shared';

// Consentimiento tácito (decisión del fundador, 2026-08-12): publicar el
// reporte ES el consentimiento. El contrato ya no lleva casilla; la evidencia
// la registra el servidor en contacts (consent_given_at + consent_version).
describe('createReportRequestSchema · consentimiento tácito', () => {
  const base = {
    reportType: 'lost' as const,
    photoPaths: ['citizen/2026/08/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg'],
    geo: { lat: 19.3467, lng: -99.1618 },
    eventDate: '2026-08-15',
    contact: { channel: 'whatsapp' as const, value: '+525512345678' },
  };

  it('acepta el alta sin ningún campo de consentimiento', () => {
    expect(createReportRequestSchema.safeParse(base).success).toBe(true);
  });

  it('un cliente viejo en caché que aún manda la casilla no rompe el alta', () => {
    // Zod descarta las claves desconocidas: quien tenga el JS anterior en caché
    // sigue pudiendo reportar mientras se propaga el despliegue.
    const parsed = createReportRequestSchema.safeParse({ ...base, consentAccepted: true });
    expect(parsed.success).toBe(true);
    expect(parsed.success && 'consentAccepted' in parsed.data).toBe(false);
  });
});

describe('createReportRequestSchema · token de Turnstile', () => {
  const base = {
    reportType: 'found' as const,
    photoPaths: ['citizen/2026/08/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg'],
    geo: { lat: 19.3467, lng: -99.1618 },
    eventDate: '2026-08-15',
    contact: { channel: 'whatsapp' as const, value: '+525512345678' },
  };

  it('es opcional: los entornos sin llaves de Cloudflare no lo mandan', () => {
    expect(createReportRequestSchema.safeParse(base).success).toBe(true);
  });

  it('acepta un token normal', () => {
    expect(
      createReportRequestSchema.safeParse({ ...base, turnstileToken: '0.abc123' }).success,
    ).toBe(true);
  });

  it('rechaza un token desmedido (no es un canal para meter payloads)', () => {
    expect(
      createReportRequestSchema.safeParse({ ...base, turnstileToken: 'x'.repeat(2049) }).success,
    ).toBe(false);
  });
});

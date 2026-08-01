import { describe, expect, it } from 'vitest';
import { createReportRequestSchema } from '@lomito/shared';

// addressText es la referencia humana que acompaña a la ubicación cuando quien
// reporta no dio permiso de GPS y eligió su alcaldía a mano.
describe('createReportRequestSchema · addressText', () => {
  const base = {
    reportType: 'found' as const,
    photoPaths: ['citizen/2026/07/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg'],
    geo: { lat: 19.3467, lng: -99.1618 },
    eventDate: '2026-07-31',
    contact: { channel: 'whatsapp' as const, value: '+525512345678' },
    consentAccepted: true as const,
  };

  it('es opcional: el camino con GPS no lo manda', () => {
    expect(createReportRequestSchema.safeParse(base).success).toBe(true);
  });

  it('acepta la referencia que compone el respaldo manual', () => {
    const parsed = createReportRequestSchema.safeParse({
      ...base,
      addressText: 'Col. Roma Norte, Cuauhtémoc',
    });
    expect(parsed.success).toBe(true);
  });

  it('rechaza un texto desmedido (no es un campo de notas)', () => {
    expect(
      createReportRequestSchema.safeParse({ ...base, addressText: 'x'.repeat(121) }).success,
    ).toBe(false);
  });
});

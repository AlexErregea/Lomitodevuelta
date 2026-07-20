import { describe, expect, it } from 'vitest';
import { updateReportRequestSchema } from '@lomito/shared';

// El PATCH es la vía ARCO de rectificación: el esquema es la frontera.
describe('updateReportRequestSchema', () => {
  it('acepta una corrección de atributos con sexo confirmado por humano', () => {
    const parsed = updateReportRequestSchema.safeParse({
      attributes: { sex: 'female', sexConfirmed: true, size: 'medium' },
    });
    expect(parsed.success).toBe(true);
  });

  it('acepta borrar las señas con null', () => {
    expect(updateReportRequestSchema.safeParse({ distinctiveMarks: null }).success).toBe(true);
  });

  it('rechaza un cuerpo vacío (nada que corregir)', () => {
    expect(updateReportRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rechaza atributos fuera del vocabulario', () => {
    expect(
      updateReportRequestSchema.safeParse({ attributes: { size: 'enorme' } }).success,
    ).toBe(false);
  });

  it('rechaza señas más largas que el límite', () => {
    expect(
      updateReportRequestSchema.safeParse({ distinctiveMarks: 'x'.repeat(501) }).success,
    ).toBe(false);
  });
});

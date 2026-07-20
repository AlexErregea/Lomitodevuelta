import { describe, expect, it } from 'vitest';
import { attributeExtractionSchema, EXTRACTION_JSON_SCHEMA } from '@lomito/shared';

// La salida del LLM es la frontera menos confiable del sistema: el esquema
// Zod es lo único que la deja entrar al dominio.
describe('attributeExtractionSchema', () => {
  const valid = {
    isDog: true,
    isSensitive: false,
    qualityScore: 0.8,
    attributes: { breedMix: ['mestizo'], colors: ['negro'], size: 'medium' },
    distinctiveMarks: 'mancha blanca en el pecho',
    marksTags: ['mancha_pecho_blanca'],
  };

  it('acepta una extracción bien formada', () => {
    expect(attributeExtractionSchema.parse(valid)).toEqual(valid);
  });

  it('rechaza qualityScore fuera de [0,1]', () => {
    expect(attributeExtractionSchema.safeParse({ ...valid, qualityScore: 1.5 }).success).toBe(false);
  });

  it('rechaza atributos con valores fuera del vocabulario', () => {
    expect(
      attributeExtractionSchema.safeParse({
        ...valid,
        attributes: { size: 'gigante' },
      }).success,
    ).toBe(false);
  });

  it('el JSON Schema espejo cubre exactamente los campos del esquema Zod', () => {
    // Si alguien añade un campo en un lado y no en el otro, este test truena.
    const zodKeys = Object.keys(attributeExtractionSchema.shape).sort();
    const jsonKeys = Object.keys(EXTRACTION_JSON_SCHEMA.properties).sort();
    expect(jsonKeys).toEqual(zodKeys);
  });
});

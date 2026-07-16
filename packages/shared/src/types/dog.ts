import { z } from 'zod';

// ============================================================================
// Tipos del dominio "perro/reporte". Espejo tipado de las columnas de la
// tabla `dogs` (ver supabase/migrations y docs/data-model.md).
// Los esquemas Zod son la fuente de verdad: validan en el servidor Y tipan
// el cliente. Los valores están en inglés (identificadores técnicos); las
// traducciones a español viven en el paquete de contenido de la UI.
// ============================================================================

export const reportTypeSchema = z.enum(['lost', 'found']);
export type ReportType = z.infer<typeof reportTypeSchema>;

export const sizeSchema = z.enum(['small', 'medium', 'large']);
export type Size = z.infer<typeof sizeSchema>;

export const sexSchema = z.enum(['male', 'female']);
export type Sex = z.infer<typeof sexSchema>;

export const ageRangeSchema = z.enum(['puppy', 'young', 'adult', 'senior']);
export type AgeRange = z.infer<typeof ageRangeSchema>;

export const coatLengthSchema = z.enum(['short', 'medium', 'long']);
export type CoatLength = z.infer<typeof coatLengthSchema>;

/**
 * Atributos estructurados del perro. Los extrae el LLM en el alta y el
 * usuario puede corregirlos. TODOS opcionales: la ausencia de un dato NUNCA
 * penaliza en el matching, solo la contradicción (matching-engine.md §1).
 */
export const dogAttributesSchema = z.object({
  breedMix: z.array(z.string()).optional(),
  colors: z.array(z.string()).optional(),
  size: sizeSchema.optional(),
  sex: sexSchema.optional(),
  /** true solo si un humano lo confirmó — activa el "gate de sexo" del score */
  sexConfirmed: z.boolean().optional(),
  ageRange: ageRangeSchema.optional(),
  coatLength: coatLengthSchema.optional(),
});
export type DogAttributes = z.infer<typeof dogAttributesSchema>;

/** Coordenada geográfica (WGS84). */
export const geoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type GeoPoint = z.infer<typeof geoPointSchema>;

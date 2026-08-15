import { z } from 'zod';
import { dogAttributesSchema } from '../types/dog.ts';

// ============================================================================
// Interfaz del extractor de atributos con LLM multimodal (ADR-0003).
// El mismo llamado hace triple servicio (ADR-0009): atributos + control de
// contenido (isDog, isSensitive) + calidad de foto, a costo marginal cero.
//
// La salida del LLM es la frontera menos confiable del sistema: por eso el
// contrato es un esquema Zod (fuente de verdad) y toda implementación DEBE
// validar contra él antes de devolver — un JSON malformado del modelo jamás
// entra al dominio.
// ============================================================================

export const attributeExtractionSchema = z.object({
  /** false → el reporte se bloquea automáticamente (único auto-bloqueo) */
  isDog: z.boolean(),
  /** true → perro herido/fallecido: difuminado con opt-in del espectador */
  isSensitive: z.boolean(),
  /** [0,1] — bajo → el score reduce el peso visual (matching-engine.md §6) */
  qualityScore: z.number().min(0).max(1),
  attributes: dogAttributesSchema,
  /** Señas en texto libre, para mostrar en la ficha */
  distinctiveMarks: z.string(),
  /** Señas normalizadas a vocabulario controlado, para el score (S_marks) */
  marksTags: z.array(z.string()),
});
export type AttributeExtraction = z.infer<typeof attributeExtractionSchema>;

// El JSON Schema espejo para structured outputs vive en extraction-prompt.ts
// (archivo sin dependencias, importable también desde Deno sin import map).

export interface AttributeExtractor {
  /** Analiza una imagen accesible por URL. La salida se valida con Zod. */
  extract(imageUrl: string): Promise<AttributeExtraction>;
}

import type { DogAttributes } from '../types/dog';

// ============================================================================
// Interfaz del extractor de atributos con LLM multimodal (ADR-0003).
// El mismo llamado hace triple servicio (ADR-0009): atributos + control de
// contenido (isDog, isSensitive) + calidad de foto, a costo marginal cero.
// ============================================================================

export interface AttributeExtraction {
  /** false → el reporte se bloquea automáticamente (único auto-bloqueo) */
  isDog: boolean;
  /** true → perro herido/fallecido: difuminado con opt-in del espectador */
  isSensitive: boolean;
  /** [0,1] — bajo → el score reduce el peso visual (matching-engine.md §6) */
  qualityScore: number;
  attributes: DogAttributes;
  /** Señas en texto libre, para mostrar en la ficha */
  distinctiveMarks: string;
  /** Señas normalizadas a vocabulario controlado, para el score (S_marks) */
  marksTags: string[];
}

export interface AttributeExtractor {
  /** Analiza una imagen accesible por URL. La salida se valida con Zod. */
  extract(imageUrl: string): Promise<AttributeExtraction>;
}

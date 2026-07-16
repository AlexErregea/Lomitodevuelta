import type { DogAttributes, ReportType } from '@lomito/shared';

// ============================================================================
// Tipos del dominio de matching. Contrato definido en docs/matching-engine.md
// §8 — si cambias algo aquí, actualiza ese documento (y viceversa).
// ============================================================================

/** Reporte de referencia (el que dispara la búsqueda). */
export interface ReferenceReport {
  dogId: string;
  reportType: ReportType;
  attributes: DogAttributes;
  marksTags: string[];
  /** ISO date (YYYY-MM-DD) */
  eventDate: string;
  bestPhotoQuality: number | null;
}

/** Fila cruda que devuelve la RPC match_candidates (capa 1, SQL). */
export interface CandidateRaw {
  dogId: string;
  reportType: ReportType;
  /** Mejor similitud coseno entre pares de fotos; null si aún no hay embedding */
  visualSimilarity: number | null;
  bestPhotoId: string | null;
  distanceMeters: number;
  /** Firmado: fecha_hallazgo − fecha_extravío (negativo = incoherente) */
  daysBetween: number;
  attributes: DogAttributes;
  marksTags: string[];
  eventDate: string;
}

/** Espejo tipado de la fila activa de la tabla matching_params. */
export interface MatchingParams {
  paramsId: number;
  weights: {
    visual: number;
    attributes: number;
    spatiotemporal: number;
    marks: number;
  };
  thresholds: {
    /** ≥ show → aparece en resultados de búsqueda */
    show: number;
    /** ≥ notify → match formal + WhatsApp a ambas partes */
    notify: number;
    /** Anclas de normalización de similitud coseno (POR MODELO — se
     * recalibran con el benchmark al cambiar de modelo de embeddings) */
    visualFloor: number;
    visualCeil: number;
  };
  geo: {
    baseRadiusKm: number;
    kmPerDay: number;
    maxRadiusKm: number;
    maxDaysWindow: number;
  };
}

/**
 * Evidencia estructurada de un score. Se persiste en matches.explanation
 * (JSON); el texto en español se genera al mostrar (renderExplanation).
 */
export type Evidence =
  | { kind: 'visual_similarity'; similarity: number }
  | { kind: 'distance'; km: number; days: number }
  | { kind: 'mark_match'; tag: string }
  | { kind: 'attribute_match'; attribute: keyof DogAttributes; value: string }
  | {
      kind: 'attribute_conflict';
      attribute: keyof DogAttributes;
      reference: string;
      candidate: string;
    };

export type MatchFlag =
  | 'visual_ambiguity' // varios candidatos casi igual de parecidos (§6)
  | 'sex_conflict' // sexos confirmados contradictorios → total ≤ 0.30 (gate)
  | 'timeline_implausible' // hallado ≥2 días antes del extravío → S_geo × 0.3
  | 'no_embedding' // score sin componente visual (renormalizado)
  | 'low_photo_quality'; // peso visual reducido a la mitad (renormalizado)

export interface ComponentScore {
  /** null = no computable (excluido del total y renormalizado) */
  value: number | null;
  /** Peso EFECTIVO tras renormalización (los pesos efectivos suman 1) */
  weight: number;
  evidence: Evidence[];
}

export interface MatchScore {
  /** [0,1] — se muestra como porcentaje sin decimales + banda verbal */
  total: number;
  breakdown: {
    visual: ComponentScore;
    attributes: ComponentScore;
    spatiotemporal: ComponentScore;
    marks: ComponentScore;
  };
  flags: MatchFlag[];
  /** Versión de parámetros con la que se calculó (dataset de calibración) */
  paramsId: number;
}

export interface ScoredCandidate {
  candidate: CandidateRaw;
  score: MatchScore;
}

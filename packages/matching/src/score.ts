import type { CandidateRaw, MatchingParams, MatchScore, ReferenceReport, ScoredCandidate } from './types';

// ============================================================================
// STUBS del score multimodal (capa 2). La implementación llega en el Bloque 7
// siguiendo docs/matching-engine.md §4 al pie de la letra. Estos stubs fijan
// las firmas para que apps/web y las Edge Functions compilen contra el
// contrato desde ya.
// ============================================================================

/**
 * Puntúa UN candidato contra el reporte de referencia.
 *
 * Función pura y determinista: misma entrada → mismo score. Es LA función
 * más testeada del sistema (casos dorados en matching-engine.md §10).
 *
 * Fórmula (matching-engine.md §4):
 *   total = w_visual·S_visual + w_attr·S_attr + w_geo·S_geo + w_marks·S_marks
 *   · componente no computable → se excluye y se renormalizan los pesos
 *   · gate de sexo: confirmados y contradictorios → total ≤ 0.30
 *   · dirección temporal: hallado ≥2 días antes del extravío → S_geo × 0.3
 */
export function scoreCandidate(
  _reference: ReferenceReport,
  _candidate: CandidateRaw,
  _params: MatchingParams,
): MatchScore {
  // TODO(Bloque 7): implementar según docs/matching-engine.md §4.
  throw new Error('scoreCandidate: no implementado aún (docs/matching-engine.md §4)');
}

/**
 * Puntúa y ordena un lote de candidatos, y aplica la detección de ambigüedad
 * visual sobre el conjunto (≥3 candidatos a menos de 0.05 de similitud del
 * mejor → flag 'visual_ambiguity' en todos; matching-engine.md §6).
 */
export function rankCandidates(
  _reference: ReferenceReport,
  _candidates: CandidateRaw[],
  _params: MatchingParams,
): ScoredCandidate[] {
  // TODO(Bloque 7): scoreCandidate por candidato + orden desc + ambigüedad.
  throw new Error('rankCandidates: no implementado aún (docs/matching-engine.md §4)');
}

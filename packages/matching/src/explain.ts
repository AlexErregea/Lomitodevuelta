import type { MatchScore } from './types';

// ============================================================================
// STUB de la explicación legible (capa 2 → humanos). Implementación: Bloque 7.
// ============================================================================

/**
 * Convierte la evidencia estructurada de un score en una frase en español
 * desde plantillas externalizadas (i18n-ready). SIN LLM: determinista,
 * gratis y testeable (ADR-0004).
 *
 * Orden de presentación (matching-engine.md §5): señas primero (lo más
 * convincente), geo después, similitud visual al final.
 *
 * Ejemplo de salida:
 *   "91 % · Misma mancha blanca en el pecho · Encontrado a 1.8 km,
 *    2 días después · Muy parecido en las fotos"
 */
export function renderExplanation(_score: MatchScore, _locale: 'es-MX'): string {
  // TODO(Bloque 7): plantillas por Evidence.kind + banda verbal del total.
  throw new Error('renderExplanation: no implementado aún (docs/matching-engine.md §5)');
}

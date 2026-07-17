import type { Evidence, MatchScore } from './types';

// ============================================================================
// Explicación legible (docs/matching-engine.md §5). Sin LLM: plantillas
// deterministas, gratis y testeables. Orden de presentación: señas primero
// (lo más convincente para un humano), geo después, visual al final.
// ============================================================================

/** Bandas verbales honestas (§4.4). Alineadas con los umbrales por defecto;
 *  son presentación, no decisión — la decisión usa matching_params. */
export type ScoreBand = 'muy_alta' | 'alta' | 'posible';

export function scoreBand(total: number): ScoreBand {
  if (total >= 0.85) return 'muy_alta';
  if (total >= 0.72) return 'alta';
  return 'posible';
}

// Plantillas por locale. es-MX es el único del MVP, pero la estructura ya es
// i18n-ready (regla del proyecto: no cablear un solo idioma).
const TEMPLATES = {
  'es-MX': {
    markMatch: (tag: string) => `Misma seña: ${humanizeTag(tag)}`,
    sameDay: (km: string) => `Encontrado a ${km} km el mismo día`,
    daysAfter: (km: string, days: number) =>
      `Encontrado a ${km} km, ${days} ${days === 1 ? 'día' : 'días'} después`,
    daysBefore: (km: string, days: number) =>
      `Encontrado a ${km} km, ${days} ${days === 1 ? 'día' : 'días'} antes del extravío (revisar fechas)`,
    veryVisuallySimilar: 'Muy parecido en las fotos',
    visuallySimilar: 'Parecido en las fotos',
  },
} as const;

/** 'mancha_pecho_blanca' → 'mancha pecho blanca' (el vocabulario controlado
 *  de señas usa snake_case legible; ver matching-engine.md §4.2). */
function humanizeTag(tag: string): string {
  return tag.replaceAll('_', ' ');
}

function formatKm(km: number): string {
  return Number.isInteger(km) ? km.toFixed(0) : km.toFixed(1);
}

export function renderExplanation(score: MatchScore, locale: 'es-MX'): string {
  const t = TEMPLATES[locale];
  const parts: string[] = [`${Math.round(score.total * 100)} %`];

  // 1) Señas particulares — la evidencia más fuerte para un humano.
  for (const ev of score.breakdown.marks.evidence) {
    if (ev.kind === 'mark_match') parts.push(t.markMatch(ev.tag));
  }

  // 2) Coherencia espaciotemporal.
  const distance = score.breakdown.spatiotemporal.evidence.find(
    (ev): ev is Extract<Evidence, { kind: 'distance' }> => ev.kind === 'distance',
  );
  if (distance) {
    const km = formatKm(distance.km);
    if (distance.days === 0) parts.push(t.sameDay(km));
    else if (distance.days > 0) parts.push(t.daysAfter(km, distance.days));
    else parts.push(t.daysBefore(km, Math.abs(distance.days)));
  }

  // 3) Similitud visual — lo menos verbalizable, al final.
  const visual = score.breakdown.visual.value;
  if (visual !== null) {
    if (visual >= 0.8) parts.push(t.veryVisuallySimilar);
    else if (visual >= 0.4) parts.push(t.visuallySimilar);
    // Por debajo no se menciona: no aporta y confunde.
  }

  return parts.join(' · ');
}

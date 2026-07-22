import { describe, expect, it } from 'vitest';
import { renderExplanation, type MatchScore } from '@lomito/matching';

// La explicación de un match se GENERA al mostrar desde el score reconstruido
// (data-model.md: el texto no se guarda). Este test fija el contrato que usa
// lib/matches.ts al reconstruir el MatchScore desde las columnas persistidas.
describe('renderExplanation sobre un score reconstruido', () => {
  const score: MatchScore = {
    total: 0.91,
    breakdown: {
      visual: { value: 0.85, weight: 0, evidence: [] },
      attributes: { value: 1, weight: 0, evidence: [] },
      spatiotemporal: { value: 0.88, weight: 0, evidence: [{ kind: 'distance', km: 1.8, days: 2 }] },
      marks: { value: 0.8, weight: 0, evidence: [{ kind: 'mark_match', tag: 'mancha_pecho_blanca' }] },
    },
    flags: [],
    paramsId: 1,
  };

  it('ordena señas → geo → visual y usa el porcentaje sin decimales', () => {
    expect(renderExplanation(score, 'es-MX')).toBe(
      '91 % · Misma seña: mancha pecho blanca · Encontrado a 1.8 km, 2 días después · Muy parecido en las fotos',
    );
  });

  it('omite el componente visual cuando no es computable (sin embedding)', () => {
    const noVisual: MatchScore = {
      ...score,
      total: 0.6,
      breakdown: { ...score.breakdown, visual: { value: null, weight: 0, evidence: [] } },
    };
    const text = renderExplanation(noVisual, 'es-MX');
    expect(text).toContain('60 %');
    expect(text).not.toContain('las fotos');
  });
});

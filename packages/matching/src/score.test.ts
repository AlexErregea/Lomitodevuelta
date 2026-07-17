import { describe, expect, it } from 'vitest';
import { renderExplanation, scoreBand } from './explain';
import { rankCandidates, scoreCandidate } from './score';
import type { CandidateRaw, MatchingParams, MatchScore, ReferenceReport } from './types';

// ============================================================================
// Casos dorados del score (docs/matching-engine.md §10). Los fixtures usan
// los parámetros iniciales del bootstrap (migración 6) — pero via fixture,
// NO leídos de la BD: calibrar producción no debe romper tests.
// ============================================================================

function makeParams(overrides: Partial<MatchingParams> = {}): MatchingParams {
  return {
    paramsId: 1,
    weights: { visual: 0.45, attributes: 0.2, spatiotemporal: 0.2, marks: 0.15 },
    thresholds: { show: 0.55, notify: 0.72, visualFloor: 0.7, visualCeil: 0.92 },
    geo: { baseRadiusKm: 3, kmPerDay: 1.5, maxRadiusKm: 20, maxDaysWindow: 60 },
    ...overrides,
  };
}

function makeReference(overrides: Partial<ReferenceReport> = {}): ReferenceReport {
  return {
    dogId: 'ref-1',
    reportType: 'lost',
    attributes: {},
    marksTags: [],
    eventDate: '2026-07-01',
    bestPhotoQuality: 0.9,
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<CandidateRaw> = {}): CandidateRaw {
  return {
    dogId: 'cand-1',
    reportType: 'found',
    visualSimilarity: 0.85,
    bestPhotoId: 'photo-1',
    distanceMeters: 2000,
    daysBetween: 2,
    attributes: {},
    marksTags: [],
    eventDate: '2026-07-03',
    ...overrides,
  };
}

const effectiveWeightsSum = (s: MatchScore) =>
  s.breakdown.visual.weight +
  s.breakdown.attributes.weight +
  s.breakdown.spatiotemporal.weight +
  s.breakdown.marks.weight;

describe('scoreCandidate — casos dorados', () => {
  it('1. mismo perro obvio (sim 0.90, 1.8 km, 2 días, 1 seña) → total ≥ 0.85', () => {
    const reference = makeReference({
      attributes: { sex: 'male', size: 'large', breedMix: ['labrador'], colors: ['negro'] },
      marksTags: ['mancha_pecho_blanca'],
    });
    const candidate = makeCandidate({
      visualSimilarity: 0.9,
      distanceMeters: 1800,
      daysBetween: 2,
      attributes: { sex: 'male', size: 'large', breedMix: ['labrador'], colors: ['negro'] },
      marksTags: ['mancha_pecho_blanca'],
    });

    const score = scoreCandidate(reference, candidate, makeParams());

    expect(score.total).toBeGreaterThanOrEqual(0.85);
    expect(score.flags).toEqual([]);
    expect(score.breakdown.marks.evidence).toContainEqual({
      kind: 'mark_match',
      tag: 'mancha_pecho_blanca',
    });
  });

  it('3. sexos confirmados contradictorios → total ≤ 0.30 + flag sex_conflict', () => {
    // Todo lo demás perfecto: el gate debe dominar de todos modos.
    const reference = makeReference({
      attributes: { sex: 'male', sexConfirmed: true },
      marksTags: ['collar_rojo'],
    });
    const candidate = makeCandidate({
      visualSimilarity: 0.95,
      distanceMeters: 500,
      daysBetween: 1,
      attributes: { sex: 'female', sexConfirmed: true },
      marksTags: ['collar_rojo'],
    });

    const score = scoreCandidate(reference, candidate, makeParams());

    expect(score.total).toBeLessThanOrEqual(0.3);
    expect(score.flags).toContain('sex_conflict');
  });

  it('3b. sexos contradictorios SIN confirmar → penaliza pero NO aplica el gate', () => {
    const reference = makeReference({ attributes: { sex: 'male' } });
    const candidate = makeCandidate({
      visualSimilarity: 0.95,
      distanceMeters: 500,
      daysBetween: 1,
      attributes: { sex: 'female' },
    });

    const score = scoreCandidate(reference, candidate, makeParams());

    expect(score.flags).not.toContain('sex_conflict');
    expect(score.total).toBeGreaterThan(0.3); // sin cap: el visual alto pesa
  });

  it('4. sin embedding → pesos renormalizados suman 1 + flag no_embedding', () => {
    const score = scoreCandidate(
      makeReference(),
      makeCandidate({ visualSimilarity: null, bestPhotoId: null }),
      makeParams(),
    );

    expect(score.flags).toContain('no_embedding');
    expect(score.breakdown.visual.value).toBeNull();
    expect(score.breakdown.visual.weight).toBe(0);
    expect(effectiveWeightsSum(score)).toBeCloseTo(1, 10);
    // attributes pasa de 0.20 a 0.20/0.55
    expect(score.breakdown.attributes.weight).toBeCloseTo(0.2 / 0.55, 10);
  });

  it('5. cachorro hace 6 meses vs adulto hoy → size/ageRange neutrales (0.5)', () => {
    const reference = makeReference({ attributes: { ageRange: 'puppy', size: 'small' } });
    const grown = makeCandidate({
      daysBetween: 180,
      attributes: { ageRange: 'adult', size: 'large' },
    });

    const score = scoreCandidate(reference, grown, makeParams());

    // Con todo lo demás desconocido, la neutralización deja S_attr exactamente en 0.5.
    expect(score.breakdown.attributes.value).toBeCloseTo(0.5, 10);
    expect(
      score.breakdown.attributes.evidence.filter((e) => e.kind === 'attribute_conflict'),
    ).toEqual([]);

    // Control: mismo par con pocos días transcurridos SÍ es contradicción.
    const recent = makeCandidate({
      daysBetween: 30,
      attributes: { ageRange: 'adult', size: 'large' },
    });
    const controlScore = scoreCandidate(reference, recent, makeParams());
    expect(controlScore.breakdown.attributes.value).toBeLessThan(0.5);
  });

  it('6. hallado 5 días antes del extravío → flag timeline_implausible y S_geo × 0.3', () => {
    const candidate = makeCandidate({ distanceMeters: 2000, daysBetween: -5 });

    const score = scoreCandidate(makeReference(), candidate, makeParams());

    // λ = 3 + 1.5·5 = 10.5; base = exp(−1/10.5) ≈ 0.9092; × 0.3 ≈ 0.2727
    expect(score.flags).toContain('timeline_implausible');
    expect(score.breakdown.spatiotemporal.value).toBeCloseTo(Math.exp(-1 / 10.5) * 0.3, 6);
  });

  it('7. Flujo B sin atributos (solo foto) → S_attr y S_marks neutrales, sin conflictos', () => {
    const reference = makeReference({
      attributes: { sex: 'male', size: 'large', breedMix: ['labrador'] },
      marksTags: ['cicatriz_lomo'],
    });
    const bareCandidate = makeCandidate({ attributes: {}, marksTags: [] });

    const score = scoreCandidate(reference, bareCandidate, makeParams());

    expect(score.breakdown.attributes.value).toBeCloseTo(0.5, 10);
    expect(score.breakdown.marks.value).toBe(0.5);
    expect(
      score.breakdown.attributes.evidence.filter((e) => e.kind === 'attribute_conflict'),
    ).toEqual([]);
  });

  it('foto de mala calidad (< 0.4) → peso visual a la mitad + flag low_photo_quality', () => {
    const score = scoreCandidate(
      makeReference({ bestPhotoQuality: 0.3 }),
      makeCandidate({ visualSimilarity: 0.9 }),
      makeParams(),
    );

    expect(score.flags).toContain('low_photo_quality');
    // 0.225 / (0.225 + 0.20 + 0.20 + 0.15) = 0.225 / 0.775
    expect(score.breakdown.visual.weight).toBeCloseTo(0.225 / 0.775, 10);
    expect(effectiveWeightsSum(score)).toBeCloseTo(1, 10);
  });
});

describe('rankCandidates — comportamiento de lote', () => {
  it('2. labrador negro genérico entre 5 similares → flag visual_ambiguity en todos', () => {
    const sims = [0.88, 0.87, 0.86, 0.85, 0.84];
    const pack = sims.map((sim, i) =>
      makeCandidate({ dogId: `lab-${i}`, visualSimilarity: sim }),
    );
    // Un candidato lejano en similitud NO debe marcarse.
    const outsider = makeCandidate({ dogId: 'outsider', visualSimilarity: 0.7 });

    const ranked = rankCandidates(makeReference(), [...pack, outsider], makeParams());

    for (const item of ranked) {
      const flagged = item.score.flags.includes('visual_ambiguity');
      expect(flagged, item.candidate.dogId).toBe(item.candidate.dogId !== 'outsider');
    }
  });

  it('no declara ambigüedad con solo 2 candidatos parecidos', () => {
    const ranked = rankCandidates(
      makeReference(),
      [
        makeCandidate({ dogId: 'a', visualSimilarity: 0.88 }),
        makeCandidate({ dogId: 'b', visualSimilarity: 0.87 }),
        makeCandidate({ dogId: 'c', visualSimilarity: 0.6 }),
      ],
      makeParams(),
    );
    expect(ranked.every((r) => !r.score.flags.includes('visual_ambiguity'))).toBe(true);
  });

  it('ordena por total descendente y es estable ante empates', () => {
    // Dos candidatos idénticos salvo el id → empate exacto → orden por id.
    const twinB = makeCandidate({ dogId: 'b-twin' });
    const twinA = makeCandidate({ dogId: 'a-twin' });
    const worse = makeCandidate({ dogId: 'worse', visualSimilarity: 0.72 });

    const ranked = rankCandidates(makeReference(), [twinB, worse, twinA], makeParams());

    expect(ranked.map((r) => r.candidate.dogId)).toEqual(['a-twin', 'b-twin', 'worse']);
  });
});

describe('renderExplanation', () => {
  const explained = (): MatchScore =>
    scoreCandidate(
      makeReference({
        attributes: { sex: 'male', breedMix: ['labrador'] },
        marksTags: ['mancha_pecho_blanca'],
      }),
      makeCandidate({
        visualSimilarity: 0.9,
        distanceMeters: 1800,
        daysBetween: 2,
        attributes: { sex: 'male', breedMix: ['labrador'] },
        marksTags: ['mancha_pecho_blanca'],
      }),
      makeParams(),
    );

  it('ordena evidencia: señas → geo → visual (matching-engine.md §5)', () => {
    const text = renderExplanation(explained(), 'es-MX');

    const marksIdx = text.indexOf('Misma seña: mancha pecho blanca');
    const geoIdx = text.indexOf('1.8 km');
    const visualIdx = text.indexOf('Muy parecido en las fotos');

    expect(marksIdx).toBeGreaterThan(-1);
    expect(geoIdx).toBeGreaterThan(marksIdx);
    expect(visualIdx).toBeGreaterThan(geoIdx);
    expect(text).toContain('2 días después');
  });

  it('formatea porcentaje sin decimales con banda verbal honesta', () => {
    const score = explained();
    const text = renderExplanation(score, 'es-MX');

    expect(text).toMatch(/^\d{1,3} % · /); // "90 % · ..." — sin falsa precisión
    expect(scoreBand(score.total)).toBe('muy_alta');
    expect(scoreBand(0.75)).toBe('alta');
    expect(scoreBand(0.6)).toBe('posible');
  });

  it('con hallazgo anterior al extravío, lo dice y pide revisar fechas', () => {
    const score = scoreCandidate(
      makeReference(),
      makeCandidate({ daysBetween: -5, distanceMeters: 2000 }),
      makeParams(),
    );
    expect(renderExplanation(score, 'es-MX')).toContain('antes del extravío (revisar fechas)');
  });
});

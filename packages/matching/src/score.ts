import type { DogAttributes } from '@lomito/shared';
import type {
  CandidateRaw,
  Evidence,
  MatchFlag,
  MatchingParams,
  MatchScore,
  ReferenceReport,
  ScoredCandidate,
} from './types';

// ============================================================================
// Score multimodal (capa 2). Implementa docs/matching-engine.md §4 — si
// cambias una fórmula aquí, actualiza ese documento y los casos dorados.
// Funciones puras y deterministas: sin I/O, sin fechas "de hoy", sin azar.
// ============================================================================

// --- Constantes de la especificación (no son parámetros calibrables: los
// --- calibrables viven en matching_params y llegan por argumento) -----------

/** Calidad de foto por debajo de la cual el peso visual se reduce a la mitad (§6). */
const LOW_QUALITY_THRESHOLD = 0.4;
/** Banda de similitud respecto al mejor para detectar ambigüedad visual (§6). */
const AMBIGUITY_BAND = 0.05;
/** Candidatos mínimos dentro de la banda para declarar ambigüedad (§6). */
const AMBIGUITY_MIN_CANDIDATES = 3;
/** Tope del total cuando hay sexos confirmados contradictorios (§4.2). */
const SEX_CONFLICT_CAP = 0.3;
/** Hallazgo anterior al extravío más allá de esta tolerancia → penalización (§4.2). */
const TIMELINE_TOLERANCE_DAYS = -2;
const TIMELINE_PENALTY = 0.3;
/** Días máximos que amplían el alcance plausible λ (§4.2). */
const MAX_LAMBDA_DAYS = 30;
/** Regla de crecimiento (§6): diferencia de edad y días que la activan. */
const GROWTH_AGE_STEPS = 2;
const GROWTH_MIN_DAYS = 90;

/** Pesos internos de S_attr por estabilidad del atributo (§4.2). */
const ATTR_WEIGHTS: Record<AttrKey, number> = {
  sex: 0.3,
  size: 0.25,
  breedMix: 0.2,
  colors: 0.15,
  ageRange: 0.05,
  coatLength: 0.05,
};

const AGE_ORDER = ['puppy', 'young', 'adult', 'senior'] as const;

type AttrKey = 'sex' | 'size' | 'breedMix' | 'colors' | 'ageRange' | 'coatLength';

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

// ----------------------------------------------------------------------------
// S_visual — similitud coseno normalizada con anclas por modelo (§4.2)
// ----------------------------------------------------------------------------
function scoreVisual(
  similarity: number,
  params: MatchingParams,
): { value: number; evidence: Evidence[] } {
  const { visualFloor, visualCeil } = params.thresholds;
  const value = clamp((similarity - visualFloor) / (visualCeil - visualFloor), 0, 1);
  return { value, evidence: [{ kind: 'visual_similarity', similarity }] };
}

// ----------------------------------------------------------------------------
// S_geo — coherencia espaciotemporal (§4.2)
// ----------------------------------------------------------------------------
function scoreGeo(
  distanceMeters: number,
  daysBetween: number,
  params: MatchingParams,
): { value: number; evidence: Evidence[]; flag: MatchFlag | null } {
  const distanceKm = distanceMeters / 1000;
  // Alcance plausible: un perro se desplaza ~1-3 km/día; tope a 30 días.
  const lambda =
    params.geo.baseRadiusKm + params.geo.kmPerDay * Math.min(Math.abs(daysBetween), MAX_LAMBDA_DAYS);
  // ≤1 km es "ahí mismo"; después decae exponencial (cola larga = transporte).
  let value = Math.exp(-Math.max(0, distanceKm - 1) / lambda);

  // Dirección temporal: hallado bastante ANTES del extravío es incoherente,
  // pero las fechas que reporta la gente son difusas → penaliza, no descarta.
  let flag: MatchFlag | null = null;
  if (daysBetween < TIMELINE_TOLERANCE_DAYS) {
    value *= TIMELINE_PENALTY;
    flag = 'timeline_implausible';
  }

  const km = Math.round(distanceKm * 10) / 10;
  return { value, evidence: [{ kind: 'distance', km, days: daysBetween }], flag };
}

// ----------------------------------------------------------------------------
// S_marks — señas particulares, asimétrico (§4.2)
// ----------------------------------------------------------------------------
function scoreMarks(
  referenceTags: string[],
  candidateTags: string[],
): { value: number; evidence: Evidence[] } {
  const normalize = (tags: string[]) => tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
  const ref = normalize(referenceTags);
  const cand = new Set(normalize(candidateTags));

  // Sin señas en alguno de los lados: neutral — la ausencia no dice nada.
  if (ref.length === 0 || cand.size === 0) return { value: 0.5, evidence: [] };

  const matches = [...new Set(ref)].filter((t) => cand.has(t));
  // Asimetría deliberada: una seña coincidente casi identifica; cero
  // coincidencias con señas en ambos lados apenas penaliza.
  const value = matches.length === 0 ? 0.35 : matches.length === 1 ? 0.8 : 1.0;
  return { value, evidence: matches.map((tag) => ({ kind: 'mark_match', tag })) };
}

// ----------------------------------------------------------------------------
// S_attr — compatibilidad de atributos ponderada por estabilidad (§4.2, §6)
// ----------------------------------------------------------------------------
type Cmp = { value: number; evidence: Evidence | null };

function cmpScalar(attribute: AttrKey, a: string | undefined, b: string | undefined): Cmp {
  if (a === undefined || b === undefined) return { value: 0.5, evidence: null };
  if (a === b) return { value: 1, evidence: { kind: 'attribute_match', attribute, value: a } };
  return {
    value: 0,
    evidence: { kind: 'attribute_conflict', attribute, reference: a, candidate: b },
  };
}

function cmpArray(attribute: AttrKey, a: string[] | undefined, b: string[] | undefined): Cmp {
  if (!a?.length || !b?.length) return { value: 0.5, evidence: null };
  const setB = new Set(b.map((x) => x.trim().toLowerCase()));
  const common = a.map((x) => x.trim().toLowerCase()).filter((x) => setB.has(x));
  if (common.length > 0) {
    return { value: 1, evidence: { kind: 'attribute_match', attribute, value: common.join(', ') } };
  }
  return {
    value: 0,
    evidence: { kind: 'attribute_conflict', attribute, reference: a.join(', '), candidate: b.join(', ') },
  };
}

function scoreAttributes(
  reference: DogAttributes,
  candidate: DogAttributes,
  daysBetween: number,
): { value: number; evidence: Evidence[]; sexConflictConfirmed: boolean } {
  // Regla de crecimiento (§6): si la edad difiere ≥2 escalones y pasaron >90
  // días, tamaño y edad se vuelven neutrales — un cachorro perdido hace meses
  // hoy es más grande, y eso no es evidencia en contra.
  const refAge = reference.ageRange ? AGE_ORDER.indexOf(reference.ageRange) : -1;
  const candAge = candidate.ageRange ? AGE_ORDER.indexOf(candidate.ageRange) : -1;
  const growthMode =
    refAge >= 0 &&
    candAge >= 0 &&
    Math.abs(refAge - candAge) >= GROWTH_AGE_STEPS &&
    daysBetween > GROWTH_MIN_DAYS;

  const neutral: Cmp = { value: 0.5, evidence: null };
  const comparisons: Record<AttrKey, Cmp> = {
    sex: cmpScalar('sex', reference.sex, candidate.sex),
    size: growthMode ? neutral : cmpScalar('size', reference.size, candidate.size),
    breedMix: cmpArray('breedMix', reference.breedMix, candidate.breedMix),
    colors: cmpArray('colors', reference.colors, candidate.colors),
    ageRange: growthMode ? neutral : cmpScalar('ageRange', reference.ageRange, candidate.ageRange),
    coatLength: cmpScalar('coatLength', reference.coatLength, candidate.coatLength),
  };

  let value = 0;
  const evidence: Evidence[] = [];
  for (const key of Object.keys(ATTR_WEIGHTS) as AttrKey[]) {
    const cmp = comparisons[key];
    value += ATTR_WEIGHTS[key] * cmp.value;
    if (cmp.evidence) evidence.push(cmp.evidence);
  }

  // Gate de sexo (§4.2): solo cuando AMBOS lados fueron confirmados por humano.
  const sexConflictConfirmed =
    reference.sex !== undefined &&
    candidate.sex !== undefined &&
    reference.sex !== candidate.sex &&
    reference.sexConfirmed === true &&
    candidate.sexConfirmed === true;

  return { value, evidence, sexConflictConfirmed };
}

// ----------------------------------------------------------------------------
// scoreCandidate — la función central del sistema (§4.1)
// ----------------------------------------------------------------------------
export function scoreCandidate(
  reference: ReferenceReport,
  candidate: CandidateRaw,
  params: MatchingParams,
): MatchScore {
  const flags: MatchFlag[] = [];

  const marks = scoreMarks(reference.marksTags, candidate.marksTags);
  const geo = scoreGeo(candidate.distanceMeters, candidate.daysBetween, params);
  if (geo.flag) flags.push(geo.flag);
  const attrs = scoreAttributes(reference.attributes, candidate.attributes, candidate.daysBetween);

  // Componente visual: puede no ser computable (sin embedding todavía).
  let visualValue: number | null = null;
  let visualEvidence: Evidence[] = [];
  let visualBaseWeight = params.weights.visual;
  if (candidate.visualSimilarity === null) {
    flags.push('no_embedding');
    visualBaseWeight = 0;
  } else {
    const v = scoreVisual(candidate.visualSimilarity, params);
    visualValue = v.value;
    visualEvidence = v.evidence;
    // Foto mala del lado de referencia: el visual pierde autoridad (§6).
    if (reference.bestPhotoQuality !== null && reference.bestPhotoQuality < LOW_QUALITY_THRESHOLD) {
      visualBaseWeight /= 2;
      flags.push('low_photo_quality');
    }
  }

  // Renormalización (§4.1): el componente excluido no se rellena con cero —
  // eso penalizaría la ausencia de datos. Los pesos efectivos suman 1.
  const base = {
    visual: visualBaseWeight,
    attributes: params.weights.attributes,
    spatiotemporal: params.weights.spatiotemporal,
    marks: params.weights.marks,
  };
  const weightSum = base.visual + base.attributes + base.spatiotemporal + base.marks;
  const eff = {
    visual: base.visual / weightSum,
    attributes: base.attributes / weightSum,
    spatiotemporal: base.spatiotemporal / weightSum,
    marks: base.marks / weightSum,
  };

  let total =
    eff.visual * (visualValue ?? 0) +
    eff.attributes * attrs.value +
    eff.spatiotemporal * geo.value +
    eff.marks * marks.value;

  if (attrs.sexConflictConfirmed) {
    total = Math.min(total, SEX_CONFLICT_CAP);
    flags.push('sex_conflict');
  }

  const breakdown: MatchScore['breakdown'] = {
    visual: { value: visualValue, weight: eff.visual, evidence: visualEvidence },
    attributes: { value: attrs.value, weight: eff.attributes, evidence: attrs.evidence },
    spatiotemporal: { value: geo.value, weight: eff.spatiotemporal, evidence: geo.evidence },
    marks: { value: marks.value, weight: eff.marks, evidence: marks.evidence },
  };

  return { total: clamp(total, 0, 1), breakdown, flags, paramsId: params.paramsId };
}

// ----------------------------------------------------------------------------
// rankCandidates — score en lote + ambigüedad visual + orden estable (§6)
// ----------------------------------------------------------------------------
export function rankCandidates(
  reference: ReferenceReport,
  candidates: CandidateRaw[],
  params: MatchingParams,
): ScoredCandidate[] {
  const scored: ScoredCandidate[] = candidates.map((candidate) => ({
    candidate,
    score: scoreCandidate(reference, candidate, params),
  }));

  // Ambigüedad visual (§6): en vecindarios homogéneos (labradores negros) la
  // similitud discrimina poco — se marca para que la UI pida mirar las señas.
  const sims = scored
    .map((s) => s.candidate.visualSimilarity)
    .filter((s): s is number => s !== null);
  if (sims.length > 0) {
    const best = Math.max(...sims);
    const inBand = scored.filter(
      (s) => s.candidate.visualSimilarity !== null && s.candidate.visualSimilarity >= best - AMBIGUITY_BAND,
    );
    if (inBand.length >= AMBIGUITY_MIN_CANDIDATES) {
      for (const s of inBand) s.score.flags.push('visual_ambiguity');
    }
  }

  // Orden: total desc; empates deterministas (distancia asc, luego id).
  return scored.sort(
    (a, b) =>
      b.score.total - a.score.total ||
      a.candidate.distanceMeters - b.candidate.distanceMeters ||
      a.candidate.dogId.localeCompare(b.candidate.dogId),
  );
}

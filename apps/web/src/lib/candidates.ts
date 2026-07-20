import {
  rankCandidates,
  renderExplanation,
  scoreBand,
  type CandidateRaw,
  type MatchingParams,
  type ReferenceReport,
} from '@lomito/matching';
import { dogAttributesSchema, type ScoredCandidate } from '@lomito/shared';
import { PHOTOS_BUCKET, supabaseAdmin } from './supabase-admin';

// ============================================================================
// Búsqueda interactiva de candidatos: RPC match_candidates (capa 1) + score
// del dominio (capa 2) + armado del DTO público (fotos firmadas, ubicación
// difuminada, contacto SIEMPRE enmascarado). Mismo código para el POST del
// alta y para GET /api/reports/:id/candidates.
// ============================================================================

/** Fila cruda que devuelve la RPC (espejo de la firma SQL). */
interface RpcCandidateRow {
  candidate_dog_id: string;
  candidate_report_type: 'lost' | 'found';
  visual_similarity: number | null;
  best_photo_id: string | null;
  distance_meters: number;
  days_between: number;
  attributes: unknown;
  distinctive_marks: string | null;
  marks_tags: string[] | null;
  event_date: string;
}

/** Valida el JSONB de atributos sin tirar la búsqueda si viniera corrupto. */
export function parseAttributes(raw: unknown): CandidateRaw['attributes'] {
  const parsed = dogAttributesSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

export function mapRpcRow(row: RpcCandidateRow): CandidateRaw {
  return {
    dogId: row.candidate_dog_id,
    reportType: row.candidate_report_type,
    visualSimilarity: row.visual_similarity,
    bestPhotoId: row.best_photo_id,
    distanceMeters: row.distance_meters,
    daysBetween: row.days_between,
    attributes: parseAttributes(row.attributes),
    marksTags: row.marks_tags ?? [],
    eventDate: row.event_date,
  };
}

export async function searchCandidates(
  reference: ReferenceReport,
  params: MatchingParams,
): Promise<ScoredCandidate[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.rpc('match_candidates', { p_dog_id: reference.dogId });
  if (error) throw new Error(`match_candidates falló: ${error.message}`);

  const raw = ((data ?? []) as RpcCandidateRow[]).map(mapRpcRow);
  const ranked = rankCandidates(reference, raw, params).filter(
    ({ score }) => score.total >= params.thresholds.show,
  );
  if (ranked.length === 0) return [];

  const ids = ranked.map(({ candidate }) => candidate.dogId);

  // Datos complementarios en lote: ubicación difuminada (vista pública),
  // máscara de contacto y foto a firmar. Nunca datos personales crudos.
  const [publicRows, contactRows, photoRows] = await Promise.all([
    db.from('dogs_public').select('id, approx_lat, approx_lng, is_sensitive').in('id', ids),
    db.from('contacts').select('dog_id, display_mask').in('dog_id', ids),
    db
      .from('dog_photos')
      .select('id, dog_id, storage_path, is_primary')
      .in('dog_id', ids),
  ]);

  const publicById = new Map(
    (publicRows.data ?? []).map((r) => [r.id as string, r as Record<string, unknown>]),
  );
  const maskByDog = new Map(
    (contactRows.data ?? []).map((r) => [r.dog_id as string, r.display_mask as string]),
  );
  const photos = photoRows.data ?? [];
  const photoPathFor = (candidate: CandidateRaw): string | null => {
    const own = photos.filter((p) => p.dog_id === candidate.dogId);
    const best =
      own.find((p) => p.id === candidate.bestPhotoId) ?? own.find((p) => p.is_primary) ?? own[0];
    return (best?.storage_path as string) ?? null;
  };

  // URLs firmadas de lectura, TTL 1 h (security-privacy.md §7), en un lote.
  const paths = ranked.map(({ candidate }) => photoPathFor(candidate)).filter((p): p is string => p !== null);
  const signed = paths.length
    ? await db.storage.from(PHOTOS_BUCKET).createSignedUrls(paths, 3600)
    : { data: [], error: null };
  const urlByPath = new Map(
    (signed.data ?? []).map((s) => [s.path as string, s.signedUrl as string]),
  );

  return ranked.map(({ candidate, score }) => {
    const pub = publicById.get(candidate.dogId);
    const path = photoPathFor(candidate);
    return {
      reportId: candidate.dogId,
      photoUrl: path ? (urlByPath.get(path) ?? null) : null,
      totalScore: score.total,
      scoreBand: scoreBand(score.total),
      explanation: renderExplanation(score, 'es-MX'),
      flags: score.flags,
      approxLocation: {
        lat: Number(pub?.approx_lat ?? 0),
        lng: Number(pub?.approx_lng ?? 0),
      },
      daysBetween: candidate.daysBetween,
      displayMask: maskByDog.get(candidate.dogId) ?? '•••',
      matchId: null, // la capa 3 (Sprint 3) enlazará el match formal
    } satisfies ScoredCandidate;
  });
}

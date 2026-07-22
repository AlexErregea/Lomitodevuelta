import {
  renderExplanation,
  scoreBand,
  type Evidence,
  type MatchScore,
} from '@lomito/matching';
import type { ManagedMatch, MatchSide, MatchStatus, OwnershipProof } from '@lomito/shared';
import { PHOTOS_BUCKET, supabaseAdmin } from './supabase-admin';

// ============================================================================
// Carga la bandeja de coincidencias de un reporte para el enlace de gestión.
// El texto de la explicación se GENERA al mostrar (data-model.md): se
// reconstruye un MatchScore mínimo desde las columnas persistidas + la
// evidencia estructurada y se pasa por renderExplanation — nunca se guardó el
// texto.
// ============================================================================

/** Estados que la bandeja muestra (los cerrados por rechazo/expiración se ocultan). */
const VISIBLE: MatchStatus[] = ['suggested', 'notified', 'accepted', 'confirmed_reunion'];

interface MatchRow {
  id: string;
  status: MatchStatus;
  dog_lost_id: string;
  dog_found_id: string;
  lost_accepted_at: string | null;
  found_accepted_at: string | null;
  ownership_proof: OwnershipProof | null;
  visual_score: number | null;
  attribute_score: number | null;
  geo_score: number | null;
  marks_score: number | null;
  total_score: number;
  explanation: Evidence[];
  params_id: number;
}

export async function loadReportMatches(dogId: string): Promise<ManagedMatch[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from('matches')
    .select(
      'id, status, dog_lost_id, dog_found_id, lost_accepted_at, found_accepted_at, ownership_proof, visual_score, attribute_score, geo_score, marks_score, total_score, explanation, params_id',
    )
    .or(`dog_lost_id.eq.${dogId},dog_found_id.eq.${dogId}`)
    .in('status', VISIBLE)
    .order('total_score', { ascending: false });
  const rows = (data ?? []) as MatchRow[];
  if (rows.length === 0) return [];

  const counterpartIds = rows.map((m) => (m.dog_lost_id === dogId ? m.dog_found_id : m.dog_lost_id));
  const [{ data: publicRows }, { data: photoRows }] = await Promise.all([
    db.from('dogs_public').select('id, approx_lat, approx_lng').in('id', counterpartIds),
    db.from('dog_photos').select('dog_id, storage_path, is_primary').in('dog_id', counterpartIds),
  ]);
  const publicById = new Map((publicRows ?? []).map((r) => [r.id as string, r]));
  const primaryPathByDog = new Map<string, string>();
  for (const p of photoRows ?? []) {
    if (!primaryPathByDog.has(p.dog_id as string) || p.is_primary) {
      primaryPathByDog.set(p.dog_id as string, p.storage_path as string);
    }
  }
  const paths = [...primaryPathByDog.values()];
  const { data: signed } = paths.length
    ? await db.storage.from(PHOTOS_BUCKET).createSignedUrls(paths, 3600)
    : { data: [] };
  const urlByPath = new Map(
    ((signed ?? []) as Array<{ path: string; signedUrl: string }>).map((s) => [s.path, s.signedUrl]),
  );

  return rows.map((m) => {
    const side: MatchSide = m.dog_lost_id === dogId ? 'lost' : 'found';
    const counterpartId = side === 'lost' ? m.dog_found_id : m.dog_lost_id;
    const pub = publicById.get(counterpartId);
    const path = primaryPathByDog.get(counterpartId);
    const score = reconstructScore(m);
    const distance = m.explanation.find((e): e is Extract<Evidence, { kind: 'distance' }> => e.kind === 'distance');

    return {
      matchId: m.id,
      status: m.status,
      side,
      totalScore: m.total_score,
      scoreBand: scoreBand(m.total_score),
      explanation: renderExplanation(score, 'es-MX'),
      flags: [], // no se persisten; la explicación y la banda bastan en la bandeja
      counterpart: {
        reportId: counterpartId,
        photoUrl: path ? (urlByPath.get(path) ?? null) : null,
        approxLocation: { lat: Number(pub?.approx_lat ?? 0), lng: Number(pub?.approx_lng ?? 0) },
        daysBetween: distance?.days ?? 0,
      },
      selfAccepted: side === 'lost' ? m.lost_accepted_at !== null : m.found_accepted_at !== null,
      counterpartAccepted: side === 'lost' ? m.found_accepted_at !== null : m.lost_accepted_at !== null,
      // La prueba de propiedad la valida el lado 'found' (ve lo que aportó el dueño).
      ownershipProof: side === 'found' ? m.ownership_proof : null,
    } satisfies ManagedMatch;
  });
}

/** Reconstruye el MatchScore mínimo que renderExplanation necesita (§5). */
function reconstructScore(m: MatchRow): MatchScore {
  const empty = { weight: 0, evidence: [] as Evidence[] };
  return {
    total: m.total_score,
    breakdown: {
      visual: { value: m.visual_score, ...empty },
      attributes: { value: m.attribute_score, ...empty },
      spatiotemporal: {
        value: m.geo_score,
        weight: 0,
        evidence: m.explanation.filter((e) => e.kind === 'distance'),
      },
      marks: {
        value: m.marks_score,
        weight: 0,
        evidence: m.explanation.filter((e) => e.kind === 'mark_match'),
      },
    },
    flags: [],
    paramsId: m.params_id,
  };
}

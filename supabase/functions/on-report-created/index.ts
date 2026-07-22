// ============================================================================
// Edge Function: on-report-created — capa 3 del matching (proactiva)
// ----------------------------------------------------------------------------
// Disparador: trigger de la BD (dogs.embedding_status → 'done') vía pg_net.
// Corre EL MISMO dominio que la web (@lomito/matching): la única diferencia
// es el umbral (notify 0.72, no show 0.55) y que aquí sí se crean matches
// formales y se notifica a ambas partes.
//   1. Valida el secreto compartido (EDGE_WEBHOOK_SECRET).
//   2. RPC match_candidates(dog_id) → candidatos crudos (capa 1).
//   3. rankCandidates() de @lomito/matching (capa 2).
//   4. score ≥ notify → INSERT matches (par único) + notificaciones idempotentes.
// Garantías: el par (lost, found) es único → jamás dos matches; el
// idempotency_key es único → jamás dos WhatsApp; tope de 3 avisos/reporte/día.
// ============================================================================

import { rankCandidates, type CandidateRaw, type MatchingParams, type ReferenceReport } from '@lomito/matching';
import { adminClient } from '../_shared/db.ts';
import { requireEnv } from '../_shared/env.ts';
import { matchNotificationsTodayForDog, notify } from '../_shared/notify.ts';

const MAX_MATCH_NOTIFICATIONS_PER_DAY = 3;

interface RpcRow {
  candidate_dog_id: string;
  candidate_report_type: 'lost' | 'found';
  visual_similarity: number | null;
  best_photo_id: string | null;
  distance_meters: number;
  days_between: number;
  attributes: Record<string, unknown> | null;
  distinctive_marks: string | null;
  marks_tags: string[] | null;
  event_date: string;
}

Deno.serve(async (req) => {
  if (req.headers.get('authorization') !== `Bearer ${requireEnv('EDGE_WEBHOOK_SECRET')}`) {
    return json({ error: { code: 'unauthorized', message: 'Secreto inválido.' } }, 401);
  }
  const body = (await req.json().catch(() => ({}))) as { dog_id?: string };
  const dogId = body.dog_id;
  if (!dogId) return json({ error: { code: 'validation_error', message: 'Falta dog_id.' } }, 400);

  const db = adminClient();

  // Reporte de referencia (el que acaba de quedar listo).
  const { data: dog } = await db
    .from('dogs')
    .select('id, report_type, attributes, marks_tags, event_date, status, moderation_status, deleted_at')
    .eq('id', dogId)
    .single();
  if (!dog || dog.status !== 'active' || dog.moderation_status !== 'approved' || dog.deleted_at) {
    return json({ skipped: 'reporte no elegible' }, 200);
  }

  const { data: params } = await db.from('matching_params').select('*').eq('is_active', true).single();
  if (!params) return json({ error: { code: 'internal_error', message: 'Sin params activos.' } }, 500);
  const matchingParams = toMatchingParams(params);

  const { data: bestPhoto } = await db
    .from('dog_photos')
    .select('quality_score')
    .eq('dog_id', dogId)
    .eq('is_primary', true)
    .maybeSingle();

  const reference: ReferenceReport = {
    dogId: dog.id as string,
    reportType: dog.report_type as 'lost' | 'found',
    attributes: (dog.attributes ?? {}) as ReferenceReport['attributes'],
    marksTags: (dog.marks_tags as string[]) ?? [],
    eventDate: dog.event_date as string,
    bestPhotoQuality: (bestPhoto?.quality_score as number | null) ?? null,
  };

  // Capa 1 (SQL) → capa 2 (dominio), filtrada al umbral de NOTIFICAR.
  const { data: rows, error: rpcError } = await db.rpc('match_candidates', { p_dog_id: dogId });
  if (rpcError) return json({ error: { code: 'internal_error', message: rpcError.message } }, 500);

  const raw: CandidateRaw[] = ((rows ?? []) as RpcRow[]).map((r) => ({
    dogId: r.candidate_dog_id,
    reportType: r.candidate_report_type,
    visualSimilarity: r.visual_similarity,
    bestPhotoId: r.best_photo_id,
    distanceMeters: r.distance_meters,
    daysBetween: r.days_between,
    attributes: (r.attributes ?? {}) as CandidateRaw['attributes'],
    marksTags: r.marks_tags ?? [],
    eventDate: r.event_date,
  }));
  const toNotify = rankCandidates(reference, raw, matchingParams).filter(
    ({ score }) => score.total >= matchingParams.thresholds.notify,
  );

  const appBaseUrl = requireEnv('APP_BASE_URL');
  const summary = { evaluated: raw.length, matched: 0, notified: 0 };

  for (const { candidate, score } of toNotify) {
    const isReferenceLost = reference.reportType === 'lost';
    const dogLostId = isReferenceLost ? reference.dogId : candidate.dogId;
    const dogFoundId = isReferenceLost ? candidate.dogId : reference.dogId;

    // Evidencia estructurada (matches.explanation); el texto se genera al mostrar.
    const evidence = [
      ...score.breakdown.visual.evidence,
      ...score.breakdown.attributes.evidence,
      ...score.breakdown.spatiotemporal.evidence,
      ...score.breakdown.marks.evidence,
    ];

    // Par único: si ya existe el match para este par, no se inserta (idempotencia
    // del matching proactivo — el mismo par se evalúa una sola vez).
    const { data: match } = await db
      .from('matches')
      .insert({
        dog_lost_id: dogLostId,
        dog_found_id: dogFoundId,
        source: 'proactive',
        params_id: score.paramsId,
        visual_score: score.breakdown.visual.value,
        attribute_score: score.breakdown.attributes.value,
        geo_score: score.breakdown.spatiotemporal.value,
        marks_score: score.breakdown.marks.value,
        total_score: score.total,
        explanation: evidence,
        status: 'suggested',
      })
      .select('id')
      .maybeSingle();
    if (!match) continue; // el par ya tenía match

    summary.matched++;
    await db.from('events').insert({
      event_type: 'match_suggested',
      actor_type: 'system',
      dog_id: reference.dogId,
      match_id: match.id,
      payload: { total_score: score.total, params_id: score.paramsId },
    });

    // Notifica a AMBAS partes (con tope anti-spam por reporte/día). Cada parte
    // recibe la ficha pública de la contraparte y usa su enlace de gestión.
    let notifiedAny = false;
    for (const [selfDogId, otherDogId] of [
      [reference.dogId, candidate.dogId],
      [candidate.dogId, reference.dogId],
    ] as const) {
      if ((await matchNotificationsTodayForDog(db, selfDogId)) >= MAX_MATCH_NOTIFICATIONS_PER_DAY) continue;
      const contact = await primaryContact(db, selfDogId);
      if (!contact) continue;
      const email = await emailContact(db, selfDogId);
      const sent = await notify({
        db,
        idempotencyKey: `match:${match.id}:notify:${contact.id}`,
        contactId: contact.id,
        channel: contact.channel,
        to: contact.value,
        matchId: match.id as string,
        template: 'match_found',
        variables: { share_url: `${appBaseUrl}/r/${otherDogId}` },
        fallbackEmail: email && contact.channel === 'whatsapp' ? { contactId: email.id, to: email.value } : null,
      });
      if (sent) notifiedAny = true;
    }

    if (notifiedAny) {
      summary.notified++;
      await db.from('matches').update({ status: 'notified' }).eq('id', match.id);
      await db.from('events').insert({
        event_type: 'match_notified',
        actor_type: 'system',
        dog_id: reference.dogId,
        match_id: match.id,
        payload: { channel: 'whatsapp', template: 'match_found' },
      });
    }
  }

  return json(summary, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

interface ParamsRow {
  id: number;
  weights: MatchingParams['weights'];
  thresholds: { show: number; notify: number; visual_floor: number; visual_ceil: number };
  geo_config: { base_radius_km: number; km_per_day: number; max_radius_km: number; max_days_window: number };
}

function toMatchingParams(p: ParamsRow): MatchingParams {
  return {
    paramsId: p.id,
    weights: p.weights,
    thresholds: {
      show: p.thresholds.show,
      notify: p.thresholds.notify,
      visualFloor: p.thresholds.visual_floor,
      visualCeil: p.thresholds.visual_ceil,
    },
    geo: {
      baseRadiusKm: p.geo_config.base_radius_km,
      kmPerDay: p.geo_config.km_per_day,
      maxRadiusKm: p.geo_config.max_radius_km,
      maxDaysWindow: p.geo_config.max_days_window,
    },
  };
}

async function primaryContact(
  db: ReturnType<typeof adminClient>,
  dogId: string,
): Promise<{ id: string; channel: 'whatsapp' | 'email'; value: string } | null> {
  // Prioriza WhatsApp (canal primario del producto); email es fallback.
  const { data } = await db
    .from('contacts')
    .select('id, channel, value')
    .eq('dog_id', dogId)
    .order('channel', { ascending: true }); // 'email' < 'whatsapp' alfabéticamente
  const rows = (data ?? []) as Array<{ id: string; channel: 'whatsapp' | 'email'; value: string }>;
  return rows.find((r) => r.channel === 'whatsapp') ?? rows[0] ?? null;
}

async function emailContact(
  db: ReturnType<typeof adminClient>,
  dogId: string,
): Promise<{ id: string; value: string } | null> {
  const { data } = await db
    .from('contacts')
    .select('id, value')
    .eq('dog_id', dogId)
    .eq('channel', 'email')
    .maybeSingle();
  return data ? { id: data.id as string, value: data.value as string } : null;
}

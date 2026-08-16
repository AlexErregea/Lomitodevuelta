import { supabaseAdmin } from './supabase-admin';

// ============================================================================
// Registro en la tabla `events` — fuente de verdad del embudo (observability.md
// §2). Los nombres de event_type son canónicos y se comparten con PostHog.
// Best-effort deliberado: fallar en métricas jamás rompe la acción del usuario.
// ============================================================================

export type FunnelEventType =
  | 'report_started'
  | 'photo_uploaded'
  | 'extraction_done'
  | 'extraction_failed'
  | 'report_created'
  | 'candidates_shown'
  | 'match_suggested'
  | 'match_notified'
  | 'match_accepted_side'
  | 'match_rejected'
  | 'contact_revealed'
  | 'reunion_confirmed'
  | 'share_clicked'
  | 'report_renewed'
  | 'report_deleted'
  // Alta rechazada por una defensa anti-abuso (S3-A). No es parte del embudo
  // de conversión, pero se registra en la misma tabla porque es la única
  // manera de distinguir "nadie reportó" de "no dejamos reportar": el payload
  // dice cuál defensa actuó (rate_limit | global_cap | turnstile).
  | 'report_throttled';

export async function recordEvent(input: {
  eventType: FunnelEventType;
  dogId?: string;
  matchId?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabaseAdmin().from('events').insert({
    event_type: input.eventType,
    actor_type: 'citizen',
    dog_id: input.dogId ?? null,
    match_id: input.matchId ?? null,
    payload: input.payload ?? {},
  });
  if (error) {
    // No propagar: la observabilidad nunca tira el camino caliente.
    console.error(JSON.stringify({ msg: 'event_insert_failed', eventType: input.eventType, error: error.message }));
  }
}

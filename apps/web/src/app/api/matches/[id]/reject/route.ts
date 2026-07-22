import { NextResponse, type NextRequest } from 'next/server';
import { rejectMatchRequestSchema, type MatchStatus, type RejectMatchResponse } from '@lomito/shared';
import { apiError } from '@/lib/api-response';
import { recordEvent } from '@/lib/events';
import { authenticateMatchSide } from '@/lib/match-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

// ============================================================================
// POST /api/matches/:id/reject — rechazar una coincidencia. Un rechazo detiene
// el puente (el contacto jamás se expuso) y su motivo alimenta el dataset de
// calibración (ADR-0004). No se puede rechazar algo ya confirmado.
// ============================================================================

const FINAL: MatchStatus[] = ['confirmed_reunion', 'expired'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('validation_error', 'El cuerpo debe ser JSON.');
  }
  const parsed = rejectMatchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('validation_error', parsed.error.issues.map((i) => i.message).join('; '));
  }
  const { side, reason } = parsed.data;

  const auth = await authenticateMatchSide(request, id, side);
  if (!auth.ok) return auth.response;
  if (FINAL.includes(auth.match.status)) {
    return apiError('conflict', 'Esta coincidencia ya está cerrada.');
  }

  const { error } = await supabaseAdmin()
    .from('matches')
    .update({ status: 'rejected', feedback_note: reason ?? null })
    .eq('id', id);
  if (error) {
    console.error(JSON.stringify({ msg: 'match_reject_failed', error: error.message }));
    return apiError('internal_error', 'No se pudo registrar el rechazo.');
  }
  await recordEvent({ eventType: 'match_rejected', matchId: id, payload: { side, reason: reason ?? null } });

  const response: RejectMatchResponse = { status: 'rejected' };
  return NextResponse.json(response);
}

import { NextResponse, type NextRequest } from 'next/server';
import { acceptMatchRequestSchema, type AcceptMatchResponse, type MatchStatus } from '@lomito/shared';
import { apiError } from '@/lib/api-response';
import { openContactBridge } from '@/lib/contact-bridge';
import { recordEvent } from '@/lib/events';
import { authenticateMatchSide } from '@/lib/match-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

// ============================================================================
// POST /api/matches/:id/accept — aceptar una coincidencia (ADR-0006).
// El lado 'lost' (dueño) DEBE aportar prueba de propiedad ligera antes de que
// su aceptación cuente (security-privacy.md §6): foto histórica o una seña no
// visible en la ficha, que la contraparte valida entre pares. Con AMBAS
// aceptaciones, el servidor abre el puente de contacto.
// ============================================================================

/** Estados desde los que aún se puede aceptar. */
const ACCEPTABLE: MatchStatus[] = ['suggested', 'notified', 'accepted'];

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
  const parsed = acceptMatchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('validation_error', parsed.error.issues.map((i) => i.message).join('; '));
  }
  const { side, ownershipProof } = parsed.data;

  const auth = await authenticateMatchSide(request, id, side);
  if (!auth.ok) return auth.response;
  const match = auth.match;

  if (!ACCEPTABLE.includes(match.status)) {
    return apiError('conflict', 'Esta coincidencia ya no admite aceptación.');
  }
  // Prueba de propiedad: obligatoria para el dueño, prohibida para el hallador.
  if (side === 'lost' && !ownershipProof && !match.ownershipProof) {
    return apiError('validation_error', 'El dueño debe aportar una prueba de propiedad para aceptar.');
  }

  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  patch[side === 'lost' ? 'lost_accepted_at' : 'found_accepted_at'] = now;
  if (side === 'lost' && ownershipProof) patch.ownership_proof = ownershipProof;

  const { error } = await db.from('matches').update(patch).eq('id', id);
  if (error) {
    console.error(JSON.stringify({ msg: 'match_accept_failed', error: error.message }));
    return apiError('internal_error', 'No se pudo registrar la aceptación.');
  }
  await recordEvent({ eventType: 'match_accepted_side', matchId: id, payload: { side } });

  // ¿Doble aceptación? → abrir el puente (una sola vez).
  const bothAccepted =
    (side === 'lost' ? true : match.lostAcceptedAt !== null) &&
    (side === 'found' ? true : match.foundAcceptedAt !== null);

  // El solicitante autenticó como `side`: su dog es ese lado, el otro el opuesto.
  const dogLostId = side === 'lost' ? match.self.dogId : match.counterpart.dogId;
  const dogFoundId = side === 'lost' ? match.counterpart.dogId : match.self.dogId;

  let contactRevealed = false;
  let status: MatchStatus = 'accepted';
  if (bothAccepted && match.status !== 'accepted') {
    await db.from('matches').update({ status: 'accepted' }).eq('id', id);
    contactRevealed = await openContactBridge(id, dogLostId, dogFoundId);
  } else if (!bothAccepted) {
    status = match.status === 'suggested' ? 'notified' : match.status;
  }

  const response: AcceptMatchResponse = { status, contactRevealed };
  return NextResponse.json(response);
}

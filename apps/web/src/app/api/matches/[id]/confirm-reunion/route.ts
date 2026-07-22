import { NextResponse, type NextRequest } from 'next/server';
import { confirmReunionRequestSchema, type ConfirmReunionResponse } from '@lomito/shared';
import { apiError } from '@/lib/api-response';
import { recordEvent } from '@/lib/events';
import { authenticateMatchSide } from '@/lib/match-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

// ============================================================================
// POST /api/matches/:id/confirm-reunion — la North Star 🎉. Solo tras la doble
// aceptación (puente abierto): marca el match 'confirmed_reunion', pasa ambos
// reportes a 'reunited' (salen del inventario) y registra el evento
// reunion_confirmed, que es la métrica que se cuenta, no se infiere.
// ============================================================================

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
  const parsed = confirmReunionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('validation_error', parsed.error.issues.map((i) => i.message).join('; '));
  }

  const auth = await authenticateMatchSide(request, id, parsed.data.side);
  if (!auth.ok) return auth.response;
  // Solo se confirma una reunión sobre un match aceptado por ambas partes.
  if (auth.match.status !== 'accepted') {
    return apiError('conflict', 'La reunión solo se confirma tras la aceptación de ambas partes.');
  }

  const db = supabaseAdmin();
  const { error } = await db.from('matches').update({ status: 'confirmed_reunion' }).eq('id', id);
  if (error) {
    console.error(JSON.stringify({ msg: 'confirm_reunion_failed', error: error.message }));
    return apiError('internal_error', 'No se pudo confirmar la reunión.');
  }
  // Ambos reportes salen del inventario activo.
  await db
    .from('dogs')
    .update({ status: 'reunited' })
    .in('id', [auth.match.self.dogId, auth.match.counterpart.dogId]);

  await recordEvent({ eventType: 'reunion_confirmed', dogId: auth.match.self.dogId, matchId: id });

  const response: ConfirmReunionResponse = { status: 'confirmed_reunion' };
  return NextResponse.json(response);
}

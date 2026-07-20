import { NextResponse, type NextRequest } from 'next/server';
import { type RenewReportResponse } from '@lomito/shared';
import { apiError } from '@/lib/api-response';
import { recordEvent } from '@/lib/events';
import { authenticateManageRequest } from '@/lib/manage-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

// ============================================================================
// POST /api/reports/:id/renew — renovar vigencia (+60 días desde HOY, no
// desde el vencimiento: renovar tarde no debe regalar tiempo). Un reporte
// expirado vuelve a 'active' y reingresa al matching; uno reunido o retirado
// no se puede renovar (conflict).
// ============================================================================

/** Misma vigencia que el alta (security-privacy.md §5). */
const RENEWAL_TTL_DAYS = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authenticateManageRequest(request, id);
  if (!auth.ok) return auth.response;

  if (auth.dog.status !== 'active' && auth.dog.status !== 'expired') {
    return apiError('conflict', 'Este reporte ya no se puede renovar.');
  }

  const expiresAt = new Date(Date.now() + RENEWAL_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  const { error } = await supabaseAdmin()
    .from('dogs')
    .update({ expires_at: expiresAt, status: 'active' })
    .eq('id', id);
  if (error) {
    console.error(JSON.stringify({ msg: 'report_renew_failed', error: error.message }));
    return apiError('internal_error', 'No se pudo renovar el reporte.');
  }
  await recordEvent({ eventType: 'report_renewed', dogId: id, payload: { expires_at: expiresAt } });

  const response: RenewReportResponse = { reportId: id, expiresAt };
  return NextResponse.json(response);
}

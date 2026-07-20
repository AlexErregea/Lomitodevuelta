import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { type CandidatesResponse } from '@lomito/shared';
import type { ReferenceReport } from '@lomito/matching';
import { apiError } from '@/lib/api-response';
import { parseAttributes, searchCandidates } from '@/lib/candidates';
import { verifyManageToken } from '@/lib/manage-token';
import { loadActiveMatchingConfig } from '@/lib/matching-config';
import { supabaseAdmin } from '@/lib/supabase-admin';

// ============================================================================
// GET /api/reports/:id/candidates — candidatos puntuados del PROPIO reporte.
// Auth: token de gestión (ADR-0006) en X-Manage-Token; el servidor compara
// contra el hash almacenado. 404 y 401 indistinguibles de información: un
// atacante no aprende si el id existe.
// ============================================================================

const idSchema = z.string().uuid();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('not_found', 'Reporte no encontrado.');

  const token = request.headers.get('x-manage-token');
  if (!token) return apiError('unauthorized', 'Falta el token de gestión.');

  const db = supabaseAdmin();
  const { data: dog } = await db
    .from('dogs')
    .select(
      'id, report_type, attributes, marks_tags, event_date, manage_token_hash, status, deleted_at, moderation_status',
    )
    .eq('id', id)
    .single();
  if (!dog || dog.deleted_at !== null) return apiError('not_found', 'Reporte no encontrado.');
  if (!dog.manage_token_hash || !verifyManageToken(token, dog.manage_token_hash)) {
    return apiError('forbidden', 'El token no corresponde a este reporte.');
  }
  if (dog.status !== 'active' || dog.moderation_status !== 'approved') {
    return NextResponse.json({ candidates: [] } satisfies CandidatesResponse);
  }

  const { data: bestPhoto } = await db
    .from('dog_photos')
    .select('quality_score')
    .eq('dog_id', id)
    .eq('is_primary', true)
    .maybeSingle();

  const config = await loadActiveMatchingConfig();
  const reference: ReferenceReport = {
    dogId: dog.id,
    reportType: dog.report_type,
    attributes: parseAttributes(dog.attributes),
    marksTags: dog.marks_tags ?? [],
    eventDate: dog.event_date,
    bestPhotoQuality: bestPhoto?.quality_score ?? null,
  };
  const candidates = await searchCandidates(reference, config.params);
  return NextResponse.json({ candidates } satisfies CandidatesResponse);
}

import { NextResponse, type NextRequest } from 'next/server';
import { type CandidatesResponse } from '@lomito/shared';
import type { ReferenceReport } from '@lomito/matching';
import { parseAttributes, searchCandidates } from '@/lib/candidates';
import { authenticateManageRequest } from '@/lib/manage-auth';
import { loadActiveMatchingConfig } from '@/lib/matching-config';
import { supabaseAdmin } from '@/lib/supabase-admin';

// ============================================================================
// GET /api/reports/:id/candidates — candidatos puntuados del PROPIO reporte.
// Auth: token de gestión (ADR-0006) vía lib/manage-auth.
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authenticateManageRequest(request, id);
  if (!auth.ok) return auth.response;
  const dog = auth.dog;

  if (dog.status !== 'active' || dog.moderation_status !== 'approved') {
    return NextResponse.json({ candidates: [] } satisfies CandidatesResponse);
  }

  const { data: bestPhoto } = await supabaseAdmin()
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

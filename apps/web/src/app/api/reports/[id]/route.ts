import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  updateReportRequestSchema,
  type DeleteReportResponse,
  type ReportPublicResponse,
  type UpdateReportResponse,
} from '@lomito/shared';
import { apiError } from '@/lib/api-response';
import { parseAttributes } from '@/lib/candidates';
import { recordEvent } from '@/lib/events';
import { authenticateManageRequest } from '@/lib/manage-auth';
import { PHOTOS_BUCKET, supabaseAdmin } from '@/lib/supabase-admin';

// ============================================================================
// /api/reports/:id
//   GET    → ficha pública: SOLO campos de la vista dogs_public (ubicación ya
//            difuminada, sin contacto, sin token) + fotos firmadas TTL 1 h.
//   PATCH  → corregir ficha (manage-token): la corrección humana gana a la IA.
//   DELETE → borrado lógico inmediato (ARCO, security-privacy.md §5); la
//            purga física la hace lifecycle (Sprint 3).
// 404 indistinguible para inexistente/expirado/borrado (api-contracts.md §5).
// ============================================================================

const idSchema = z.string().uuid();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('not_found', 'Reporte no encontrado.');

  const db = supabaseAdmin();
  const { data: dog } = await db.from('dogs_public').select('*').eq('id', id).single();
  if (!dog) return apiError('not_found', 'Reporte no encontrado.');

  const { data: photos } = await db
    .from('dog_photos')
    .select('storage_path, is_primary')
    .eq('dog_id', id)
    .order('is_primary', { ascending: false });
  const paths = (photos ?? []).map((p) => p.storage_path as string);
  const { data: signed } = paths.length
    ? await db.storage.from(PHOTOS_BUCKET).createSignedUrls(paths, 3600)
    : { data: [] };

  const response: ReportPublicResponse = {
    reportId: dog.id,
    reportType: dog.report_type,
    attributes: parseAttributes(dog.attributes),
    distinctiveMarks: dog.distinctive_marks ?? null,
    isSensitive: Boolean(dog.is_sensitive),
    rewardOffered: Boolean(dog.reward_offered),
    eventDate: dog.event_date,
    approxLocation: { lat: Number(dog.approx_lat), lng: Number(dog.approx_lng) },
    addressText: dog.address_text ?? null,
    photoUrls: (signed ?? []).map((s) => s.signedUrl).filter((u): u is string => Boolean(u)),
    createdAt: dog.created_at,
  };
  return NextResponse.json(response);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authenticateManageRequest(request, id);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('validation_error', 'El cuerpo debe ser JSON.');
  }
  const parsed = updateReportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('validation_error', parsed.error.issues.map((i) => i.message).join('; '));
  }
  const input = parsed.data;

  // Solo se tocan los campos enviados; la ausencia no borra nada (null sí).
  const patch: Record<string, unknown> = {};
  if (input.attributes !== undefined) {
    patch.attributes = { ...parseAttributes(auth.dog.attributes), ...input.attributes };
  }
  if (input.distinctiveMarks !== undefined) patch.distinctive_marks = input.distinctiveMarks;
  if (input.finderNote !== undefined) patch.finder_note = input.finderNote;

  const { data: updated, error } = await supabaseAdmin()
    .from('dogs')
    .update(patch)
    .eq('id', id)
    .select('id, attributes, distinctive_marks, finder_note')
    .single();
  if (error || !updated) {
    console.error(JSON.stringify({ msg: 'report_patch_failed', error: error?.message }));
    return apiError('internal_error', 'No se pudo guardar la corrección.');
  }

  const response: UpdateReportResponse = {
    reportId: updated.id,
    attributes: parseAttributes(updated.attributes),
    distinctiveMarks: updated.distinctive_marks ?? null,
    finderNote: updated.finder_note ?? null,
  };
  return NextResponse.json(response);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authenticateManageRequest(request, id);
  if (!auth.ok) return auth.response;

  const { error } = await supabaseAdmin()
    .from('dogs')
    .update({ deleted_at: new Date().toISOString(), status: 'removed' })
    .eq('id', id);
  if (error) {
    console.error(JSON.stringify({ msg: 'report_delete_failed', error: error.message }));
    return apiError('internal_error', 'No se pudo borrar el reporte.');
  }
  await recordEvent({ eventType: 'report_deleted', dogId: id });

  const response: DeleteReportResponse = { reportId: id, deleted: true };
  return NextResponse.json(response);
}

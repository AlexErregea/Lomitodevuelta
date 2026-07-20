import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { type ReportPublicResponse } from '@lomito/shared';
import { apiError } from '@/lib/api-response';
import { parseAttributes } from '@/lib/candidates';
import { PHOTOS_BUCKET, supabaseAdmin } from '@/lib/supabase-admin';

// ============================================================================
// GET /api/reports/:id — ficha pública. SOLO campos de la vista dogs_public
// (ubicación ya difuminada, sin contacto, sin token) + fotos con URL firmada
// de lectura (TTL 1 h). Un id inexistente, expirado o borrado responde 404
// indistinguible (api-contracts.md §5).
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

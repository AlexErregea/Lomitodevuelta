import { z } from 'zod';
import type { DogAttributes, ReportType } from '@lomito/shared';
import { parseAttributes } from './candidates';
import { PHOTOS_BUCKET, supabaseAdmin } from './supabase-admin';

// ============================================================================
// Carga de la ficha pública (/r/:id y su og:image). SOLO lee dogs_public
// (ubicación ya difuminada, sin datos personales) + updated_at de dogs para
// el buster de caché del cartel (ADR-0010) + fotos con URL firmada TTL 1 h.
// ============================================================================

const idSchema = z.string().uuid();

export interface PublicReport {
  id: string;
  reportType: ReportType;
  attributes: DogAttributes;
  distinctiveMarks: string | null;
  isSensitive: boolean;
  rewardOffered: boolean;
  eventDate: string;
  approxLat: number;
  approxLng: number;
  addressText: string | null;
  photoUrls: string[];
  /** Epoch de updated_at: buster de caché de la og:image (ADR-0010) */
  version: number;
}

export async function loadPublicReport(id: string): Promise<PublicReport | null> {
  if (!idSchema.safeParse(id).success) return null;
  const db = supabaseAdmin();

  const { data: dog } = await db.from('dogs_public').select('*').eq('id', id).single();
  if (!dog) return null;

  const [{ data: meta }, { data: photos }] = await Promise.all([
    db.from('dogs').select('updated_at').eq('id', id).single(),
    db
      .from('dog_photos')
      .select('storage_path, is_primary')
      .eq('dog_id', id)
      .order('is_primary', { ascending: false }),
  ]);

  const paths = (photos ?? []).map((p) => p.storage_path as string);
  const { data: signed } = paths.length
    ? await db.storage.from(PHOTOS_BUCKET).createSignedUrls(paths, 3600)
    : { data: [] };

  return {
    id: dog.id,
    reportType: dog.report_type,
    attributes: parseAttributes(dog.attributes),
    distinctiveMarks: dog.distinctive_marks ?? null,
    isSensitive: Boolean(dog.is_sensitive),
    rewardOffered: Boolean(dog.reward_offered),
    eventDate: dog.event_date,
    approxLat: Number(dog.approx_lat),
    approxLng: Number(dog.approx_lng),
    addressText: dog.address_text ?? null,
    photoUrls: ((signed ?? []) as Array<{ signedUrl: string | null }>)
      .map((s) => s.signedUrl)
      .filter((u): u is string => Boolean(u)),
    version: meta ? Math.floor(new Date(meta.updated_at as string).getTime() / 1000) : 0,
  };
}

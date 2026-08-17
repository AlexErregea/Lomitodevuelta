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

/** Tarjeta de la landing: lo mínimo para reconocer un perro de un vistazo. */
export interface ReportePreview {
  id: string;
  reportType: ReportType;
  /** Alcaldía declarada, o null si la persona solo dio GPS. */
  addressText: string | null;
  /** "hace 3 h", "ayer", "hace 4 días" — ya resuelto en servidor. */
  cuando: string;
  /** "mestizo café · mediano", armado con lo que la IA sí extrajo. */
  rasgos: string;
  photoUrl: string | null;
}

/**
 * Últimos reportes activos para la sección "cerca de ti" de la landing.
 *
 * Se excluyen los marcados como sensibles a propósito: en la ficha se difuminan
 * con un toque para revelar, pero una landing es otra cosa — alguien que llega
 * desde un enlace no pidió ver un perro herido, y no hay contexto donde ponerlo.
 *
 * Lee `dogs_public`, que ya es la proyección segura (sin contacto, sin token,
 * ubicación difuminada a ~110 m). Las fotos se firman aparte porque el bucket es
 * privado y la vista no las expone.
 */
export async function loadRecentPublicReports(limit = 3): Promise<ReportePreview[]> {
  const db = supabaseAdmin();

  const { data: dogs } = await db
    .from('dogs_public')
    .select('id, report_type, attributes, address_text, created_at, is_sensitive')
    .eq('is_sensitive', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!dogs?.length) return [];

  const ids = dogs.map((d) => d.id as string);
  const { data: photos } = await db
    .from('dog_photos')
    .select('dog_id, storage_path')
    .in('dog_id', ids)
    .eq('is_primary', true);

  const rutaPorPerro = new Map<string, string>();
  for (const p of photos ?? []) rutaPorPerro.set(p.dog_id as string, p.storage_path as string);

  const rutas = [...rutaPorPerro.values()];
  const { data: firmadas } = rutas.length
    ? await db.storage.from(PHOTOS_BUCKET).createSignedUrls(rutas, 3600)
    : { data: [] };
  const urlPorRuta = new Map<string, string>();
  for (const s of (firmadas ?? []) as Array<{ path: string | null; signedUrl: string | null }>) {
    if (s.path && s.signedUrl) urlPorRuta.set(s.path, s.signedUrl);
  }

  return dogs.map((d) => {
    const ruta = rutaPorPerro.get(d.id as string);
    return {
      id: d.id as string,
      reportType: d.report_type as ReportType,
      addressText: (d.address_text as string | null) ?? null,
      cuando: tiempoRelativo(d.created_at as string),
      rasgos: describirRasgos(parseAttributes(d.attributes)),
      photoUrl: ruta ? (urlPorRuta.get(ruta) ?? null) : null,
    };
  });
}

/** Fecha → "hace 3 h" en es-MX, sin arrastrar una librería de fechas. */
function tiempoRelativo(iso: string): string {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 60) return 'hace unos minutos';
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

/**
 * Atributos → una línea legible. Omite lo desconocido en vez de escribir "no
 * sé": en el Flujo B la IA a veces solo saca el color, y media línea real
 * informa más que una completa llena de huecos.
 */
function describirRasgos(attrs: DogAttributes): string {
  const partes: string[] = [];
  if (attrs.breedMix?.length) partes.push(attrs.breedMix.slice(0, 2).join(' y '));
  if (attrs.colors?.length) partes.push(attrs.colors.slice(0, 2).join(' y '));
  const tamanos: Record<string, string> = { small: 'chico', medium: 'mediano', large: 'grande' };
  const tamano = typeof attrs.size === 'string' ? tamanos[attrs.size] : undefined;
  if (tamano) partes.push(tamano);
  return partes.join(' · ');
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

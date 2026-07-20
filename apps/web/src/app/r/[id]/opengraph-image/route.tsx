import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { content } from '@/content/es-MX';
import { loadPublicReport } from '@/lib/ficha';

// ============================================================================
// Cartel compartible (ADR-0010): og:image dinámica con next/og, 1200×630.
//   · Caché CDN (s-maxage=86400) + buster ?v={updated_at} declarado por la
//     ficha: editar el reporte cambia la URL y WhatsApp la trata como nueva.
//   · Reportes sensibles: silueta, JAMÁS la foto (security-privacy.md §7).
//   · Bloqueados/borrados/inexistentes: cartel genérico del producto (la URL
//     puede seguir circulando en chats).
//   · Solo contiene lo ya público en la ficha: el cartel es público por
//     naturaleza (WhatsApp lo re-hospeda).
// ============================================================================

const WIDTH = 1200;
const HEIGHT = 630;
const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
};

const t = content.ficha;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const report = await loadPublicReport(id).catch(() => null);

  if (!report) {
    // Cartel genérico: marca + promesa, sin datos (la ficha ya no existe).
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#1F2937',
            color: '#fff',
          }}
        >
          <div style={{ fontSize: 140 }}>🐕</div>
          <div style={{ fontSize: 64, fontWeight: 800 }}>{content.home.title}</div>
          <div style={{ fontSize: 36, marginTop: 12 }}>{content.home.tagline}</div>
        </div>
      ),
      { width: WIDTH, height: HEIGHT, headers: CACHE_HEADERS },
    );
  }

  const isLost = report.reportType === 'lost';
  const badge = isLost ? t.lostBadge : t.foundBadge;
  const accent = isLost ? '#C0392B' : '#1E8449';
  const photoUrl = report.isSensitive ? null : (report.photoUrls[0] ?? null);
  const place =
    report.addressText ?? `${report.approxLat.toFixed(3)}, ${report.approxLng.toFixed(3)}`;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#fff' }}>
        {photoUrl ? (
          <img
            src={photoUrl}
            width={560}
            height={HEIGHT}
            style={{ objectFit: 'cover' }}
            alt=""
          />
        ) : (
          <div
            style={{
              width: 560,
              height: HEIGHT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#E5E7EB',
              fontSize: 220,
            }}
          >
            🐕
          </div>
        )}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: 48,
            gap: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              background: accent,
              color: '#fff',
              fontSize: 64,
              fontWeight: 800,
              padding: '8px 32px',
              borderRadius: 12,
            }}
          >
            {badge}
          </div>
          <div style={{ display: 'flex', fontSize: 36, color: '#111827' }}>📍 {place}</div>
          <div style={{ display: 'flex', fontSize: 32, color: '#374151' }}>📅 {report.eventDate}</div>
          <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, color: accent }}>{t.cta}</div>
          <div style={{ display: 'flex', fontSize: 28, color: '#6B7280' }}>{content.home.title}</div>
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT, headers: CACHE_HEADERS },
  );
}

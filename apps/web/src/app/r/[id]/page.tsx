import type { Metadata } from 'next';
import Link from 'next/link';
import { content } from '@/content/es-MX';
import { requireEnv } from '@/lib/env';
import { loadPublicReport, type PublicReport } from '@/lib/ficha';
import { SensitiveImage } from './sensitive-image';
import { ShareButton } from './share-button';

// ============================================================================
// Ficha pública /r/:id — mobile-first, el destino de todo enlace compartido.
// La og:image lleva el buster ?v={updated_at} (ADR-0010): editar el reporte
// cambia la URL y WhatsApp la trata como imagen nueva.
// ============================================================================

const t = content.ficha;

/** La ficha cambia al editar el reporte: siempre datos frescos del servidor. */
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const report = await loadPublicReport(id);
  const baseUrl = requireEnv('APP_BASE_URL');
  if (!report) return { title: t.notFoundTitle };

  const badge = report.reportType === 'lost' ? t.lostBadge : t.foundBadge;
  const heading = report.reportType === 'lost' ? t.lostHeading : t.foundHeading;
  return {
    title: `${badge} · LomitoDeVuelta`,
    description: `${heading}. ${report.addressText ? `${t.nearLabel} ${report.addressText}. ` : ''}${t.cta}`,
    openGraph: {
      title: `${badge} 🐕 ${t.cta}`,
      description: heading,
      url: `${baseUrl}/r/${report.id}`,
      // Buster de versión: única forma fiable de invalidar el caché de WhatsApp.
      images: [{ url: `${baseUrl}/r/${report.id}/opengraph-image?v=${report.version}`, width: 1200, height: 630 }],
      type: 'website',
    },
  };
}

export default async function FichaPage({ params }: PageProps) {
  const { id } = await params;
  const report = await loadPublicReport(id);

  if (!report) {
    return (
      <main style={{ maxWidth: 480, margin: '0 auto', padding: '1rem' }}>
        <h1>{t.notFoundTitle}</h1>
        <p>{t.notFoundBody}</p>
        <p>
          <Link href="/">← {content.home.title}</Link>
        </p>
      </main>
    );
  }

  const isLost = report.reportType === 'lost';
  const badge = isLost ? t.lostBadge : t.foundBadge;
  const shareUrl = `${requireEnv('APP_BASE_URL')}/r/${report.id}`;
  const attributeEntries = buildAttributeEntries(report);

  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: '1rem' }}>
      <p
        style={{
          display: 'inline-block',
          background: isLost ? '#C0392B' : '#1E8449',
          color: '#fff',
          fontWeight: 800,
          padding: '0.3rem 0.8rem',
          borderRadius: '0.4rem',
          margin: 0,
        }}
      >
        {badge}
      </p>
      <h1 style={{ marginTop: '0.5rem' }}>{isLost ? t.lostHeading : t.foundHeading}</h1>

      {report.photoUrls.map((url, i) =>
        report.isSensitive ? (
          <SensitiveImage key={url} src={url} alt={`Foto ${i + 1}`} />
        ) : (
          // img nativo a propósito: URLs firmadas efímeras, next/image no aplica.
          <img key={url} src={url} alt={`Foto ${i + 1}`} style={{ width: '100%', borderRadius: '0.5rem', marginBottom: '0.5rem' }} />
        ),
      )}

      <p>
        📅 {isLost ? t.eventDateLost : t.eventDateFound} <strong>{report.eventDate}</strong>
        <br />
        📍 {t.nearLabel}{' '}
        <strong>
          {report.addressText ?? `${report.approxLat.toFixed(3)}, ${report.approxLng.toFixed(3)}`}
        </strong>
        {report.rewardOffered && (
          <>
            <br />
            {t.rewardBadge}
          </>
        )}
      </p>

      {attributeEntries.length > 0 && (
        <ul>
          {attributeEntries.map(([label, value]) => (
            <li key={label}>
              <strong>{label}:</strong> {value}
            </li>
          ))}
        </ul>
      )}

      {report.distinctiveMarks && (
        <p>
          <strong>{t.marksLabel}:</strong> {report.distinctiveMarks}
        </p>
      )}

      <p style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <ShareButton badge={badge} shareUrl={shareUrl} />
        <Link href={isLost ? '/' : '/perdi'}>{isLost ? t.ctaLost : t.ctaFound}</Link>
      </p>
    </main>
  );
}

/** Atributos → pares [etiqueta, valor] en es-MX, omitiendo lo desconocido. */
function buildAttributeEntries(report: PublicReport): Array<[string, string]> {
  const labels = t.attributeLabels;
  const values = t.attributeValues;
  const attrs = report.attributes;
  const entries: Array<[string, string]> = [];
  if (attrs.breedMix?.length) entries.push([labels.breedMix ?? 'Raza', attrs.breedMix.join(', ')]);
  if (attrs.colors?.length) entries.push([labels.colors ?? 'Colores', attrs.colors.join(', ')]);
  for (const key of ['size', 'sex', 'ageRange', 'coatLength'] as const) {
    const raw = attrs[key];
    if (typeof raw === 'string') entries.push([labels[key] ?? key, values[raw] ?? raw]);
  }
  return entries;
}

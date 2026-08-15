import type { Metadata } from 'next';
import Link from 'next/link';
import { FlowShell, secondaryButtonClass } from '@/components/flow-shell';
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

  // Expirado, retirado o enlace mal copiado: mismo mensaje. Y una salida hacia
  // los flujos — quien llega aquí buscando un perro sigue teniendo el problema.
  if (!report) {
    return (
      <FlowShell>
        <div className="rounded-[14px] border border-borde bg-crema-card p-5">
          <h1 className="font-display text-[22px] font-bold leading-[1.2]">{t.notFoundTitle}</h1>
          <p className="mt-2 text-[15px] leading-[1.6] text-[#5b4b3a]">{t.notFoundBody}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/perdi" className={secondaryButtonClass}>
              {content.landing.hero.ctaLost}
            </Link>
            <Link href="/encontre" className={secondaryButtonClass}>
              {content.landing.hero.ctaFound}
            </Link>
          </div>
        </div>
      </FlowShell>
    );
  }

  const isLost = report.reportType === 'lost';
  const badge = isLost ? t.lostBadge : t.foundBadge;
  const shareUrl = `${requireEnv('APP_BASE_URL')}/r/${report.id}`;
  const attributeEntries = buildAttributeEntries(report);

  const [primeraFoto, ...demasFotos] = report.photoUrls;

  return (
    <FlowShell>
      {/* Badge y titular arriba de la foto: quien abre esto desde WhatsApp
          necesita saber en dos segundos si el perro se busca o se encontró. */}
      <span
        className={`inline-block rounded-full px-[14px] py-[6px] text-[13px] font-bold uppercase tracking-[.06em] text-white ${
          isLost ? 'bg-perdido' : 'bg-encontrado'
        }`}
      >
        {badge}
      </span>
      <h1 className="mt-3 font-display text-[clamp(26px,6vw,34px)] font-bold leading-[1.15] tracking-[-.02em]">
        {isLost ? t.lostHeading : t.foundHeading}
      </h1>

      {/* Foto principal grande; el resto como tira de miniaturas. Con hasta 5
          fotos apiladas a ancho completo, la página se volvía un scroll eterno
          y las acciones quedaban fuera de alcance. */}
      {primeraFoto && (
        <div className="mt-5">
          {report.isSensitive ? (
            <SensitiveImage src={primeraFoto} alt="Foto 1" />
          ) : (
            // img nativo a propósito: URLs firmadas efímeras, next/image no aplica.
            <img src={primeraFoto} alt="Foto 1" className="w-full rounded-[14px]" />
          )}
        </div>
      )}
      {demasFotos.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {demasFotos.map((url, i) =>
            report.isSensitive ? (
              <div key={url} className="w-[92px] shrink-0">
                <SensitiveImage src={url} alt={`Foto ${i + 2}`} />
              </div>
            ) : (
              <img
                key={url}
                src={url}
                alt={`Foto ${i + 2}`}
                className="h-[92px] w-[92px] shrink-0 rounded-[10px] object-cover"
              />
            ),
          )}
        </div>
      )}

      {/* Dónde y cuándo: los dos datos que deciden si alguien puede ayudar. */}
      <dl className="mt-5 rounded-[14px] border border-borde bg-crema-card p-4">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <dt className="text-[14px] text-[#5b4b3a]">{isLost ? t.eventDateLost : t.eventDateFound}</dt>
          <dd className="text-[15px] font-bold text-tinta">{report.eventDate}</dd>
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
          <dt className="text-[14px] text-[#5b4b3a]">{t.nearLabel}</dt>
          <dd className="text-[15px] font-bold text-tinta">
            {report.addressText ?? `${report.approxLat.toFixed(3)}, ${report.approxLng.toFixed(3)}`}
          </dd>
        </div>
        {report.rewardOffered && (
          <p className="mt-3 inline-block rounded-full bg-ambar-claro/40 px-3 py-1 text-[13px] font-bold text-tinta">
            {t.rewardBadge}
          </p>
        )}
      </dl>

      {/* Atributos como etiquetas y no como lista: se escanean de un vistazo y
          ocupan la mitad de alto en pantalla de celular. */}
      {attributeEntries.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {attributeEntries.map(([label, value]) => (
            <li
              key={label}
              className="rounded-full border border-borde bg-white px-3 py-[6px] text-[14px] text-tinta"
            >
              <span className="text-[#6b5a48]">{label}:</span>{' '}
              <span className="font-semibold">{value}</span>
            </li>
          ))}
        </ul>
      )}

      {report.distinctiveMarks && (
        <div className="mt-4 rounded-[12px] border border-borde bg-white p-4">
          <h2 className="text-[14px] font-bold text-tinta">{t.marksLabel}</h2>
          <p className="mt-1 text-[15px] leading-[1.55] text-tinta">{report.distinctiveMarks}</p>
        </div>
      )}

      {/* El bloque de acción. Compartir es el motor de distribución del producto
          (WhatsApp-first), así que va como acción principal y a ancho completo;
          el CTA cruzado queda debajo para quien reconoce al perro. */}
      <section className="mt-7 rounded-[14px] border border-borde bg-white p-4">
        <h2 className="font-display text-lg font-bold">{t.helpHeading}</h2>
        <p className="mt-1 text-[14px] leading-[1.55] text-[#5b4b3a]">{t.helpBody}</p>
        <div className="mt-4">
          <ShareButton badge={badge} shareUrl={shareUrl} />
        </div>
        <Link
          href={isLost ? '/encontre' : '/perdi'}
          className={`${secondaryButtonClass} mt-2 block text-center`}
        >
          {isLost ? t.ctaLost : t.ctaFound}
        </Link>
      </section>
    </FlowShell>
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

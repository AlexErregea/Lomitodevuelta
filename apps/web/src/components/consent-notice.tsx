import { content } from '@/content/es-MX';

// ============================================================================
// Referencia al aviso de privacidad en el punto de recolección (LFPDPPP: el
// aviso debe estar donde se piden los datos, no solo en el footer).
//
// Consentimiento tácito, sin casilla (decisión del fundador, 2026-08-12):
// publicar el reporte es el acto de consentimiento. La evidencia que la ley
// pide poder demostrar la registra el servidor —contacts.consent_given_at y
// consent_version— en cada alta; una casilla marcada no habría probado más y
// sí costaba un tap en el paso donde más gente abandona.
//
// Va justo arriba del botón de envío en /perdi y /encontre.
// ============================================================================

const t = content.flowB;

export function ConsentNotice() {
  return (
    <p className="mb-5 text-[13px] leading-[1.55] text-[#5b4b3a]">
      {t.consentNoticeBefore}
      <a
        href="/privacidad"
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-ambar-texto underline"
      >
        {t.privacyLink}
      </a>
      {t.consentNoticeAfter}
    </p>
  );
}

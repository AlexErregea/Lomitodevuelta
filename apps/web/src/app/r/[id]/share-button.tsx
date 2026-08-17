'use client';

import { content } from '@/content/es-MX';
import { captureEvent } from '@/lib/client/analytics';

// ============================================================================
// Botón de compartir a WhatsApp — EL mecanismo de distribución del producto.
// wa.me abre el share sheet nativo con el texto + enlace de la ficha.
//
// Conserva el verde de WhatsApp y no el ámbar de marca a propósito: aquí el
// reconocimiento instantáneo del canal vale más que la coherencia cromática.
// La persona debe saber en qué app va a acabar antes de tocar.
// ============================================================================

export function ShareButton({
  badge,
  shareUrl,
  petName,
}: {
  badge: string;
  shareUrl: string;
  petName?: string | null;
}) {
  // "Ayúdanos a encontrar a Toby" se reenvía; "PERDIDO 🐕" se ignora. Este texto
  // ES el mecanismo de distribución del producto, no una etiqueta.
  const text = petName
    ? `${content.ficha.shareTextNamed(petName)} ${shareUrl}`
    : `${content.ficha.shareText(badge)} ${shareUrl}`;
  return (
    <a
      href={`https://wa.me/?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => captureEvent('share_clicked', { url: shareUrl })}
      className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#1a7f4b] px-6 py-[15px] text-base font-bold text-white hover:bg-[#156b3f] focus:outline-none focus:ring-2 focus:ring-[#1a7f4b]/40"
    >
      <WhatsAppIcon />
      {content.ficha.shareButton}
    </a>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.11-.22-.17-.47-.29Z" />
    </svg>
  );
}

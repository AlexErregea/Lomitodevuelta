'use client';

import { content } from '@/content/es-MX';
import { captureEvent } from '@/lib/client/analytics';

// Botón de compartir a WhatsApp — EL mecanismo de distribución del producto.
// wa.me abre el share sheet nativo con el texto + enlace de la ficha.
export function ShareButton({ badge, shareUrl }: { badge: string; shareUrl: string }) {
  const text = `${content.ficha.shareText(badge)} ${shareUrl}`;
  return (
    <a
      href={`https://wa.me/?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => captureEvent('share_clicked', { url: shareUrl })}
      style={{
        display: 'inline-block',
        background: '#25D366',
        color: '#fff',
        padding: '0.8rem 1.4rem',
        borderRadius: '0.5rem',
        textDecoration: 'none',
        fontWeight: 700,
      }}
    >
      {content.ficha.shareButton}
    </a>
  );
}

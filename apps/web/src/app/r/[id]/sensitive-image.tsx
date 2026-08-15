'use client';

import { useState } from 'react';
import { content } from '@/content/es-MX';

// ============================================================================
// Contenido sensible (perro herido/fallecido): difuminado con opt-in de quien
// mira (security-privacy.md §7) — jamás visible sin un toque explícito.
//
// El enlace de una ficha llega por WhatsApp sin contexto: alguien puede abrirlo
// en el camión o frente a un niño. El difuminado no es pudor, es no emboscar a
// nadie con una imagen que no pidió ver.
// ============================================================================

export function SensitiveImage({ src, alt }: { src: string; alt: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setRevealed(true)}
      disabled={revealed}
      className="relative block w-full overflow-hidden rounded-[14px] border-0 bg-transparent p-0 disabled:cursor-default"
      aria-label={content.ficha.tapToReveal}
    >
      <img
        src={src}
        alt={alt}
        className={`w-full transition-[filter] duration-200 ${revealed ? '' : 'blur-2xl'}`}
      />
      {!revealed && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-tinta/45 px-4 text-center">
          <span className="text-[15px] font-bold leading-[1.4] text-white [text-shadow:0_1px_4px_rgba(0,0,0,.8)]">
            {content.ficha.sensitiveWarning}
          </span>
          <span className="rounded-full bg-white/95 px-4 py-2 text-[14px] font-bold text-tinta">
            {content.ficha.tapToReveal}
          </span>
        </span>
      )}
    </button>
  );
}

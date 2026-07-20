'use client';

import { useState } from 'react';
import { content } from '@/content/es-MX';

// Contenido sensible (perro herido/fallecido): difuminado con opt-in del
// espectador (security-privacy.md §7) — jamás visible sin un toque explícito.
export function SensitiveImage({ src, alt }: { src: string; alt: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setRevealed(true)}
      style={{ position: 'relative', border: 0, padding: 0, background: 'none', width: '100%' }}
      aria-label={content.ficha.tapToReveal}
    >
      <img
        src={src}
        alt={alt}
        style={{
          width: '100%',
          borderRadius: '0.5rem',
          filter: revealed ? 'none' : 'blur(24px)',
          transition: 'filter 0.2s',
        }}
      />
      {!revealed && (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            textShadow: '0 1px 4px rgba(0,0,0,0.8)',
            fontWeight: 700,
          }}
        >
          ⚠️ {content.ficha.sensitiveWarning}
          <br />
          {content.ficha.tapToReveal}
        </span>
      )}
    </button>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';

// ============================================================================
// Widget de Cloudflare Turnstile (ADR-0009 §4). Filtra automatización sin
// pedirle nada a la persona: en el modo administrado, un usuario real casi
// nunca ve más que un recuadro que se resuelve solo.
//
// Sin NEXT_PUBLIC_TURNSTILE_SITE_KEY el componente no renderiza nada y no
// carga ningún script: el sitio queda idéntico a como estaba. Así el código
// puede desplegarse hoy y la defensa encenderse el día que existan las llaves,
// sin volver a tocar el repo (el servidor tampoco exige token si no hay
// secreto configurado — ver lib/turnstile.ts).
//
// Renderizado explícito, no el implícito por clase CSS: con navegación de
// cliente el script puede cargar antes de que este formulario exista, y el
// escaneo automático del DOM ya habría pasado.
// ============================================================================

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function TurnstileField() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState('');

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    const renderWidget = () => {
      const container = containerRef.current;
      if (cancelled || !container || !window.turnstile) return;
      // En StrictMode el efecto corre dos veces: sin esto saldrían dos widgets.
      if (container.childElementCount > 0) return;
      window.turnstile.render(container, {
        sitekey: siteKey,
        callback: (value: string) => setToken(value),
        // Token caducado o error: se limpia y el servidor pedirá recargar.
        'expired-callback': () => setToken(''),
        'error-callback': () => setToken(''),
      });
    };

    if (window.turnstile) {
      renderWidget();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`);
    const script = existing ?? document.createElement('script');
    if (!existing) {
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', renderWidget);
    return () => {
      cancelled = true;
      script.removeEventListener('load', renderWidget);
    };
  }, [siteKey]);

  if (!siteKey) return null;

  return (
    <>
      <div ref={containerRef} className="mb-4" />
      {/* El token viaja con el FormData del propio formulario. */}
      <input type="hidden" name="turnstileToken" value={token} readOnly />
    </>
  );
}

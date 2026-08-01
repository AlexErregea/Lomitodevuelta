import { content } from '@/content/es-MX';

// ============================================================================
// Identidad de marca compartida: el logo (marco tipo cámara + carita de perro)
// y el logotipo tipográfico. Vivían dentro de la landing; se extrajeron para
// que los flujos (/perdi, /encontre) y la ficha usen exactamente la misma
// marca, en lugar de un texto suelto con emoji.
//
// El color se recibe por prop porque el logo aparece sobre crema (ámbar) y
// sobre café oscuro (ámbar claro, por contraste). Ver globals.css.
// ============================================================================

const t = content.landing;

/** Ámbar accesible sobre fondos claros (4.6:1). Espejo de --color-ambar. */
export const AMBAR = '#A6661B';
/** Ámbar claro para fondos oscuros (9.1:1 sobre tinta-2). Espejo de --color-ambar-claro. */
export const AMBAR_CLARO = '#E0B878';

export function Logo({
  size = 34,
  color = AMBAR,
  faceBg = '#F5EEE1',
  eyes = true,
}: {
  size?: number;
  color?: string;
  faceBg?: string;
  eyes?: boolean;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <g fill="none" stroke={color} strokeWidth="5" strokeLinecap="round">
        <path d="M12 34 V16 a4 4 0 0 1 4 -4 H34" />
        <path d="M86 12 H104 a4 4 0 0 1 4 4 V34" />
        <path d="M108 86 V104 a4 4 0 0 1 -4 4 H86" />
        <path d="M34 108 H16 a4 4 0 0 1 -4 -4 V86" />
      </g>
      <path d="M34 44 L30 20 Q30 16 34 18 L54 34 Z" fill={color} />
      <path d="M86 44 L90 20 Q90 16 86 18 L66 34 Z" fill={color} />
      <path d="M32 48 Q32 88 60 96 Q88 88 88 48 Q88 34 60 34 Q32 34 32 48 Z" fill={color} />
      <path d="M48 70 Q60 78 72 70 Q72 84 60 86 Q48 84 48 70 Z" fill={faceBg} />
      {eyes ? (
        <>
          <circle cx="60" cy="72" r="4.6" fill="#2E241C" />
          <circle cx="47" cy="56" r="3.2" fill="#2E241C" />
          <circle cx="73" cy="56" r="3.2" fill="#2E241C" />
        </>
      ) : (
        <circle cx="60" cy="72" r="4.6" fill={color} />
      )}
    </svg>
  );
}

/**
 * Logotipo tipográfico. Sobre fondo oscuro se usa el ámbar claro: el ámbar
 * primario, ya oscurecido por accesibilidad, no contrasta ahí.
 */
export function Brand({ dark = false, size = 18 }: { dark?: boolean; size?: number }) {
  return (
    <span
      className={`font-display font-bold ${dark ? 'text-crema' : 'text-tinta'}`}
      style={{ fontSize: size }}
    >
      {t.brandA}
      <span className={dark ? 'text-ambar-claro' : 'text-ambar-texto'}>{t.brandB}</span>
    </span>
  );
}

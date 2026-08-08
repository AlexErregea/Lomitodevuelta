import Link from 'next/link';
import type { ReactNode } from 'react';
import { Brand, Logo } from '@/components/brand';
import { content } from '@/content/es-MX';

// ============================================================================
// Marco común de los flujos de reporte (/perdi, /encontre) y cualquier pantalla
// de formulario. Antes cada página abría con un `<main style={{maxWidth:480}}>`
// y un enlace de texto con emoji: el usuario cruzaba el CTA de la landing y
// aterrizaba en algo que no parecía el mismo producto.
//
// Aquí vive todo lo que hace que se sienta LomitoDeVuelta: fondo crema, marca
// real, ancho de lectura y una tarjeta que contiene el formulario.
// ============================================================================

const t = content.flowShell;

export function FlowShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-crema font-sans text-tinta">
      <header className="border-b border-borde bg-crema">
        <div className="mx-auto flex max-w-[560px] items-center gap-[10px] px-5 py-[14px]">
          <Link href="/" className="flex items-center gap-[10px]" aria-label={t.backHome}>
            <Logo size={30} />
            <Brand />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-[560px] px-5 pb-20 pt-7">{children}</main>
    </div>
  );
}

/**
 * Encabezado del formulario: título grande + una línea que explica qué va a
 * pasar. La promesa importa tanto como el título — reduce el abandono en el
 * primer scroll.
 */
export function FlowHeading({ title, promise }: { title: string; promise: string }) {
  return (
    <div className="mb-7">
      <h1 className="font-display text-[clamp(26px,6vw,34px)] font-bold leading-[1.15] tracking-[-.02em]">
        {title}
      </h1>
      <p className="mt-2 text-[15px] leading-[1.55] text-[#6b5a48]">{promise}</p>
    </div>
  );
}

/**
 * Campo de formulario: label semibold, ayuda opcional en tono secundario y el
 * control debajo. Sustituye al patrón `<label>texto<br/><input/></label>`, que
 * dejaba todo con el mismo peso visual y sin ritmo vertical.
 */
export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  // Sin `htmlFor` no se emite un <label>: un <label> que no apunta a ningún
  // control es inerte para un lector de pantalla — se ve la etiqueta pero no se
  // escucha. Cuando el hijo no es un control único con id (p. ej. un grupo de
  // botones), la etiqueta se emite como texto y el hijo aporta su propio nombre.
  const claseEtiqueta = 'block text-[15px] font-semibold text-tinta';
  return (
    <div className="mb-5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={claseEtiqueta}>
          {label}
        </label>
      ) : (
        <span className={claseEtiqueta}>{label}</span>
      )}
      {hint && <p className="mt-1 text-[13px] leading-[1.5] text-[#6b5a48]">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** Clases compartidas de los controles de texto (input/textarea/select). */
export const controlClass =
  'w-full rounded-[10px] border border-borde bg-white px-[14px] py-[12px] text-[16px] text-tinta ' +
  'placeholder:text-[#a3927c] focus:border-ambar focus:outline-none focus:ring-2 focus:ring-ambar/30';

/** Botón primario: ancho completo, 48px de alto, el ámbar accesible. */
export const primaryButtonClass =
  'w-full rounded-[12px] bg-ambar px-6 py-[14px] text-base font-bold text-white ' +
  'hover:bg-ambar-oscuro focus:outline-none focus:ring-2 focus:ring-ambar/40 ' +
  'disabled:cursor-default disabled:opacity-60';

/** Botón secundario sobre crema (ubicación, acciones de apoyo). */
export const secondaryButtonClass =
  'rounded-[10px] border-[1.5px] border-[#cdbb9d] bg-white px-[18px] py-[11px] text-[15px] font-semibold ' +
  'text-tinta hover:border-ambar focus:outline-none focus:ring-2 focus:ring-ambar/30 ' +
  'disabled:cursor-default disabled:opacity-60';

/**
 * Botón destructivo (borrar reporte). Deliberadamente de bajo contraste: es una
 * acción legítima del derecho de cancelación (ARCO) y no se esconde, pero
 * tampoco compite visualmente con las acciones que reúnen perros con su familia.
 */
export const dangerButtonClass =
  'rounded-[10px] border-[1.5px] border-perdido/40 bg-white px-[18px] py-[11px] text-[15px] font-semibold ' +
  'text-perdido-texto hover:border-perdido focus:outline-none focus:ring-2 focus:ring-perdido/30 ' +
  'disabled:cursor-default disabled:opacity-60';

/**
 * Bloque de contenido del panel de gestión. `tone` distingue lo informativo
 * (crema) de lo accionable (blanco), para que la página se lea de un vistazo.
 */
export function Card({
  title,
  body,
  tone = 'blanco',
  children,
}: {
  title?: string;
  body?: string;
  tone?: 'blanco' | 'crema';
  children?: ReactNode;
}) {
  const fondo = tone === 'crema' ? 'bg-crema-card' : 'bg-white';
  return (
    <section className={`mb-4 rounded-[14px] border border-borde ${fondo} p-4`}>
      {title && <h2 className="font-display text-lg font-bold">{title}</h2>}
      {body && <p className="mt-1 text-[14px] leading-[1.55] text-[#5b4b3a]">{body}</p>}
      {children && <div className={title || body ? 'mt-4' : ''}>{children}</div>}
    </section>
  );
}

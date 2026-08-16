'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { content } from '@/content/es-MX';

// ============================================================================
// Selector de fotos. El control nativo ("Seleccionar archivo · Ningún archivo
// seleccionado") es la acción más importante de los dos flujos y se veía como
// un trámite de formulario de gobierno. Aquí es una zona grande, tocable, con
// icono de cámara y confirmación de lo elegido.
//
// El <input> sigue siendo nativo y conserva su `name`: los formularios usan
// `form action` + FormData, así que no se cambió nada del envío.
//
// Cómo se oculta importa. Con `sr-only` el input queda recortado a 1px, y al
// enviar el formulario vacío el navegador tiene que anclar ahí el globo de
// validación de `required`: Chrome puede responder "an invalid form control is
// not focusable" y **cancelar el envío sin decir nada**. En el flujo sagrado eso
// sería perder el reporte entero. Por eso el input va superpuesto y transparente
// (`opacity-0` sobre toda la zona): sigue renderizado y enfocable, el globo
// aparece donde el usuario está viendo, y tocar cualquier parte lo activa.
//
// QUITAR Y ACUMULAR (2026-08-16). Antes, equivocarse de foto no tenía remedio
// más que abandonar la página. Ahora cada foto se lista con MINIATURA —no solo
// el nombre, porque "IMG_20260815_204512.jpg" no responde la pregunta de quien
// se equivocó, que es "¿cuál elegí?"— y con un tache para quitarla. En modo
// múltiple la selección se acumula entre toques, que es lo natural cuando las
// fotos del perro están en álbumes distintos.
//
// Un FileList es inmutable, así que ambas cosas se hacen reescribiendo
// `input.files` con un DataTransfer. El input sigue siendo la fuente de verdad
// del envío, y de ahí la invariante que se respeta abajo: **la lista visible se
// deriva de lo que el input realmente tiene**. Si el navegador no soporta
// DataTransfer, la UI muestra lo que se va a enviar de verdad, nunca una foto
// que se quedaría fuera.
// ============================================================================

const t = content.photoPicker;

interface Preview {
  file: File;
  /** URL de objeto para la miniatura; se revoca al reemplazar o desmontar. */
  url: string;
}

// NO se usa el atributo `capture`. Fuerza la cámara y deja fuera la galería, y
// eso pierde reportes: quien encontró al perro hace dos horas, lo metió a su
// casa y ahora reporta desde el sillón ya tiene la foto tomada; quien la recibió
// de un vecino también. El flujo B no puede permitirse perder ni un registro
// (architecture.md), y el selector nativo ya ofrece "Tomar foto" como primera
// opción — no se pierde nada y se gana la galería.
export function PhotoPicker({
  id,
  name,
  multiple = false,
  required = true,
  maxFiles,
  onChange,
}: {
  /** Permite que el <label> de `Field` apunte a este input (etiquetado real). */
  id?: string;
  name: string;
  multiple?: boolean;
  required?: boolean;
  /** Tope de fotos acumuladas (Flujo A: 5). Sin valor, sin tope. */
  maxFiles?: number;
  onChange?: (files: FileList | null) => void;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [limitHit, setLimitHit] = useState(false);

  // Las URLs de objeto viven hasta que se revocan: sin esto, elegir fotos
  // varias veces deja los bitmaps retenidos en memoria del navegador. El ref
  // espeja el estado para poder limpiar al desmontar, y se actualiza en el
  // mismo punto que el estado (nunca durante el render).
  const previewsRef = useRef<Preview[]>([]);
  useEffect(() => {
    return () => {
      for (const item of previewsRef.current) URL.revokeObjectURL(item.url);
    };
  }, []);

  /** Reemplaza la lista visible, revocando las miniaturas que dejan de usarse. */
  const showFiles = (files: File[]) => {
    for (const item of previewsRef.current) URL.revokeObjectURL(item.url);
    const next = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    previewsRef.current = next;
    setPreviews(next);
  };

  /**
   * Intenta dejar exactamente `files` en el input. Devuelve lo que quedó dentro
   * (que es lo que se enviará) o null si el navegador no permitió escribirlo.
   */
  const writeToInput = (files: File[]): File[] | null => {
    const input = inputRef.current;
    if (!input) return null;
    try {
      const transfer = new DataTransfer();
      for (const file of files) transfer.items.add(file);
      input.files = transfer.files;
      return Array.from(input.files);
    } catch {
      return null;
    }
  };

  const adopt = (picked: FileList | null) => {
    const incoming = Array.from(picked ?? []);
    const base = multiple ? previews.map((p) => p.file) : [];

    const desired = [...base];
    let dropped = false;
    for (const file of incoming) {
      const duplicate = desired.some(
        (existing) =>
          existing.name === file.name &&
          existing.size === file.size &&
          existing.lastModified === file.lastModified,
      );
      if (duplicate) continue;
      if (maxFiles !== undefined && desired.length >= maxFiles) {
        dropped = true;
        continue;
      }
      desired.push(file);
    }

    // Si lo deseado es exactamente lo que el navegador ya puso, no hay que
    // reescribir nada (caso de una sola foto, o del primer toque).
    const sameAsInput =
      desired.length === incoming.length && desired.every((file, i) => file === incoming[i]);
    const actual = sameAsInput ? incoming : writeToInput(desired) ?? incoming;

    setLimitHit(dropped && actual.length < base.length + incoming.length);
    showFiles(actual);
    onChange?.(inputRef.current?.files ?? picked);
  };

  const remove = (index: number) => {
    const remaining = previews.filter((_, i) => i !== index).map((p) => p.file);
    const input = inputRef.current;

    if (remaining.length === 0) {
      // Vaciar siempre funciona, sin depender de DataTransfer. Y devuelve el
      // `required` nativo al juego: enviar sin foto vuelve a avisar.
      if (input) input.value = '';
      setLimitHit(false);
      showFiles([]);
      onChange?.(input?.files ?? null);
      return;
    }

    const actual = writeToInput(remaining);
    if (actual === null) {
      // Sin DataTransfer no se puede quitar una sola: se vacía todo antes que
      // enseñar una lista que no corresponde a lo que se enviaría.
      if (input) input.value = '';
      setLimitHit(false);
      showFiles([]);
      onChange?.(input?.files ?? null);
      return;
    }

    setLimitHit(false);
    showFiles(actual);
    onChange?.(input?.files ?? null);
  };

  const count = previews.length;
  const label = count === 0 ? (multiple ? t.ctaMany : t.ctaOne) : multiple ? t.addMore : t.change;
  const hint = multiple ? t.hintMany : t.hintOne;

  return (
    <div>
      <label
        htmlFor={inputId}
        className="relative flex cursor-pointer flex-col items-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-[#cdbb9d] bg-crema-card px-5 py-7 text-center transition-colors hover:border-ambar hover:bg-white focus-within:border-ambar focus-within:ring-2 focus-within:ring-ambar/30"
      >
        <CameraIcon />
        <span className="text-[15px] font-bold text-ambar-texto">{label}</span>
        <span className="text-[13px] leading-[1.5] text-[#6b5a48]">{hint}</span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          name={name}
          accept="image/*"
          multiple={multiple}
          required={required}
          onChange={(event) => adopt(event.target.files)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>

      {count > 0 && (
        <>
          <p className="sr-only" aria-live="polite">
            {count === 1 ? t.selectedOne : `${count} ${t.selectedMany}`}
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {previews.map((item, index) => (
              <li
                key={item.url}
                className="flex items-center gap-3 rounded-[12px] border border-borde bg-white p-2"
              >
                {/* img nativo: es un blob local, next/image no aplica. */}
                <img src={item.url} alt="" className="h-14 w-14 shrink-0 rounded-[8px] object-cover" />
                <div className="min-w-0 grow">
                  <p className="truncate text-[14px] font-semibold text-tinta">{item.file.name}</p>
                  <p className="text-[12px] text-[#6b5a48]">
                    {formatSize(item.file.size)}
                    {multiple && index === 0 && ` · ${t.primary}`}
                  </p>
                </div>
                {/* 44px de lado: objetivo tocable real, no un icono diminuto. */}
                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label={`${t.remove}: ${item.file.name}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] text-[#6b5a48] transition-colors hover:bg-crema-2 hover:text-perdido-texto focus:outline-none focus:ring-2 focus:ring-ambar/40"
                >
                  <CloseIcon />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {limitHit && maxFiles !== undefined && (
        <p className="mt-2 text-[13px] font-semibold text-perdido-texto" aria-live="polite">
          {t.limitReached.replace('{max}', String(maxFiles))}
        </p>
      )}
    </div>
  );
}

/** Peso en KB/MB: confirma que la foto pesada es la que se cree que es. */
function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CameraIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 34 34" aria-hidden="true">
      <path
        d="M17 5 L28 12 V28 H6 V12 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
        className="text-[#cdbb9d]"
      />
      <circle cx="17" cy="19" r="5" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-ambar" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M4 4 L14 14 M14 4 L4 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

'use client';

import { useId, useState } from 'react';
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
// ============================================================================

const t = content.photoPicker;

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
  onChange,
}: {
  /** Permite que el <label> de `Field` apunte a este input (etiquetado real). */
  id?: string;
  name: string;
  multiple?: boolean;
  required?: boolean;
  onChange?: (files: FileList | null) => void;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [count, setCount] = useState(0);

  const label = count === 0 ? (multiple ? t.ctaMany : t.ctaOne) : t.change;
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
          id={inputId}
          type="file"
          name={name}
          accept="image/*"
          multiple={multiple}
          required={required}
          onChange={(event) => {
            setCount(event.target.files?.length ?? 0);
            onChange?.(event.target.files);
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      {count > 0 && (
        <p className="mt-2 text-[14px] font-semibold text-encontrado-texto" aria-live="polite">
          {count === 1 ? t.selectedOne : `${count} ${t.selectedMany}`}
        </p>
      )}
    </div>
  );
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

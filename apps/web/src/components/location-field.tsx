'use client';

import { useId, useState } from 'react';
import { Field, controlClass, secondaryButtonClass } from '@/components/flow-shell';
import { content } from '@/content/es-MX';
import { CDMX_ALCALDIAS, findAlcaldia } from '@/lib/cdmx-alcaldias';

// ============================================================================
// Campo de ubicación de los flujos de reporte.
//
// El bug que arregla: antes solo existía el botón de GPS. Si el usuario negaba
// el permiso —cosa que mucha gente hace por instinto— el formulario quedaba
// intransitable: el envío exigía coordenadas y no había forma de darlas. Se
// perdía el reporte completo, justo en el Flujo B, que es el lado escaso de la
// red y "no puede perder ni un registro" (architecture.md §1).
//
// Reglas de diseño:
//   1. El respaldo manual está SIEMPRE disponible, no solo tras un error: así
//      no hay callejón sin salida ni siquiera si el usuario ignora el GPS.
//   2. El mensaje de error depende del motivo real: "activa el GPS" no sirve
//      de nada a quien negó el permiso del sitio (eso se cambia en los ajustes
//      del navegador, no en el GPS).
//   3. Negar el permiso no es un error del usuario: el tono lo trata como una
//      bifurcación normal, no como una falla.
// ============================================================================

const t = content.location;

export interface LocationValue {
  lat: number;
  lng: number;
  /** Referencia humana ("Col. Roma Norte, Coyoacán"); se muestra en la ficha. */
  addressText: string | null;
  /** De dónde salió la ubicación (alimenta métricas del embudo). */
  source: 'gps' | 'manual';
}

type ErrorKind = 'denied' | 'unavailable' | 'unsupported';

export function LocationField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: LocationValue | null;
  onChange: (value: LocationValue | null) => void;
}) {
  const [locating, setLocating] = useState(false);
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [alcaldiaId, setAlcaldiaId] = useState('');
  const [reference, setReference] = useState('');
  const selectId = useId();
  const referenceId = useId();

  const requestGps = () => {
    setErrorKind(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setErrorKind('unsupported');
      setManualOpen(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          addressText: null,
          source: 'gps',
        });
      },
      (err) => {
        setLocating(false);
        // Distinguir el motivo es lo que hace accionable el mensaje.
        setErrorKind(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
        // Al fallar, el respaldo se abre solo: el usuario no tiene que buscarlo.
        setManualOpen(true);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  /** Recompone la ubicación manual a partir de alcaldía + referencia. */
  const applyManual = (nextAlcaldiaId: string, nextReference: string) => {
    const alcaldia = findAlcaldia(nextAlcaldiaId);
    if (!alcaldia) {
      onChange(null);
      return;
    }
    const ref = nextReference.trim();
    onChange({
      lat: alcaldia.lat,
      lng: alcaldia.lng,
      addressText: ref ? `${ref}, ${alcaldia.name}` : alcaldia.name,
      source: 'manual',
    });
  };

  return (
    <Field label={label}>
      <button
        type="button"
        onClick={requestGps}
        disabled={locating}
        className={`${secondaryButtonClass} disabled:opacity-60`}
      >
        {locating ? t.locating : errorKind === 'unavailable' ? t.retry : t.useGps}
      </button>

      {/* Confirmación de lo que quedará registrado. */}
      {value && (
        <p className="mt-2 text-[14px] font-semibold text-encontrado-texto" aria-live="polite">
          {value.source === 'gps'
            ? `${t.capturedGps} (${value.lat.toFixed(3)}, ${value.lng.toFixed(3)})`
            : `${t.capturedManual}: ${value.addressText}`}
        </p>
      )}

      {errorKind && (
        <p role="alert" className="mt-2 text-[14px] leading-[1.5] text-perdido-texto">
          {t.errors[errorKind]}
        </p>
      )}

      {/* Respaldo manual: siempre alcanzable, aunque el GPS nunca haya fallado. */}
      {manualOpen ? (
        <div className="mt-3 rounded-[12px] border border-borde bg-crema-card p-4">
          <label htmlFor={selectId} className="block text-[14px] font-semibold text-tinta">
            {t.alcaldiaLabel}
          </label>
          <select
            id={selectId}
            value={alcaldiaId}
            onChange={(event) => {
              setAlcaldiaId(event.target.value);
              applyManual(event.target.value, reference);
            }}
            className={`${controlClass} mt-2`}
          >
            <option value="">{t.alcaldiaPlaceholder}</option>
            {CDMX_ALCALDIAS.map((alcaldia) => (
              <option key={alcaldia.id} value={alcaldia.id}>
                {alcaldia.name}
              </option>
            ))}
          </select>

          <label htmlFor={referenceId} className="mt-4 block text-[14px] font-semibold text-tinta">
            {t.referenceLabel}
          </label>
          <input
            id={referenceId}
            type="text"
            value={reference}
            maxLength={80}
            placeholder={t.referencePlaceholder}
            onChange={(event) => {
              setReference(event.target.value);
              if (alcaldiaId) applyManual(alcaldiaId, event.target.value);
            }}
            className={`${controlClass} mt-2`}
          />

          <p className="mt-3 text-[13px] leading-[1.5] text-[#6b5a48]">{t.approxNote}</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="mt-2 block text-[14px] font-semibold text-ambar-texto underline"
        >
          {t.manualToggle}
        </button>
      )}
    </Field>
  );
}

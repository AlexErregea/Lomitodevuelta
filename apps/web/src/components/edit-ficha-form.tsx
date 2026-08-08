'use client';

import { useState } from 'react';
import type { DogAttributes, UpdateReportRequest } from '@lomito/shared';
import { Field, controlClass, primaryButtonClass } from '@/components/flow-shell';
import { content } from '@/content/es-MX';

// ============================================================================
// Editor de ficha (Flujo A post-alta y panel de gestión): corrige atributos y
// señas vía PATCH con el token de gestión. Regla del dominio: elegir el sexo
// aquí lo marca como CONFIRMADO POR HUMANO (activa el gate del score).
// ============================================================================

const t = content.editor;

const SELECT_FIELDS = ['size', 'sex', 'ageRange', 'coatLength'] as const;

export function EditFichaForm({
  reportId,
  manageToken,
  initialAttributes,
  initialMarks,
}: {
  reportId: string;
  manageToken: string;
  initialAttributes: DogAttributes;
  initialMarks: string | null;
}) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function handleSubmit(formData: FormData) {
    setStatus('saving');
    const attributes: DogAttributes = {};

    const listOf = (name: 'breedMix' | 'colors') => {
      const raw = String(formData.get(name) ?? '').trim();
      if (raw) {
        attributes[name] = raw
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
      }
    };
    listOf('breedMix');
    listOf('colors');

    for (const field of SELECT_FIELDS) {
      const value = String(formData.get(field) ?? '');
      if (value) {
        (attributes as Record<string, unknown>)[field] = value;
        // El humano eligió el sexo explícitamente → confirmado (gate del score).
        if (field === 'sex') attributes.sexConfirmed = true;
      }
    }

    const marks = String(formData.get('distinctiveMarks') ?? '').trim();
    const request: UpdateReportRequest = {
      attributes,
      distinctiveMarks: marks || null,
    };

    const response = await fetch(`/api/reports/${reportId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Manage-Token': manageToken },
      body: JSON.stringify(request),
    });
    setStatus(response.ok ? 'saved' : 'error');
  }

  return (
    <form action={handleSubmit}>
      <Field label={t.breedMix} htmlFor="breedMix">
        <input
          id="breedMix"
          name="breedMix"
          defaultValue={initialAttributes.breedMix?.join(', ') ?? ''}
          className={controlClass}
        />
      </Field>

      <Field label={t.colors} htmlFor="colors">
        <input
          id="colors"
          name="colors"
          defaultValue={initialAttributes.colors?.join(', ') ?? ''}
          className={controlClass}
        />
      </Field>

      {/* Los cuatro desplegables en rejilla: son campos cortos y emparejados,
          uno por renglón desperdiciaría la pantalla y alargaría el formulario. */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        {SELECT_FIELDS.map((field) => (
          <div key={field}>
            <label htmlFor={field} className="block text-[15px] font-semibold text-tinta">
              {t[field]}
            </label>
            <select
              id={field}
              name={field}
              defaultValue={(initialAttributes[field] as string | undefined) ?? ''}
              className={`${controlClass} mt-2`}
            >
              <option value="">{t.unknown}</option>
              {Object.entries(t.options[field] ?? {}).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Elegir el sexo lo marca como confirmado por humano y activa el gate del
          score: la advertencia va junto a los controles, no al final. */}
      <p className="mb-5 rounded-[10px] border border-borde bg-crema-card p-3 text-[13px] leading-[1.5] text-[#5b4b3a]">
        {t.sexConfirmedHint}
      </p>

      <Field label={t.distinctiveMarks} htmlFor="distinctiveMarks">
        <textarea
          id="distinctiveMarks"
          name="distinctiveMarks"
          defaultValue={initialMarks ?? ''}
          maxLength={500}
          rows={3}
          className={`${controlClass} resize-none`}
        />
      </Field>

      <button type="submit" disabled={status === 'saving'} className={primaryButtonClass}>
        {status === 'saved' ? t.saved : t.save}
      </button>
      {status === 'error' && (
        <p role="alert" className="mt-2 text-[14px] font-semibold text-perdido-texto">
          {t.saveError}
        </p>
      )}
    </form>
  );
}

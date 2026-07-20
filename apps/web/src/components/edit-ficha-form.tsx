'use client';

import { useState } from 'react';
import type { DogAttributes, UpdateReportRequest } from '@lomito/shared';
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
      <label>
        {t.breedMix}
        <br />
        <input name="breedMix" defaultValue={initialAttributes.breedMix?.join(', ') ?? ''} />
      </label>
      <br />
      <label>
        {t.colors}
        <br />
        <input name="colors" defaultValue={initialAttributes.colors?.join(', ') ?? ''} />
      </label>
      <br />
      {SELECT_FIELDS.map((field) => (
        <label key={field} style={{ display: 'inline-block', marginRight: '1rem' }}>
          {t[field]}
          <br />
          <select name={field} defaultValue={(initialAttributes[field] as string | undefined) ?? ''}>
            <option value="">{t.unknown}</option>
            {Object.entries(t.options[field] ?? {}).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ))}
      <p style={{ fontSize: '0.85rem' }}>{t.sexConfirmedHint}</p>
      <label>
        {t.distinctiveMarks}
        <br />
        <textarea name="distinctiveMarks" defaultValue={initialMarks ?? ''} maxLength={500} rows={2} />
      </label>
      <br />
      <button type="submit" disabled={status === 'saving'}>
        {status === 'saved' ? t.saved : t.save}
      </button>
      {status === 'error' && <span role="alert"> ⚠️ {t.saveError}</span>}
    </form>
  );
}

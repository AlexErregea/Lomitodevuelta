'use client';

import { useState } from 'react';
import type { DogAttributes, RenewReportResponse } from '@lomito/shared';
import { EditFichaForm } from '@/components/edit-ficha-form';
import { Card, dangerButtonClass, secondaryButtonClass } from '@/components/flow-shell';
import { content } from '@/content/es-MX';

// ============================================================================
// Panel de gestión (ARCO sin cuenta, ADR-0006): corregir, renovar y borrar
// con el token del enlace. Las mutaciones van a las rutas API con
// X-Manage-Token; el servidor ya validó el token para montar este panel.
// ============================================================================

const t = content.manage;

export function ManagePanel({
  reportId,
  manageToken,
  status,
  expiresAt,
  attributes,
  distinctiveMarks,
}: {
  reportId: string;
  manageToken: string;
  status: string;
  expiresAt: string | null;
  attributes: DogAttributes;
  distinctiveMarks: string | null;
}) {
  const [renewState, setRenewState] = useState<string | null>(null);
  const [renewFailed, setRenewFailed] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  const headers = { 'Content-Type': 'application/json', 'X-Manage-Token': manageToken };

  async function handleRenew() {
    setRenewFailed(false);
    const response = await fetch(`/api/reports/${reportId}/renew`, { method: 'POST', headers });
    if (!response.ok) return setRenewFailed(true);
    const body = (await response.json()) as RenewReportResponse;
    setRenewState(body.expiresAt.slice(0, 10));
  }

  async function handleDelete() {
    if (!window.confirm(t.deleteConfirm)) return;
    setDeleteFailed(false);
    const response = await fetch(`/api/reports/${reportId}`, { method: 'DELETE', headers });
    if (!response.ok) return setDeleteFailed(true);
    setDeleted(true);
  }

  if (deleted) {
    return (
      <Card tone="crema">
        <p className="text-[15px] font-semibold leading-[1.55] text-encontrado-texto">{t.deleted}</p>
      </Card>
    );
  }

  const activo = status === 'active';

  return (
    <>
      {/* Estado y vigencia: lo primero que la persona quiere saber al volver. */}
      <Card tone="crema">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <span className="text-[14px] text-[#5b4b3a]">
            {t.statusLabel}:{' '}
            <strong className={activo ? 'text-encontrado-texto' : 'text-tinta'}>
              {t.statusValues[status] ?? status}
            </strong>
          </span>
          {expiresAt && (
            <span className="text-[14px] text-[#5b4b3a]">
              {t.expiresLabel}: <strong className="text-tinta">{expiresAt.slice(0, 10)}</strong>
            </span>
          )}
        </div>
        <a
          href={`/r/${reportId}`}
          className="mt-3 inline-block text-[14px] font-semibold text-ambar-texto underline"
        >
          {t.viewFicha}
        </a>
      </Card>

      <Card title={t.editHeading}>
        <EditFichaForm
          reportId={reportId}
          manageToken={manageToken}
          initialAttributes={attributes}
          initialMarks={distinctiveMarks}
        />
      </Card>

      <Card title={t.renewHeading} body={t.renewBody}>
        <button type="button" onClick={handleRenew} className={secondaryButtonClass}>
          {t.renewButton}
        </button>
        {renewState && (
          <p className="mt-2 text-[14px] font-semibold text-encontrado-texto" aria-live="polite">
            {t.renewed(renewState)}
          </p>
        )}
        {renewFailed && (
          <p role="alert" className="mt-2 text-[14px] font-semibold text-perdido-texto">
            {t.renewError}
          </p>
        )}
      </Card>

      {/* Cancelación (ARCO): visible y sin trabas, pero sin competir con lo demás. */}
      <Card title={t.deleteHeading} body={t.deleteBody} tone="crema">
        <button type="button" onClick={handleDelete} className={dangerButtonClass}>
          {t.deleteButton}
        </button>
        {deleteFailed && (
          <p role="alert" className="mt-2 text-[14px] font-semibold text-perdido-texto">
            {t.deleteError}
          </p>
        )}
      </Card>
    </>
  );
}

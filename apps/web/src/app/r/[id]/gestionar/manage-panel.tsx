'use client';

import { useState } from 'react';
import type { DogAttributes, RenewReportResponse } from '@lomito/shared';
import { EditFichaForm } from '@/components/edit-ficha-form';
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

  if (deleted) return <p>✅ {t.deleted}</p>;

  return (
    <>
      <p>
        {t.statusLabel}: <strong>{t.statusValues[status] ?? status}</strong>
        {expiresAt && (
          <>
            {' · '}
            {t.expiresLabel}: <strong>{expiresAt.slice(0, 10)}</strong>
          </>
        )}
        <br />
        <a href={`/r/${reportId}`}>{t.viewFicha}</a>
      </p>

      <h2>{t.editHeading}</h2>
      <EditFichaForm
        reportId={reportId}
        manageToken={manageToken}
        initialAttributes={attributes}
        initialMarks={distinctiveMarks}
      />

      <h2>{t.renewHeading}</h2>
      <p>{t.renewBody}</p>
      <p>
        <button type="button" onClick={handleRenew}>
          {t.renewButton}
        </button>{' '}
        {renewState && <span>✅ {t.renewed(renewState)}</span>}
        {renewFailed && <span role="alert">⚠️ {t.renewError}</span>}
      </p>

      <h2>{t.deleteHeading}</h2>
      <p>{t.deleteBody}</p>
      <p>
        <button type="button" onClick={handleDelete} style={{ color: '#C0392B' }}>
          {t.deleteButton}
        </button>{' '}
        {deleteFailed && <span role="alert">⚠️ {t.deleteError}</span>}
      </p>
    </>
  );
}

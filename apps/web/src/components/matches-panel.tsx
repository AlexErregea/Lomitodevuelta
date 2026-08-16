'use client';

import { useState } from 'react';
import type {
  AcceptMatchResponse,
  ManagedMatch,
  OwnershipProof,
} from '@lomito/shared';
import { controlClass, primaryButtonClass, secondaryButtonClass } from '@/components/flow-shell';
import { content } from '@/content/es-MX';
import { uploadPhoto } from '@/lib/client/upload';

// ============================================================================
// Bandeja de coincidencias del enlace de gestión (ADR-0006): aceptar (con
// prueba de propiedad si eres el dueño), rechazar, y confirmar la reunión.
// El contacto de la contraparte NUNCA aparece aquí: llega por WhatsApp tras
// la doble aceptación (security-privacy.md §3).
// ============================================================================

const t = content.matches;
const bands = content.results.bandLabels;

export function MatchesPanel({
  matches,
  manageToken,
}: {
  matches: ManagedMatch[];
  manageToken: string;
}) {
  // Estado vacío: a baja densidad es lo que más se ve, y su trabajo es que la
  // persona entienda que el sistema sigue trabajando aunque no haya nada.
  if (matches.length === 0) {
    return (
      <p className="rounded-[12px] border border-borde bg-crema-card p-4 text-[14px] leading-[1.6] text-[#5b4b3a]">
        {t.empty}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {matches.map((match) => (
        <MatchCard key={match.matchId} match={match} manageToken={manageToken} />
      ))}
    </div>
  );
}

function MatchCard({ match, manageToken }: { match: ManagedMatch; manageToken: string }) {
  const [status, setStatus] = useState(match.status);
  const [selfAccepted, setSelfAccepted] = useState(match.selfAccepted);
  const [contactRevealed, setContactRevealed] = useState(
    match.status === 'accepted' || match.status === 'confirmed_reunion',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Prueba de propiedad (solo lado 'lost').
  const [proofKind, setProofKind] = useState<'private_mark' | 'historic_photo'>('private_mark');
  const [markText, setMarkText] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);

  const headers = { 'Content-Type': 'application/json', 'X-Manage-Token': manageToken };

  async function buildProof(): Promise<OwnershipProof | null> {
    if (proofKind === 'private_mark') {
      if (markText.trim().length < 10) return null;
      return { kind: 'private_mark', description: markText.trim() };
    }
    if (!proofFile) return null;
    const storagePath = await uploadPhoto(proofFile);
    return { kind: 'historic_photo', storagePath };
  }

  async function handleAccept() {
    setError(null);
    setBusy(true);
    try {
      let ownershipProof: OwnershipProof | undefined;
      if (match.side === 'lost') {
        const proof = await buildProof();
        if (!proof) {
          setError(t.proofRequired);
          setBusy(false);
          return;
        }
        ownershipProof = proof;
      }
      const response = await fetch(`/api/matches/${match.matchId}/accept`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ side: match.side, ...(ownershipProof ? { ownershipProof } : {}) }),
      });
      if (!response.ok) throw new Error('accept failed');
      const body = (await response.json()) as AcceptMatchResponse;
      setSelfAccepted(true);
      setStatus(body.status);
      setContactRevealed(body.contactRevealed || body.status === 'accepted');
    } catch {
      setError(t.genericError);
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setError(null);
    setBusy(true);
    try {
      const reason = window.prompt(t.rejectReasonPlaceholder) ?? undefined;
      const response = await fetch(`/api/matches/${match.matchId}/reject`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ side: match.side, ...(reason ? { reason } : {}) }),
      });
      if (!response.ok) throw new Error('reject failed');
      setStatus('rejected');
    } catch {
      setError(t.genericError);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmReunion() {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/matches/${match.matchId}/confirm-reunion`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ side: match.side }),
      });
      if (!response.ok) throw new Error('confirm failed');
      setStatus('confirmed_reunion');
    } catch {
      setError(t.genericError);
    } finally {
      setBusy(false);
    }
  }

  if (status === 'rejected') return null;

  return (
    <div className="rounded-[14px] border border-borde bg-crema-card p-4">
      {/* Foto y veredicto juntos arriba: la decisión de aceptar o rechazar se
          toma mirando la cara del perro, no leyendo la explicación. */}
      <div className="flex gap-4">
        {match.counterpart.photoUrl && (
          // img nativo a propósito: URL firmada efímera, next/image no aplica.
          <img
            src={match.counterpart.photoUrl}
            alt=""
            className="h-[110px] w-[110px] shrink-0 rounded-[10px] object-cover"
          />
        )}
        <div className="min-w-0">
          <span className="inline-block rounded-full bg-ambar px-[10px] py-1 text-[12px] font-bold uppercase tracking-[.04em] text-white">
            {bands[match.scoreBand] ?? match.scoreBand}
          </span>
          <p className="mt-2 text-[14px] leading-[1.5] text-tinta">{match.explanation}</p>
          {/* Pestaña nueva a propósito: la decisión se toma AQUÍ, y navegar
              fuera dejaría a la persona otra vez en una página sin botones. */}
          <a
            href={`/r/${match.counterpart.reportId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-[14px] font-semibold text-ambar-texto underline"
          >
            {t.viewFicha}
          </a>
        </div>
      </div>

      <div className="mt-4">
      {status === 'confirmed_reunion' ? (
        <p className="rounded-[10px] border border-encontrado/30 bg-encontrado/5 p-3 text-[15px] font-bold text-encontrado-texto">
          {t.reunionConfirmed}
        </p>
      ) : contactRevealed ? (
        <>
          <p className="rounded-[10px] border border-encontrado/30 bg-encontrado/5 p-3 text-[15px] font-bold text-encontrado-texto">
            {t.bridgeOpen}
          </p>
          {/* Copy anti-extorsión: va destacado, no como nota al pie. */}
          <p className="mt-3 rounded-[10px] border border-borde bg-white p-3 text-[13px] leading-[1.55] text-[#5b4b3a]">
            {t.safetyWarning}
          </p>
          <button
            type="button"
            onClick={handleConfirmReunion}
            disabled={busy}
            className={`${primaryButtonClass} mt-3`}
          >
            {t.confirmReunionButton}
          </button>
        </>
      ) : selfAccepted ? (
        <p className="rounded-[10px] border border-borde bg-white p-3 text-[14px] leading-[1.55] text-[#5b4b3a]">
          {t.waitingCounterpart}
        </p>
      ) : (
        <>
          {/* El lado 'found' ve la prueba que aportó el dueño para validarla. */}
          {match.side === 'found' && match.ownershipProof && (
            <p className="rounded-[10px] border border-borde bg-white p-3 text-[14px] leading-[1.55] text-tinta">
              <span className="font-semibold">{t.proofFromClaimant}</span>{' '}
              {match.ownershipProof.kind === 'private_mark'
                ? `"${match.ownershipProof.description}"`
                : t.proofPhotoLabel}
            </p>
          )}

          {/* El lado 'lost' (dueño) aporta la prueba de propiedad. */}
          {match.side === 'lost' && (
            <fieldset className="rounded-[12px] border border-borde bg-white p-4">
              <legend className="px-1 font-display text-[15px] font-bold">{t.proofHeading}</legend>
              <p className="text-[13px] leading-[1.55] text-[#5b4b3a]">{t.proofBody}</p>

              <div className="mt-3 flex flex-col gap-2">
                <label className="flex cursor-pointer items-start gap-3 text-[14px] leading-[1.5] text-tinta">
                  <input
                    type="radio"
                    name={`proof-${match.matchId}`}
                    checked={proofKind === 'private_mark'}
                    onChange={() => setProofKind('private_mark')}
                    className="mt-[3px] h-[18px] w-[18px] accent-ambar"
                  />
                  {t.proofKindMark}
                </label>
                <label className="flex cursor-pointer items-start gap-3 text-[14px] leading-[1.5] text-tinta">
                  <input
                    type="radio"
                    name={`proof-${match.matchId}`}
                    checked={proofKind === 'historic_photo'}
                    onChange={() => setProofKind('historic_photo')}
                    className="mt-[3px] h-[18px] w-[18px] accent-ambar"
                  />
                  {t.proofKindPhoto}
                </label>
              </div>

              <div className="mt-3">
                {proofKind === 'private_mark' ? (
                  <textarea
                    value={markText}
                    onChange={(e) => setMarkText(e.target.value)}
                    placeholder={t.proofMarkPlaceholder}
                    rows={3}
                    maxLength={500}
                    className={`${controlClass} resize-none`}
                  />
                ) : (
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                    className="w-full text-[14px] text-tinta file:mr-3 file:cursor-pointer file:rounded-[8px] file:border-0 file:bg-ambar file:px-4 file:py-2 file:text-[14px] file:font-semibold file:text-white"
                  />
                )}
              </div>
            </fieldset>
          )}

          {/* Aceptar es la acción principal; rechazar existe pero no compite. */}
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleAccept}
              disabled={busy}
              className={primaryButtonClass}
            >
              {match.side === 'lost' ? t.acceptLost : t.acceptFound}
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={busy}
              className={`${secondaryButtonClass} w-full`}
            >
              {t.rejectButton}
            </button>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-[10px] border border-perdido/30 bg-perdido/5 p-3 text-[14px] font-semibold text-perdido-texto">
          {error}
        </p>
      )}
      </div>
    </div>
  );
}

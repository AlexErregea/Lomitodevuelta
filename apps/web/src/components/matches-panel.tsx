'use client';

import { useState } from 'react';
import type {
  AcceptMatchResponse,
  ManagedMatch,
  OwnershipProof,
} from '@lomito/shared';
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
  if (matches.length === 0) return <p>{t.empty}</p>;
  return (
    <div>
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

  const cardStyle = { border: '1px solid #ddd', borderRadius: '0.5rem', padding: '1rem', margin: '1rem 0' };

  return (
    <div style={cardStyle}>
      {match.counterpart.photoUrl && (
        // img nativo a propósito: URL firmada efímera, next/image no aplica.
        <img src={match.counterpart.photoUrl} alt="" width={140} style={{ borderRadius: '0.4rem' }} />
      )}
      <p>
        <strong>{bands[match.scoreBand] ?? match.scoreBand}</strong>
        <br />
        {match.explanation}
        <br />
        <a href={`/r/${match.counterpart.reportId}`}>{t.viewFicha}</a>
      </p>

      {status === 'confirmed_reunion' ? (
        <p>✅ {t.reunionConfirmed}</p>
      ) : contactRevealed ? (
        <>
          <p>✅ {t.bridgeOpen}</p>
          <p style={{ fontSize: '0.85rem' }}>{t.safetyWarning}</p>
          <button type="button" onClick={handleConfirmReunion} disabled={busy}>
            {t.confirmReunionButton}
          </button>
        </>
      ) : selfAccepted ? (
        <p>⏳ {t.waitingCounterpart}</p>
      ) : (
        <>
          {/* El lado 'found' ve la prueba que aportó el dueño para validarla. */}
          {match.side === 'found' && match.ownershipProof && (
            <p style={{ background: '#F3F4F6', padding: '0.6rem', borderRadius: '0.4rem' }}>
              {t.proofFromClaimant}{' '}
              {match.ownershipProof.kind === 'private_mark'
                ? `"${match.ownershipProof.description}"`
                : t.proofPhotoLabel}
            </p>
          )}

          {/* El lado 'lost' (dueño) aporta la prueba de propiedad. */}
          {match.side === 'lost' && (
            <fieldset style={{ margin: '0.5rem 0' }}>
              <legend>{t.proofHeading}</legend>
              <p style={{ fontSize: '0.85rem' }}>{t.proofBody}</p>
              <label>
                <input
                  type="radio"
                  name={`proof-${match.matchId}`}
                  checked={proofKind === 'private_mark'}
                  onChange={() => setProofKind('private_mark')}
                />{' '}
                {t.proofKindMark}
              </label>
              <br />
              <label>
                <input
                  type="radio"
                  name={`proof-${match.matchId}`}
                  checked={proofKind === 'historic_photo'}
                  onChange={() => setProofKind('historic_photo')}
                />{' '}
                {t.proofKindPhoto}
              </label>
              <br />
              {proofKind === 'private_mark' ? (
                <textarea
                  value={markText}
                  onChange={(e) => setMarkText(e.target.value)}
                  placeholder={t.proofMarkPlaceholder}
                  rows={2}
                  maxLength={500}
                  style={{ width: '100%' }}
                />
              ) : (
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                />
              )}
            </fieldset>
          )}

          <button type="button" onClick={handleAccept} disabled={busy}>
            {match.side === 'lost' ? t.acceptLost : t.acceptFound}
          </button>{' '}
          <button type="button" onClick={handleReject} disabled={busy}>
            {t.rejectButton}
          </button>
        </>
      )}

      {error && (
        <p role="alert" style={{ color: '#C0392B' }}>
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}

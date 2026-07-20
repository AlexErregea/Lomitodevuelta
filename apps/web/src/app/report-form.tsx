'use client';

import { useRef, useState } from 'react';
import type { CreateReportRequest, CreateReportResponse } from '@lomito/shared';
import { content } from '@/content/es-MX';
import { captureEvent } from '@/lib/client/analytics';
import { uploadPhoto } from '@/lib/client/upload';

// ============================================================================
// Formulario del Flujo B — "una foto → la IA busca", deliberadamente simple
// (Sprint 1: funcional aunque feo). Estados de carga por etapas para que la
// espera se perciba como trabajo de la IA, no como lentitud (architecture.md
// §5). Los textos vienen del módulo de contenido (regla i18n).
// ============================================================================

type Stage = 'idle' | 'uploading' | 'analyzing' | 'searching' | 'done';

const t = content.flowB;
const tr = content.results;

export function ReportForm() {
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState(false);
  const [result, setResult] = useState<CreateReportResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const startedRef = useRef(false);

  const markStarted = () => {
    // Evento 1 del embudo, una sola vez por sesión de formulario.
    if (!startedRef.current) {
      startedRef.current = true;
      captureEvent('report_started', { report_type: 'found' });
    }
  };

  const requestLocation = () => {
    setGeoError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoError(true),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  async function handleSubmit(formData: FormData) {
    setError(null);
    const photo = formData.get('photo');
    const whatsapp = String(formData.get('whatsapp') ?? '').trim();
    const eventDate = String(formData.get('eventDate') ?? '');
    const finderNote = String(formData.get('finderNote') ?? '').trim();
    const consent = formData.get('consent') === 'on';

    if (!(photo instanceof File) || photo.size === 0) return setError(t.errors.missingPhoto);
    if (!geo) return setError(t.errors.missingLocation);
    if (!consent) return setError(t.errors.missingConsent);

    try {
      setStage('uploading');
      const storagePath = await uploadPhoto(photo);
      captureEvent('photo_uploaded', { report_type: 'found' });

      setStage('analyzing');
      const request: CreateReportRequest = {
        reportType: 'found',
        photoPaths: [storagePath],
        geo,
        eventDate,
        contact: { channel: 'whatsapp', value: whatsapp },
        consentAccepted: true,
        ...(finderNote ? { finderNote } : {}),
      };
      const reportResponse = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      setStage('searching');
      if (!reportResponse.ok) {
        const body = (await reportResponse.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? 'report failed');
      }
      const created = (await reportResponse.json()) as CreateReportResponse;
      captureEvent('report_created', { report_type: 'found' });
      captureEvent('candidates_shown', { count: created.candidates.length });
      setResult(created);
      setStage('done');
    } catch (err) {
      setStage('idle');
      setError(err instanceof Error && err.message !== 'report failed' && err.message !== 'sign failed' && err.message !== 'upload failed' ? err.message : t.errors.generic);
    }
  }

  if (result) return <Results result={result} copied={copied} onCopy={async () => {
    await navigator.clipboard.writeText(result.manageUrl);
    setCopied(true);
  }} />;

  const busy = stage !== 'idle';
  return (
    <form action={handleSubmit} onFocusCapture={markStarted}>
      <h2>{t.heading}</h2>

      <label>
        {t.photoLabel}
        <br />
        <input type="file" name="photo" accept="image/*" capture="environment" required />
      </label>

      <p>
        {t.locationLabel}
        <br />
        <button type="button" onClick={requestLocation}>
          {t.useMyLocation}
        </button>{' '}
        {geo && (
          <span>
            ✅ {t.locationCaptured} ({geo.lat.toFixed(3)}, {geo.lng.toFixed(3)})
          </span>
        )}
        {geoError && <span role="alert"> ⚠️ {t.locationError}</span>}
      </p>

      <label>
        {t.dateLabel}
        <br />
        <input type="date" name="eventDate" defaultValue={new Date().toISOString().slice(0, 10)} required />
      </label>

      <p>
        <label>
          {t.noteLabel}
          <br />
          <textarea name="finderNote" placeholder={t.notePlaceholder} maxLength={500} rows={2} />
        </label>
      </p>

      <label>
        {t.whatsappLabel}
        <br />
        <input type="tel" name="whatsapp" placeholder={t.whatsappPlaceholder} required minLength={10} />
      </label>

      <p>
        <label>
          <input type="checkbox" name="consent" required /> {t.consentLabel}
        </label>{' '}
        <a href="/privacidad" target="_blank">
          {t.privacyLink}
        </a>
      </p>

      {error && <p role="alert">⚠️ {error}</p>}
      {busy && stage !== 'done' && <p aria-live="polite">⏳ {t.stages[stage as Exclude<Stage, 'idle' | 'done'>]}</p>}

      <button type="submit" disabled={busy}>
        {t.submit}
      </button>
    </form>
  );
}

function Results({
  result,
  copied,
  onCopy,
}: {
  result: CreateReportResponse;
  copied: boolean;
  onCopy: () => void;
}) {
  const hasAmbiguity = result.candidates.some((c) => c.flags.includes('visual_ambiguity'));
  return (
    <section>
      <h2>{result.candidates.length > 0 ? tr.candidatesHeading : tr.noCandidatesHeading}</h2>
      {result.candidates.length === 0 && <p>{tr.noCandidatesBody}</p>}
      {hasAmbiguity && <p>⚠️ {tr.ambiguityWarning}</p>}

      <ul>
        {result.candidates.map((candidate) => (
          <li key={candidate.reportId}>
            {candidate.photoUrl && (
              // img nativo a propósito: URL firmada efímera, next/image no aplica.
              <img src={candidate.photoUrl} alt="" width={120} />
            )}
            <p>
              <strong>{tr.bandLabels[candidate.scoreBand] ?? candidate.scoreBand}</strong>
              <br />
              {candidate.explanation}
              <br />
              {tr.contactMasked}: {candidate.displayMask}
            </p>
          </li>
        ))}
      </ul>

      <h3>{tr.manageLinkHeading}</h3>
      <p>{tr.manageLinkBody}</p>
      <p>
        <code>{result.manageUrl}</code>{' '}
        <button type="button" onClick={onCopy}>
          {copied ? tr.copied : tr.copyLink}
        </button>
      </p>
    </section>
  );
}

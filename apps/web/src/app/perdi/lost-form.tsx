'use client';

import { useRef, useState } from 'react';
import type { CreateReportRequest, CreateReportResponse } from '@lomito/shared';
import { EditFichaForm } from '@/components/edit-ficha-form';
import { content } from '@/content/es-MX';
import { captureEvent } from '@/lib/client/analytics';
import { uploadPhoto } from '@/lib/client/upload';

// ============================================================================
// Formulario del Flujo A — "perdí a mi perro": multi-foto, la IA autocompleta
// la ficha y el usuario la corrige después (su corrección siempre gana).
// ============================================================================

type Stage = 'idle' | 'uploading' | 'analyzing' | 'searching' | 'done';

const t = content.flowA;
const tb = content.flowB;
const tr = content.results;

const MAX_PHOTOS = 5;

export function LostForm() {
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState(false);
  const [result, setResult] = useState<CreateReportResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const startedRef = useRef(false);

  const markStarted = () => {
    if (!startedRef.current) {
      startedRef.current = true;
      captureEvent('report_started', { report_type: 'lost' });
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
    const photos = formData.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
    const whatsapp = String(formData.get('whatsapp') ?? '').trim();
    const eventDate = String(formData.get('eventDate') ?? '');
    const marks = String(formData.get('distinctiveMarks') ?? '').trim();
    const consent = formData.get('consent') === 'on';

    if (photos.length === 0) return setError(tb.errors.missingPhoto);
    if (photos.length > MAX_PHOTOS) return setError(t.tooManyPhotos);
    if (!geo) return setError(tb.errors.missingLocation);
    if (!consent) return setError(tb.errors.missingConsent);

    try {
      setStage('uploading');
      const photoPaths: string[] = [];
      for (const photo of photos) {
        photoPaths.push(await uploadPhoto(photo));
      }
      captureEvent('photo_uploaded', { report_type: 'lost', count: photoPaths.length });

      setStage('analyzing');
      const request: CreateReportRequest = {
        reportType: 'lost',
        photoPaths,
        geo,
        eventDate,
        contact: { channel: 'whatsapp', value: whatsapp },
        consentAccepted: true,
        ...(marks ? { distinctiveMarks: marks } : {}),
      };
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      setStage('searching');
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? tb.errors.generic);
      }
      const created = (await response.json()) as CreateReportResponse;
      captureEvent('report_created', { report_type: 'lost' });
      captureEvent('candidates_shown', { count: created.candidates.length });
      setResult(created);
      setStage('done');
    } catch (err) {
      setStage('idle');
      setError(err instanceof Error ? err.message : tb.errors.generic);
    }
  }

  if (result) {
    const manageToken = new URL(result.manageUrl).searchParams.get('t') ?? '';
    return (
      <section>
        <h2>{result.candidates.length > 0 ? tr.candidatesHeading : tr.noCandidatesHeading}</h2>
        {result.candidates.length === 0 && <p>{tr.noCandidatesBody}</p>}
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
              </p>
            </li>
          ))}
        </ul>

        <h3>{t.editHeading}</h3>
        <p>{t.editBody}</p>
        <EditFichaForm
          reportId={result.reportId}
          manageToken={manageToken}
          initialAttributes={result.extracted?.attributes ?? {}}
          initialMarks={null}
        />

        <h3>{tr.manageLinkHeading}</h3>
        <p>{tr.manageLinkBody}</p>
        <p>
          <code>{result.manageUrl}</code>{' '}
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(result.manageUrl);
              setCopied(true);
            }}
          >
            {copied ? tr.copied : tr.copyLink}
          </button>
        </p>
        <p>
          <a href={result.shareUrl}>🔗 {content.ficha.shareButton}</a>
        </p>
      </section>
    );
  }

  const busy = stage !== 'idle';
  return (
    <form action={handleSubmit} onFocusCapture={markStarted}>
      <h2>{t.heading}</h2>

      <label>
        {t.photosLabel}
        <br />
        <input type="file" name="photos" accept="image/*" multiple required />
      </label>

      <p>
        {t.locationLabel}
        <br />
        <button type="button" onClick={requestLocation}>
          {tb.useMyLocation}
        </button>{' '}
        {geo && (
          <span>
            ✅ {tb.locationCaptured} ({geo.lat.toFixed(3)}, {geo.lng.toFixed(3)})
          </span>
        )}
        {geoError && <span role="alert"> ⚠️ {tb.locationError}</span>}
      </p>

      <label>
        {t.dateLabel}
        <br />
        <input type="date" name="eventDate" defaultValue={new Date().toISOString().slice(0, 10)} required />
      </label>

      <p>
        <label>
          {t.marksLabel}
          <br />
          <textarea name="distinctiveMarks" placeholder={t.marksPlaceholder} maxLength={500} rows={2} />
        </label>
      </p>

      <label>
        {tb.whatsappLabel}
        <br />
        <input type="tel" name="whatsapp" placeholder={tb.whatsappPlaceholder} required minLength={10} />
      </label>

      <p>
        <label>
          <input type="checkbox" name="consent" required /> {tb.consentLabel}
        </label>{' '}
        <a href="/privacidad" target="_blank">
          {tb.privacyLink}
        </a>
      </p>

      {error && <p role="alert">⚠️ {error}</p>}
      {busy && stage !== 'done' && (
        <p aria-live="polite">⏳ {tb.stages[stage === 'uploading' ? 'uploading' : stage === 'analyzing' ? 'analyzing' : 'searching']}</p>
      )}

      <button type="submit" disabled={busy}>
        {t.submit}
      </button>
    </form>
  );
}

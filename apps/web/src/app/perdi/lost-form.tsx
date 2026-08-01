'use client';

import { useRef, useState } from 'react';
import type { CreateReportRequest, CreateReportResponse } from '@lomito/shared';
import { EditFichaForm } from '@/components/edit-ficha-form';
import {
  Field,
  FlowHeading,
  controlClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/flow-shell';
import { LocationField, type LocationValue } from '@/components/location-field';
import { PhotoPicker } from '@/components/photo-picker';
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
  const [location, setLocation] = useState<LocationValue | null>(null);
  const [result, setResult] = useState<CreateReportResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const startedRef = useRef(false);

  const markStarted = () => {
    if (!startedRef.current) {
      startedRef.current = true;
      captureEvent('report_started', { report_type: 'lost' });
    }
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
    if (!location) return setError(tb.errors.missingLocation);
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
        geo: { lat: location.lat, lng: location.lng },
        eventDate,
        contact: { channel: 'whatsapp', value: whatsapp },
        consentAccepted: true,
        ...(location.addressText ? { addressText: location.addressText } : {}),
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
      // location_source mide cuánta gente depende del respaldo manual.
      captureEvent('report_created', { report_type: 'lost', location_source: location.source });
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
    const hasCandidates = result.candidates.length > 0;
    return (
      <section>
        <h1 className="font-display text-[clamp(24px,5.5vw,30px)] font-bold leading-[1.2] tracking-[-.02em]">
          {hasCandidates ? tr.candidatesHeading : tr.noCandidatesHeading}
        </h1>
        {/* Estado vacío: a baja densidad es lo que más gente va a ver, así que
            se trata como parte del producto y no como un caso borde. */}
        {!hasCandidates && (
          <p className="mt-3 rounded-[12px] border border-borde bg-crema-card p-4 text-[15px] leading-[1.6] text-[#5b4b3a]">
            {tr.noCandidatesBody}
          </p>
        )}

        <ul className="mt-6 flex flex-col gap-3">
          {result.candidates.map((candidate) => (
            <li
              key={candidate.reportId}
              className="flex gap-4 rounded-[14px] border border-borde bg-white p-3"
            >
              {candidate.photoUrl && (
                // img nativo a propósito: URL firmada efímera, next/image no aplica.
                <img
                  src={candidate.photoUrl}
                  alt=""
                  className="h-[92px] w-[92px] shrink-0 rounded-[10px] object-cover"
                />
              )}
              <div className="min-w-0">
                <span className="inline-block rounded-full bg-crema-2 px-[10px] py-1 text-[12px] font-bold uppercase tracking-[.04em] text-ambar-texto">
                  {tr.bandLabels[candidate.scoreBand] ?? candidate.scoreBand}
                </span>
                <p className="mt-2 text-[14px] leading-[1.5] text-tinta">{candidate.explanation}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-8 rounded-[14px] border border-borde bg-white p-4">
          <h2 className="font-display text-lg font-bold">{t.editHeading}</h2>
          <p className="mt-1 text-[14px] leading-[1.55] text-[#5b4b3a]">{t.editBody}</p>
          <div className="mt-4">
            <EditFichaForm
              reportId={result.reportId}
              manageToken={manageToken}
              initialAttributes={result.extracted?.attributes ?? {}}
              initialMarks={null}
            />
          </div>
        </div>

        {/* El enlace de gestión es lo único que le devuelve el control a quien
            reportó sin cuenta: se destaca, no se esconde al final. */}
        <div className="mt-6 rounded-[14px] border border-borde bg-crema-card p-4">
          <h2 className="font-display text-lg font-bold">{tr.manageLinkHeading}</h2>
          <p className="mt-1 text-[14px] leading-[1.55] text-[#5b4b3a]">{tr.manageLinkBody}</p>
          <code className="mt-3 block overflow-x-auto whitespace-nowrap rounded-[8px] border border-borde bg-white px-3 py-2 text-[13px] text-tinta">
            {result.manageUrl}
          </code>
          <button
            type="button"
            className={`${secondaryButtonClass} mt-3 w-full`}
            onClick={async () => {
              await navigator.clipboard.writeText(result.manageUrl);
              setCopied(true);
            }}
          >
            {copied ? tr.copied : tr.copyLink}
          </button>
        </div>

        <a href={result.shareUrl} className={`${primaryButtonClass} mt-4 block text-center`}>
          {content.ficha.shareButton}
        </a>
      </section>
    );
  }

  const busy = stage !== 'idle';
  return (
    <form action={handleSubmit} onFocusCapture={markStarted}>
      <FlowHeading title={t.heading} promise={t.promise} />

      <Field label={t.photosLabel}>
        <PhotoPicker name="photos" multiple />
      </Field>

      <LocationField label={t.locationLabel} value={location} onChange={setLocation} />

      <Field label={t.dateLabel} htmlFor="eventDate">
        <input
          id="eventDate"
          type="date"
          name="eventDate"
          defaultValue={new Date().toISOString().slice(0, 10)}
          required
          className={controlClass}
        />
      </Field>

      <Field label={t.marksLabel} htmlFor="distinctiveMarks">
        <textarea
          id="distinctiveMarks"
          name="distinctiveMarks"
          placeholder={t.marksPlaceholder}
          maxLength={500}
          rows={3}
          className={`${controlClass} resize-none`}
        />
      </Field>

      <Field label={tb.whatsappLabel} htmlFor="whatsapp">
        <input
          id="whatsapp"
          type="tel"
          name="whatsapp"
          placeholder={tb.whatsappPlaceholder}
          required
          minLength={10}
          className={controlClass}
        />
      </Field>

      <div className="mb-6 rounded-[12px] border border-borde bg-crema-card p-4">
        <label htmlFor="consent" className="grid grid-cols-[auto_1fr] items-start gap-3">
          <input id="consent" type="checkbox" name="consent" required className="mt-[3px] h-[18px] w-[18px] accent-[#a6661b]" />
          <span className="text-[14px] leading-[1.55] text-[#5b4b3a]">
            {tb.consentLabel}{' '}
            <a
              href="/privacidad"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-ambar-texto underline"
            >
              {tb.privacyLink}
            </a>
          </span>
        </label>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-[10px] border border-perdido/30 bg-perdido/5 p-3 text-[14px] font-semibold text-perdido-texto">
          {error}
        </p>
      )}
      {busy && stage !== 'done' && (
        <p
          aria-live="polite"
          className="mb-4 flex items-center gap-[10px] rounded-[10px] border border-borde bg-crema-card p-3 text-[14px] font-semibold text-tinta"
        >
          <span className="h-[14px] w-[14px] shrink-0 animate-spin rounded-full border-2 border-ambar border-t-transparent" />
          {tb.stages[stage === 'uploading' ? 'uploading' : stage === 'analyzing' ? 'analyzing' : 'searching']}
        </p>
      )}

      <button type="submit" disabled={busy} className={primaryButtonClass}>
        {t.submit}
      </button>
    </form>
  );
}

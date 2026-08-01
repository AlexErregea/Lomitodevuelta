'use client';

import { useRef, useState } from 'react';
import type { CreateReportRequest, CreateReportResponse } from '@lomito/shared';
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
// Formulario del Flujo B — "una foto → la IA busca". La lógica es la del
// Sprint 1 (sin cambios); lo que cambió es la presentación: ahora usa los
// tokens de marca y los primitivos de flow-shell en vez de controles nativos
// desnudos. Estados de carga por etapas para que la espera se perciba como
// trabajo de la IA, no como lentitud (architecture.md §5). Los textos vienen
// del módulo de contenido (regla i18n).
// ============================================================================

type Stage = 'idle' | 'uploading' | 'analyzing' | 'searching' | 'done';

const t = content.flowB;
const tr = content.results;

export function FoundForm() {
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationValue | null>(null);
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

  async function handleSubmit(formData: FormData) {
    setError(null);
    const photo = formData.get('photo');
    const whatsapp = String(formData.get('whatsapp') ?? '').trim();
    const eventDate = String(formData.get('eventDate') ?? '');
    const finderNote = String(formData.get('finderNote') ?? '').trim();
    const consent = formData.get('consent') === 'on';

    if (!(photo instanceof File) || photo.size === 0) return setError(t.errors.missingPhoto);
    if (!location) return setError(t.errors.missingLocation);
    if (!consent) return setError(t.errors.missingConsent);

    try {
      setStage('uploading');
      const storagePath = await uploadPhoto(photo);
      captureEvent('photo_uploaded', { report_type: 'found' });

      setStage('analyzing');
      const request: CreateReportRequest = {
        reportType: 'found',
        photoPaths: [storagePath],
        geo: { lat: location.lat, lng: location.lng },
        eventDate,
        contact: { channel: 'whatsapp', value: whatsapp },
        consentAccepted: true,
        ...(location.addressText ? { addressText: location.addressText } : {}),
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
      // location_source mide cuánta gente depende del respaldo manual.
      captureEvent('report_created', { report_type: 'found', location_source: location.source });
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
      <FlowHeading title={t.heading} promise={t.promise} />

      <Field label={t.photoLabel}>
        <PhotoPicker name="photo" capture />
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

      <Field label={t.noteLabel} htmlFor="finderNote">
        <textarea
          id="finderNote"
          name="finderNote"
          placeholder={t.notePlaceholder}
          maxLength={500}
          rows={3}
          className={`${controlClass} resize-none`}
        />
      </Field>

      <Field label={t.whatsappLabel} htmlFor="whatsapp">
        <input
          id="whatsapp"
          type="tel"
          name="whatsapp"
          placeholder={t.whatsappPlaceholder}
          required
          minLength={10}
          className={controlClass}
        />
      </Field>

      {/* Consentimiento: la casilla y su texto se alinean en grid para que las
          líneas siguientes no queden bajo la casilla. */}
      <div className="mb-6 rounded-[12px] border border-borde bg-crema-card p-4">
        <label htmlFor="consent" className="grid grid-cols-[auto_1fr] items-start gap-3">
          <input id="consent" type="checkbox" name="consent" required className="mt-[3px] h-[18px] w-[18px] accent-[#a6661b]" />
          <span className="text-[14px] leading-[1.55] text-[#5b4b3a]">
            {t.consentLabel}{' '}
            <a
              href="/privacidad"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-ambar-texto underline"
            >
              {t.privacyLink}
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
          {t.stages[stage as Exclude<Stage, 'idle' | 'done'>]}
        </p>
      )}

      <button type="submit" disabled={busy} className={primaryButtonClass}>
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
  const hasCandidates = result.candidates.length > 0;
  return (
    <section>
      <h1 className="font-display text-[clamp(24px,5.5vw,30px)] font-bold leading-[1.2] tracking-[-.02em]">
        {hasCandidates ? tr.candidatesHeading : tr.noCandidatesHeading}
      </h1>
      {/* Estado vacío: es una función del producto, no un caso borde. A baja
          densidad de datos es lo que más gente va a ver (architecture.md). */}
      {!hasCandidates && (
        <p className="mt-3 rounded-[12px] border border-borde bg-crema-card p-4 text-[15px] leading-[1.6] text-[#5b4b3a]">
          {tr.noCandidatesBody}
        </p>
      )}
      {hasAmbiguity && (
        <p className="mt-3 rounded-[10px] border border-borde bg-crema-card p-3 text-[14px] leading-[1.5] text-[#5b4b3a]">
          {tr.ambiguityWarning}
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
              <p className="mt-1 text-[13px] text-[#6b5a48]">
                {tr.contactMasked}: {candidate.displayMask}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {/* El enlace de gestión es lo único que le devuelve el control a quien
          reportó sin cuenta: se destaca, no se esconde al final. */}
      <div className="mt-7 rounded-[14px] border border-borde bg-crema-card p-4">
        <h2 className="font-display text-lg font-bold">{tr.manageLinkHeading}</h2>
        <p className="mt-1 text-[14px] leading-[1.55] text-[#5b4b3a]">{tr.manageLinkBody}</p>
        <code className="mt-3 block overflow-x-auto whitespace-nowrap rounded-[8px] border border-borde bg-white px-3 py-2 text-[13px] text-tinta">
          {result.manageUrl}
        </code>
        <button type="button" onClick={onCopy} className={`${secondaryButtonClass} mt-3 w-full`}>
          {copied ? tr.copied : tr.copyLink}
        </button>
      </div>
    </section>
  );
}

import Anthropic from 'npm:@anthropic-ai/sdk';
import {
  EXTRACTION_JSON_SCHEMA,
  EXTRACTION_SYSTEM_PROMPT,
  EXTRACTION_USER_PROMPT,
} from '../../../packages/shared/src/providers/extraction-prompt.ts';
import { optionalEnv, requireEnv } from './env.ts';

// ============================================================================
// Providers de visión para reintentos (ADR-0003). Mismo contrato que las
// implementaciones de apps/web: comparten prompt y JSON Schema vía
// packages/shared (archivo sin dependencias — importable desde Deno).
// La validación fina con Zod vive en apps/web; aquí un guard estructural
// equivalente mantiene la frontera sin arrastrar zod al runtime Deno.
// ============================================================================

const DEFAULT_EXTRACTION_MODEL = 'claude-haiku-4-5';
// Por VERSIÓN, no por nombre: /v1/models/{owner}/{name}/predictions solo sirve
// para modelos oficiales de Replicate y devuelve 404 con los de la comunidad.
// Espejo de apps/web/src/lib/providers/replicate-embedding.ts — mantener igual.
const DEFAULT_REPLICATE_VERSION =
  '75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a';
const EXPECTED_DIMENSIONS = 768;
/** En reintentos nadie espera: se tolera más latencia que en el camino vivo. */
const REQUEST_TIMEOUT_MS = 45_000;

export interface ExtractionResult {
  isDog: boolean;
  isSensitive: boolean;
  qualityScore: number;
  attributes: Record<string, unknown>;
  distinctiveMarks: string;
  marksTags: string[];
}

export async function extractAttributes(imageUrl: string): Promise<ExtractionResult> {
  const client = new Anthropic({
    apiKey: requireEnv('ANTHROPIC_API_KEY'),
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 1,
  });
  const model = optionalEnv('ANTHROPIC_EXTRACTION_MODEL') ?? DEFAULT_EXTRACTION_MODEL;
  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          { type: 'text', text: EXTRACTION_USER_PROMPT },
        ],
      },
    ],
    output_config: {
      format: {
        type: 'json_schema',
        schema: EXTRACTION_JSON_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });
  if (response.stop_reason === 'refusal') throw new Error('El modelo rechazó analizar la imagen.');
  const text = response.content.find((b: { type: string }) => b.type === 'text')?.text;
  if (!text) throw new Error('La extracción no devolvió texto.');
  return validateExtraction(JSON.parse(text));
}

/** Guard estructural (espejo de attributeExtractionSchema en @lomito/shared). */
export function validateExtraction(raw: unknown): ExtractionResult {
  const r = raw as Record<string, unknown>;
  if (
    typeof r?.isDog !== 'boolean' ||
    typeof r?.isSensitive !== 'boolean' ||
    typeof r?.qualityScore !== 'number' ||
    r.qualityScore < 0 ||
    r.qualityScore > 1 ||
    typeof r?.attributes !== 'object' ||
    r.attributes === null ||
    typeof r?.distinctiveMarks !== 'string' ||
    !Array.isArray(r?.marksTags) ||
    !(r.marksTags as unknown[]).every((t) => typeof t === 'string')
  ) {
    throw new Error('La extracción no valida contra el esquema esperado.');
  }
  return r as unknown as ExtractionResult;
}

/**
 * 429 de Replicate: no es una inferencia fallida, es una espera con duración
 * conocida. Espejo de apps/web/src/lib/providers/replicate-embedding.ts.
 * `retry-pending` la trata distinto de un fallo real: la respeta y NO gasta un
 * intento del reporte (si no, un límite de tasa acabaría matando el reporte,
 * justo lo contrario de la regla de oro del ADR-0003).
 */
export class ReplicateThrottleError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, detail: string) {
    super(`Replicate throttled (reintentar en ~${retryAfterSeconds}s): ${detail}`);
    this.name = 'ReplicateThrottleError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isThrottleError(error: unknown): error is ReplicateThrottleError {
  return error instanceof Error && error.name === 'ReplicateThrottleError';
}

const MIN_RETRY_AFTER_SECONDS = 1;
const MAX_RETRY_AFTER_SECONDS = 30;
const DEFAULT_RETRY_AFTER_SECONDS = 10;

/** Segundos que pide Replicate: van en el JSON (`retry_after`) o en la cabecera. */
export function parseRetryAfterSeconds(body: string, header: string | null): number {
  const clamp = (value: number): number =>
    Math.min(MAX_RETRY_AFTER_SECONDS, Math.max(MIN_RETRY_AFTER_SECONDS, Math.ceil(value)));

  try {
    const parsed = JSON.parse(body) as { retry_after?: unknown };
    if (typeof parsed.retry_after === 'number' && Number.isFinite(parsed.retry_after)) {
      return clamp(parsed.retry_after);
    }
  } catch {
    // Cuerpo no-JSON: se sigue con la cabecera.
  }

  const fromHeader = Number(header);
  if (header && Number.isFinite(fromHeader)) return clamp(fromHeader);

  return DEFAULT_RETRY_AFTER_SECONDS;
}

export async function embedImage(imageUrl: string): Promise<number[]> {
  const replicateVersion = optionalEnv('REPLICATE_EMBEDDING_VERSION') ?? DEFAULT_REPLICATE_VERSION;
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireEnv('REPLICATE_API_TOKEN')}`,
      'Content-Type': 'application/json',
      Prefer: 'wait',
    },
    body: JSON.stringify({
      version: replicateVersion,
      input: { inputs: imageUrl },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const body = await response.text();
    if (response.status === 429) {
      throw new ReplicateThrottleError(
        parseRetryAfterSeconds(body, response.headers.get('retry-after')),
        body,
      );
    }
    throw new Error(`Replicate respondió ${response.status}: ${body}`);
  }
  const prediction = (await response.json()) as { status: string; output: unknown; error: string | null };
  if (prediction.status !== 'succeeded') {
    throw new Error(`Predicción de Replicate en estado ${prediction.status}: ${prediction.error ?? 'sin detalle'}`);
  }
  // Normaliza las dos formas comunes de salida (vector plano o [{embedding}]).
  let values: unknown = prediction.output;
  if (Array.isArray(values) && values.length > 0 && typeof values[0] === 'object' && values[0] !== null) {
    values = (values[0] as { embedding?: unknown }).embedding;
  }
  if (!Array.isArray(values) || !values.every((v) => typeof v === 'number')) {
    throw new Error('Salida de Replicate no reconocida como vector de números.');
  }
  if (values.length !== EXPECTED_DIMENSIONS) {
    throw new Error(`Dimensión inesperada del embedding: ${values.length} (se esperaban ${EXPECTED_DIMENSIONS}).`);
  }
  return values as number[];
}

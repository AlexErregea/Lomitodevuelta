import type { EmbeddingProvider } from '@lomito/shared';
import { optionalEnv, requireEnv } from '../env';

// ============================================================================
// EmbeddingProvider con Replicate (ADR-0003). El modelo de Replicate se fija
// por env (REPLICATE_EMBEDDING_MODEL) pero la VERSIÓN que se persiste junto a
// cada vector viene de la fila activa de matching_params — así el benchmark
// del Bloque 7 puede cambiar de modelo sin tocar código (nueva fila activa +
// re-embed, runbook en matching-engine.md §7).
// ============================================================================

// Placeholder pre-benchmark: CLIP ViT-L/14 (768 dims) servido en Replicate.
//
// Se invoca por VERSIÓN y no por nombre de modelo. El endpoint
// /v1/models/{owner}/{name}/predictions solo existe para los modelos oficiales
// de Replicate; andreasjansson/clip-features es de la comunidad, y llamarlo así
// devuelve 404. Los modelos de la comunidad van por /v1/predictions con el hash
// de la versión.
//
// Fijar el hash además cumple el ADR-0003: un vector solo se compara con otros
// de la MISMA versión de modelo. Si el hash cambia sin que cambie
// matching_params.embedding_model_version, quedarían vectores incomparables
// bajo la misma etiqueta.
const DEFAULT_REPLICATE_VERSION =
  '75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a';
const EXPECTED_DIMENSIONS = 768;
/** Timeout propio < 20 s del pipeline (los cold starts se van a 'pending'). */
const REQUEST_TIMEOUT_MS = 18_000;

interface ReplicatePrediction {
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output: unknown;
  error: string | null;
}

/**
 * 429 de Replicate: NO es una inferencia fallida, es una espera con duración
 * conocida. Distinguirla importa porque el reintento la trata al revés que a
 * un fallo real — un throttle no debe consumir intentos ni, por tanto, poder
 * matar un reporte (ADR-0003: una inferencia fallida jamás pierde un reporte;
 * mucho menos una que ni siquiera falló).
 */
export class ReplicateThrottleError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, detail: string) {
    super(`Replicate throttled (reintentar en ~${retryAfterSeconds}s): ${detail}`);
    this.name = 'ReplicateThrottleError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** ¿Es un throttle? Se pregunta por el nombre para cruzar límites de módulo. */
export function isThrottleError(error: unknown): error is ReplicateThrottleError {
  return error instanceof Error && error.name === 'ReplicateThrottleError';
}

/** Espera mínima y máxima que se respeta de un 429 (el resto lo hace el cron). */
const MIN_RETRY_AFTER_SECONDS = 1;
const MAX_RETRY_AFTER_SECONDS = 30;
const DEFAULT_RETRY_AFTER_SECONDS = 10;

/**
 * Segundos de espera que pide Replicate. Los manda en el JSON del cuerpo
 * (`retry_after`) y a veces en la cabecera estándar `Retry-After`; hasta hoy
 * los ignorábamos por completo y reintentábamos de inmediato, que es la razón
 * de que un throttle se repitiera intento tras intento.
 */
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

export class ReplicateEmbeddingProvider implements EmbeddingProvider {
  readonly modelVersion: string;
  readonly dimensions = EXPECTED_DIMENSIONS;
  private replicateVersion: string;

  /** @param modelVersion versión activa de matching_params (se persiste con cada vector) */
  constructor(modelVersion: string) {
    this.modelVersion = modelVersion;
    this.replicateVersion = optionalEnv('REPLICATE_EMBEDDING_VERSION') ?? DEFAULT_REPLICATE_VERSION;
  }

  async embed(imageUrl: string): Promise<Float32Array> {
    // 'Prefer: wait' bloquea hasta ~60 s en el servidor de Replicate; nuestro
    // AbortSignal corta antes — el llamador maneja el fallo (ruta pending).
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requireEnv('REPLICATE_API_TOKEN')}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
      body: JSON.stringify({
        version: this.replicateVersion,
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

    const prediction = (await response.json()) as ReplicatePrediction;
    if (prediction.status !== 'succeeded') {
      throw new Error(`Predicción de Replicate en estado ${prediction.status}: ${prediction.error ?? 'sin detalle'}`);
    }
    return parseEmbeddingOutput(prediction.output, this.dimensions);
  }
}

/**
 * Normaliza la salida de Replicate a Float32Array. Los modelos de embeddings
 * en Replicate devuelven formas distintas (array plano, [{embedding: [...]}]);
 * se aceptan las dos y se valida la dimensión SIEMPRE — un vector de otra
 * dimensión corrompería el índice pgvector.
 */
export function parseEmbeddingOutput(output: unknown, expectedDims: number): Float32Array {
  let values: unknown = output;
  if (Array.isArray(output) && output.length > 0 && typeof output[0] === 'object' && output[0] !== null) {
    values = (output[0] as { embedding?: unknown }).embedding;
  }
  if (!Array.isArray(values) || !values.every((v) => typeof v === 'number')) {
    throw new Error('Salida de Replicate no reconocida como vector de números.');
  }
  if (values.length !== expectedDims) {
    throw new Error(`Dimensión inesperada del embedding: ${values.length} (se esperaban ${expectedDims}).`);
  }
  return Float32Array.from(values as number[]);
}

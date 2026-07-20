import type { EmbeddingProvider } from '@lomito/shared';
import { optionalEnv, requireEnv } from '../env';

// ============================================================================
// EmbeddingProvider con Replicate (ADR-0003). El modelo de Replicate se fija
// por env (REPLICATE_EMBEDDING_MODEL) pero la VERSIÓN que se persiste junto a
// cada vector viene de la fila activa de matching_params — así el benchmark
// del Bloque 7 puede cambiar de modelo sin tocar código (nueva fila activa +
// re-embed, runbook en matching-engine.md §7).
// ============================================================================

/** Placeholder pre-benchmark: CLIP ViT-L/14 (768 dims) servido en Replicate. */
const DEFAULT_REPLICATE_MODEL = 'andreasjansson/clip-features';
const EXPECTED_DIMENSIONS = 768;
/** Timeout propio < 20 s del pipeline (los cold starts se van a 'pending'). */
const REQUEST_TIMEOUT_MS = 18_000;

interface ReplicatePrediction {
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output: unknown;
  error: string | null;
}

export class ReplicateEmbeddingProvider implements EmbeddingProvider {
  readonly modelVersion: string;
  readonly dimensions = EXPECTED_DIMENSIONS;
  private replicateModel: string;

  /** @param modelVersion versión activa de matching_params (se persiste con cada vector) */
  constructor(modelVersion: string) {
    this.modelVersion = modelVersion;
    this.replicateModel = optionalEnv('REPLICATE_EMBEDDING_MODEL') ?? DEFAULT_REPLICATE_MODEL;
  }

  async embed(imageUrl: string): Promise<Float32Array> {
    // 'Prefer: wait' bloquea hasta ~60 s en el servidor de Replicate; nuestro
    // AbortSignal corta antes — el llamador maneja el fallo (ruta pending).
    const response = await fetch(
      `https://api.replicate.com/v1/models/${this.replicateModel}/predictions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${requireEnv('REPLICATE_API_TOKEN')}`,
          'Content-Type': 'application/json',
          Prefer: 'wait',
        },
        body: JSON.stringify({ input: { inputs: imageUrl } }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new Error(`Replicate respondió ${response.status}: ${await response.text()}`);
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

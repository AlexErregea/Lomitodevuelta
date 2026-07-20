import type { AttributeExtraction } from '@lomito/shared';
import { ClaudeAttributeExtractor } from './providers/claude-attributes';
import { ReplicateEmbeddingProvider } from './providers/replicate-embedding';

// ============================================================================
// Pipeline de visión síncrono (ADR-0003): embedding + extracción EN PARALELO.
// Contrato con el llamador: esta función NUNCA lanza — devuelve lo que haya
// logrado y los errores por separado. El llamador decide: todo bien → status
// 'done'; algo falló → el reporte se guarda igual con 'pending' y pg_cron
// reintenta. Una inferencia fallida jamás pierde un reporte.
// ============================================================================

export interface VisionResult {
  /** Un vector por foto (mismo orden que photoUrls); null donde falló */
  embeddings: Array<Float32Array | null>;
  /** Extracción de la PRIMERA foto (la primaria); null si falló */
  extraction: AttributeExtraction | null;
  /** Mensajes de error acumulados (para embedding_last_error y métricas) */
  errors: string[];
  latencyMs: number;
}

export async function runVisionPipeline(
  photoUrls: string[],
  embeddingModelVersion: string,
): Promise<VisionResult> {
  const started = Date.now();
  const primaryUrl = photoUrls[0];
  if (!primaryUrl) throw new Error('runVisionPipeline requiere al menos una foto.');
  const embedder = new ReplicateEmbeddingProvider(embeddingModelVersion);
  const extractor = new ClaudeAttributeExtractor();

  const [extractionResult, embeddingResults] = await Promise.all([
    // La extracción analiza solo la primera foto (la primaria): atributos y
    // señas son del perro, no de la foto — una pasada basta y cuesta 5× menos.
    Promise.allSettled([extractor.extract(primaryUrl)]),
    Promise.allSettled(photoUrls.map((url) => embedder.embed(url))),
  ]);

  const errors: string[] = [];
  const embeddings = embeddingResults.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    errors.push(`embedding foto ${i + 1}: ${describeError(result.reason)}`);
    return null;
  });
  let extraction: AttributeExtraction | null = null;
  const first = extractionResult[0];
  if (first.status === 'fulfilled') {
    extraction = first.value;
  } else {
    errors.push(`extracción: ${describeError(first.reason)}`);
  }

  return { embeddings, extraction, errors, latencyMs: Date.now() - started };
}

function describeError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

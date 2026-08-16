import type { AttributeExtraction } from '@lomito/shared';
import { ClaudeAttributeExtractor } from './providers/claude-attributes';
import { ReplicateEmbeddingProvider, isThrottleError } from './providers/replicate-embedding';

// ============================================================================
// Pipeline de visión síncrono (ADR-0003). Contrato con el llamador: esta
// función NUNCA lanza — devuelve lo que haya logrado y los errores por
// separado. El llamador decide: todo bien → status 'done'; algo falló → el
// reporte se guarda igual con 'pending' y pg_cron reintenta. Una inferencia
// fallida jamás pierde un reporte.
//
// Las embeddings van EN SERIE, no en paralelo. El paralelo parecía gratis y no
// lo era: el 2026-08-16 un reporte de 5 fotos disparó 5 predicciones en el
// mismo instante y Replicate rechazó 4 con 429, mientras uno de 1 foto pasaba
// sin problema cinco minutos antes. Los límites de tasa se miden en ráfaga, así
// que abanicar peticiones es pedir el error uno mismo. La extracción SÍ corre
// en paralelo: es otro proveedor (Anthropic) y no comparte cupo.
// ============================================================================

export interface VisionResult {
  /** Un vector por foto (mismo orden que photoUrls); null donde falló */
  embeddings: Array<Float32Array | null>;
  /** Extracción de la PRIMERA foto (la primaria); null si falló */
  extraction: AttributeExtraction | null;
  /** Mensajes de error acumulados (para embedding_last_error y métricas) */
  errors: string[];
  /** true si el proveedor pidió esperar: transitorio, no un fallo del alta */
  throttled: boolean;
  latencyMs: number;
}

/**
 * Presupuesto de tiempo para las embeddings del alta. La ruta tiene 60 s de
 * `maxDuration`, pero quien subió la foto está esperando: pasado esto, las
 * fotos que falten se dejan a `retry-pending`, que no tiene prisa.
 */
const EMBEDDING_BUDGET_MS = 25_000;

export async function runVisionPipeline(
  photoUrls: string[],
  embeddingModelVersion: string,
): Promise<VisionResult> {
  const started = Date.now();
  const primaryUrl = photoUrls[0];
  if (!primaryUrl) throw new Error('runVisionPipeline requiere al menos una foto.');
  const embedder = new ReplicateEmbeddingProvider(embeddingModelVersion);
  const extractor = new ClaudeAttributeExtractor();

  const errors: string[] = [];
  let throttled = false;

  const embedSerially = async (): Promise<Array<Float32Array | null>> => {
    const results: Array<Float32Array | null> = [];
    for (const [index, url] of photoUrls.entries()) {
      // Ante un throttle no se insiste con las demás: van a recibir el mismo
      // 429 y solo gastarían el tiempo de quien está esperando en pantalla.
      if (throttled) {
        results.push(null);
        continue;
      }
      if (Date.now() - started > EMBEDDING_BUDGET_MS) {
        results.push(null);
        errors.push(`embedding foto ${index + 1}: sin tiempo en el alta; queda para el reintento`);
        continue;
      }
      try {
        results.push(await embedder.embed(url));
      } catch (err) {
        results.push(null);
        if (isThrottleError(err)) throttled = true;
        errors.push(`embedding foto ${index + 1}: ${describeError(err)}`);
      }
    }
    return results;
  };

  const [extractionResult, embeddings] = await Promise.all([
    // La extracción analiza solo la primera foto (la primaria): atributos y
    // señas son del perro, no de la foto — una pasada basta y cuesta 5× menos.
    Promise.allSettled([extractor.extract(primaryUrl)]),
    embedSerially(),
  ]);

  let extraction: AttributeExtraction | null = null;
  const first = extractionResult[0];
  if (first.status === 'fulfilled') {
    extraction = first.value;
  } else {
    errors.push(`extracción: ${describeError(first.reason)}`);
  }

  return { embeddings, extraction, errors, throttled, latencyMs: Date.now() - started };
}

function describeError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

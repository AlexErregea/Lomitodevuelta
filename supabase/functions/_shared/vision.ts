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
const DEFAULT_REPLICATE_MODEL = 'andreasjansson/clip-features';
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

export async function embedImage(imageUrl: string): Promise<number[]> {
  const replicateModel = optionalEnv('REPLICATE_EMBEDDING_MODEL') ?? DEFAULT_REPLICATE_MODEL;
  const response = await fetch(
    `https://api.replicate.com/v1/models/${replicateModel}/predictions`,
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

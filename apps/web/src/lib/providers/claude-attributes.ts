import Anthropic from '@anthropic-ai/sdk';
import {
  attributeExtractionSchema,
  EXTRACTION_JSON_SCHEMA,
  EXTRACTION_SYSTEM_PROMPT,
  EXTRACTION_USER_PROMPT,
  type AttributeExtraction,
  type AttributeExtractor,
} from '@lomito/shared';
import { optionalEnv, requireEnv } from '../env';

// ============================================================================
// AttributeExtractor con Claude (ADR-0003). Modelo: Claude Haiku — decisión
// de costo registrada en el ADR (~0.5 ¢/foto). Prompt y esquema viven en
// @lomito/shared para que la Edge Function de reintentos use exactamente el
// mismo contrato. Structured outputs + validación Zod: un JSON malformado
// del modelo jamás entra al dominio.
// ============================================================================

const DEFAULT_MODEL = 'claude-haiku-4-5';
/** Timeout propio < 20 s del pipeline: deja margen para la ruta 'pending'. */
const REQUEST_TIMEOUT_MS = 18_000;

export class ClaudeAttributeExtractor implements AttributeExtractor {
  private client: Anthropic;
  private model: string;

  constructor() {
    this.client = new Anthropic({
      apiKey: requireEnv('ANTHROPIC_API_KEY'),
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: 1,
    });
    this.model = optionalEnv('ANTHROPIC_EXTRACTION_MODEL') ?? DEFAULT_MODEL;
  }

  async extract(imageUrl: string): Promise<AttributeExtraction> {
    const response = await this.client.messages.create({
      model: this.model,
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

    if (response.stop_reason === 'refusal') {
      throw new Error('El modelo rechazó analizar la imagen.');
    }
    const text = response.content.find((block) => block.type === 'text')?.text;
    if (!text) throw new Error('La extracción no devolvió texto.');
    // La validación Zod aplica también los límites que structured outputs no
    // soporta (0 ≤ qualityScore ≤ 1) y protege contra cualquier deriva.
    return attributeExtractionSchema.parse(JSON.parse(text));
  }
}

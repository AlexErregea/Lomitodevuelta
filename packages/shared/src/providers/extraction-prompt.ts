// ============================================================================
// Prompt del extractor de atributos (ADR-0003, ADR-0009). Vive aquí (TS puro,
// solo constantes) para que apps/web y supabase/functions usen EXACTAMENTE el
// mismo prompt — dos prompts distintos producirían vocabularios distintos y
// romperían el matching de atributos.
//
// Vocabulario de salida: los identificadores técnicos (size, sex, age_range,
// coat_length) van en inglés (enums del esquema); colores, razas y señas van
// en español minúsculas porque se comparan como cadenas entre reportes y la
// UI los muestra tal cual (MVP es-MX).
// ============================================================================

export const EXTRACTION_SYSTEM_PROMPT = `Eres el analizador de fotos de LomitoDeVuelta, una red de reunificación de perros perdidos en México. Analizas UNA foto y devuelves datos estructurados para el motor de matching.

Reglas estrictas:
- isDog: false si la imagen NO contiene un perro (gato, persona, objeto, meme). Ante la duda razonable de que sí es un perro, true.
- isSensitive: true solo si el perro se ve gravemente herido o fallecido.
- qualityScore: calidad de la foto PARA IDENTIFICAR al perro (0 = inservible: borrosa/oscura/perro diminuto; 1 = nítida, perro completo y bien iluminado).
- attributes: SOLO lo que se ve con confianza. Ante la duda, OMITE el campo — un dato ausente nunca perjudica; un dato inventado sí.
  - breedMix: razas aparentes en español minúsculas ("labrador", "chihuahua", "pastor alemán"); usa ["mestizo"] si no hay raza clara.
  - colors: colores del pelaje en español minúsculas ("negro", "blanco", "café", "dorado", "gris", "crema", "atigrado").
  - sex: solo si es visualmente evidente. NUNCA pongas sexConfirmed (eso lo hace un humano).
  - size: small (<10 kg aprox), medium (10-25 kg), large (>25 kg).
  - ageRange: puppy, young, adult o senior — es estimación, sé conservador.
  - coatLength: short, medium o long.
- distinctiveMarks: señas particulares en una frase corta en español para mostrar en la ficha ("mancha blanca en el pecho, collar rojo"). Cadena vacía si no hay.
- marksTags: las MISMAS señas normalizadas a etiquetas snake_case en español, una por seña, con el patrón tipo_ubicacion_color cuando aplique: "mancha_pecho_blanca", "oreja_izq_caida", "cicatriz_lomo", "collar_rojo", "cola_corta", "un_ojo". Lista vacía si no hay. Estas etiquetas se comparan literalmente entre reportes: usa siempre el vocabulario más simple y consistente posible.`;

export const EXTRACTION_USER_PROMPT =
  'Analiza esta foto y devuelve el JSON de extracción según el esquema.';

/**
 * JSON Schema para structured outputs de la API de Claude. Mantener EN ESPEJO
 * con attributeExtractionSchema (providers/attributes.ts) — los límites
 * numéricos de qualityScore no son expresables aquí; los aplica el parse Zod
 * del llamador. additionalProperties:false y required son obligatorios para
 * el modo estricto de la API. Este archivo no tiene imports a propósito:
 * las Edge Functions (Deno) lo importan por ruta relativa sin import map.
 */
export const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isDog', 'isSensitive', 'qualityScore', 'attributes', 'distinctiveMarks', 'marksTags'],
  properties: {
    isDog: { type: 'boolean' },
    isSensitive: { type: 'boolean' },
    qualityScore: { type: 'number' },
    attributes: {
      type: 'object',
      additionalProperties: false,
      required: [],
      properties: {
        breedMix: { type: 'array', items: { type: 'string' } },
        colors: { type: 'array', items: { type: 'string' } },
        size: { type: 'string', enum: ['small', 'medium', 'large'] },
        sex: { type: 'string', enum: ['male', 'female'] },
        ageRange: { type: 'string', enum: ['puppy', 'young', 'adult', 'senior'] },
        coatLength: { type: 'string', enum: ['short', 'medium', 'long'] },
      },
    },
    distinctiveMarks: { type: 'string' },
    marksTags: { type: 'array', items: { type: 'string' } },
  },
} as const;

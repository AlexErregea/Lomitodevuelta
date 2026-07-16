// @lomito/matching — el dominio del motor de matching (capa 2 del score).
// Especificación completa: docs/matching-engine.md. Decisión: ADR-0004.
//
// REGLAS DE ESTE PAQUETE:
//   1. TypeScript puro: sin I/O, sin APIs de Node/Deno, sin dependencias de
//      infraestructura. Corre idéntico en Vercel y en Edge Functions.
//   2. Funciones deterministas: misma entrada → misma salida. Es lo que las
//      hace testeables con casos dorados (matching-engine.md §10).
//   3. Los pesos NUNCA se cablean aquí: llegan por parámetro (MatchingParams,
//      espejo de la fila activa de la tabla matching_params).

export * from './types';
export * from './score';
export * from './explain';

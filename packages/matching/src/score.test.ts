import { describe, it } from 'vitest';

// ============================================================================
// Casos dorados del score (docs/matching-engine.md §10).
// Están como `it.todo` a propósito: fijan el contrato de pruebas ANTES de la
// implementación (Bloque 7). Al implementar scoreCandidate/rankCandidates,
// cada todo se convierte en un test real con fixtures — ninguno se borra.
// ============================================================================

describe('scoreCandidate — casos dorados', () => {
  it.todo('1. mismo perro obvio (sim 0.90, 1.8 km, 2 días, 1 seña) → total ≥ 0.85');
  it.todo('3. sexos confirmados contradictorios → total ≤ 0.30 + flag sex_conflict');
  it.todo('4. sin embedding → pesos renormalizados suman 1 + flag no_embedding');
  it.todo('5. cachorro hace 6 meses vs adulto hoy → size/ageRange neutrales (0.5)');
  it.todo('6. hallado 5 días antes del extravío → flag timeline_implausible y S_geo × 0.3');
  it.todo('7. Flujo B sin atributos (solo foto) → nunca peor que neutral');
  it.todo('foto de mala calidad (< 0.4) → peso visual a la mitad + flag low_photo_quality');
});

describe('rankCandidates — comportamiento de lote', () => {
  it.todo('2. labrador negro genérico entre 5 similares → flag visual_ambiguity en todos');
  it.todo('ordena por total descendente y es estable ante empates');
});

describe('renderExplanation', () => {
  it.todo('ordena evidencia: señas → geo → visual (matching-engine.md §5)');
  it.todo('formatea porcentaje sin decimales con banda verbal honesta');
});

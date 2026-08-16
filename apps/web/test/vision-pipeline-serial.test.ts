import { beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// El 2026-08-16 un reporte de 5 fotos perdió 4 embeddings con 429, mientras uno
// de 1 foto había pasado sin problema cinco minutos antes: el pipeline
// disparaba todas las predicciones a la vez contra un proveedor cuyo límite se
// mide en ráfaga. Estas pruebas fijan el comportamiento que lo evita.
// ============================================================================

const state = vi.hoisted(() => ({
  inFlight: 0,
  maxInFlight: 0,
  embedded: [] as string[],
  /** Índice (0-based) de la foto en la que el proveedor responde 429. */
  throttleAt: null as number | null,
}));

vi.mock('@/lib/providers/claude-attributes', () => ({
  ClaudeAttributeExtractor: class {
    async extract() {
      return {
        isDog: true,
        isSensitive: false,
        qualityScore: 0.8,
        attributes: {},
        distinctiveMarks: '',
        marksTags: [],
      };
    }
  },
}));

vi.mock('@/lib/providers/replicate-embedding', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/providers/replicate-embedding')>();
  return {
    ...actual,
    ReplicateEmbeddingProvider: class {
      readonly dimensions = 768;
      constructor(readonly modelVersion: string) {}
      async embed(url: string): Promise<Float32Array> {
        state.inFlight++;
        state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
        try {
          await new Promise((resolve) => setTimeout(resolve, 5));
          if (state.throttleAt !== null && state.embedded.length === state.throttleAt) {
            throw new actual.ReplicateThrottleError(10, 'throttled');
          }
          state.embedded.push(url);
          return new Float32Array(768);
        } finally {
          state.inFlight--;
        }
      }
    },
  };
});

const { runVisionPipeline } = await import('@/lib/vision-pipeline');

const urls = (n: number): string[] => Array.from({ length: n }, (_, i) => `https://foto/${i}`);

beforeEach(() => {
  state.inFlight = 0;
  state.maxInFlight = 0;
  state.embedded = [];
  state.throttleAt = null;
});

describe('runVisionPipeline · concurrencia', () => {
  it('nunca tiene dos embeddings en vuelo a la vez', async () => {
    await runVisionPipeline(urls(5), 'clip-vit-l14-768/v1');
    expect(state.maxInFlight).toBe(1);
  });

  it('con todo en orden devuelve un vector por foto y sin errores', async () => {
    const result = await runVisionPipeline(urls(3), 'clip-vit-l14-768/v1');
    expect(result.embeddings.filter(Boolean)).toHaveLength(3);
    expect(result.errors).toEqual([]);
    expect(result.throttled).toBe(false);
  });
});

describe('runVisionPipeline · throttle', () => {
  it('deja de insistir en cuanto el proveedor frena', async () => {
    state.throttleAt = 1; // la segunda foto choca
    const result = await runVisionPipeline(urls(5), 'clip-vit-l14-768/v1');

    // Solo la primera llegó; las tres restantes ni se intentaron, porque
    // recibirían el mismo 429 y solo alargarían la espera del usuario.
    expect(state.embedded).toHaveLength(1);
    expect(result.throttled).toBe(true);
  });

  it('marca el resultado como incompleto para que el alta quede en pending', async () => {
    state.throttleAt = 0;
    const result = await runVisionPipeline(urls(2), 'clip-vit-l14-768/v1');
    expect(result.embeddings.every((e) => e === null)).toBe(true);
    expect(result.throttled).toBe(true);
  });

  // El freno de Replicate no debe arrastrar a Anthropic: son cupos distintos y
  // la ficha sin atributos es mucho menos útil que la ficha sin una foto.
  it('la extracción se completa aunque las embeddings estén frenadas', async () => {
    state.throttleAt = 0;
    const result = await runVisionPipeline(urls(3), 'clip-vit-l14-768/v1');
    expect(result.extraction).not.toBeNull();
    expect(result.extraction?.isDog).toBe(true);
  });
});

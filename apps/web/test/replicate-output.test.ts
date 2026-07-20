import { describe, expect, it } from 'vitest';
import { parseEmbeddingOutput } from '@/lib/providers/replicate-embedding';

// La dimensión del vector protege el índice pgvector: un vector de otra
// dimensión jamás debe llegar a la base.
describe('parseEmbeddingOutput', () => {
  const vector = Array.from({ length: 768 }, (_, i) => i / 768);

  it('acepta un vector plano', () => {
    const parsed = parseEmbeddingOutput(vector, 768);
    expect(parsed).toBeInstanceOf(Float32Array);
    expect(parsed.length).toBe(768);
  });

  it('acepta la forma [{embedding: [...]}] de clip-features', () => {
    const parsed = parseEmbeddingOutput([{ embedding: vector, input: 'url' }], 768);
    expect(parsed.length).toBe(768);
  });

  it('rechaza dimensiones incorrectas', () => {
    expect(() => parseEmbeddingOutput(vector.slice(0, 512), 768)).toThrow(/Dimensión/);
  });

  it('rechaza salidas no numéricas', () => {
    expect(() => parseEmbeddingOutput('no soy un vector', 768)).toThrow();
  });
});

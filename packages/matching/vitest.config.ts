import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // El dominio de matching es la pieza más testeada del sistema
    // (docs/testing-strategy.md): cobertura alta exigida en CI a partir
    // de la implementación del Bloque 7.
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
    },
  },
});

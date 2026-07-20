import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Configuración de Vitest para la lib de servidor de apps/web.
// 'server-only' se sustituye por un stub: en tests no hay React Server
// Components y el paquete real lanza error al importarse fuera de ellos.
export default defineConfig({
  resolve: {
    alias: {
      'server-only': fileURLToPath(new URL('./test/server-only-stub.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});

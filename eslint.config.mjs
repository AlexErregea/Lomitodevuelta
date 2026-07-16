// Configuración de ESLint (flat config) para todo el monorepo.
// Regla clave: los paquetes de dominio (packages/*) son TypeScript PURO,
// sin I/O ni APIs de Node — así corren idénticos en Vercel (Node) y en
// Edge Functions (Deno). Ver ADR-0001.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      // Las Edge Functions son Deno: se validan con `deno check`, no con ESLint.
      'supabase/functions/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['packages/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fs', 'path', 'os', 'crypto', 'http', 'https', 'child_process'],
              message:
                'packages/* debe ser TypeScript puro sin I/O ni APIs de Node (ADR-0001). La infraestructura vive en apps/web o en supabase/functions.',
            },
          ],
        },
      ],
    },
  },
);

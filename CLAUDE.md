# LomitoDeVuelta — Guía para sesiones de Claude Code

Red de reunificación de perros perdidos/encontrados con matching por IA.
Fundador PM sin formación en programación: explica en términos simples, decide
tú lo técnico dentro de las decisiones ya registradas.

## Antes de tocar código

1. **Lee `docs/architecture.md`** (visión + mapa de decisiones) y el ADR
   relevante en `docs/adr/` antes de cualquier decisión de diseño. Si vas a
   contradecir un ADR, propón primero un ADR nuevo que lo reemplace.
2. Especificaciones por área: motor de matching → `docs/matching-engine.md`;
   base de datos → `docs/data-model.md`; API → `docs/api-contracts.md`;
   seguridad/privacidad → `docs/security-privacy.md`.

## Reglas duras (no negociables sin ADR)

- **Idioma**: documentación y comentarios de negocio en español; código,
  identificadores, tablas y commits en inglés.
- **`packages/*` es TypeScript puro**: sin I/O, sin APIs de Node/Deno (lo
  vigila ESLint). La infraestructura vive en `apps/web` y `supabase/functions`.
- **Migraciones**: NUNCA editar una migración existente; siempre crear una
  nueva (`supabase/migrations/`, timestamp + nombre descriptivo, SQL comentado
  en español).
- **RLS deny-by-default**: el cliente jamás toca Postgres directo; toda
  escritura pasa por servidor con validación Zod (`packages/shared/src/api`).
- **Pesos y umbrales del matching viven en la tabla `matching_params`**,
  jamás cableados en código (ADR-0004).
- **Datos personales**: contacto solo vía `service_role` y siempre enmascarado
  en UI; ubicación pública siempre difuminada (`security-privacy.md`).
- **Los embeddings llevan versión de modelo** y nunca se comparan entre
  versiones distintas (ADR-0003).
- Textos de UI: no cablear español en JSX profundo; el MVP es es-MX pero la
  estructura es i18n-ready.

## Comandos

- `pnpm dev` · `pnpm typecheck` · `pnpm test` · `pnpm lint`
- Base local: `pnpm db:start`, `pnpm db:reset` (aplica migraciones desde cero)
- Antes de dar por terminado un cambio: `pnpm typecheck && pnpm test`

## Estado del proyecto

Sesión de arquitectura completada por bloques (1-5 entregados). Los stubs con
`TODO(Bloque 7)` en `packages/matching/src/` y `supabase/functions/` son
implementación pendiente — sus especificaciones ya existen en `docs/`.
Roadmap de sprints: `docs/roadmap-tecnico.md` (Bloque 6).

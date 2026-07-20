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

Dominio de matching (`packages/matching`) implementado y testeado (14 casos
dorados). **Sprint 1 implementado en código** (2026-07-19): pipeline de visión
completo (Replicate + Claude Haiku con salida estructurada validada por Zod),
rutas API (`/api/uploads/sign`, `POST /api/reports` Flujo B con ruta
pending, `GET /api/reports/:id`, `GET /api/reports/:id/candidates` con
manage-token), Edge Functions reales `retry-pending` (reintentos con backoff +
fallback email) y `whatsapp-webhook` (verificación + estados → verified_at),
migración 8 (bucket privado `dog-photos`, `notifications.attempts`, pg_cron),
UI mínima del Flujo B con compresión client-side, y tests de la lib de
servidor. Siguen como stubs: `on-report-created` y `lifecycle` (Sprint 3).

**Sprint 2 implementado en código** (2026-07-19): Flujo A completo (`/perdi`,
multi-foto, ficha autocompletada corregible — la corrección humana gana y
elegir sexo marca `sexConfirmed`), ficha pública `/r/:id` mobile-first con
difuminado opt-in para sensibles y botón compartir a WhatsApp, og:image
dinámica `/r/:id/opengraph-image` (ADR-0010: caché CDN + buster
`?v=updated_at`, silueta si sensible, cartel genérico si bloqueado/borrado),
gestión ARCO sin cuenta (`PATCH`/`renew`/`DELETE` + panel `/r/:id/gestionar`)
y aviso de privacidad versionado (`/privacidad`, v1 en
`src/content/privacidad-v1.ts` — plantilla: revisión de abogado antes de la
fase B2B).

**El DoD del Sprint 1 exige verificación EN PRODUCCIÓN — pendiente de insumos
del fundador**: cuentas Supabase/Vercel + secretos reales (Replicate,
Anthropic, WhatsApp con plantilla `manage_link` aprobada en Meta), secretos de
Vault para el cron (ver migración `20260719130000`), Docker Desktop para
validar migraciones localmente, y el benchmark de embeddings
(`docs/benchmark-embeddings.md` — modelo y anclas visual_floor/ceil siguen
siendo placeholder).

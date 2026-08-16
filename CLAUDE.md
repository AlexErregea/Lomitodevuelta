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

> El plan vigente es **`docs/plan-sprints-lomitodevuelta.md`** (2026-08-15):
> aterriza `roadmap-tecnico.md` sobre el estado real desplegado. El sprint en
> curso es el **Sprint 3-cierre** (blindar y lanzar el MVP).

**Paquete anti-abuso S3-A + consentimiento tácito S3-C** (2026-08-15):
implementados en código, **pendientes de desplegar**. Lo que hay que saber:

- **Toda la DDL entra por `supabase/migrations/`, jamás por el dashboard.**
  Producción tenía una migración a mano que el repo no
  (`20260811183009`, recuperada el 15-ago). Si vuelve a pasar, `pnpm db:reset`
  deja de reproducir producción y la siguiente migración se escribe a ciegas.
- **Los topes viven en `system_config`**, nunca en el código (misma regla que
  los pesos del matching): `max_reports_per_day`, `max_messages_per_contact_per_day`,
  `monthly_message_budget`, `reports_per_ip_hour`, `reports_per_ip_day`,
  `reports_per_contact_day`, `upload_signs_per_ip_hour`. Cambiarlos es un
  UPDATE, no un despliegue. Las **ventanas** de tiempo sí son código
  (`WINDOWS` en `lib/rate-limit.ts`): son diseño, no operación.
- **Rate limit**: contadores en Postgres (`rate_limit_counters` +
  `consume_rate_limits()`), envueltos en `apps/web/src/lib/rate-limit.ts`. Las
  cubetas guardan hashes, nunca la IP en claro.
- **Hay TRES caminos de envío de mensajes** y los tres deben respetar el tope
  por destino: `lib/notify.ts` (web), `_shared/notify.ts` (Edge) y
  `lib/notifications.ts` (enlace de gestión, que no pasa por `sendNotification`).
  Al tocar notificaciones, revisar los tres.
- **Consentimiento tácito, sin casilla** (decisión del fundador 2026-08-12,
  ratificada el 15-ago): el contrato ya no lleva `consentAccepted`; la evidencia
  la registra el servidor (`consent_given_at` + `consent_version`) y el aviso se
  referencia con `components/consent-notice.tsx` arriba del botón.
- **Turnstile está condicionado a llaves**: sin `TURNSTILE_SECRET_KEY` /
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` no se carga el script ni se exige token.

**Landing / cambio de rutas** (2026-07-31): la raíz `/` es ahora la landing de
marketing (Server Component estático, `apps/web/src/app/page.tsx`, copy en
`content.landing`). El Flujo B ("encontré") se movió de `/` a **`/encontre`**.
Se introdujo **Tailwind CSS v4** (`globals.css` con `@theme` de marca + `@layer
base` para no romper los controles nativos de los flujos MVP tras Preflight) y
fuentes Space Grotesk/Work Sans vía `next/font`. Los CTAs de la landing enrutan
a `/perdi` y `/encontre`.

**Sistema visual aplicado a los flujos + accesibilidad** (2026-07-31): `/perdi`
y `/encontre` dejaron de ser los formularios "funcionales aunque feos" de los
Sprints 1-2 y ahora usan los tokens de marca. Componentes nuevos:
`components/brand.tsx` (Logo y logotipo, extraídos de la landing para que los
flujos usen la misma marca), `components/flow-shell.tsx` (marco de página +
primitivos `Field` / `controlClass` / `primaryButtonClass`) y
`components/photo-picker.tsx` (zona de foto tocable; el `<input>` sigue nativo
con su `name`, no cambió nada del envío). **La lógica de los Sprints 1-3 no se
tocó: el cambio es de presentación.**

Se corrigió el contraste de la paleta, que reprobaba WCAG AA: el ámbar original
(`#c0873f`) daba 3.1:1 con texto blanco. Ahora `--color-ambar` es `#a6661b`
(4.6:1). Reglas que se derivan de eso y hay que respetar:

- Sobre fondos **oscuros** (footer, `tinta`/`tinta-2`) el ámbar primario NO
  contrasta: usar `ambar-claro`.
- Para **texto** ámbar sobre crema: `ambar-texto`, no `ambar` (4.0 vs 5.4:1).
- `perdido`/`encontrado` son colores de **badge** (fondo con texto blanco); como
  texto usar `perdido-texto`/`encontrado-texto`.

`Landing/index.html` es el diseño HTML original del fundador, versionado como
referencia de la reconstrucción en JSX. No se despliega.

**Respaldo de ubicación sin GPS** (2026-07-31): quien niega el permiso de
ubicación ya no queda atorado — antes el envío exigía coordenadas y no había
forma de darlas, así que se perdía el reporte entero. `components/
location-field.tsx` (compartido por los dos flujos) distingue el motivo real
del fallo (permiso denegado vs GPS no disponible: "activa el GPS" no le sirve a
quien negó el permiso) y ofrece **siempre** elegir alcaldía a mano
(`lib/cdmx-alcaldias.ts`, centros aproximados) más una referencia opcional, que
viajan como `addressText` y se muestran en la ficha. El evento `report_created`
lleva `location_source` (`gps` | `manual`) para medir cuánto se usa el respaldo.

Pendiente en los flujos: el rediseño del estado de espera de la IA.

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

**Sprint 3 implementado en código** (2026-07-22): el motor proactivo y el
cierre del MVP. `on-report-created` real (capa 3: reusa `@lomito/matching` vía
import map de Deno, crea `matches` con par único e idempotencia, notifica a
ambas partes con tope anti-spam), disparada por un trigger de BD al quedar el
embedding listo. Rutas de match `accept`/`reject`/`confirm-reunion` con
prueba de propiedad ligera y puente de contacto tras doble aceptación (copys
anti-extorsión, evento `reunion_confirmed`). `lifecycle` real (renovación,
expiración, purga vía `purge_personal_data()`, kill-switch de presupuesto).
Bandeja de coincidencias en `/r/:id/gestionar`. Migración 9 (trigger,
`system_config`, purga, cron a lifecycle, vistas de métricas del panel).
Todas las Edge Functions están implementadas; NADA queda como stub.

**Pendiente de despliegue/insumos del fundador para el DoD del MVP**: además
de lo del Sprint 1-2, aprobar en Meta las plantillas `match_found`,
`contact_reveal` y `renewal_reminder`; sembrar los secretos de Vault de las
migraciones 8 y 9; y ejecutar el caso completo end-to-end en producción para
el lanzamiento en la zona piloto.

**El DoD del Sprint 1 exige verificación EN PRODUCCIÓN — pendiente de insumos
del fundador**: cuentas Supabase/Vercel + secretos reales (Replicate,
Anthropic, WhatsApp con plantilla `manage_link` aprobada en Meta), secretos de
Vault para el cron (ver migración `20260719130000`), Docker Desktop para
validar migraciones localmente, y el benchmark de embeddings
(`docs/benchmark-embeddings.md` — modelo y anclas visual_floor/ceil siguen
siendo placeholder).

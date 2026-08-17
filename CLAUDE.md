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

**EL CICLO COMPLETO FUNCIONÓ EN PRODUCCIÓN** (2026-08-17): la promesa entera del
producto, de punta a punta, con dos celulares y números reales. El embudo tal
como quedó en `events` (match `31467cb9`, score 0.7682):

```
04:34  photo_uploaded (5)  → report_created (lost, "Liah")
04:37  photo_uploaded (1)  → extraction_done → report_created (found)
04:37  candidates_shown 0.7682 → match_suggested → match_notified (whatsapp)
04:40  extraction_done (reintento, attempts 2, throttled false)
04:41  match_accepted_side lost → found → contact_revealed (ambos entregados)
04:42  reunion_confirmed
```

**`reunion_confirmed` es la North Star y ya tiene su primer registro real.** El
motor proactivo encontró el par solo, avisó a las dos partes, cobró la prueba de
propiedad, abrió el puente de contacto y cerró el caso. El match guarda además
sus dos tokens por lado, así que el enlace de coincidencia también quedó
verificado con datos reales.

**Lo que NO cierra todavía el Sprint 3-cierre** (no confundir el ciclo técnico
con el sprint): falta **probar el kill-switch de presupuesto** agotándolo de
verdad, y falta **lanzar al público en la zona piloto**. Mientras eso no pase, el
sprint sigue abierto por más que la maquinaria funcione.

Un dato de esa corrida que corrige una creencia: los embeddings del reporte de 5
fotos fallaron por **timeout de 18 s**, no por 429 — y fue con el pipeline en
paralelo, que se promovió a serie después (21:11). En serie la foto **principal**
ya no compite por el presupuesto de tiempo con las otras cuatro: se lleva el
primer intento, que es lo que usan la extracción y la búsqueda inmediata.

**MVP VERIFICADO EN PRODUCCIÓN** (2026-08-16): un reporte real recorrió la
cadena completa — foto subida al bucket privado → embedding en Replicate →
atributos con Claude → reporte creado → plantilla `manage_link` enviada →
**entregada** por WhatsApp → webhook de Meta validado con el App Secret →
`notifications.status = 'delivered'` → `contacts.verified_at` con fecha. El DoD
del Sprint 1 dejó de ser una promesa. La entrega ES la verificación del número
(ADR-0006), demostrado con datos reales.

Coordenadas de producción: Supabase `wgpksrgqtmbnpwrfemgg` (us-east-1, plan
Free), Vercel con **Root Directory `apps/web`** y framework `nextjs`, dominio
**`lomitodevuelta.com`** con DNS en Cloudflare. El `.mx` nunca se compró: no debe
aparecer en ningún texto. Las 4 Edge Functions desplegadas; 14 migraciones
aplicadas con el historial reconciliado a las versiones del repo.

**Trampas que costaron horas de depuración. No repetirlas:**

- **Replicate se invoca por VERSIÓN, no por nombre de modelo.** El endpoint
  `/v1/models/{owner}/{name}/predictions` solo existe para modelos *oficiales*;
  los de la comunidad (`andreasjansson/clip-features`) van por `/v1/predictions`
  con el hash de versión. Fijar el hash además cumple el ADR-0003: si el autor
  publica otra versión, los vectores cambiarían de forma bajo la misma etiqueta.
- **Con saldo menor a $5 USD, Replicate limita a 6 predicciones/minuto con
  ráfaga de 1**, y lo dice en el cuerpo del 429 junto con el `retry_after`
  exacto. El pipeline se ahogaba solo disparando las embeddings en paralelo;
  desde el 2026-08-16 van **en serie** y los reintentos respetan esa espera.
  Reglas que se derivan y hay que mantener:
  - **Nunca abanicar peticiones a Replicate.** Un límite en ráfaga convierte el
    paralelismo en fallos garantizados: un reporte de 5 fotos perdió 4, mientras
    uno de 1 foto pasó bien cinco minutos antes.
  - **Un throttle NO es una inferencia fallida y no gasta un intento**
    (`retry-pending`). Si los gastara, cinco 429 dejarían el reporte en `failed`
    con los intentos agotados y fuera del matching para siempre — lo contrario
    de la regla de oro del ADR-0003.
  - El texto "less than $5.0 in credit" lo calcula Replicate sobre **la cuenta
    dueña del token**. Si no cuadra con el saldo que crees tener, revisa a qué
    cuenta pertenece el token (personal vs. organización, facturación separada)
    y si los fondos son *crédito prepagado* o solo un método de pago; y recuerda
    que Vercel y los secretos de Supabase guardan el token por separado.
- **`packages/*` lleva extensión `.ts` explícita en sus imports relativos.** Deno
  la exige y las Edge Functions consumen esos archivos como fuente (ADR-0001).
  De ahí `allowImportingTsExtensions` en `tsconfig.base.json`, que a su vez exige
  `noEmit` — se cumple porque nada de este monorepo emite JS.
- **`on-report-created` tiene su propio `deno.json`.** El empaquetador del CLI
  resuelve el import map relativo a la función, no a `supabase/functions/`.
  Mantener ambos mapas sincronizados. Y si una función falla, el lote entero
  aborta: desplegar por nombre cuando una esté rota.
- **La versión de Graph API caduca cada ~2 años.** Hoy `v24.0` (octubre 2025),
  con margen hasta finales de 2027. Está en `_shared/whatsapp.ts` y su espejo en
  la web. Calendario: developers.facebook.com/docs/graph-api/changelog
- **Vercel no promueve solo.** Los push a `master` crean *previews*; producción
  solo avanza al promover a mano. Si algo "no se aplicó", revisar primero
  Settings → Git → Production Branch antes de depurar código.
- **Promover SOLO deployments cuyo `githubCommitRef` sea `master`.** Un preview
  de rama es una foto completa del sitio en ese commit, no un parche: promoverlo
  **revierte en silencio todo lo que esa rama no tenga**. Ya pasó dos veces con
  el mismo arreglo — el pipeline en serie de Replicate vivía solo en `master` y
  dos promotes de rama lo quitaron de producción sin que nada fallara. Antes de
  promover: que el commit coincida con la punta de `master`.
- **`pnpm build` local exige `SUPABASE_SERVICE_ROLE_KEY`** desde que la landing
  lee reportes reales: `/` se prerenderiza y consulta la base. Sin la llave, el
  build compila y falla en el prerender de `/`. No es un bug — el error dice qué
  falta. `typecheck`, `test` y `lint` no la necesitan.
- **Puede haber DOS cuentas de WhatsApp Business** (la del número de prueba y la
  del real). El usuario del sistema necesita asignada la del número real, y los
  permisos granulares **se congelan al emitir el token**: asignar un activo
  después obliga a regenerarlo.
- **`capture` en el input de foto está prohibido.** Fuerza la cámara y esconde la
  galería, lo que pierde reportes de quien ya tenía la foto. El selector nativo
  ya ofrece "Tomar foto" como primera opción.
- **`disabled={busy}` NO evita el doble envío.** `setStage` corre dentro de una
  acción de formulario, o sea como transición, y React puede diferir ese render:
  el botón sigue vivo y un segundo toque (478 ms en producción) entra completo.
  Se duplicaban reporte, subida, inferencias y mensaje de WhatsApp — y dos fichas
  del mismo perro en el inventario. El candado es un `ref` síncrono
  (`submittingRef`) en ambos formularios. Era además la causa de los 429 de
  Replicate: dos predicciones simultáneas contra una ráfaga de 1.
- **Sin `.gitattributes` con `eol=lf`, Windows marca 27 archivos como
  modificados** y `git status` deja de servir para distinguir cambios reales.
  Provocó una falsa alarma de migración editada. Ante un diff sospechoso:
  `git diff --ignore-cr-at-eol --numstat` antes de dar la voz.

**El aviso de coincidencia lleva a donde SÍ se puede decidir** (2026-08-16,
migración 13): antes mandaba a la ficha pública de la contraparte. Esa página es
anónima por diseño (los ciudadanos no tienen cuenta, ADR-0006) y es la misma que
ve un desconocido cuando el enlace se reenvía a un grupo: **no puede saber quién
la abre, así que no puede pedirle nada**. El cuerpo aprobado en Meta ya apuntaba
a `/gestionar`; era el código el que mandaba otra cosa. Reglas que salen de ahí:

- **`/r/:id/gestionar` tiene DOS niveles de permiso.** Con `?t=` (token de
  gestión) es el panel completo. Con `?m={matchId}&t=` es solo esa coincidencia
  y sus botones, **sin acceso ARCO**: un enlace que viaja por WhatsApp se
  reenvía con facilidad y no debe poder borrar un reporte.
- **Un token por LADO del match** (`lost_access_token_hash` /
  `found_access_token_hash`). Con uno compartido, el enlace de quien encontró al
  perro autenticaría como el dueño y podría aportar la prueba de propiedad en su
  nombre. El lado se deduce de cuál hash coincidió, no de lo que manda el
  cliente.
- **No se reusa ni se rota el token de gestión** para esto: solo se guarda su
  hash, así que mandarlo obligaría a emitir uno nuevo e invalidar el que la
  persona guardó — en cada notificación.
- El hash se guarda **solo si el mensaje salió** (mismo guardarraíl que
  `lifecycle`): un envío fallido no puede dejar un token vivo.
- La URL mantiene la forma `/gestionar` a propósito, para encajar con la
  plantilla ya aprobada y no volver a pasar por Meta.

**Nombre del perro** (2026-08-16, migración 14): `dogs.pet_name`, nullable para
siempre. **Solo Flujo A** — quien encuentra un perro no sabe cómo se llama, y el
flujo sagrado no gana ni un campo. **NO entra al score**: el lado "encontrado"
nunca lo tiene, así que compararlo sería imposible por construcción y
`packages/matching` no se toca. Es presentación, y donde rinde no es la ficha
sino el **texto que se comparte por WhatsApp** ("Ayúdanos a encontrar a Toby" en
vez de "PERDIDO 🐕") y la og:image — o sea el mecanismo de distribución del
producto. Va **primero** en `/perdi` a propósito: cambia el registro del
formulario, de levantar un acta a contarle a alguien sobre tu perro. Editable y
borrable desde el panel de gestión. Riesgo de extorsión evaluado y aceptado: la
ficha enmascara el contacto y el puente exige doble aceptación + prueba de
propiedad; todo grupo de mascotas perdidas del país publica el nombre.

**La landing lee datos reales** (2026-08-16): la sección "cerca de ti" mostraba
tres perros inventados —con alcaldía, tiempo y "2 posibles coincidencias"—
indistinguibles de reportes de verdad, en un producto que vive de que la gente
crea lo que ve. Ahora usa `loadRecentPublicReports()` sobre `dogs_public`,
**excluye los sensibles** (la ficha los difumina tras un toque; una landing no
tiene dónde enmarcarlos) y las tarjetas enlazan a la ficha. Estado vacío propio,
que es lo que se ve al lanzar y en cualquier semana tranquila: da la buena
noticia primero en vez de fingir actividad. La página pasó a ISR
(`export const revalidate = 300`) — es la URL más compartida y no debe pagar una
consulta por visita.

**Ilustración del dálmata** (`components/dalmata.tsx`): el módulo del hero tenía
dos cuadros grises y la tesis había que leerla. Ahora son dos vistas del **mismo**
perro; las manchas son los puntos de referencia que dejan verlo sin leer. Se
descartaron el perfil lateral (se leía como otro perro, lo contrario del mensaje)
y el frente girado (decía "misma foto inclinada", no "otra persona la tomó").
Reutiliza la silueta de cabeza de `components/brand.tsx`, por eso empata con el
logo.

**Pendiente, por orden de impacto:**

1. **El benchmark de embeddings sigue sin ejecutarse.** `visual_floor`/
   `visual_ceil` valen 0.70/0.92, que son números inventados: **el score no está
   calibrado y las coincidencias que muestre hoy no son confiables.** Es el
   corazón de la tesis "motor de reunificación, no directorio". Requiere 15-25
   perros con 3-5 fotos cada uno (`docs/benchmark-embeddings.md`).
2. **Verificación de negocio en Meta** (RFC + Constancia de Situación Fiscal).
   Sin ella, límites de mensajería. Trámite de días, no técnico.
3. **El buzón `privacidad@lomitodevuelta.com` no existe.** El aviso lo declara
   como canal para derechos ARCO; sin Email Routing en Cloudflare, ese derecho
   es ficticio.
4. El rediseño del estado de espera de la IA.

Cerrado el 2026-08-17: la etiqueta del modelo de embeddings ya está consistente
(`matching_params` y las fotos con embedding dicen todas `clip-vit-l14-768/v1`);
no hay inventario partido.

**Paquete anti-abuso S3-A + consentimiento tácito S3-C** (2026-08-15):
**desplegados y verificados en producción el 2026-08-16**. Los límites corren
con sus valores reales (3 altas/hora y 10/día por IP, 5/día por contacto, 15
firmas/hora, 3 mensajes/día por número destino) y `founder_whatsapp` ya tiene
destinatario para el aviso de presupuesto. Lo que hay que saber:

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

# Plan de sprints — LomitoDeVuelta (S3-cierre → S7+)

> Elaborado el 2026-08-15 a partir del estado **verificado en producción**
> (Supabase `wgpksrgqtmbnpwrfemgg`, Vercel `lomitodevuelta`, repo
> `AlexErregea/Lomitodevuelta@master`). Complementa `docs/roadmap-tecnico.md`:
> no lo sustituye, lo aterriza. Los sprints siguen siendo de alcance, no de
> calendario. Regla heredada: cada sprint termina con su DoD verificado en
> producción.

---

## Estado actual verificado (2026-08-15)

**Hecho y en producción:**

- S0–S2 completos: sitio en `lomitodevuelta.com`, Flujos A (`/perdi`) y B
  (`/encontre`), ficha pública `/r/[id]` con og:image y compartir, panel de
  gestión `/r/[id]/gestionar` con brand system, `/privacidad` publicado y
  enlazado desde footer y formularios.
- Infraestructura de S3 desplegada: Edge Functions `on-report-created`,
  `retry-pending`, `lifecycle`, `whatsapp-webhook` activas; rutas
  `api/matches/[id]/{accept,reject,confirm-reunion}` existen; 11 migraciones
  aplicadas; RLS institucional y funciones helper ya en la base.
- Del doc `cambios-dominio-y-privacidad.md`: ítems 1–3 **hechos** (cero `.mx`
  en el sitio, liga al aviso en footer, correo `@.com` en `/privacidad`).
  El ítem 5 (versión como constante) está **resuelto de facto**: el insert de
  `contacts` puebla `consent_version` desde `PRIVACY_VERSION` importada de
  `@/content/privacidad-v1`. Verificar solo que `/privacidad` renderice desde
  la misma constante y cerrar el ítem.
- Fixes recientes: Replicate invocado por version hash (ADR-0003), Graph API
  v24.0, foto de galería habilitada en Flujo B (sin `capture`).

**Roto o bloqueando (el porqué del S3-cierre):**

| Síntoma | Evidencia | Causa |
|---|---|---|
| 6/6 WhatsApp fallidos | `notifications` todas `failed` | Phone number ID `1221991167672648` no existe/sin permisos (4×) y plantilla inexistente en Meta (2×) |
| Embeddings lentos/reintentos | 12× `extraction_failed`, 429 de Replicate | Crédito Replicate < $5 → throttle a 6 req/min |
| 0 matches | `matches` vacía; los 6 reportes son `found` | Nunca ha habido un par perdido+encontrado real |
| Decisión de consentimiento abierta | Doc (12-ago): tácito sin checkbox; código desplegado: checkbox con `z.literal(true)` | Se difirió deliberadamente al fundador |
| Sin defensa anti-abuso | `api/reports` y `api/uploads/sign` sin rate limit ni CAPTCHA; presupuesto solo se evalúa 1×/día en `lifecycle` | Estaba calendarizado en S4; se adelanta (ver S3-A) |

---

## Sprint 3-cierre — Blindar y lanzar el MVP 🚀

**Objetivo:** cerrar el DoD original del S3 (caso completo real + lanzamiento
en zona piloto) **sin lanzar con la cartera abierta**. Cuatro bloques; A y B
pueden avanzar en paralelo (A es código, B es trámite del fundador).

### S3-A · Paquete anti-abuso (adelantado de S4) — código ✅ IMPLEMENTADO (2026-08-15)

> Los 6 puntos están en el repo, con `typecheck`, tests y lint en verde.
> **Falta desplegarlo**: migración 12 sin aplicar y funciones sin redesplegar
> (ver "Qué falta para cerrar S3-A" al final de esta sección).
>
> Hallazgo del camino: **producción tenía una migración que el repo no**
> (`20260811183009_harden_public_view_and_table_grants`, aplicada a mano el
> 11-ago). Se recuperó al repo tal cual, para que `pnpm db:reset` vuelva a
> reproducir producción. Regla que conviene fijar: nada de SQL a mano en el
> dashboard; toda DDL entra por `supabase/migrations/`.

1. **Rate limit por IP** en `POST /api/reports` y `POST /api/uploads/sign`.
   Sugerido: middleware con Upstash Redis (free tier) o tabla de contadores en
   Postgres si se prefiere cero dependencias. Límites iniciales: 3 reportes/h
   y 10/día por IP; 15 firmas de subida/h por IP. Respuesta 429 con copy
   amable en español.
2. **Circuit breaker global**: columna `max_reports_per_day` en
   `system_config` (default ~200). `POST /api/reports` la consulta y devuelve
   503 con mensaje de "estamos saturados" al superarla. Es el tope duro si
   todo lo demás falla.
3. **Tope por número destino**: máx. 2–3 mensajes/día por `value_hash` del
   contacto (query sobre `notifications` + `contacts` antes de enviar, en
   `sendNotification` de `apps/web/src/lib/notify.ts` y su espejo
   `supabase/functions/_shared/notify.ts`). **Mata el vector de bombardeo a
   víctimas — la mayor amenaza al número de WhatsApp.**
4. **Presupuesto síncrono**: `sendNotification` cuenta los enviados del mes
   contra `monthly_message_budget` **antes** de cada envío (hoy solo
   `lifecycle` lo revisa 1×/día). Al 100 %: marca `whatsapp_paused` y degrada
   a email en el momento, no al día siguiente.
5. **Cloudflare Turnstile** (invisible, gratis) en `/perdi` y `/encontre`;
   validación del token en `POST /api/reports`. Filtra scripts sin castigar
   al usuario real.
6. **Higiene de Storage**: verificar límite de tamaño y MIME del bucket
   (migración `storage_bucket_and_retry_cron`); agregar a `lifecycle` la purga
   de subidas huérfanas (objetos en `citizen/` sin fila en `dog_photos` y
   con > 24 h de edad).

**DoD S3-A:** un script de 100 requests seguidas recibe 429 desde la #4 · un
número destino no recibe más de 3 mensajes en un día aunque se creen 10
reportes con él · con el presupuesto simulado en 100 %, el siguiente envío
degrada a email en el acto · Turnstile activo sin reportes de fricción.

**Cómo quedó implementado** (para no reconstruirlo leyendo el diff):

| Punto | Dónde vive |
|---|---|
| 1. Rate limit por IP | `rate_limit_counters` + `consume_rate_limits()` (migración 12) y `apps/web/src/lib/rate-limit.ts`; se aplica en `POST /api/reports` (3/h, 10/día) y `POST /api/uploads/sign` (15/h). **Los umbrales son columnas de `system_config`**, ajustables con un UPDATE — indispensable para probar en campo sin bloquearse a uno mismo. Las cubetas guardan la IP **hasheada con pepper**, nunca en claro |
| 2. Circuit breaker global | `system_config.max_reports_per_day` (default 200) evaluado como una cubeta más; al superarlo, 503 `service_unavailable` con copy de "estamos saturados" |
| 3. Tope por número destino | `system_config.max_messages_per_contact_per_day` (default 3) + RPC `notifications_last_day_for_contact()`, aplicado en los **tres** caminos de envío: `lib/notify.ts`, `_shared/notify.ts` y `lib/notifications.ts` (el enlace de gestión, que no pasaba por `sendNotification`) |
| 4. Presupuesto síncrono | `isWhatsAppPaused()` cuenta el mes antes de CADA envío y persiste la pausa; `retry-pending` ya no puede colar por la puerta de atrás los mensajes encolados con el presupuesto agotado |
| 5. Turnstile | `components/turnstile-field.tsx` + `lib/turnstile.ts`, **condicionado a llaves**: sin ellas ni se carga el script ni se exige token |
| 6. Higiene de Storage | El bucket ya tenía límite de 10 MB y MIME restringido (migración 8, verificado); nuevo `list_orphan_uploads()` + borrado real desde `lifecycle`, más la limpieza de ventanas viejas de contadores |

Decisiones tomadas al implementar (no había que consultarlas, quedan asentadas):

- **Postgres, no Upstash**: `api-contracts.md` §6 ya lo tenía registrado. Cero
  dependencias y cero proveedores nuevos.
- **Los límites del plan ganaron sobre los del contrato** donde diferían
  (3/h nuevo, firmas 30 → 15/h); §6 quedó actualizado para que los dos
  documentos digan lo mismo.
- **Todo tope vive en `system_config`**, no en el código: subir el circuit
  breaker el día del lanzamiento es un UPDATE, no un despliegue.
- **Falla abierto** el rate limit y el Turnstile ante un error de
  infraestructura: una defensa que tira tráfico legítimo por un hipo de red
  hace más daño del que evita (y el alta necesita la base de todos modos).
- **Nuevo evento `report_throttled`** con `reason` (`rate_limit` | `global_cap`
  | `turnstile`): sin él, un bloqueo mal calibrado sería indistinguible de "no
  llegó nadie" en el embudo.

**Qué falta para cerrar S3-A** (despliegue, no código):

1. `supabase db push` → aplica la migración 12. Se validó contra producción
   dentro de una transacción con ROLLBACK (sintaxis, tipos y comportamiento
   correctos, sin dejar residuo), pero **no está aplicada**.
2. Redesplegar las Edge Functions `lifecycle` y `retry-pending` (cambiaron).
3. Redesplegar la web (Vercel) con el consentimiento tácito y el rate limit.
4. Verificar el DoD contra producción (los cuatro criterios de arriba).

### S3-B · Destrabe operativo — tareas del fundador (guía: `docs/guia-whatsapp-setup.md`)

1. **WhatsApp Cloud API** (bloqueo #1 hoy):
   - Registrar el número real (SIM dedicada) en la app de Meta; obtener el
     `WHATSAPP_PHONE_NUMBER_ID` correcto y actualizar el secret
     (`supabase secrets set` + env de Vercel). El ID actual apunta a un
     objeto inexistente — probablemente sandbox caducado.
   - Token permanente de System User (`whatsapp_business_messaging` +
     `whatsapp_business_management`).
   - Crear y someter a aprobación las 4 plantillas **utility**:
     `manage_link`, `match_found`, `contact_reveal`, `renewal_reminder`
     (es-MX; la aprobación tarda horas–días: someterlas YA).
   - Configurar webhook → `whatsapp-webhook` con el verify token; suscribir
     `messages` y `message_status` (la entrega del `manage_link` ES la
     verificación del número, ADR-0006).
   - Iniciar Business Verification en paralelo (no bloquea el piloto: ~250
     conversaciones/día alcanzan).
2. **Replicate**: fondear ≥ $10 para salir del throttle de 6 req/min.
3. **Buzón ARCO**: alias `privacidad@lomitodevuelta.com` en Cloudflare Email
   Routing con reenvío al personal. Sin esto el canal ARCO declarado no existe.
4. **Resend**: verificar dominio de envío `.com` (SPF/DKIM) para que el
   fallback a email no caiga en spam.
5. **Poblar `system_config`**: `founder_whatsapp` en E.164 (hoy el aviso de
   80 % de presupuesto no tiene a quién llegar). Verificado el 15-ago: sigue en
   NULL.
6. **Llaves de Turnstile** (nuevo, habilita S3-A.5): dash.cloudflare.com →
   Turnstile → Add site → dominio `lomitodevuelta.com`, modo *Managed*. La
   site key va a Vercel como `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y la secreta como
   `TURNSTILE_SECRET_KEY`. Sin ellas el código ya desplegado simplemente no
   activa el CAPTCHA: no bloquea nada, solo deja esa defensa apagada.
   ⚠️ Al encenderlas, hazlo en hora de bajo tráfico: quien tenga el JS anterior
   en caché aún no manda token y recibirá "recarga la página" hasta que el
   navegador tome el bundle nuevo.

### S3-C · Consentimiento y privacidad — decisión + código ✅ RESUELTO (2026-08-15)

> **El fundador ratificó el consentimiento tácito.** Ejecutado: fuera el
> checkbox de `/perdi` y `/encontre`, en su lugar `components/consent-notice.tsx`
> con el texto de §4 (incluida la frase de la máscara del número); fuera
> `consentAccepted` del schema compartido; tests actualizados (uno nuevo
> comprueba que un cliente viejo en caché que aún mande la casilla no rompe el
> alta). `api-contracts.md` y `security-privacy.md` §4 quedaron alineados.
> Verificado además que `/privacidad` muestra `privacyNotice.version`, que sale
> de la misma constante `PRIVACY_VERSION` que puebla `consent_version` en cada
> alta — ítem 5 del doc del 12-ago cerrado, sin cambios necesarios.

- **Decisión a confirmar**: el doc del 12-ago fija consentimiento **tácito sin
  checkbox**; el código desplegado conservó el checkbox
  (`consentAccepted: z.literal(true)` en `packages/shared/src/api/schemas.ts`).
  - **Si se ratifica tácito**: quitar el checkbox de `lost-form.tsx` y
    `found-form.tsx`, sustituir por el párrafo "Al publicar tu reporte
    aceptas…" (texto ya redactado en `cambios-dominio-y-privacidad.md` §4,
    incluye la frase de la máscara del número), relajar el schema (el server
    sigue registrando `consent_given_at` + `consent_version` — eso no cambia),
    y ajustar `create-report-address.test.ts`.
  - **Si se mantiene checkbox**: cerrar el tema actualizando el doc del
    proyecto; cero código.
- Verificar que `/privacidad` renderiza su versión desde `PRIVACY_VERSION`
  (misma constante que puebla `consent_version`).

### S3-D · Caso completo real y lanzamiento

1. ~~**E2E en producción con dos celulares reales**~~ ✅ **HECHO (2026-08-17)**:
   corrió completo con números reales — match `31467cb9` (score 0.7682),
   `match_notified` → doble `match_accepted_side` con prueba de propiedad →
   `contact_revealed` entregado a ambos → **`reunion_confirmed` a las 04:42**.
   El embudo quedó en `events` (detalle en `CLAUDE.md`). Pendiente de esta
   viñeta: verificar explícitamente la **idempotencia** (que repetir el flujo
   no re-notifique al mismo par) — el par único está en el código y en la
   migración 9, pero no se ha ejercitado a propósito en producción.
2. **Probar el kill-switch**: fijar `monthly_message_budget` bajo, agotar,
   confirmar pausa + fallback a email + aviso al fundador; restaurar.
3. **Fricción anti-fraude mínima en la revelación** (recomendado tras la
   revisión de riesgos): el lado "encontré" debe adjuntar al aceptar una foto
   actual del perro (timestamp reciente) antes de que se revele el contacto
   del dueño. Cierra el vector "match falso con foto descargada → extorsión".
   Si se decide diferir a S4, dejar el copy anti-extorsión especialmente
   visible en `contact_reveal`.
4. **Vistas de métricas** (observability.md §4) creadas y consultables.
5. **Lanzamiento en la colonia/alcaldía piloto** (volanteo/grupos locales).

**DoD S3-cierre:** el caso E2E completo corrió en producción con números
reales · `reunion_confirmed` en `events` · kill-switch probado · paquete
anti-abuso en verde · decisión de consentimiento ejecutada · lanzado al
público en la zona piloto.

---

## Sprint 4 — Densidad y confianza

**Objetivo:** que crecer no rompa calidad, seguridad ni la base de datos de
matching. (Los rate limits ya quedaron en S3-A; esto es lo que resta.)

1. **Moderación operativa** (ADR-0009): flags automáticos activos —
   duplicado por embedding (umbral de similitud contra reportes recientes de
   la misma zona), heurísticas de estafa en textos (`finder_note`,
   `distinctive_marks`), reporte ciudadano de fichas ("reportar abuso" en
   `/r/[id]`). Rutina semanal de revisión del fundador sobre vista SQL en
   Supabase Studio (el panel propio sigue diferido — ver S5).
2. **Tests de aislamiento RLS en CI**: suite que verifica que anon no lee
   `contacts`/`manage_token_hash`/reportes borrados, y que un miembro
   institucional solo ve lo suyo. Corre en cada PR.
3. **E2E Playwright del Flujo B** (y smoke del A) contra preview de Vercel.
4. **PWA instalable**: manifest + service worker con offline básico (la ficha
   y los formularios cachean shell; los POST requieren red).
5. **Calibración con datos reales**: cuando haya ~200 matches etiquetados
   (aceptados/rechazados con razón), primera recalibración de pesos de
   `matching_params` (nueva fila versionada, A/B contra la activa) y ajuste
   de radio/umbrales según recall observado.
6. **Deuda de seguridad de linter** (baja prioridad, documentada): mover
   extensiones fuera de `public` cuando haya ventana (hoy `postgis`, `vector`,
   `pg_net` viven ahí; `spatial_ref_sys` sin RLS es catálogo de solo lectura),
   revisar `SECURITY DEFINER` de `dogs_public`.

**DoD S4:** suite RLS y e2e en verde en CI · un duplicado y un no-perro se
detectan solos en producción · PWA instalable desde Android gama media ·
informe de precisión del matching con datos reales · flags de estafa con < 20 %
falsos positivos en la rutina semanal.

---

## Sprint 5 — Institucional (Flujo C)

**Objetivo:** veterinarias y refugios operan la plataforma sin ayuda. La base
ya existe (`institutions`, `institution_members`, RLS institucional,
`user_institution_ids()`, `user_is_institution_admin()`); falta todo el
frontend y la operación.

1. **Auth institucional en producción**: Supabase Auth con magic link (sin
   contraseñas, ADR-0006). Alta manual verificada: el fundador valida que la
   institución existe → `institutions.verified_at` → crea el primer `admin`.
2. **Route group `(panel)`**: layout autenticado con:
   - **Bandeja de matches** de los reportes de la institución (aceptar/
     rechazar con la misma maquinaria de `api/matches`).
   - **Alta rápida** con foto (Flujo B optimizado a mostrador: 3 taps).
   - **QR de mostrador** imprimible que abre `/encontre` pre-etiquetado con
     `tenant_id` de la institución.
   - Gestión de miembros (rol `admin`): invitar/revocar por email.
3. **Diseño para el futuro superadmin**: el layout del panel y el modelo de
   roles se construyen de modo que un rol `founder`/plataforma quepa después
   sin rehacer auth (guard central de roles, no checks dispersos). El panel de
   moderación propio se construye **aquí solo si** la rutina semanal de S4 ya
   resulta incómoda en Studio; si no, se difiere otra vez.
4. **Onboarding piloto**: 3–5 veterinarias/refugios de la zona, con visita,
   material impreso (QR) y canal de soporte directo (WhatsApp del fundador).

**DoD S5:** una veterinaria real da de alta un perro encontrado desde su
mostrador y gestiona un match sin ayuda · el QR funciona impreso · un `member`
no puede administrar miembros (RLS verificada) · 3+ instituciones activas.

---

## Sprint 6 — Monetización

**Objetivo:** primeros ingresos sin traicionar el "gratis para ciudadanos,
siempre".

1. **Stripe** para plan Pro institucional: checkout + customer portal,
   webhook → columna de plan en `institutions`, degradación elegante al
   cancelar. Definir el gate del plan Pro (candidatos: múltiples miembros,
   estadísticas, prioridad en bandeja) — decisión de producto previa.
2. **Aviso de privacidad revisado por abogado** (requisito de fase 3,
   security-privacy.md §8): nueva versión → bump de `PRIVACY_VERSION`
   (los consentimientos nuevos registran v2; los v1 no se recontactan —
   aplicación prospectiva, como declara el propio aviso).
3. **Convenio institucional** firmado con al menos el piloto (plantilla
   simple; el abogado del punto 2 puede matar dos pájaros).
4. **Facturación MX**: decidir si se factura (CFDI) desde el inicio o se
   opera con recibos Stripe mientras el volumen es piloto — decisión
   fundador/contador, documentarla.

**DoD S6:** primer peso cobrado con Stripe en producción · downgrade/cancelación
probados · aviso v2 publicado con `consent_version` correcto en altas nuevas ·
convenio firmado.

---

## Sprint 7+ — Expansión

**Objetivo:** repetir lo que ya funciona, con disparadores explícitos (regla
del roadmap: nada se adelanta sin su disparador).

1. **Segunda zona**: INSERT en `zones` + operación de lanzamiento hiperlocal
   (mismo playbook del piloto). Requisito previo: tasa de reunión de la zona 1
   estable y rutina de moderación que no dependa de conocer la colonia.
2. **Gatos**: relajar el CHECK de `species` + prompt de extracción específico
   + benchmark corto de embeddings con fotos de gatos (el espacio visual es
   otro; validar `visual_floor/ceil` antes de abrir).
3. **Palancas de escala, cada una con su disparador escrito**:
   - Self-hosting de embeddings (ADR-0003) — disparador: costo Replicate
     mensual > costo de una GPU pequeña sostenida.
   - Iterative scans / particionado (ADR-0005) — disparador: p95 de búsqueda
     de candidatos degradado con el volumen.
   - Staging formal + CI de migraciones (ADR-0012) — disparador: segunda
     persona tocando la base, o primer incidente por migración.

---

## Riesgos abiertos (fuera de sprint, vigilar)

- **Calidad del número de WhatsApp**: aun con los topes de S3-A, monitorear el
  quality rating en Meta Business; si baja, revisar copys y frecuencia.
- **Dependencia de un solo proveedor de embeddings**: el 429 de Replicate ya
  causó degradación; el kill-switch cubre mensajes pero no visión. Mitigación
  barata: alerta (email al fundador) cuando `retry-pending` acumule > N fallos
  seguidos.
- **Crédito prepago como techo**: Anthropic/Replicate prepago = el modo de
  falla de un pico (orgánico o ataque) es outage de visión, no factura. El
  circuit breaker global (S3-A.2) convierte ese outage en degradación
  controlada.
- **Sunset Graph API**: v24.0 vive hasta ~fin de 2027; la fecha ya está
  comentada en el código. Recordatorio de calendario para mediados de 2027.

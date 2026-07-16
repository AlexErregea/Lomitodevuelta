# Seguridad, privacidad y cumplimiento — LomitoDeVuelta

> Postura completa de seguridad del sistema: RLS, datos personales (LFPDPPP),
> consentimiento, retención, anti-fraude e imágenes. Decisiones formales en
> ADRs 0006 (identidad), 0007 (multi-tenancy), 0009 (moderación).
> Última actualización: 2026-07-16.

## 1. Postura general

1. **Denegar por defecto.** RLS habilitado en todas las tablas; sin políticas para
   `anon`. Toda escritura pasa por código de servidor con validación Zod
   (ADR-0002). Lo único público es la vista `dogs_public` (columnas seguras, filas
   moderadas, ubicación difuminada).
2. **Minimización.** Solo se recaba lo que el matching necesita: fotos del perro,
   ubicación del evento, fecha y un canal de contacto. Sin nombres, sin direcciones
   personales, sin cuentas para ciudadanos.
3. **El contacto es EL dato personal del sistema** y tiene el perímetro más
   estricto: tabla propia, legible solo por `service_role`, expuesto siempre como
   máscara, revelado solo tras doble aceptación.
4. **La ubicación exacta es dato personal** (un extravío suele ocurrir cerca del
   domicilio): se difumina a ~110 m en todo lo público.

## 2. Matriz de acceso (RLS) por tabla

| Tabla | `anon` | `authenticated` (institucional) | `service_role` (backend) |
|---|---|---|---|
| `dogs` | — (solo vista `dogs_public`) | SELECT/INSERT/UPDATE de su tenant | todo |
| `dog_photos` | — (fotos vía URL firmada) | SELECT/INSERT de su tenant | todo |
| `contacts` | — | SELECT de su tenant (es su propio mostrador) | todo |
| `matches` | — | SELECT si involucra un reporte suyo | todo |
| `institutions` | — | SELECT la suya; UPDATE solo `admin` | todo |
| `institution_members` | — | SELECT sus membresías; gestión solo `admin` | todo |
| `zones` | — (el servidor las provee) | — | todo |
| `matching_params`, `events`, `notifications` | — | — | todo |

Los cambios de estado de `matches` (aceptar/rechazar/confirmar) son **solo por
servidor** incluso para institucionales: la máquina de estados y su registro en
`events` no se pueden saltar. Políticas en
`supabase/migrations/20260716090000_rls_institutional.sql`.

**Invariante crítica multi-tenant** (ADR-0007): los reportes ciudadanos
(`tenant_id IS NULL`) no son visibles para ninguna cuenta institucional por acceso
directo — solo a través del matching, como cualquier otro candidato.

## 3. El puente de contacto enmascarado (flujo completo)

1. Al crear un reporte, el contacto se guarda en `contacts` (`value` solo
   service_role) con `display_mask` ("•• •• 1234") y `value_hash` (dedupe/rate-limit).
2. Toda UI y notificación muestra únicamente la máscara.
3. Cuando hay match, cada parte recibe la notificación **sin** el contacto del otro.
4. Cada parte acepta desde su enlace de gestión (ADR-0006). El lado "perdí" pasa
   antes la prueba de propiedad ligera (§6).
5. Con **ambas aceptaciones** (`lost_accepted_at` y `found_accepted_at`), el sistema
   envía a cada parte el contacto del otro por WhatsApp, junto con la guía de
   entrega segura. La revelación queda registrada en `events` (quién, cuándo, qué
   match).
6. Un rechazo detiene el puente; el contacto jamás se expuso.

## 4. Consentimiento y aviso de privacidad (LFPDPPP)

- **Aviso de privacidad** corto en el punto de captura (antes del campo de WhatsApp)
  + versión integral en `/privacidad`. El texto es contenido versionado:
  `contacts.consent_version` registra qué versión aceptó cada persona y
  `consent_given_at` cuándo.
- Se recaba consentimiento **expreso** para: (a) usar el contacto para conectar con
  la contraparte de un match, (b) mostrar públicamente fotos y ubicación difuminada.
  Nada de marketing en MVP: un solo propósito, un solo checkbox.
- **Derechos ARCO** (acceso, rectificación, cancelación, oposición): el enlace de
  gestión del reporte permite editar y borrar sin cuenta; borrar dispara el flujo de
  §5. Contacto para solicitudes manuales: correo del responsable en el aviso.
- ⚠️ **MVP vs. legal**: el aviso de privacidad inicial puede partir de plantilla,
  pero **debe revisarlo un abogado antes de la fase institucional/B2B** (ahí hay
  tratamiento por cuenta de terceros y probablemente convenios con gobierno →
  requisitos adicionales de la LFPDPPP y posible aviso conjunto).

## 5. Retención y borrado

| Momento | Qué pasa | Mecanismo |
|---|---|---|
| Alta | `expires_at = now() + 60 días` | default en el INSERT (servidor) |
| Día ~50 | WhatsApp "¿sigues buscando? renueva aquí" | pg_cron + notificación |
| `expires_at` vencido | `status = expired`; sale del matching y de lo público | pg_cron diario |
| Reunión confirmada | `status = reunited`; ficha pública pasa a historia de éxito **solo con opt-in** | servidor |
| +30 días de expirado/reunido | **Anonimización**: se borran `contacts`, `manage_token_hash`, `finder_note` y `geo_point` se trunca a 2 decimales (~1.1 km). Fotos, atributos y `matches` se conservan **sin vínculo a persona** como dataset de calibración | pg_cron mensual (función `purge_personal_data()`, se implementa en Bloque 7) |
| Solicitud de borrado (ARCO) | Borrado lógico inmediato (`deleted_at`) → invisible en todo; purga física en el siguiente ciclo | enlace de gestión |

Principio: **los datos del perro son el activo; los de la persona son un pasivo**.
Se conserva lo primero anonimizado, se purga lo segundo por calendario.

## 6. Anti-fraude y anti-extorsión en el flujo de reclamo

Amenaza principal en México: extorsionadores que "encontraron" al perro y piden
depósito por adelantado, o reclamantes falsos que quieren quedarse un perro ajeno.

- **Prueba de propiedad ligera** (antes de abrir el puente): quien dice ser el dueño
  aporta una foto histórica del perro o describe una seña **no visible en la ficha
  pública**. La valida la contraparte ("¿coincide con el perro que tienes?"), no la
  plataforma — verificación entre pares, la plataforma solo estructura el paso.
- **La plataforma no toca dinero** (MVP): solo existe el badge "ofrece recompensa".
  Sin montos, sin promesas de pago en fichas ni notificaciones.
- **Copys de advertencia** en cada revelación de contacto: "Nunca deposites dinero
  por adelantado. Si te piden un pago para 'devolverte' a tu perro, es extorsión:
  repórtalo." (texto exacto en el paquete de contenido, Bloque 5).
- **Entrega en punto seguro**: la guía posterior a la doble aceptación sugiere
  veterinarias aliadas o lugares públicos; nunca domicilios.
- **Rate-limits por `value_hash` e IP**: máx. 5 reportes/día por contacto, límites
  de búsqueda por IP — un extorsionador no puede barrer el inventario (detalle en
  api-contracts.md).
- La **ubicación difuminada** (§1.4) es en sí una defensa: no se puede vigilar un
  domicilio desde la ficha.

## 7. Imágenes

- **Bucket privado** (`dog-photos`); el cliente sube con URL firmada de subida
  (TTL corto, ruta dictada por el servidor) y el público ve las fotos vía URL
  firmada de lectura (TTL 1 h) generada al render de la ficha. Nada de bucket
  público: si mañana hay que retirar una foto, muere con su URL.
- **Contenido sensible** (perro herido/fallecido): `is_sensitive` lo marca el LLM en
  el alta (ADR-0009) o el usuario; la UI lo muestra difuminado con "toca para ver"
  (opt-in del espectador). La política de contenido permite estos reportes — un
  perro herido es un caso urgente real — pero jamás en miniaturas ni og:image.
- **EXIF**: la compresión client-side elimina metadatos (incluido GPS) antes de
  subir; la ubicación es solo la que la persona declara en el mapa.

## 8. Qué es MVP y qué requiere asesoría legal

| MVP (esta arquitectura) | Antes de fase B2B/gubernamental (con abogado) |
|---|---|
| Aviso de privacidad de plantilla + consentimiento versionado | Aviso revisado; convenios de tratamiento con instituciones (encargado vs. responsable) |
| ARCO vía enlace de gestión + correo | Procedimiento ARCO formal con plazos LFPDPPP |
| Retención 60+30 días programada | Política de retención formal, incluida en el aviso |
| Verificación manual de instituciones | Contratos institucionales, SLA, posible CFDI (facturación) |
| Moderación asistida + revisión del fundador | Términos de servicio y política de contenido revisados |

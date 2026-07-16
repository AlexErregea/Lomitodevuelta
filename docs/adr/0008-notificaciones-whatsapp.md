# ADR-0008 — Notificaciones: WhatsApp Cloud API directo (Meta) + fallback email; ledger idempotente

- **Estado**: Aceptado
- **Fecha**: 2026-07-16

## Contexto

WhatsApp es EL canal del producto: entrega del enlace de gestión, notificación de
match a ambas partes, revelación de contacto, avisos de renovación. Los mensajes
salientes que inicia la plataforma requieren **plantillas aprobadas** por Meta y se
cobran por mensaje; los que responden a un usuario dentro de una ventana de 24 h son
gratis. El proveedor puede fallar o encarecer, así que el fallback es de diseño, no
de emergencia. Criterio del fundador: **priorizar costo**.

## Decisión

### Proveedor: Meta WhatsApp Cloud API, directo (sin intermediario)

Es la opción estructuralmente más barata: los BSP (Twilio, Gupshup…) cobran un margen
por mensaje sobre las mismas tarifas de Meta. Cifras de referencia para México
(⚠️ verificar tarifas vigentes al implementar — cambian):

- Plantillas **utility** (nuestro caso: "hay una coincidencia", "tu enlace de
  gestión"): ~1-2 ¢ USD por mensaje; **gratis** dentro de una ventana de servicio
  abierta.
- Conversaciones iniciadas por el usuario (responder "sí, sigue perdido"): gratis.
- Marketing: ~4-5 ¢ — **no usaremos plantillas de marketing en MVP**.

Costo de setup que asume el fundador: verificación de Meta Business + un número
telefónico dedicado (no puede ser su WhatsApp personal). Guía paso a paso en el
Bloque 7.

### Arquitectura de envío

1. **Ledger `notifications`** (migración 2): toda notificación nace como fila con
   `idempotency_key` única (p. ej. `match:{id}:notify:{contact_id}`) — un reintento
   o un webhook duplicado **jamás** genera un segundo WhatsApp.
2. **Envío desde Edge Functions** (`on-report-created`, `lifecycle`): insertar fila
   → llamar API → actualizar `status`/`provider_message_id`. Fallo → `failed`, y
   `retry-pending` (pg_cron, 5 min) reintenta con backoff.
3. **Webhook de estados** (`whatsapp-webhook`): sent/delivered/failed →
   `notifications.status`; la primera entrega al contacto marca
   `contacts.verified_at` (ADR-0006).
4. **Detrás de interfaz** `NotificationProvider` (packages/shared): cambiar a
   Twilio/BSP si Meta encarece o bloquea es una implementación nueva, no un
   rediseño — misma jugada que con embeddings (ADR-0003).

### Fallback y control de costos

- **Email con Resend** (capa gratis: 3,000/mes) cuando: el contacto dio email, y
  WhatsApp falló 3 veces o el número resultó no-entregable. El email es plan B
  honesto: peor canal, mejor que silencio.
- **Caps de producto** (matching-engine.md §4.3): máx. 3 notificaciones de match por
  reporte/día; el par (lost, found) se notifica una sola vez.
- **Contador mensual de mensajes** en `events` con dos umbrales: alerta al fundador
  (80 % del presupuesto) y **kill-switch a modo solo-email** (100 %) — la plataforma
  degrada, no quiebra. Umbrales en configuración, no en código.

## Consecuencias

- (+) El costo por mensaje es el mínimo posible y el volumen MVP (decenas/día) cuesta
  centavos; el escenario "0 pagado hasta validar" se sostiene.
- (+) Idempotencia y reintentos desde el día 1: los bugs de notificación duplicada
  (los más vergonzosos) quedan estructuralmente prevenidos.
- (−) La Cloud API directa es más árida que un BSP (plantillas se aprueban en el
  Business Manager de Meta, errores menos amigables). Mitigación: guía de setup en
  Bloque 7 + la interfaz permite migrar a Twilio pagando el margen si la operación
  duele.
- (−) Riesgo de plataforma: Meta puede rechazar plantillas o el número puede ser
  restringido si hay reportes de spam. Mitigación: solo plantillas utility con
  opt-out claro, caps de frecuencia, y el fallback email mantiene el servicio vivo.
- (−) Dependencia de un número de teléfono dedicado desde el arranque (trámite del
  fundador, no de la arquitectura).

## Alternativas descartadas

1. **Twilio** — Rechazado por costo: margen por mensaje sobre las tarifas de Meta y
   cuota mensual del número. Su DX superior no compensa cuando el criterio es costo;
   queda documentado como plan B operativo detrás de `NotificationProvider`.
2. **BSP local (Gupshup, Wati, etc.)** — Rechazado: precios opacos/por paquete,
   lock-in de plantillas, y sin ventaja técnica real sobre la API directa.
3. **SMS** — Rechazado: más caro por mensaje en México, sin imágenes ni enlaces
   ricos, y culturalmente muerto para este caso de uso — WhatsApp es donde ocurre la
   conversación real.
4. **Solo email** — Rechazado como canal primario: tasas de apertura incomparables y
   los ciudadanos del Flujo B muchas veces no darán email. Queda como fallback.

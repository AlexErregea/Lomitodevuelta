# Observabilidad — LomitoDeVuelta

> Qué se mide, dónde vive cada métrica y cómo se detectan problemas y costos
> desbocados desde el día 1. Decisión formal: ADR-0011.
> Última actualización: 2026-07-16.

## 1. North Star y arquitectura de medición

**North Star: reuniones confirmadas** (`confirmed_reunion`). Todo lo demás es
diagnóstico de por qué esa cifra sube o no.

Doble registro deliberado (ADR-0011):

- **Tabla `events` (Postgres)** — fuente de verdad de negocio: alimenta la
  calibración del score, la auditoría y las métricas oficiales. Se escribe en la
  misma transacción que la acción. Nunca depende de un tercero.
- **PostHog** — producto y comportamiento: embudos, retención, sesiones, y también
  **error tracking** (una sola herramienta gratuita para ambas cosas). Best-effort:
  si PostHog cae, el producto ni se entera.

Regla: si una métrica decide dinero o calibración → `events`. Si explica
comportamiento de usuarios → PostHog. Las críticas van a ambos.

## 2. El embudo (eventos canónicos)

Nombres exactos — el `event_type` de `events` y el evento de PostHog comparten
nombre para poder cruzarlos:

| # | Evento | Momento |
|---|---|---|
| 1 | `report_started` | Abre el formulario (A o B) |
| 2 | `photo_uploaded` | Foto en Storage |
| 3 | `extraction_done` / `extraction_failed` | Pipeline de visión (+latencia ms, +modelo) |
| 4 | `report_created` | Reporte persistido (payload: report_type, zone, tenant?) |
| 5 | `candidates_shown` | Resultados de búsqueda inmediata (+cuántos, +score máx) |
| 6 | `match_suggested` | Capa 3 creó un match formal (+total_score, +params_id) |
| 7 | `match_notified` | WhatsApp salió (+canal, +plantilla) |
| 8 | `match_accepted_side` / `match_rejected` | Veredicto humano (+side, +reason) |
| 9 | `contact_revealed` | Doble aceptación: puente abierto |
| 10 | `reunion_confirmed` | **North Star** 🎉 |
| — | `share_clicked` | Compartir ficha (crecimiento) |
| — | `report_renewed` / `report_expired` / `report_deleted` | Ciclo de vida |

Métricas derivadas clave: **tasa de reunión** (10÷4, por zona y por tipo),
**precisión del matching** (8-aceptados ÷ 7-notificados — mide el umbral `notify`),
tiempo mediano reporte→reunión, y K-factor aproximado (shares → reportes nuevos).

## 3. Métricas técnicas

| Métrica | Fuente | Umbral de atención |
|---|---|---|
| Latencia del pipeline síncrono (p50/p95) | payload de `extraction_done` | p95 > 8 s |
| Tasa de fallo de inferencia | `extraction_failed` ÷ intentos | > 5 % en 1 h |
| Cola de reintentos (`embedding_status='failed'`) | consulta SQL directa | > 10 sostenido |
| Entregabilidad WhatsApp | `notifications.status` | delivered ÷ sent < 90 % |
| Errores de la web/API | PostHog error tracking | cualquier error nuevo |
| Latencia RPC `match_candidates` | log estructurado en el servidor | p95 > 500 ms |

Logs: estructurados (JSON) en Vercel y Supabase (dashboards nativos, retención
corta pero gratis). Sin stack de logging propio en MVP.

## 4. Panel del fundador (MVP)

Sin Grafana ni BI: **una vista SQL por pregunta**, consultadas desde Supabase Studio
(se crean como migración en el Bloque 7):

- `metrics_funnel_weekly` — el embudo §2 por semana y zona.
- `metrics_matching_quality` — precisión del matching por versión de parámetros
  (la tabla que guía la calibración, ADR-0004).
- `metrics_costs_monthly` — unidades consumidas del mes: altas × inferencias,
  mensajes WhatsApp por plantilla (base del kill-switch, ADR-0008).
- `moderation_queue` — reportes `flagged` pendientes (ADR-0009).

## 5. Alertas (pocas y accionables)

MVP: revisión manual de las vistas (rutina semanal) + los umbrales de presupuesto
de ADR-0008 (80 % → aviso WhatsApp al fundador; 100 % → kill-switch a solo-email)
implementados en la Edge Function `lifecycle`. Alertas push automáticas por métrica
técnica: fase posterior (cuando exista tracción que vigilar a diario).

# ADR-0011 — Observabilidad: tabla events como fuente de verdad + PostHog para producto y errores

- **Estado**: Aceptado
- **Fecha**: 2026-07-16

## Contexto

Hay que instrumentar el embudo desde el día 1 (North Star: reuniones confirmadas),
detectar fallos técnicos (pipeline de visión, WhatsApp) y vigilar costos — con
presupuesto ~cero, un solo operador humano y sin apetito por un stack de
observabilidad que mantener. Además, parte de los datos de medición (transiciones de
matches) es también el dataset de calibración del score (ADR-0004): ese subconjunto
no puede vivir solo en un SaaS externo.

## Decisión

**Doble registro con papeles claros** (detalle operativo en `docs/observability.md`):

1. **Tabla `events` (Postgres) = fuente de verdad.** Todo evento de negocio se
   escribe en la misma transacción que la acción que lo produce. De aquí salen: la
   North Star, la calibración del score, la auditoría (revelaciones de contacto) y
   los contadores de costo. No depende de ningún tercero.
2. **PostHog = producto + errores.** Embudos, retención, sesiones y error tracking
   en una sola herramienta con capa gratuita holgada (1M eventos/mes) — evita
   contratar Sentry por separado. Best-effort: su caída no afecta al producto.
3. **Mismos nombres de evento en ambos lados** (taxonomía en observability.md §2)
   para poder cruzar sin mapeos.
4. **Dashboards = vistas SQL** consultadas en Supabase Studio (embudo, calidad del
   matching, costos, cola de moderación). Sin Grafana/Metabase en MVP.
5. **Logs estructurados** (JSON) a los dashboards nativos de Vercel y Supabase;
   retención corta gratuita es suficiente a esta escala.
6. **Alertas mínimas**: solo las de presupuesto (80 % aviso / 100 % kill-switch,
   ADR-0008), evaluadas por la Edge Function `lifecycle`. El resto es rutina
   semanal de revisión — con decenas de reportes/día, un humano viendo 4 vistas
   SQL detecta más que 20 alertas mal calibradas.

## Consecuencias

- (+) La North Star y el dataset de calibración quedan en casa, transaccionales y
  consultables con SQL desde el día 1.
- (+) Una sola herramienta externa (PostHog) y en capa gratis; cero infraestructura
  de observabilidad que operar.
- (−) Doble escritura de eventos = disciplina de código. Mitigación: un solo helper
  `trackEvent()` en el servidor escribe en ambos destinos; las sesiones de IA usan
  ese helper (regla en CLAUDE.md cuando se implemente, Sprint 1).
- (−) Sin alertas técnicas automáticas en MVP: un fallo silencioso puede vivir
  horas. Asumido y acotado: los fallos con daño real (inferencia, notificación)
  tienen reintentos automáticos (ADR-0003/0008); la alerta llegaría tarde de todos
  modos a esta escala.
- (−) La tabla `events` crece sin límite: es append-only y barata (bigint + jsonb);
  particionarla o archivarla es trivial y queda para cuando pese (>~10M filas).

## Alternativas descartadas

1. **Solo PostHog (sin tabla events)** — Rechazado: la calibración del score y la
   auditoría LFPDPPP no pueden depender de un SaaS externo con muestreo/retención
   ajenos; y cruzar PostHog con Postgres para entrenar sería un ETL permanente.
2. **Sentry para errores + PostHog para producto** — Rechazado: dos herramientas
   donde una cubre ambas necesidades en gratis. Sentry queda anotado como upgrade
   si el error tracking de PostHog se queda corto.
3. **Stack propio (Grafana + Prometheus/Loki)** — Rechazado: infraestructura de
   observabilidad para observar a un servidor serverless que no tenemos; overkill
   absoluto a esta escala.
4. **Solo logs (sin eventos estructurados)** — Rechazado: los logs de Vercel/
   Supabase tienen retención corta y no son consultables como embudo; la North Star
   no puede vivir en un log que expira.

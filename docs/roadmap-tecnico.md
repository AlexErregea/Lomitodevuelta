# Roadmap técnico — LomitoDeVuelta

> Sprints técnicos mapeados a las fases del negocio, con criterios de "listo" (DoD)
> verificables por sprint. Los sprints son de alcance, no de calendario: con un
> fundador + Claude Code, un sprint dura lo que duren sus criterios.
> Última actualización: 2026-07-16.

## Mapa fases → sprints

| Fase de negocio | Sprints | Resultado |
|---|---|---|
| **0 — Validación** | S0 | Andamiaje corre de punta a punta; score implementado y testeado |
| **1 — MVP herramienta (Flujos A/B)** | S1-S3 | Lanzamiento público en CDMX |
| **2 — Densidad + verificación** | S4 | La red se llena y se cuida sola |
| **3 — Monetización + institucional** | S5-S6 | Flujo C y primeros ingresos |
| **4 — Expansión** | S7+ | Segunda zona, gatos, escala |

---

## Sprint 0 — Cimientos ejecutables (= Bloque 7 de esta sesión)

**Objetivo**: nada de features; que todo lo diseñado compile, corra y esté probado.

Entregables: entorno local completo (pnpm install real, `supabase init/start/reset`
con las 7 migraciones aplicadas), implementación de `scoreCandidate` /
`rankCandidates` / `renderExplanation` con los casos dorados en verde, benchmark
del modelo de embeddings con fotos reales de perros (fija modelo definitivo y anclas
`visual_floor/ceil`), CI en verde, despliegue esqueleto (Vercel + Supabase cloud).

**Tareas del fundador**: comprar dominio; crear cuentas (Supabase, Vercel,
Replicate, Anthropic, PostHog); iniciar verificación de Meta Business + número
WhatsApp dedicado (tarda días-semanas: empezar YA); juntar ~50-100 fotos de perros
para el benchmark; avanzar el estudio de densidad de CDMX (elegir colonia/alcaldía
piloto).

**DoD**: `pnpm typecheck && pnpm test` en verde con casos dorados reales ·
`pnpm db:reset` aplica todo sin errores · benchmark documentado en
`docs/benchmark-embeddings.md` · web esqueleto desplegada en el dominio real.

## Sprint 1 — El pipeline vivo (Flujo B mínimo)

**Objetivo**: "una foto → la IA busca" funcionando de verdad, aunque feo.

Entregables: subida con compresión client-side y URL firmada; integración real de
`EmbeddingProvider` (Replicate) y `AttributeExtractor` (Claude) con la ruta
`pending`/reintentos (pg_cron + `retry-pending`); `POST /api/reports` completo
(Flujo B); resultados con explicación; alta automática con nota del encontrador;
enlace de gestión entregado por WhatsApp (primera plantilla aprobada).

**DoD**: en producción, un celular sube una foto real y en <5 s percibidos ve
candidatos o su reporte creado · el WhatsApp con el enlace llega · una inferencia
forzada a fallar no pierde el reporte (reintento lo completa) · eventos 1-5 del
embudo registrándose.

## Sprint 2 — Flujo A + crecimiento (fichas compartibles)

**Objetivo**: el lado "perdí a mi perro" completo y el mecanismo de distribución.

Entregables: Flujo A (multi-foto, ficha autocompletada editable, ubicación/fecha);
ficha pública `/r/:id` mobile-first; og:image dinámico (ADR-0010) con caché;
botón compartir a WhatsApp; edición/renovación/borrado vía enlace de gestión;
página de aviso de privacidad y consentimiento versionado.

**DoD**: una ficha compartida en un chat de WhatsApp muestra preview con foto y CTA ·
Flujo A completo en un celular gama media · Lighthouse mobile ≥ 85 en la ficha ·
ARCO básico funciona (editar/borrar sin cuenta).

## Sprint 3 — El motor proactivo (lanzamiento MVP) 🚀

**Objetivo**: la promesa completa: el sistema busca solo y avisa solo.

Entregables: `on-report-created` real (capa 3: candidatos → score → matches →
notificaciones idempotentes); plantillas de match aprobadas; aceptar/rechazar desde
el enlace de gestión; prueba de propiedad ligera; puente de contacto tras doble
aceptación con copys anti-extorsión; fallback email; `lifecycle` (expiración,
renovación, purga de datos personales); vistas de métricas (observability.md §4).

**DoD**: caso completo real: A reporta perdido, B sube encontrado, ambos reciben
WhatsApp, aceptan, reciben el contacto, se confirma reunión → `reunion_confirmed`
en `events` · el mismo par jamás genera doble notificación · kill-switch de
presupuesto probado · **se lanza al público en la zona piloto**.

## Sprint 4 — Densidad y confianza (fase 2)

**Objetivo**: que crecer no rompa la calidad ni la seguridad.

Entregables: moderación operativa (flags de ADR-0009 + rutina de revisión);
rate-limits activos; tests de integración RLS en CI; e2e Playwright del Flujo B;
PWA instalable (manifest + offline básico); primera calibración de pesos si ya hay
~200 matches etiquetados; mejoras de recall según datos reales (radio, umbrales).

**DoD**: suite de aislamiento RLS en verde en CI · un duplicado y un "no-perro"
se detectan solos en producción · e2e del Flujo B en verde · informe de precisión
del matching con datos reales.

## Sprint 5-6 — Institucional + monetización (fase 3)

Panel institucional (route group `(panel)`: bandeja de matches, alta rápida con
foto, QR de mostrador), onboarding manual de 3-5 veterinarias/refugios piloto,
Supabase Auth institucional en producción, Stripe para plan Pro institucional,
aviso de privacidad revisado por abogado (requisito de esta fase,
security-privacy.md §8).

**DoD**: una veterinaria real opera su bandeja sin ayuda · primer peso cobrado con
Stripe · convenio institucional firmado con el piloto.

## Sprint 7+ — Expansión (fase 4)

Segunda zona (INSERT en `zones` + operación de lanzamiento hiperlocal), gatos
(relajar CHECK de `species` + prompt de extracción), y las palancas de escala ya
documentadas con disparador: self-hosting de embeddings (ADR-0003), iterative
scans/particionado (ADR-0005), staging formal y CI de migraciones (ADR-0012).

---

## Reglas del roadmap

1. **No se adelanta nada de una fase posterior** aunque sea tentador: cada pieza
   marcada "posterior" en los ADRs tiene su disparador escrito.
2. **Cada sprint termina con su DoD verificado en producción**, no en local.
3. Si un sprint revela que una decisión de arquitectura estorba, se escribe un ADR
   que la reemplace — no se parchea en silencio (regla de CLAUDE.md).

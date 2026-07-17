# Estrategia de testing — LomitoDeVuelta

> Con un solo desarrollador (fundador + Claude Code), los tests no son burocracia:
> son el mecanismo que permite a la IA modificar código con confianza sin romper lo
> que ya funciona. Se invierte fuerte donde el riesgo es alto y nada donde no.
> Última actualización: 2026-07-16.

## 1. Dónde invertir (y dónde no)

| Capa | Riesgo si falla | Inversión |
|---|---|---|
| `packages/matching` (score) | Un perro no se reencuentra: el fallo invisible y más caro | **Máxima** — unit tests exhaustivos |
| RLS / privacidad | Fuga de datos personales (LFPDPPP) | **Alta** — tests de integración de aislamiento |
| API (Route Handlers) | Reportes corruptos o perdidos | Media — integración de los caminos críticos |
| UI | Molesto pero visible y recuperable | Mínima — un e2e del camino feliz (fase 2) |
| Estilos, textos, páginas estáticas | Cosmético | Ninguna |

## 2. Unit tests — el dominio de matching (Vitest)

- **Qué**: `scoreCandidate`, `rankCandidates`, `renderExplanation` — funciones puras,
  sin infraestructura, con fixtures. Los **casos dorados** viven en
  [matching-engine.md §10](./matching-engine.md) y ya están declarados como
  `it.todo` en `packages/matching/src/score.test.ts`: la implementación del Bloque 7
  los convierte en tests reales, ninguno se borra.
- **Regla para sesiones de IA**: cualquier cambio en la fórmula del score exige
  (1) actualizar matching-engine.md, (2) pasar los casos dorados o justificar por
  qué cambia el esperado. Los pesos NO se testean con valores exactos de la BD, sino
  con parámetros de fixture — así calibrar en producción no rompe tests.
- **Cobertura**: objetivo ≥90 % de líneas en `score.ts`/`explain.ts` a partir del
  Bloque 7 (config en `vitest.config.ts`).

## 3. Tests de integración — RLS y API (Vitest + Supabase local)

Corren contra `supabase start` local (mismas migraciones que producción):

1. **Aislamiento multi-tenant** (los más importantes; ADR-0007):
   - el tenant A no lee reportes/fotos/contactos del tenant B;
   - ninguna cuenta autenticada lee reportes ciudadanos (`tenant_id IS NULL`);
   - `anon` no lee ninguna tabla base; `dogs_public` no expone contacto, token de
     gestión ni ubicación exacta.
2. **RPC `match_candidates`**: dado un seed con reportes en radios/fechas
   conocidos, devuelve exactamente los esperados (geo-filtro, ventana temporal,
   inventario contrario, exclusión de expirados/bloqueados).
3. **API crítica**: crear reporte válido → 200 con manageUrl; sin consentimiento →
   400; token de gestión ajeno → 403; transición de match inválida → 409.

**MVP**: estos tests corren **en local** (`pnpm test:integration`, se añade en
Bloque 7) antes de cada `db push` a producción. Integrarlos a CI con Supabase en
GitHub Actions es fase posterior (añade ~2-3 min por corrida; vale la pena cuando
haya más de un contribuidor o despliegues frecuentes).

## 4. E2E — un solo camino, el que paga todo (fase 2)

Playwright, un único flujo: **Flujo B completo** (abrir → foto → ver candidatos o
alta automática → recibir enlace). Es el flujo sagrado y el que involucra todas las
piezas (Storage, visión, RPC, score). Se escribe cuando la UI exista y se estabilice
(sprint 4, ver roadmap); antes de eso los e2e se rompen con cada iteración de UI y
generan mantenimiento sin retorno.

## 5. CI (GitHub Actions — `.github/workflows/ci.yml`)

En cada push/PR: `pnpm install` → `lint` → `typecheck` → `test` (unit). Suficiente
para un desarrollador solo; el gate real pre-producción es el checklist de
despliegue (ADR-0012), que incluye los tests de integración locales.

**Qué NO hay (deliberadamente)**: matrices de versiones, tests de carga, mutation
testing, snapshots de UI — complejidad sin retorno a esta escala.

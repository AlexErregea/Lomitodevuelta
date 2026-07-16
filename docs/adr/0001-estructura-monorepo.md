# ADR-0001 — Estructura del repositorio: monorepo con pnpm workspaces

- **Estado**: Aceptado
- **Fecha**: 2026-07-15
- **Decisores**: Fundador + Claude (arquitecto)

## Contexto

Un solo desarrollador (perfil PM, desarrollo AI-assisted con Claude Code) construirá:
una PWA Next.js, un dominio de matching que debe ser testeable sin infraestructura,
tipos compartidos entre frontend y funciones serverless, y migraciones/funciones de
Supabase. El código debe ser navegable y comprensible para sesiones futuras de IA:
cuanto más predecible la estructura, menos errores de contexto.

La preferencia expresada es un punto medio que apunte a estructura: ni un solo
directorio plano, ni tooling enterprise (Nx, Bazel).

## Decisión

**Monorepo con pnpm workspaces, sin orquestador de builds (sin Turborepo) en MVP.**

```
lomitodevuelta/
├─ apps/
│  └─ web/                 # Next.js PWA: UI ciudadana + panel institucional
│                          # (route group (panel), fase 3) + Route Handlers + og:image
├─ packages/
│  ├─ matching/            # Dominio puro de matching: scoring, explicaciones,
│  │                       # calibración. CERO dependencias de infraestructura.
│  └─ shared/              # Tipos TypeScript, esquemas Zod, constantes,
│                          # utilidades compartidas (formatos de teléfono, geo)
├─ supabase/
│  ├─ migrations/          # SQL versionado (Supabase CLI)
│  ├─ functions/           # Edge Functions (Deno): matching proactivo,
│  │                       # webhooks WhatsApp, reintentos
│  └─ seed/                # Datos de desarrollo
└─ docs/                   # architecture.md, matching-engine.md, ADRs, etc.
```

Reglas de dependencia (dirección única, verificable con lint):
`apps/web` → `packages/*`; `supabase/functions` → `packages/*`;
`packages/matching` → `packages/shared`; `packages/shared` → nada.

El panel institucional (Flujo C) vive como route group dentro de `apps/web`, **no**
como app separada: comparte componentes, auth y despliegue. Se separaría solo si en
fase B2B su ciclo de release divergiera del sitio ciudadano.

## Consecuencias

- (+) Tipos compartidos sin publicar paquetes: un cambio en el esquema se propaga
  a web y a Edge Functions en el mismo commit.
- (+) `packages/matching` se testea con `vitest` sin levantar Supabase — crítico
  para iterar los pesos del score con confianza.
- (+) Un solo repo = un solo contexto para Claude Code; convenciones en un solo
  CLAUDE.md.
- (−) Las Edge Functions (Deno) importan desde paquetes pensados para Node: hay que
  mantener `packages/matching` y `packages/shared` libres de APIs de Node
  (regla: solo TypeScript estándar + sin I/O). Se documenta y se protege con lint.
- (−) pnpm workspaces requiere entender `workspace:*`; se documenta en el README de
  onboarding.
- Si en el futuro hay varias apps con builds lentos, **añadir Turborepo es un cambio
  aditivo** (un `turbo.json`), no un rediseño. Marcado como fase posterior.

## Alternativas descartadas

1. **Repos separados (web / dominio / infra)** — Rechazado: sincronizar tipos entre
   repos exige publicar paquetes o duplicar código; fricción máxima para un
   desarrollador solo y para IA que necesita el contexto completo.
2. **Turborepo/Nx desde el día 1** — Rechazado: con una sola app y dos paquetes, el
   orquestador solo añade configuración que mantener. Se adopta cuando duela el build,
   no antes.
3. **Una sola app Next.js sin paquetes** (todo en `src/lib/`) — Rechazado: el dominio
   de matching quedaría acoplado al runtime de Next.js; no sería importable desde
   Edge Functions ni testeable en aislamiento, y es el activo de código más valioso.

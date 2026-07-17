# ADR-0012 — Entornos y despliegue: local + producción, con proyecto dev en la nube para previews

- **Estado**: Aceptado
- **Fecha**: 2026-07-16

## Contexto

Hay que definir entornos, flujo de migraciones y manejo de secretos para un
desarrollador solo con presupuesto ~cero. Los riesgos a balancear: (a) aplicar una
migración mala a producción sin red de seguridad; (b) que los preview deployments de
Vercel (uno por push) apunten a la base de producción; (c) burocracia de entornos
que un fundador solo no va a mantener.

## Decisión

**Dos entornos y medio, todos gratis:**

| Entorno | Web | Base de datos | Para qué |
|---|---|---|---|
| **Local** | `pnpm dev` | Supabase local (Docker) | Desarrollo diario; `db reset` aplica migraciones desde cero |
| **Dev cloud** | Previews de Vercel (auto por push/PR) | Proyecto Supabase Free `lomito-dev` | Probar en celular real y validar migraciones antes de prod |
| **Producción** | Vercel (rama `master`) | Proyecto Supabase Free→Pro `lomito-prod` | Usuarios reales |

(El plan Free de Supabase admite dos proyectos: dev y prod caben sin pagar.)

1. **Flujo de migraciones** (Supabase CLI): local `db reset` → válido → `supabase db
   push` a `lomito-dev` → smoke test → `db push` a `lomito-prod`. **Manual con
   checklist en MVP** (deliberado: el momento más peligroso del sistema merece un
   humano leyendo). El checklist vive en el README de `supabase/` (Bloque 7).
   Automatizar el push a prod en CI = fase posterior, cuando exista staging con
   datos representativos.
2. **Orden de despliegue**: siempre migración antes que código que la usa; toda
   migración debe ser **compatible con el código anterior** (aditiva: crear antes
   que borrar; borrar solo en una migración posterior cuando ya nada lo usa). Regla
   en CLAUDE.md.
3. **Previews de Vercel apuntan a `lomito-dev`** vía variables de entorno de scope
   Preview (Vercel separa Production/Preview/Development): un push jamás toca datos
   reales. Edge Functions y secretos de WhatsApp solo existen en prod; en dev se
   usan stubs/valores de prueba.
4. **Secretos**: inventario único en `.env.example` con columna "dónde vive"
   (local / Vercel / Supabase secrets). Nunca en el repo (`.gitignore` ya lo
   fuerza), nunca compartidos entre entornos (cada entorno, sus claves). Rotación
   documentada por proveedor en el runbook del Bloque 7.
5. **Ramas**: trunk-based — `master` despliega; ramas cortas para trabajo en curso.
   Sin GitFlow: no hay equipo que coordinar. CI (typecheck+lint+test) corre en todo
   push (`.github/workflows/ci.yml`).

## Consecuencias

- (+) Cero costo, y el riesgo mayor (migración rompe prod) queda cubierto por el
  ensayo obligatorio en `lomito-dev` + checklist.
- (+) Previews con datos falsos: se puede compartir un preview por WhatsApp para
  feedback sin exponer datos reales (LFPDPPP).
- (−) `lomito-dev` acumulará basura de pruebas. Mitigación: `db reset` remoto
  ocasional; sus datos son desechables por definición.
- (−) Proyectos Free de Supabase se pausan por inactividad (~1 semana): `lomito-dev`
  se pausará en semanas quietas — reactivarlo es un clic; el cron de `lifecycle`
  mantiene vivo a prod (cost-model.md §3.4).
- (−) Sin staging "espejo de prod" con datos realistas: las migraciones se ensayan
  contra datos sintéticos. Asumido hasta fase 2-3; el disparador para staging formal
  es la primera migración que reescriba datos en caliente con usuarios activos.

## Alternativas descartadas

1. **Solo local + producción** — Rechazado: deja las migraciones sin ensayo real y
   los previews de Vercel sin base segura a la que apuntar (o peor: apuntando a
   prod). El proyecto dev es gratis; no tomarlo sería ahorrar cero asumiendo el
   mayor riesgo del sistema.
2. **Tres entornos formales (dev/staging/prod) con promoción por CI** — Rechazado:
   burocracia de release para un equipo de uno; cada capa de proceso que el fundador
   no pueda sostener se convertirá en teatro. Fase posterior con disparador claro.
3. **Supabase branching (ramas de BD por PR)** — Rechazado: es de plan pago y
   resuelve un problema de equipos concurrentes que no tenemos.
4. **Migraciones auto-aplicadas a prod en cada merge desde el día 1** — Rechazado:
   sin staging con datos representativos, es automatizar el paso más peligroso
   justo donde menos red hay. Se automatiza cuando el ensayo sea representativo.

# ADR-0007 — Multi-tenancy institucional: modelo pooled (tablas compartidas + tenant_id + RLS)

- **Estado**: Aceptado
- **Fecha**: 2026-07-16

## Contexto

Las cuentas institucionales (veterinarias, refugios, control animal — Flujo C,
fase 3) gestionan sus propios reportes y verán su bandeja de matches. Conviven con
reportes ciudadanos anónimos en el mismo sistema. Hay que elegir el modelo de
aislamiento antes de escribir cualquier política, porque cambiarlo después reescribe
la capa de seguridad completa.

**El dato que decide todo**: el inventario es compartido *por diseño de producto*.
Un perro que recibe un refugio DEBE poder matchear con el reporte de un ciudadano
que lo perdió, y viceversa. El motor de matching cruza tenants siempre.

## Decisión

**Modelo pooled**: todas las instituciones y los ciudadanos comparten las mismas
tablas; los reportes institucionales llevan `tenant_id` (los ciudadanos, `NULL`);
el aislamiento lo imponen políticas RLS
(`supabase/migrations/20260716090000_rls_institutional.sql`).

Reglas:

1. **El aislamiento es de gestión, no de datos**: una institución administra
   (SELECT/INSERT/UPDATE) solo filas de su `tenant_id`. Pero sus reportes
   participan del matching global exactamente igual que los ciudadanos.
2. **Los reportes ciudadanos son invisibles por acceso directo** para cualquier
   cuenta autenticada (`tenant_id IS NULL` no matchea ninguna política). Las
   instituciones los ven solo como cualquier persona: vía ficha pública o como
   contraparte de un match.
3. **Helpers `security definer`** (`user_institution_ids()`,
   `user_is_institution_admin()`) resuelven la membresía sin recursión de RLS y
   concentran la lógica en un solo lugar auditable.
4. **`matches` es solo-lectura para tenants**: la bandeja del panel lee; los cambios
   de estado pasan por el servidor (máquina de estados + auditoría en `events`).
5. Un usuario puede pertenecer a varias instituciones (cadenas de veterinarias):
   `institution_members` es N:M con rol por membresía.

## Consecuencias

- (+) El matching cruza tenants sin ninguna gimnasia: es un SELECT normal con
  service_role.
- (+) Una sola migración sirve a todos los tenants; onboarding de institución =
  2 INSERTs (institución + primer admin).
- (+) Las políticas quedan escritas y probadas desde el MVP aunque el panel llegue
  en fase 3: el costo hoy es casi cero, el ahorro futuro es la capa de seguridad
  entera.
- (−) Un error en una política RLS afecta a todos los tenants. Mitigación: helpers
  centralizados, tests de integración de aislamiento (Bloque 6: "el tenant A no ve
  filas del tenant B ni ciudadanas") y cambios de política siempre por migración
  revisada.
- (−) Sin aislamiento físico que ofrecer contractualmente a gobierno (fase B2G
  podría exigirlo). Asumido: si un contrato lo exige, ese tenant amerita evaluación
  dedicada — no se paga ese costo hoy por un contrato que no existe.

## Alternativas descartadas

1. **Schema-per-tenant** — Rechazado: rompe el producto. El matching tendría que
   consultar N schemas por cada alta; cada migración se multiplica por N; pgvector
   y PostGIS indexarían por separado inventarios que deben buscarse juntos.
2. **Proyecto/BD Supabase por tenant** — Rechazado: mismo defecto elevado al cubo,
   más costo por proyecto y N pipelines de despliegue. Solo tendría sentido para un
   contrato gubernamental con requisitos duros de residencia de datos (fase
   posterior, si ocurre).
3. **Columna tenant_id con filtrado en aplicación (sin RLS)** — Rechazado: un
   `WHERE` olvidado en cualquier query filtraría datos entre tenants. RLS hace que
   el olvido sea imposible por construcción — exactamente el tipo de guardarraíl
   que este proyecto necesita (desarrollo AI-assisted).

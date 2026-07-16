-- ============================================================================
-- LomitoDeVuelta · Migración 5 — RLS base: denegar por defecto + vista pública
-- ----------------------------------------------------------------------------
-- Postura de seguridad del MVP (detalle completo en /docs/security-privacy.md
-- y ADRs 0006/0007, Bloque 4):
--
--   · RLS habilitado en TODAS las tablas, sin políticas para anon/authenticated
--     → todo denegado por defecto para los clientes.
--   · El backend (Server Actions / Route Handlers / Edge Functions) usa
--     service_role, que omite RLS: toda escritura y lectura sensible pasa por
--     código de servidor con validación Zod (ADR-0002).
--   · Lo único legible por el público es la vista dogs_public: filas ya
--     moderadas y SOLO columnas seguras, con la ubicación difuminada.
--   · Las políticas para cuentas institucionales (leer/escribir su tenant)
--     llegan en el Bloque 4 como migración propia.
-- ============================================================================

alter table public.zones               enable row level security;
alter table public.institutions        enable row level security;
alter table public.institution_members enable row level security;
alter table public.dogs                enable row level security;
alter table public.dog_photos          enable row level security;
alter table public.contacts            enable row level security;
alter table public.matching_params     enable row level security;
alter table public.matches             enable row level security;
alter table public.events              enable row level security;
alter table public.notifications       enable row level security;

-- ----------------------------------------------------------------------------
-- Vista pública de reportes
-- ----------------------------------------------------------------------------
-- La vista corre con los privilegios de su dueño (postgres) y por eso puede
-- leer la tabla base pese al RLS: la vista MISMA es la frontera de seguridad.
-- Es una decisión deliberada y auditada — expone únicamente:
--   · filas activas, aprobadas y no borradas,
--   · columnas sin datos personales (ni contacto, ni token de gestión),
--   · la ubicación redondeada a 3 decimales (~110 m): suficiente para saber
--     la colonia, insuficiente para señalar un domicilio (LFPDPPP).
create view public.dogs_public as
select
  d.id,
  d.species,
  d.report_type,
  d.status,
  d.attributes,
  d.distinctive_marks,
  d.is_sensitive,
  d.reward_offered,
  d.zone_id,
  d.event_date,
  round(st_y(d.geo_point::geometry)::numeric, 3) as approx_lat,
  round(st_x(d.geo_point::geometry)::numeric, 3) as approx_lng,
  d.address_text,
  d.created_at
from public.dogs d
where d.status = 'active'
  and d.moderation_status = 'approved'
  and d.deleted_at is null;

grant select on public.dogs_public to anon, authenticated;

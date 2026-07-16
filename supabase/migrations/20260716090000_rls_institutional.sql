-- ============================================================================
-- LomitoDeVuelta · Migración 7 — Políticas RLS institucionales (ADR-0007)
-- ----------------------------------------------------------------------------
-- El panel institucional es fase 3, pero las políticas se diseñan desde ahora:
-- añadir multi-tenancy después obligaría a reescribir la seguridad completa.
--
-- Modelo: pooled (tablas compartidas + tenant_id). El aislamiento es de
-- GESTIÓN, no de datos: el inventario es compartido por diseño (un perro que
-- recibe una veterinaria debe poder matchear con reportes ciudadanos).
--
-- Invariantes:
--   · Una cuenta institucional solo ve/edita filas de SU tenant.
--   · Los reportes ciudadanos (tenant_id IS NULL) son invisibles por acceso
--     directo para cualquier cuenta autenticada.
--   · Los cambios de estado de matches son SOLO por servidor (service_role):
--     la máquina de estados y su auditoría en events no se pueden saltar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Funciones helper (security definer para no disparar recursión de RLS al
-- consultar institution_members desde sus propias políticas).
-- ----------------------------------------------------------------------------

create or replace function public.user_institution_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select institution_id
  from public.institution_members
  where user_id = auth.uid();
$$;

create or replace function public.user_is_institution_admin(p_institution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.institution_members
    where user_id = auth.uid()
      and institution_id = p_institution_id
      and role = 'admin'
  );
$$;

revoke execute on function public.user_institution_ids() from public, anon;
grant execute on function public.user_institution_ids() to authenticated;
revoke execute on function public.user_is_institution_admin(uuid) from public, anon;
grant execute on function public.user_is_institution_admin(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- institutions
-- ----------------------------------------------------------------------------

create policy institutions_select_own
  on public.institutions for select
  to authenticated
  using (id in (select public.user_institution_ids()));

create policy institutions_update_admin
  on public.institutions for update
  to authenticated
  using (public.user_is_institution_admin(id))
  with check (public.user_is_institution_admin(id));

-- El alta de instituciones es solo por servidor (verificación manual previa,
-- ADR-0006): sin política de INSERT para authenticated.

-- ----------------------------------------------------------------------------
-- institution_members
-- ----------------------------------------------------------------------------

create policy members_select_own
  on public.institution_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.user_is_institution_admin(institution_id)
  );

create policy members_insert_admin
  on public.institution_members for insert
  to authenticated
  with check (public.user_is_institution_admin(institution_id));

create policy members_delete_admin
  on public.institution_members for delete
  to authenticated
  using (public.user_is_institution_admin(institution_id));

-- ----------------------------------------------------------------------------
-- dogs — reportes del propio tenant
-- ----------------------------------------------------------------------------

create policy dogs_select_tenant
  on public.dogs for select
  to authenticated
  using (tenant_id in (select public.user_institution_ids()));

create policy dogs_insert_tenant
  on public.dogs for insert
  to authenticated
  with check (tenant_id in (select public.user_institution_ids()));

create policy dogs_update_tenant
  on public.dogs for update
  to authenticated
  using (tenant_id in (select public.user_institution_ids()))
  with check (tenant_id in (select public.user_institution_ids()));

-- ----------------------------------------------------------------------------
-- dog_photos y contacts — a través del reporte del tenant
-- ----------------------------------------------------------------------------

create policy photos_select_tenant
  on public.dog_photos for select
  to authenticated
  using (exists (
    select 1 from public.dogs d
    where d.id = dog_id
      and d.tenant_id in (select public.user_institution_ids())
  ));

create policy photos_insert_tenant
  on public.dog_photos for insert
  to authenticated
  with check (exists (
    select 1 from public.dogs d
    where d.id = dog_id
      and d.tenant_id in (select public.user_institution_ids())
  ));

-- El contacto de un reporte institucional es el mostrador de la propia
-- institución: puede verlo y corregirlo.
create policy contacts_select_tenant
  on public.contacts for select
  to authenticated
  using (exists (
    select 1 from public.dogs d
    where d.id = dog_id
      and d.tenant_id in (select public.user_institution_ids())
  ));

-- ----------------------------------------------------------------------------
-- matches — solo lectura: la bandeja del panel. Los cambios de estado
-- (aceptar/rechazar/confirmar) pasan por el servidor SIEMPRE.
-- ----------------------------------------------------------------------------

create policy matches_select_tenant
  on public.matches for select
  to authenticated
  using (exists (
    select 1 from public.dogs d
    where (d.id = dog_lost_id or d.id = dog_found_id)
      and d.tenant_id in (select public.user_institution_ids())
  ));

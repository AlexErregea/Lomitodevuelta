-- ============================================================================
-- LomitoDeVuelta · Migración 14 — Nombre del perro
-- ----------------------------------------------------------------------------
-- Decisión del fundador (2026-08-16). Un perro con nombre no es un animal
-- extraviado: es alguien de la familia. "Se busca a Toby" se comparte y
-- "PERDIDO 🐕" se ignora — y compartir por WhatsApp ES el mecanismo de
-- distribución del producto, no un adorno.
--
-- Nullable a propósito y para siempre: solo el Flujo A puede llenarlo. Quien
-- encuentra un perro en la calle no sabe cómo se llama, y el flujo B no gana
-- ni un campo más (architecture.md: fricción cero, no puede perder registros).
--
-- NO participa en el matching. El lado "encontrado" nunca lo tiene, así que
-- compararlo sería imposible por construcción: es campo de presentación pura.
-- Por eso no toca `matching_params` ni `packages/matching`.
--
-- Riesgo asumido con conocimiento: publicar el nombre facilita la llamada de
-- extorsión "tengo a Toby". Se acepta porque (a) la ficha ya enmascara el
-- contacto, así que desde la plataforma no se puede llamar a nadie, (b) el
-- puente de contacto exige doble aceptación y prueba de propiedad
-- (security-privacy.md §6), y (c) todo grupo de mascotas perdidas del país
-- publica el nombre: quitarlo sacrifica la difusión sin cerrar el vector real,
-- que es el número que el propio dueño difunde fuera de aquí.
-- ============================================================================

alter table public.dogs
  add column pet_name text;

comment on column public.dogs.pet_name is
  'Nombre del perro. Solo Flujo A (quien encuentra no lo sabe). No entra al score.';

-- ----------------------------------------------------------------------------
-- La vista pública debe exponerlo: es lo que leen la ficha y la landing.
-- Se recrea completa porque `create or replace view` no admite agregar
-- columnas en medio; el resto queda idéntico a la migración 5.
-- ----------------------------------------------------------------------------
drop view if exists public.dogs_public;

create view public.dogs_public as
select
  d.id,
  d.species,
  d.report_type,
  d.status,
  d.pet_name,
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

-- Recrear la vista descarta sus permisos: hay que reponerlos tal como los dejó
-- la migración 11, o la API dejaría de poder leerla.
revoke all on public.dogs_public from anon, authenticated;
grant select on public.dogs_public to anon, authenticated;

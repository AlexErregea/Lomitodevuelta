-- ============================================================================
-- LomitoDeVuelta · Migración 1 — Extensiones, tipos enumerados y utilidades
-- ----------------------------------------------------------------------------
-- Las extensiones son la base del motor: PostGIS para el filtro geoespacial,
-- pgvector para la búsqueda por similitud visual, pg_cron para reintentos y
-- mantenimiento programado. Todas vienen incluidas en Supabase (plan Free).
-- ============================================================================

create extension if not exists postgis;
create extension if not exists vector;
create extension if not exists pg_cron;

-- ----------------------------------------------------------------------------
-- Tipos enumerados
-- Un enum de Postgres protege contra estados inválidos a nivel de base de
-- datos (un guardarraíl más para el desarrollo AI-assisted). Añadir un valor
-- nuevo es barato: ALTER TYPE ... ADD VALUE en una migración futura.
-- ----------------------------------------------------------------------------

-- Tipo de reporte: es el eje del sistema. 'lost' y 'found' son los dos
-- inventarios que el matching compara entre sí.
create type report_type as enum ('lost', 'found');

-- Ciclo de vida de un reporte (independiente del tipo):
--   active   → en vigilancia, participa en el matching
--   reunited → reunión confirmada (final feliz; sale del inventario activo)
--   expired  → venció su ventana de vigencia sin resolución
--   removed  → retirado por el usuario o por moderación
create type dog_status as enum ('active', 'reunited', 'expired', 'removed');

-- Moderación post-publicación: el Flujo B exige fricción cero, así que los
-- reportes nacen 'approved' y la moderación (IA + manual) los puede marcar
-- después. Detalle en ADR-0010 (Bloque 4).
create type moderation_status as enum ('pending', 'approved', 'flagged', 'blocked');

-- Estado del pipeline de visión por reporte. Regla de oro (ADR-0003):
-- una inferencia fallida jamás pierde un reporte → queda 'pending'/'failed'
-- y pg_cron lo reintenta.
create type embedding_status as enum ('pending', 'processing', 'done', 'failed');

-- Ciclo de vida de un match. Cada transición se registra en `events`:
-- ese historial es el dataset que calibrará el score (ADR-0004).
create type match_status as enum
  ('suggested', 'notified', 'accepted', 'rejected', 'confirmed_reunion', 'expired');

create type contact_channel as enum ('whatsapp', 'email');

create type institution_type as enum ('veterinary', 'shelter', 'animal_control', 'other');
create type institution_role as enum ('admin', 'member');

create type actor_type as enum ('citizen', 'institution_user', 'system');

create type notification_status as enum ('queued', 'sent', 'delivered', 'failed');

-- ----------------------------------------------------------------------------
-- Utilidades
-- ----------------------------------------------------------------------------

-- Mantiene updated_at al día en cualquier tabla que tenga esa columna.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

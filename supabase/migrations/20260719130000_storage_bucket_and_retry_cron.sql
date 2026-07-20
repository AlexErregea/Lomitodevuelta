-- ============================================================================
-- LomitoDeVuelta · Migración 8 — Storage de fotos + reintentos programados
-- ----------------------------------------------------------------------------
-- Sprint 1 (roadmap-tecnico.md): el pipeline vivo necesita
--   1. El bucket PRIVADO de fotos (security-privacy.md §7): el cliente sube
--      con URL firmada de subida y el público lee con URL firmada de lectura.
--      Sin políticas para anon: las URLs firmadas no pasan por RLS y el
--      backend usa service_role — deny-by-default intacto.
--   2. Contador de intentos en el ledger de notificaciones (ADR-0008): el
--      fallback a email se decide al AGOTAR los reintentos de WhatsApp.
--   3. El job de pg_cron que invoca la Edge Function retry-pending cada
--      5 minutos vía pg_net (ADR-0003: el estado en la tabla + pg_cron ES la
--      cola de reintentos; no hay message broker en MVP).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Bucket privado de fotos
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dog-photos', 'dog-photos', false, 10485760, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2) Reintentos de notificaciones
-- ----------------------------------------------------------------------------
-- Cuántas veces se ha intentado el envío. retry-pending reintenta mientras
-- attempts < 3; al agotar, encola el fallback a email si el reporte dio uno.
alter table public.notifications
  add column attempts smallint not null default 0;

-- ----------------------------------------------------------------------------
-- 3) pg_cron → retry-pending cada 5 minutos
-- ----------------------------------------------------------------------------
-- pg_net permite llamar HTTP desde la base (es como el DB webhook invoca
-- Edge Functions, ADR-0002). La URL de la función y el secreto compartido
-- viven en Vault, NUNCA en esta migración (el repo es público para efectos
-- prácticos y las migraciones no llevan secretos).
--
-- ⚙️ Configuración por entorno (una sola vez, desde el SQL editor):
--   select vault.create_secret('<https://PROJECT.supabase.co/functions/v1/retry-pending>', 'edge_retry_pending_url');
--   select vault.create_secret('<el mismo valor que EDGE_WEBHOOK_SECRET>',   'edge_webhook_secret');
-- Mientras los secretos no existan, el job corre pero no llama a nada
-- (el WHERE de abajo lo deja en no-op) — la migración es segura en local.
create extension if not exists pg_net;

-- Idempotencia del job: si una migración anterior lo creó, se reemplaza.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'retry-pending-every-5min') then
    perform cron.unschedule('retry-pending-every-5min');
  end if;
end;
$$;

select cron.schedule(
  'retry-pending-every-5min',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_retry_pending_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_webhook_secret')
    ),
    body := '{}'::jsonb
  )
  where (
    select count(*) from vault.decrypted_secrets
    where name in ('edge_retry_pending_url', 'edge_webhook_secret')
  ) = 2;
  $job$
);

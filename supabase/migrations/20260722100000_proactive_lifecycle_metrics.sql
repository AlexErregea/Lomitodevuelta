-- ============================================================================
-- LomitoDeVuelta · Migración 9 — Capa 3 proactiva, ciclo de vida y métricas
-- ----------------------------------------------------------------------------
-- Sprint 3 (roadmap-tecnico.md): el sistema busca solo, avisa solo y se cuida
-- solo. Esta migración añade la infraestructura de base que el código de las
-- Edge Functions on-report-created y lifecycle necesita:
--   1. matches.ownership_proof — la prueba de propiedad ligera del lado dueño
--      (security-privacy.md §6): la valida la contraparte, no la plataforma.
--   2. system_config — presupuesto de mensajes y kill-switch (ADR-0008): los
--      umbrales viven en configuración, jamás cableados en código.
--   3. Disparo de la capa 3: cuando un reporte queda con embedding listo, un
--      trigger invoca on-report-created (pg_net + Vault, como el cron).
--   4. purge_personal_data() — anonimización programada (security-privacy.md §5).
--   5. Cron diario a lifecycle (expiración, renovación, purga, kill-switch).
--   6. Vistas de métricas del panel del fundador (observability.md §4).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Prueba de propiedad en el match
-- ----------------------------------------------------------------------------
-- Forma esperada (discriminated union, packages/shared):
--   { "kind": "historic_photo", "storagePath": "..." }
--   { "kind": "private_mark",  "description": "..." }
-- La aporta el lado 'lost' al aceptar; se muestra al lado 'found' para que la
-- valide entre pares. La plataforma solo estructura el paso.
alter table public.matches
  add column ownership_proof jsonb;

-- ----------------------------------------------------------------------------
-- 2) Configuración del sistema (fila única) — presupuesto y kill-switch
-- ----------------------------------------------------------------------------
create table public.system_config (
  id                     boolean primary key default true,  -- fila única: siempre true
  -- Presupuesto mensual de mensajes de pago (WhatsApp utility). Al 80% se
  -- avisa al fundador; al 100% se pausa WhatsApp y se degrada a solo-email.
  monthly_message_budget int not null default 1000,
  -- Kill-switch: cuando true, las Edge Functions no envían por WhatsApp y
  -- caen a email donde exista (la plataforma degrada, no quiebra).
  whatsapp_paused        boolean not null default false,
  -- WhatsApp del fundador para el aviso de presupuesto (E.164).
  founder_whatsapp       text,
  -- Marca de agua del último aviso de 80% enviado, para no repetirlo el mismo mes.
  budget_alerted_month   text,
  updated_at             timestamptz not null default now(),
  constraint system_config_singleton check (id = true)
);

insert into public.system_config (id) values (true) on conflict do nothing;

alter table public.system_config enable row level security;  -- solo service_role

create trigger system_config_set_updated_at
  before update on public.system_config
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3) Disparo de la capa 3 proactiva
-- ----------------------------------------------------------------------------
-- Cuando un reporte queda con el embedding listo (INSERT con 'done', o el
-- reintento que lo completa), se invoca on-report-created con su dog_id. Es el
-- equivalente del "DB webhook" del ADR-0002 implementado con pg_net + Vault,
-- para no depender de configuración de dashboard. Seguro en local: si faltan
-- los secretos de Vault, no llama a nada (no-op).
create or replace function public.trigger_on_report_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  -- Solo cuando el embedding TRANSICIONA a 'done' (no en cada update de la fila).
  if new.embedding_status <> 'done' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.embedding_status is not distinct from 'done' then
    return new;
  end if;
  -- Reportes bloqueados/borrados no disparan matching.
  if new.moderation_status <> 'approved' or new.deleted_at is not null then
    return new;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'edge_on_report_created_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'edge_webhook_secret';
  if v_url is null or v_secret is null then
    return new;  -- sin configurar: no-op (local/CI)
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := jsonb_build_object('dog_id', new.id)
  );
  return new;
end;
$$;

create trigger dogs_proactive_matching
  after insert or update of embedding_status on public.dogs
  for each row execute function public.trigger_on_report_created();

-- ----------------------------------------------------------------------------
-- 4) Purga de datos personales (security-privacy.md §5)
-- ----------------------------------------------------------------------------
-- +30 días de expirado/reunido: se borran los datos de la PERSONA y se conserva
-- lo del PERRO anonimizado como dataset de calibración. Idempotente: solo toca
-- filas que aún tengan datos personales.
create or replace function public.purge_personal_data()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with purgeable as (
    select id from public.dogs
    where status in ('expired', 'reunited', 'removed')
      and coalesce(deleted_at, updated_at) < now() - interval '30 days'
      and (manage_token_hash is not null or finder_note is not null)
  )
  update public.dogs d
  set
    manage_token_hash = null,
    finder_note       = null,
    address_text      = null,
    -- Trunca la ubicación a ~1.1 km (2 decimales): ya no señala un domicilio.
    geo_point = st_setsrid(
      st_makepoint(
        round(st_x(d.geo_point::geometry)::numeric, 2)::float,
        round(st_y(d.geo_point::geometry)::numeric, 2)::float
      ), 4326)::geography
  from purgeable p
  where d.id = p.id;
  get diagnostics v_count = row_count;

  -- El contacto es EL dato personal: se elimina en firme (la fila del perro
  -- queda sin vínculo a persona). ON DELETE CASCADE limpiaría notifications.
  delete from public.contacts c
  using public.dogs d
  where c.dog_id = d.id
    and d.status in ('expired', 'reunited', 'removed')
    and coalesce(d.deleted_at, d.updated_at) < now() - interval '30 days';

  return v_count;
end;
$$;

revoke execute on function public.purge_personal_data() from public, anon, authenticated;
grant execute on function public.purge_personal_data() to service_role;

-- ----------------------------------------------------------------------------
-- 5) Cron diario → lifecycle
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'lifecycle-daily') then
    perform cron.unschedule('lifecycle-daily');
  end if;
end;
$$;

select cron.schedule(
  'lifecycle-daily',
  '0 9 * * *',  -- 09:00 UTC ≈ 03:00 CDMX
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_lifecycle_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_webhook_secret')
    ),
    body := '{}'::jsonb
  )
  where (
    select count(*) from vault.decrypted_secrets
    where name in ('edge_lifecycle_url', 'edge_webhook_secret')
  ) = 2;
  $job$
);

-- ----------------------------------------------------------------------------
-- 6) Vistas de métricas (observability.md §4) — una vista por pregunta.
--    Corren con privilegios del dueño (postgres); solo se conceden a
--    service_role (el panel se lee con esa clave desde Supabase Studio).
-- ----------------------------------------------------------------------------

-- El embudo semanal por zona (eventos canónicos de observability.md §2).
create view public.metrics_funnel_weekly as
select
  date_trunc('week', e.occurred_at) as week,
  (e.payload->>'zone')              as zone,
  count(*) filter (where e.event_type = 'report_created')    as reports_created,
  count(*) filter (where e.event_type = 'candidates_shown')  as candidates_shown,
  count(*) filter (where e.event_type = 'match_suggested')   as matches_suggested,
  count(*) filter (where e.event_type = 'match_notified')    as matches_notified,
  count(*) filter (where e.event_type = 'contact_revealed')  as contacts_revealed,
  count(*) filter (where e.event_type = 'reunion_confirmed') as reunions_confirmed
from public.events e
group by 1, 2;

-- Precisión del matching por versión de parámetros (guía de calibración, ADR-0004).
create view public.metrics_matching_quality as
select
  m.params_id,
  count(*)                                                        as total_matches,
  count(*) filter (where m.status = 'notified')                  as notified,
  count(*) filter (where m.lost_accepted_at is not null
                     or m.found_accepted_at is not null)          as any_accept,
  count(*) filter (where m.status = 'confirmed_reunion')          as reunions,
  count(*) filter (where m.status = 'rejected')                   as rejected,
  round(avg(m.total_score)::numeric, 3)                           as avg_score
from public.matches m
group by m.params_id;

-- Consumo del mes: base del kill-switch (ADR-0008). Cuenta mensajes de pago
-- (WhatsApp) enviados/entregados y altas con inferencia.
create view public.metrics_costs_monthly as
select
  to_char(date_trunc('month', n.created_at), 'YYYY-MM')        as month,
  n.template_key,
  count(*) filter (where n.channel = 'whatsapp'
                     and n.status in ('sent', 'delivered'))     as whatsapp_sent,
  count(*) filter (where n.channel = 'email'
                     and n.status in ('sent', 'delivered'))     as email_sent
from public.notifications n
group by 1, 2;

-- Cola de moderación: reportes marcados pendientes de revisión (ADR-0009).
create view public.moderation_queue as
select
  d.id, d.report_type, d.moderation_status, d.moderation_reason,
  d.zone_id, d.created_at
from public.dogs d
where d.moderation_status in ('pending', 'flagged')
  and d.deleted_at is null
order by d.created_at;

grant select on public.metrics_funnel_weekly,
               public.metrics_matching_quality,
               public.metrics_costs_monthly,
               public.moderation_queue
  to service_role;

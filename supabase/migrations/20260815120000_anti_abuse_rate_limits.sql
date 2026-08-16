-- ============================================================================
-- LomitoDeVuelta · Migración 12 — Paquete anti-abuso (S3-A)
-- ----------------------------------------------------------------------------
-- El MVP se lanza al público con la cartera abierta: cada alta cuesta dinero
-- real (visión + WhatsApp) y el crédito es prepago, así que un pico —orgánico
-- o malintencionado— se paga con un apagón del pipeline. Esta migración pone
-- los cimientos de datos de las cuatro defensas:
--
--   1. rate_limit_counters + consume_rate_limits() — contadores por ventana.
--      Implementación en Postgres por decisión ya registrada en
--      api-contracts.md §6 ("Upstash/Redis solo si algún límite se vuelve
--      cuello de botella"): cero dependencias, cero proveedores nuevos.
--   2. Dos topes nuevos en system_config — los umbrales viven en
--      configuración, jamás cableados en código (misma regla que ADR-0004).
--   3. notifications_last_day_for_contact() — cuántos mensajes recibió HOY un
--      número destino, contando por value_hash (no por reporte). Es lo que
--      mata el vector de bombardear a una víctima creando reportes con su
--      número: la mayor amenaza al número de WhatsApp del proyecto.
--   4. list_orphan_uploads() — fotos firmadas que nunca llegaron a ser un
--      reporte; sin esto, Storage crece con basura que nadie borra.
--
-- Todo lo de aquí es infraestructura de servidor: nada de esto es invocable
-- por anon (deny-by-default, security-privacy.md §2).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Contadores de rate limit
-- ----------------------------------------------------------------------------
-- Una fila por (cubeta, ventana). La ventana se calcula por truncamiento del
-- epoch, así que el conteo se reinicia solo al cruzar el borde: no hace falta
-- expirar filas para que el límite funcione (la limpieza de §5 es higiene de
-- espacio, no corrección).
--
-- `bucket_key` NUNCA contiene datos personales en claro: quien llama pasa
-- hashes (sha256 de IP con pepper, value_hash del contacto). Ver
-- apps/web/src/lib/rate-limit.ts.
create table public.rate_limit_counters (
  bucket_key   text        not null,
  window_start timestamptz not null,
  hits         int         not null default 0,
  primary key (bucket_key, window_start)
);

-- Para la limpieza periódica de ventanas viejas.
create index rate_limit_counters_window_idx
  on public.rate_limit_counters (window_start);

alter table public.rate_limit_counters enable row level security;  -- solo service_role
revoke all on public.rate_limit_counters from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) consume_rate_limits() — evalúa e incrementa varias cubetas de una vez
-- ----------------------------------------------------------------------------
-- Se llama UNA vez por request con todas las cubetas que apliquen (IP/hora,
-- IP/día, contacto/día, global/día): un solo viaje a la base.
--
-- El INSERT ... ON CONFLICT DO UPDATE ... RETURNING es atómico, así que dos
-- requests simultáneos no pueden colarse por el mismo hueco (el bug clásico
-- del "leer, comparar, escribir").
--
-- Contrato de entrada:
--   [{ "key": "...", "window_seconds": 3600, "limit": 3 }, ...]
-- Salida:
--   { "allowed": bool, "blocked_key": text|null, "retry_after_seconds": int }
create or replace function public.consume_rate_limits(p_specs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_spec        jsonb;
  v_key         text;
  v_window      int;
  v_limit       int;
  v_start       timestamptz;
  v_hits        int;
  v_blocked_key text := null;
  v_retry       int  := 0;
begin
  for v_spec in select * from jsonb_array_elements(p_specs) loop
    v_key    := v_spec ->> 'key';
    v_window := (v_spec ->> 'window_seconds')::int;
    v_limit  := (v_spec ->> 'limit')::int;

    if v_key is null or v_window is null or v_window <= 0 or v_limit is null then
      raise exception 'consume_rate_limits: spec inválida %', v_spec;
    end if;

    -- Ventana fija (no deslizante): el borde es el mismo para todos los que
    -- comparten cubeta, que es justo lo que hace el conteo comparable.
    v_start := to_timestamp(floor(extract(epoch from now()) / v_window) * v_window);

    insert into public.rate_limit_counters (bucket_key, window_start, hits)
    values (v_key, v_start, 1)
    on conflict (bucket_key, window_start)
      do update set hits = public.rate_limit_counters.hits + 1
    returning hits into v_hits;

    -- Se evalúan TODAS las cubetas aunque una ya haya fallado: así el conteo
    -- de las demás no queda desfasado. Se reporta la primera que se pasó.
    if v_hits > v_limit and v_blocked_key is null then
      v_blocked_key := v_key;
      v_retry := greatest(
        1,
        ceil(extract(epoch from (v_start + make_interval(secs => v_window)) - now()))::int
      );
    end if;
  end loop;

  return jsonb_build_object(
    'allowed', v_blocked_key is null,
    'blocked_key', v_blocked_key,
    'retry_after_seconds', v_retry
  );
end;
$$;

revoke execute on function public.consume_rate_limits(jsonb) from public, anon, authenticated;
grant execute on function public.consume_rate_limits(jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- 3) Topes nuevos en system_config
-- ----------------------------------------------------------------------------
-- TODOS los umbrales son columnas, no constantes de código: afinarlos el día
-- del lanzamiento (o durante una prueba en campo, donde el propio fundador se
-- bloquea a sí mismo tras 3 reportes) tiene que ser un UPDATE, no un
-- despliegue. Las VENTANAS sí viven en el código: una ventana es parte del
-- diseño del limitador, no una perilla que se afloje en caliente.
alter table public.system_config
  -- Circuit breaker global: tope duro de altas por día en toda la plataforma.
  -- Es la última red si el rate limit por IP se evade con IPs rotativas; al
  -- superarlo la API responde 503 "estamos saturados" en vez de gastar.
  -- 200/día es ~10x el tráfico esperado del piloto: no estorba, tapa el pico.
  add column max_reports_per_day int not null default 200,
  -- Tope de mensajes por número destino y día (anti-bombardeo). Cuenta por
  -- value_hash: da igual desde cuántos reportes se dispare.
  add column max_messages_per_contact_per_day int not null default 3,
  -- Altas por IP: la ráfaga de una hora y el acumulado del día por separado.
  -- Sin el tope horario, las 10 del día podían salir en diez segundos, que es
  -- exactamente la forma de un script.
  add column reports_per_ip_hour int not null default 3,
  add column reports_per_ip_day int not null default 10,
  -- Altas por contacto y día (api-contracts.md §6).
  add column reports_per_contact_day int not null default 5,
  -- Firmas de subida por IP y hora: holgado porque un Flujo A completo
  -- consume hasta 5 de golpe.
  add column upload_signs_per_ip_hour int not null default 15;

comment on column public.system_config.max_reports_per_day is
  'Circuit breaker global: altas máximas por día en toda la plataforma (503 al superarlo).';
comment on column public.system_config.max_messages_per_contact_per_day is
  'Mensajes máximos por número destino y día, contados por contacts.value_hash.';
comment on column public.system_config.reports_per_ip_hour is
  'Rate limit: altas por IP y hora. Súbelo temporalmente para pruebas en campo.';
comment on column public.system_config.reports_per_ip_day is
  'Rate limit: altas por IP y día.';
comment on column public.system_config.reports_per_contact_day is
  'Rate limit: altas por contacto (value_hash) y día.';
comment on column public.system_config.upload_signs_per_ip_hour is
  'Rate limit: firmas de subida a Storage por IP y hora.';

-- ----------------------------------------------------------------------------
-- 4) notifications_last_day_for_contact() — anti-bombardeo
-- ----------------------------------------------------------------------------
-- Cuenta los mensajes de las últimas 24 h dirigidos al MISMO destino que el
-- contacto dado, resolviendo por value_hash: diez reportes creados con el
-- número de una víctima comparten value_hash y por tanto comparten tope.
--
-- 'failed' no cuenta: un envío que no llegó no molestó a nadie y no debe
-- consumir el cupo del destinatario.
create or replace function public.notifications_last_day_for_contact(p_contact_id uuid)
returns int
language sql
stable
security definer
set search_path = public, extensions
as $$
  select count(*)::int
  from public.notifications n
  join public.contacts c on c.id = n.recipient_contact_id
  where c.value_hash = (select value_hash from public.contacts where id = p_contact_id)
    and n.created_at > now() - interval '1 day'
    and n.status in ('queued', 'sent', 'delivered');
$$;

revoke execute on function public.notifications_last_day_for_contact(uuid) from public, anon, authenticated;
grant execute on function public.notifications_last_day_for_contact(uuid) to service_role;

-- Sin este índice el conteo anterior escanea la tabla en cada envío.
create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_contact_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 5) list_orphan_uploads() — higiene de Storage
-- ----------------------------------------------------------------------------
-- Objetos del bucket privado que nadie reclamó: se firmó la subida, el archivo
-- llegó, pero el reporte nunca se creó (el usuario abandonó el formulario, o
-- alguien pidió firmas en masa). Sin esto, el plan Free de Storage (1 GB) se
-- llena de basura antes que de perros.
--
-- Solo devuelve rutas: el borrado lo hace `lifecycle` con la API de Storage,
-- porque borrar la fila de storage.objects no borra el archivo físico.
--
-- El margen de 24 h es holgado a propósito: una subida en curso jamás debe
-- entrar aquí. El LIMIT acota el trabajo de cada corrida del cron.
create or replace function public.list_orphan_uploads(p_older_than_hours int default 24)
returns setof text
language sql
stable
security definer
set search_path = public, storage, extensions
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'dog-photos'
    and o.created_at < now() - make_interval(hours => p_older_than_hours)
    and not exists (
      select 1 from public.dog_photos p where p.storage_path = o.name
    )
  limit 500;
$$;

revoke execute on function public.list_orphan_uploads(int) from public, anon, authenticated;
grant execute on function public.list_orphan_uploads(int) to service_role;

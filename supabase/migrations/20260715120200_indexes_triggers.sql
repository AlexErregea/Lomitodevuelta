-- ============================================================================
-- LomitoDeVuelta · Migración 3 — Índices y triggers
-- ----------------------------------------------------------------------------
-- Cada índice está documentado con su razón de ser. La justificación completa
-- de la estrategia (GiST + HNSW, por qué no IVFFlat, particionado futuro)
-- está en /docs/data-model.md y en el ADR-0005.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- dogs
-- ----------------------------------------------------------------------------

-- GiST sobre geography: es el índice que hace posible "geo primero".
-- ST_DWithin(geo_point, punto_ref, radio) lo usa para reducir miles de
-- reportes a decenas ANTES de tocar los vectores.
create index dogs_geo_idx on public.dogs using gist (geo_point);

-- Índice parcial del inventario vigente: el matching solo consulta reportes
-- activos, así que el índice ignora el histórico (más pequeño y más rápido).
create index dogs_active_inventory_idx
  on public.dogs (report_type, zone_id, event_date)
  where status = 'active' and deleted_at is null;

-- Panel institucional (fase 3): listados por tenant.
create index dogs_tenant_idx on public.dogs (tenant_id) where tenant_id is not null;

-- Cola de reintentos del pipeline de visión (pg_cron busca estos estados).
create index dogs_embedding_pending_idx
  on public.dogs (embedding_status)
  where embedding_status in ('pending', 'failed');

-- ----------------------------------------------------------------------------
-- dog_photos
-- ----------------------------------------------------------------------------

create index dog_photos_dog_idx on public.dog_photos (dog_id);

-- Máximo una foto principal por reporte.
create unique index dog_photos_one_primary
  on public.dog_photos (dog_id) where is_primary;

-- HNSW con distancia coseno: el índice vectorial. Es parcial (solo fotos con
-- embedding) y se elige HNSW sobre IVFFlat porque tolera inserciones
-- continuas sin re-entrenar y su recall es estable (ADR-0005).
-- Parámetros por defecto (m=16, ef_construction=64): suficientes hasta
-- cientos de miles de vectores; ajustar es un REINDEX, no un rediseño.
-- NOTA: en el MVP la búsqueda usa KNN exacto sobre el subconjunto geo-filtrado
-- (recall perfecto); este índice sirve a futuras búsquedas globales y a la
-- detección de duplicados. Ver ADR-0005.
create index dog_photos_embedding_hnsw
  on public.dog_photos using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- ----------------------------------------------------------------------------
-- matches / events / contacts / notifications
-- ----------------------------------------------------------------------------

create index matches_lost_idx on public.matches (dog_lost_id);
create index matches_found_idx on public.matches (dog_found_id);
create index matches_status_idx on public.matches (status);

-- El embudo de producto se lee de events por tipo y tiempo.
create index events_type_time_idx on public.events (event_type, occurred_at desc);
create index events_dog_idx on public.events (dog_id) where dog_id is not null;
create index events_match_idx on public.events (match_id) where match_id is not null;

-- Dedupe y rate-limit por contacto sin exponer el dato (se busca por hash).
create index contacts_hash_idx on public.contacts (value_hash);

-- Cola de envío: solo interesan las pendientes o fallidas.
create index notifications_pending_idx
  on public.notifications (status, created_at)
  where status in ('queued', 'failed');

-- ----------------------------------------------------------------------------
-- Triggers de updated_at
-- ----------------------------------------------------------------------------

create trigger dogs_set_updated_at
  before update on public.dogs
  for each row execute function public.set_updated_at();

create trigger institutions_set_updated_at
  before update on public.institutions
  for each row execute function public.set_updated_at();

create trigger matches_set_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

-- ============================================================================
-- LomitoDeVuelta · Migración 4 — Función match_candidates (capa 1 del matching)
-- ----------------------------------------------------------------------------
-- Recibe un reporte de referencia y devuelve hasta N candidatos del inventario
-- CONTRARIO (lost↔found) con datos crudos: mejor similitud visual entre pares
-- de fotos, distancia en metros y días transcurridos. NO puntúa: el score
-- multimodal (capa 2) vive en TypeScript (packages/matching, ADR-0004).
--
-- Estrategia (ADR-0005): geo primero con cota superior constante (usa el
-- índice GiST), radio dinámico por fila según días transcurridos (un perro se
-- desplaza ~1-3 km/día), y KNN exacto sobre el subconjunto resultante
-- (recall perfecto a escala MVP).
-- ============================================================================

create or replace function public.match_candidates(
  p_dog_id uuid,
  p_max_candidates int default 20
)
returns table (
  candidate_dog_id      uuid,
  candidate_report_type report_type,
  visual_similarity     real,     -- mejor similitud coseno entre pares de fotos; null si aún no hay embeddings
  best_photo_id         uuid,     -- foto del candidato que produjo esa similitud
  distance_meters       real,
  days_between          int,      -- firmado: fecha_hallazgo - fecha_extravío (negativo = incoherente)
  attributes            jsonb,
  distinctive_marks     text,
  marks_tags            text[],
  event_date            date
)
language sql
stable
as $$
with reference as (
  select d.id, d.report_type, d.geo_point, d.event_date
  from public.dogs d
  where d.id = p_dog_id
),
params as (
  select
    (geo_config->>'base_radius_km')::float as base_km,
    (geo_config->>'km_per_day')::float     as km_per_day,
    (geo_config->>'max_radius_km')::float  as max_km,
    (geo_config->>'max_days_window')::int  as max_days
  from public.matching_params
  where is_active
  limit 1
),
ref_photos as (
  select p.embedding, p.embedding_model_version
  from public.dog_photos p
  join reference r on p.dog_id = r.id
  where p.embedding is not null
),
candidates as (
  select
    c.id, c.report_type, c.attributes, c.distinctive_marks, c.marks_tags,
    c.event_date,
    st_distance(c.geo_point, r.geo_point) as dist_m,
    -- Días firmados desde la perspectiva perdido→encontrado.
    case when r.report_type = 'lost'
         then c.event_date - r.event_date
         else r.event_date - c.event_date
    end as days_signed
  from public.dogs c
  cross join reference r
  cross join params p
  where c.report_type <> r.report_type          -- inventario contrario
    and c.id <> r.id
    and c.status = 'active'
    and c.moderation_status = 'approved'
    and c.deleted_at is null
    and abs(c.event_date - r.event_date) <= p.max_days
    -- Cota superior CONSTANTE: permite usar el índice GiST.
    and st_dwithin(c.geo_point, r.geo_point, p.max_km * 1000)
    -- Radio dinámico por fila: a más días transcurridos, más lejos pudo llegar.
    and st_dwithin(
          c.geo_point, r.geo_point,
          least(p.max_km,
                p.base_km + p.km_per_day * abs(c.event_date - r.event_date)) * 1000)
)
select
  c.id,
  c.report_type,
  vs.visual_similarity::real,
  vs.best_photo_id,
  c.dist_m::real,
  c.days_signed,
  c.attributes,
  c.distinctive_marks,
  c.marks_tags,
  c.event_date
from candidates c
-- KNN exacto: compara TODOS los pares de fotos (referencia × candidato) de la
-- misma versión de modelo y se queda con la mejor similitud. Con ~5 fotos por
-- reporte y cientos de candidatos geo-filtrados, esto es milisegundos.
left join lateral (
  select
    max(1 - (cp.embedding <=> rp.embedding)) as visual_similarity,
    (array_agg(cp.id order by cp.embedding <=> rp.embedding))[1] as best_photo_id
  from public.dog_photos cp
  cross join ref_photos rp
  where cp.dog_id = c.id
    and cp.embedding is not null
    and cp.embedding_model_version = rp.embedding_model_version
) vs on true
order by coalesce(vs.visual_similarity, 0) desc, c.dist_m asc
limit p_max_candidates
$$;

-- Solo el backend (service_role) puede ejecutarla: los clientes nunca
-- consultan el motor directamente (ADR-0002).
revoke execute on function public.match_candidates(uuid, int) from public, anon, authenticated;
grant execute on function public.match_candidates(uuid, int) to service_role;

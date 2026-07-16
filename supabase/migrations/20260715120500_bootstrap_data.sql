-- ============================================================================
-- LomitoDeVuelta · Migración 6 — Datos de arranque
-- ----------------------------------------------------------------------------
-- Va como migración (no como seed de desarrollo) porque TODOS los entornos
-- necesitan una zona activa y una configuración de matching activa para que
-- el sistema funcione.
-- ============================================================================

-- Zona de lanzamiento: Ciudad de México (estrategia hiperlocal).
insert into public.zones (slug, name, country_code, timezone, center, radius_km)
values (
  'cdmx',
  'Ciudad de México',
  'MX',
  'America/Mexico_City',
  st_setsrid(st_makepoint(-99.1332, 19.4326), 4326)::geography,  -- Zócalo aprox.
  35
);

-- Parámetros iniciales del matching. TODO es hipótesis heurística documentada
-- en /docs/matching-engine.md; se calibra con el benchmark del Bloque 7
-- (anclas visuales) y con el feedback humano acumulado (pesos).
insert into public.matching_params
  (is_active, weights, thresholds, geo_config, embedding_model_version, notes)
values (
  true,
  '{"visual": 0.45, "attributes": 0.20, "spatiotemporal": 0.20, "marks": 0.15}',
  '{"show": 0.55, "notify": 0.72, "visual_floor": 0.70, "visual_ceil": 0.92}',
  '{"base_radius_km": 3, "km_per_day": 1.5, "max_radius_km": 20, "max_days_window": 60}',
  'siglip-base-768/v1',
  'Hipótesis inicial pre-benchmark. visual_floor/visual_ceil son las anclas de normalización de similitud coseno y DEBEN recalibrarse con fotos reales de perros antes del lanzamiento (Bloque 7). Los pesos se recalibran con feedback humano (~200 matches etiquetados).'
);

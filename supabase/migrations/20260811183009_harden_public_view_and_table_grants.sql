-- ============================================================================
-- LomitoDeVuelta · Migración 11 — Permisos de vistas y tablas sin políticas
-- ----------------------------------------------------------------------------
-- ⚠️ Esta migración se aplicó DIRECTO a producción el 2026-08-11 (segunda
-- tanda de hallazgos del linter, tras la migración 10) y nunca se versionó.
-- Se recupera aquí, byte por byte, tal como quedó registrada en
-- supabase_migrations.schema_migrations, para que `pnpm db:reset` reproduzca
-- producción. NO se modifica su contenido: si algo hay que cambiar, va en una
-- migración nueva (regla dura de CLAUDE.md).
--
-- Qué hace: RLS activo pero sin políticas ya niega el acceso de anon; aun así
-- el GRANT por defecto de Supabase deja la tabla "visible" en la API. Aquí se
-- revoca explícitamente, que es la postura deny-by-default del proyecto
-- (security-privacy.md §2), y se conceden solo las lecturas legítimas.
-- ============================================================================

-- Vista pública de perros: solo lectura para roles anónimos/autenticados.
revoke all on public.dogs_public from anon, authenticated;
grant select on public.dogs_public to anon, authenticated;

-- Cola de moderación: interna. Sin acceso público y sin bypass de RLS.
revoke all on public.moderation_queue from anon, authenticated;
alter view public.moderation_queue set (security_invoker = on);

-- Métricas de negocio: internas.
revoke all on public.metrics_funnel_weekly from anon, authenticated;
revoke all on public.metrics_costs_monthly from anon, authenticated;
revoke all on public.metrics_matching_quality from anon, authenticated;

-- Tablas sin políticas: negar explícitamente en vez de depender de RLS vacío.
revoke all on public.events from anon, authenticated;
revoke all on public.notifications from anon, authenticated;
revoke all on public.system_config from anon, authenticated;
revoke all on public.matching_params from anon, authenticated;

-- zones: lectura pública legítima, escritura no.
revoke all on public.zones from anon, authenticated;
grant select on public.zones to anon, authenticated;

-- spatial_ref_sys: tabla de referencia de PostGIS, solo lectura.
revoke all on public.spatial_ref_sys from anon, authenticated;
grant select on public.spatial_ref_sys to anon, authenticated;

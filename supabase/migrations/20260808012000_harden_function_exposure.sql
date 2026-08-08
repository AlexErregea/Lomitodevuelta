-- ============================================================================
-- LomitoDeVuelta · Migración 10 — Endurecer la exposición de funciones
-- ----------------------------------------------------------------------------
-- Hallazgos del linter de Supabase al desplegar el proyecto por primera vez.
-- Ninguno es explotable hoy, pero los tres son gratis de cerrar y el proyecto
-- maneja datos personales (LFPDPPP): la postura es cerrar por defecto.
--
-- 1. `trigger_on_report_created()` es SECURITY DEFINER y vive en `public`, así
--    que PostgREST la publica en /rest/v1/rpc/. Postgres rechaza invocar una
--    función de trigger directamente, pero no hay razón para ofrecerla: se
--    revoca. La invoca el trigger, que corre como dueño de la tabla.
--
-- 2. `set_updated_at()` y `match_candidates()` no fijan search_path. En una
--    función SECURITY DEFINER eso sería grave; aquí no lo son, pero un
--    search_path mutable permite que el llamante cambie a qué objetos se
--    resuelven los nombres sin cualificar. Se fija explícitamente.
--
-- NO se corrige aquí (deuda consciente): postgis, vector y pg_net quedaron en
-- el esquema `public` porque la migración 1 los crea sin cláusula `schema`.
-- Eso expone `spatial_ref_sys` y las funciones st_* por la API REST. Mover
-- PostGIS de esquema con columnas `geography` ya creadas no es una operación
-- soportada; el riesgo es bajo (catálogo estático de sistemas de coordenadas,
-- solo lectura) y la corrección real es crear las extensiones en `extensions`
-- desde la migración 1 la próxima vez que el esquema se levante de cero.
-- ============================================================================

-- 1) La función de trigger deja de ser invocable desde la API.
revoke execute on function public.trigger_on_report_created() from public, anon, authenticated;

-- 2) search_path fijo. `extensions` va en la lista porque ahí viven pgcrypto y
--    compañía; `public` porque es donde quedaron postgis y vector.
alter function public.set_updated_at() set search_path = public, extensions;
alter function public.match_candidates(uuid, int) set search_path = public, extensions;

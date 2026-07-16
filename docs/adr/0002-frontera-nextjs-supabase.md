# ADR-0002 — Frontera Next.js ↔ Supabase: interactivo en Vercel, búsqueda en SQL, asíncrono en Edge Functions

- **Estado**: Aceptado
- **Fecha**: 2026-07-15

## Contexto

Hay tres tipos de trabajo con requisitos distintos:

1. **Interactivo** (el usuario espera): alta de reportes, pipeline de visión del
   camino síncrono, búsqueda de candidatos, render de fichas y og:image.
2. **Consulta intensiva en datos**: geo-filtro + búsqueda vectorial sobre índices.
3. **Asíncrono** (el usuario ya se fue): matching proactivo al insertar, envío de
   notificaciones WhatsApp, webhook entrante de WhatsApp, reintentos.

Restricciones: Vercel Hobby limita la duración de funciones y el body a 4.5 MB;
las Edge Functions de Supabase corren Deno (DX de depuración más árida para un
no-programador); presupuesto ~0 hasta validar; latencia objetivo < 5 s percibidos.

## Decisión

**Cada tipo de trabajo en la pieza que mejor lo hace:**

1. **Interactivo → Next.js en Vercel** (Server Actions para mutaciones desde la UI,
   Route Handlers para endpoints consumidos por terceros o por polling). El cliente
   **nunca** habla con Postgres directamente: toda escritura pasa por el servidor con
   validación Zod. Las lecturas públicas (fichas) usan el cliente anon + RLS.
2. **Subida de fotos → directa del navegador a Supabase Storage con URL firmada**,
   generada por un Server Action. Evita el límite de 4.5 MB de Vercel y no consume
   cómputo del servidor. La foto se comprime client-side antes de subir.
3. **Búsqueda de candidatos → función SQL (`match_candidates`) invocada por RPC.**
   Geo-filtro PostGIS + top-K vectorial HNSW en una sola consulta, junto a los
   índices. Un viaje de red en lugar de traer miles de filas a JavaScript.
4. **Asíncrono → Supabase Edge Functions**, disparadas por Database Webhooks
   (alta nueva → matching proactivo → notificación) y por pg_cron (reintentos de
   embeddings fallidos, expiración de reportes). El webhook entrante de WhatsApp
   también aterriza aquí: vive junto a la base y no depende del despliegue de la web.
5. **El scoring (capa 2) es código del paquete `packages/matching`** y se ejecuta en
   quien lo necesite: el Route Handler en el camino síncrono, la Edge Function en el
   proactivo. Mismo código, dos puntos de entrada — por eso el paquete es puro.

## Consecuencias

- (+) Todo cabe en capas gratuitas: Vercel Hobby + Supabase Free (500K invocaciones
  de Edge Functions/mes sobran para el MVP).
- (+) El camino síncrono cumple el presupuesto de latencia: la parte lenta
  (inferencia externa) corre en paralelo y la búsqueda es un solo RPC.
- (+) Las notificaciones no dependen de que la web esté desplegada o despierta.
- (−) Dos runtimes (Node en Vercel, Deno en Supabase). Mitigación: los paquetes
  compartidos son TypeScript puro sin I/O (regla del ADR-0001), y cada Edge Function
  se mantiene deliberadamente corta (< 100 líneas, orquestación solamente).
- (−) Los secretos viven en dos lugares (Vercel env vars, Supabase secrets). Se
  documenta un inventario único de secretos en `.env.example` con dónde vive cada uno.
- Camino de evolución: si el volumen asíncrono crece (colas reales, prioridades),
  el paso natural es `pgmq` o un worker dedicado — las Edge Functions ya son solo
  orquestación, así que moverlas es barato. **Fase posterior.**

## Alternativas descartadas

1. **Todo en Next.js (también lo asíncrono, con `waitUntil` o QStash)** — Rechazado:
   `waitUntil` en Hobby no garantiza ejecución larga ni reintentos; QStash añade un
   proveedor más que configurar y pagar. Además el matching proactivo pertenece
   conceptualmente a la base ("cuando se inserte X, haz Y").
2. **Todo en Edge Functions de Supabase (Next.js solo como frontend estático)** —
   Rechazado: se pierde Server Actions, streaming y og:image de Next.js; la DX de
   Deno es peor para desarrollo AI-assisted (menos ecosistema, depuración más árida).
3. **Backend dedicado (Railway/Fly con Node o Python)** — Rechazado en MVP: una
   pieza más que desplegar, monitorear y pagar (~5-10 USD/mes mínimo), sin necesidad
   real hasta que exista un modelo de ML propio. Marcado como opción de fase
   posterior para el servicio de scoring aprendido.
4. **Búsqueda de candidatos en JavaScript (traer filas y filtrar en el servidor)** —
   Rechazado: mover miles de embeddings por la red rompe la latencia y el costo;
   los índices existen precisamente para esto.

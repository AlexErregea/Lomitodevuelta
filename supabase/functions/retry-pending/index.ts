// ============================================================================
// Edge Function: retry-pending — red de seguridad del pipeline (ADR-0003)
// ----------------------------------------------------------------------------
// Disparador: pg_cron cada 5 minutos.
// Qué hará (Bloque 7):
//   · dogs con embedding_status IN ('pending','failed') y attempts < máx →
//     reintentar embedding + extracción (con backoff); al completar, disparar
//     el matching proactivo normal. Regla de oro: una inferencia fallida
//     jamás pierde un reporte.
//   · notifications con status 'failed' → reintentar envío; al agotar
//     intentos, fallback a email si hay (ADR-0008).
// ============================================================================

Deno.serve((_req) => {
  // TODO(Bloque 7): implementar reintentos con backoff.
  return new Response(
    JSON.stringify({ error: { code: 'internal_error', message: 'No implementado (Bloque 7)' } }),
    { status: 501, headers: { 'Content-Type': 'application/json' } },
  );
});

// ============================================================================
// Edge Function: on-report-created — capa 3 del matching (proactiva)
// ----------------------------------------------------------------------------
// Disparador: Database Webhook al completarse el embedding de un reporte.
// Qué hará (Bloque 7, según docs/matching-engine.md §2):
//   1. Validar el secreto compartido (EDGE_WEBHOOK_SECRET).
//   2. RPC match_candidates(dog_id) → candidatos crudos (capa 1).
//   3. rankCandidates() de @lomito/matching (capa 2 — mismo código que la web).
//   4. score ≥ notify → INSERT matches (suggested) + notificaciones idempotentes.
// ============================================================================

Deno.serve((_req) => {
  // TODO(Bloque 7): implementar. Stub para que el despliegue de funciones exista.
  return new Response(
    JSON.stringify({ error: { code: 'internal_error', message: 'No implementado (Bloque 7)' } }),
    { status: 501, headers: { 'Content-Type': 'application/json' } },
  );
});

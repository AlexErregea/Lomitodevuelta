// ============================================================================
// Edge Function: lifecycle — ciclo de vida y retención (security-privacy.md §5)
// ----------------------------------------------------------------------------
// Disparador: pg_cron diario.
// Qué hará (Bloque 7):
//   · Reportes por vencer (~día 50) → notificación de renovación.
//   · expires_at vencido → status 'expired' (sale del matching y de lo público).
//   · Purga mensual: expirados/reunidos +30 días → anonimización (borra
//     contacts, manage_token_hash, finder_note; trunca geo a ~1 km). Los datos
//     del perro se conservan anónimos como dataset; los de la persona se purgan.
// ============================================================================

Deno.serve((_req) => {
  // TODO(Bloque 7): implementar expiración, avisos y purga.
  return new Response(
    JSON.stringify({ error: { code: 'internal_error', message: 'No implementado (Bloque 7)' } }),
    { status: 501, headers: { 'Content-Type': 'application/json' } },
  );
});

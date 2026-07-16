// ============================================================================
// Edge Function: whatsapp-webhook — entrada de Meta WhatsApp Cloud API
// ----------------------------------------------------------------------------
// Disparador: Meta (GET de verificación con WHATSAPP_WEBHOOK_VERIFY_TOKEN;
// POST de eventos firmado con X-Hub-Signature-256 → WHATSAPP_APP_SECRET).
// Qué hará (Bloque 7, según ADR-0008):
//   · Estados de entrega (sent/delivered/failed) → notifications.status;
//     la primera entrega marca contacts.verified_at (ADR-0006).
//   · Mensajes entrantes: respuestas de renovación, solicitudes de baja.
// ============================================================================

Deno.serve((_req) => {
  // TODO(Bloque 7): verificación GET de Meta + procesamiento de eventos POST.
  return new Response(
    JSON.stringify({ error: { code: 'internal_error', message: 'No implementado (Bloque 7)' } }),
    { status: 501, headers: { 'Content-Type': 'application/json' } },
  );
});

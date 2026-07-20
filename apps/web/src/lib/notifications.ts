import { WhatsAppNotificationProvider } from './providers/whatsapp';
import { optionalEnv } from './env';
import { supabaseAdmin } from './supabase-admin';

// ============================================================================
// Entrega del enlace de gestión (ADR-0006/0008). Ledger-first: la fila en
// `notifications` (idempotency_key única) nace ANTES de llamar al proveedor —
// un reintento jamás duplica un WhatsApp. El envío inline es best-effort:
// si las credenciales no están en este entorno o Meta falla, la fila queda
// 'queued'/'failed' y retry-pending (pg_cron) la reintenta o cae a email.
// ============================================================================

export async function enqueueManageLinkNotification(input: {
  dogId: string;
  contactId: string;
  channel: 'whatsapp' | 'email';
  /** E.164 o email — solo lo ve el servidor */
  to: string;
  manageUrl: string;
}): Promise<void> {
  const db = supabaseAdmin();
  const idempotencyKey = `manage_link:${input.dogId}`;

  const { data: row, error } = await db
    .from('notifications')
    .insert({
      idempotency_key: idempotencyKey,
      recipient_contact_id: input.contactId,
      channel: input.channel,
      template_key: 'manage_link',
      status: 'queued',
    })
    .select('id')
    .single();
  if (error) {
    // Clave duplicada = ya se encoló antes (reintento del cliente): correcto no reenviar.
    console.error(JSON.stringify({ msg: 'manage_link_enqueue_failed', error: error.message }));
    return;
  }

  // Envío inline solo por WhatsApp y solo si hay credenciales en este entorno
  // (el inventario canónico de estos secretos es Supabase; ponerlos también en
  // Vercel habilita la entrega inmediata — si no, retry-pending la hará ≤5 min).
  if (input.channel !== 'whatsapp' || !optionalEnv('WHATSAPP_ACCESS_TOKEN')) return;

  try {
    const provider = new WhatsAppNotificationProvider();
    const result = await provider.send({
      channel: 'whatsapp',
      to: input.to,
      template: 'manage_link',
      variables: { manage_url: input.manageUrl },
    });
    await db
      .from('notifications')
      .update({
        status: 'sent',
        provider_message_id: result.providerMessageId,
        sent_at: new Date().toISOString(),
      })
      .eq('id', row.id);
  } catch (err) {
    await db
      .from('notifications')
      .update({ status: 'failed', error: err instanceof Error ? err.message : String(err) })
      .eq('id', row.id);
  }
}

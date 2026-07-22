import { recordEvent } from './events';
import { sendNotification } from './notify';
import { supabaseAdmin } from './supabase-admin';

// ============================================================================
// El puente de contacto enmascarado (security-privacy.md §3, ADR-0006). Solo
// tras la DOBLE aceptación: el servidor envía a cada parte el contacto de la
// otra por su canal, con los copys anti-extorsión. El contacto real jamás se
// muestra en la web; se entrega por mensaje dirigido y queda auditado.
// ============================================================================

interface BridgeParty {
  contactId: string;
  channel: 'whatsapp' | 'email';
  /** Valor real (E.164 o email) — solo lo ve el servidor */
  value: string;
  /** Cómo se le muestra a la contraparte (enmascarado si es teléfono largo) */
  display: string;
  emailFallback: { contactId: string; value: string } | null;
}

/** Abre el puente para un match ya aceptado por ambas partes. Idempotente. */
export async function openContactBridge(
  matchId: string,
  dogLostId: string,
  dogFoundId: string,
): Promise<boolean> {
  const lost = await loadParty(dogLostId);
  const found = await loadParty(dogFoundId);
  if (!lost || !found) return false;

  // A cada parte se le entrega el contacto de la OTRA.
  const sentToLost = await sendNotification({
    idempotencyKey: `reveal:${matchId}:${lost.contactId}`,
    contactId: lost.contactId,
    channel: lost.channel,
    to: lost.value,
    matchId,
    template: 'contact_reveal',
    variables: { counterpart_contact: found.value },
    fallbackEmail: lost.emailFallback
      ? { contactId: lost.emailFallback.contactId, to: lost.emailFallback.value }
      : null,
  });
  const sentToFound = await sendNotification({
    idempotencyKey: `reveal:${matchId}:${found.contactId}`,
    contactId: found.contactId,
    channel: found.channel,
    to: found.value,
    matchId,
    template: 'contact_reveal',
    variables: { counterpart_contact: lost.value },
    fallbackEmail: found.emailFallback
      ? { contactId: found.emailFallback.contactId, to: found.emailFallback.value }
      : null,
  });

  await recordEvent({
    eventType: 'contact_revealed',
    matchId,
    payload: { delivered_lost: sentToLost, delivered_found: sentToFound },
  });
  return true;
}

async function loadParty(dogId: string): Promise<BridgeParty | null> {
  const { data } = await supabaseAdmin()
    .from('contacts')
    .select('id, channel, value, display_mask')
    .eq('dog_id', dogId);
  const rows = (data ?? []) as Array<{
    id: string;
    channel: 'whatsapp' | 'email';
    value: string;
    display_mask: string;
  }>;
  if (rows.length === 0) return null;
  const primary = rows.find((r) => r.channel === 'whatsapp') ?? rows[0]!;
  const email = rows.find((r) => r.channel === 'email');
  return {
    contactId: primary.id,
    channel: primary.channel,
    value: primary.value,
    display: primary.display_mask,
    emailFallback: email && primary.channel === 'whatsapp' ? { contactId: email.id, value: email.value } : null,
  };
}

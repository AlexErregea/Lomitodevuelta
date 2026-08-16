import { WhatsAppNotificationProvider } from './providers/whatsapp';
import { optionalEnv } from './env';
import { supabaseAdmin } from './supabase-admin';

// ============================================================================
// Sender de notificaciones del servidor (ADR-0008), contraparte Node del
// _shared/notify.ts de las Edge Functions: ledger idempotente + kill-switch
// de presupuesto + fallback a email. La idempotencia la da la columna única
// idempotency_key.
// ============================================================================

export interface ServerNotifyInput {
  idempotencyKey: string;
  contactId: string;
  channel: 'whatsapp' | 'email';
  to: string;
  matchId?: string;
  template: string;
  variables: Record<string, string>;
  fallbackEmail?: { contactId: string; to: string } | null;
}

/** Tope por defecto si system_config no responde: nunca "sin límite". */
const FALLBACK_MAX_MESSAGES_PER_CONTACT_DAY = 3;

/**
 * ¿Este destino ya recibió sus mensajes del día? (S3-A.3)
 *
 * Cuenta por `value_hash`, no por reporte: si alguien crea diez reportes con
 * el número de una víctima para bombardearla, los diez comparten cupo. Es la
 * defensa que protege a la vez a la persona y al número de WhatsApp del
 * proyecto (una racha de bloqueos hunde el quality rating de Meta).
 */
export async function contactCapReached(contactId: string): Promise<boolean> {
  const db = supabaseAdmin();
  const [{ data: config }, { data: sentToday }] = await Promise.all([
    db.from('system_config').select('max_messages_per_contact_per_day').eq('id', true).maybeSingle(),
    db.rpc('notifications_last_day_for_contact', { p_contact_id: contactId }),
  ]);
  const max =
    (config?.max_messages_per_contact_per_day as number | undefined) ??
    FALLBACK_MAX_MESSAGES_PER_CONTACT_DAY;
  const used = typeof sentToday === 'number' ? sentToday : 0;
  if (used >= max) {
    console.warn(JSON.stringify({ msg: 'contact_cap_reached', contactId, used, max }));
    return true;
  }
  return false;
}

/**
 * ¿WhatsApp indisponible? Pausa manual del kill-switch O presupuesto agotado.
 *
 * El presupuesto se evalúa AQUÍ, antes de cada envío (S3-A.4). Antes solo lo
 * revisaba `lifecycle` una vez al día, lo que dejaba una ventana de hasta 24 h
 * para gastar por encima del tope — justo el escenario que el kill-switch
 * existe para evitar. Al agotarse se persiste `whatsapp_paused` para que todo
 * el sistema (incluidas las Edge Functions) lo vea en el acto.
 */
async function whatsappUnavailable(): Promise<boolean> {
  const db = supabaseAdmin();
  const { data: config } = await db
    .from('system_config')
    .select('whatsapp_paused, monthly_message_budget')
    .eq('id', true)
    .maybeSingle();
  if (!config) return false;
  if (config.whatsapp_paused) return true;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { count } = await db
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('channel', 'whatsapp')
    .in('status', ['sent', 'delivered'])
    .gte('created_at', monthStart.toISOString());

  const used = count ?? 0;
  const budget = config.monthly_message_budget as number;
  if (used < budget) return false;

  console.warn(JSON.stringify({ msg: 'budget_exhausted_pausing_whatsapp', used, budget }));
  await db.from('system_config').update({ whatsapp_paused: true }).eq('id', true);
  return true;
}

export async function sendNotification(input: ServerNotifyInput): Promise<boolean> {
  const db = supabaseAdmin();

  // Tope anti-bombardeo antes del ledger: un mensaje que no se va a enviar
  // tampoco debe ocupar su clave de idempotencia (si no, el destinatario
  // quedaría sin ese aviso para siempre, no solo hoy).
  if (await contactCapReached(input.contactId)) return false;

  const { data: row } = await db
    .from('notifications')
    .insert({
      idempotency_key: input.idempotencyKey,
      recipient_contact_id: input.contactId,
      match_id: input.matchId ?? null,
      channel: input.channel,
      template_key: input.template,
      status: 'queued',
    })
    .select('id')
    .single();
  if (!row) return false; // clave duplicada = ya se manejó

  let channel = input.channel;
  let to = input.to;
  let notificationId = row.id as string;

  if (channel === 'whatsapp' && (await whatsappUnavailable())) {
    if (!input.fallbackEmail) return false; // queda 'queued'; retry-pending revisará
    const { data: emailRow } = await db
      .from('notifications')
      .insert({
        idempotency_key: `${input.idempotencyKey}:email`,
        recipient_contact_id: input.fallbackEmail.contactId,
        match_id: input.matchId ?? null,
        channel: 'email',
        template_key: input.template,
        status: 'queued',
      })
      .select('id')
      .single();
    if (!emailRow) return false;
    channel = 'email';
    to = input.fallbackEmail.to;
    notificationId = emailRow.id as string;
  }

  try {
    if (channel === 'whatsapp' && optionalEnv('WHATSAPP_ACCESS_TOKEN')) {
      const provider = new WhatsAppNotificationProvider();
      const result = await provider.send({
        channel: 'whatsapp',
        to,
        template: input.template as never,
        variables: input.variables,
      });
      await db
        .from('notifications')
        .update({ status: 'sent', provider_message_id: result.providerMessageId, sent_at: new Date().toISOString() })
        .eq('id', notificationId);
      return true;
    }
    if (channel === 'email' && optionalEnv('RESEND_API_KEY')) {
      await sendEmail(to, input.template, input.variables);
      await db
        .from('notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', notificationId);
      return true;
    }
    // Sin credenciales en este entorno: queda 'queued' y retry-pending lo enviará.
    return false;
  } catch (err) {
    await db
      .from('notifications')
      .update({ status: 'failed', error: err instanceof Error ? err.message : String(err) })
      .eq('id', notificationId);
    return false;
  }
}

async function sendEmail(to: string, template: string, variables: Record<string, string>): Promise<void> {
  const body = EMAIL_BODIES[template]?.(variables);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${optionalEnv('RESEND_API_KEY') ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: optionalEnv('RESEND_FROM') ?? 'LomitoDeVuelta <onboarding@resend.dev>',
      to,
      subject: body?.subject ?? 'LomitoDeVuelta',
      html: body?.html ?? '<p>Tienes una novedad en tu reporte.</p>',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Resend respondió ${response.status}: ${await response.text()}`);
}

const EMAIL_BODIES: Record<string, (v: Record<string, string>) => { subject: string; html: string }> = {
  contact_reveal: (v) => ({
    subject: 'Contacto de la coincidencia — LomitoDeVuelta',
    html: `<p>Ambas partes aceptaron. Contacto de la otra persona: <strong>${v.counterpart_contact}</strong></p><p>⚠️ Nunca deposites dinero por adelantado. Si te piden un pago para "devolverte" a tu perro, es extorsión: repórtalo. Acuerden verse en un lugar público o una veterinaria aliada.</p>`,
  }),
};

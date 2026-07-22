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

async function isWhatsAppPaused(): Promise<boolean> {
  const { data } = await supabaseAdmin()
    .from('system_config')
    .select('whatsapp_paused')
    .eq('id', true)
    .maybeSingle();
  return Boolean(data?.whatsapp_paused);
}

export async function sendNotification(input: ServerNotifyInput): Promise<boolean> {
  const db = supabaseAdmin();
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

  if (channel === 'whatsapp' && (await isWhatsAppPaused())) {
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

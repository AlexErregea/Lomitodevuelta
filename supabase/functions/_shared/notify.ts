import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { optionalEnv, requireEnv } from './env.ts';
import { sendWhatsAppTemplate } from './whatsapp.ts';

// ============================================================================
// Envío de notificaciones desde Edge Functions con las tres garantías del
// ADR-0008: ledger idempotente, respeto del kill-switch de presupuesto, y
// fallback a email. La idempotencia la da la columna única idempotency_key:
// un reintento o un disparo duplicado JAMÁS produce un segundo mensaje.
// ============================================================================

export interface NotifyInput {
  db: SupabaseClient;
  idempotencyKey: string;
  contactId: string;
  channel: 'whatsapp' | 'email';
  /** E.164 o email (solo lo ve el servidor) */
  to: string;
  matchId?: string;
  template: string;
  variables: Record<string, string>;
  /** Si el kill-switch pausó WhatsApp, se intenta este email en su lugar */
  fallbackEmail?: { contactId: string; to: string } | null;
}

/** ¿WhatsApp pausado por el kill-switch de presupuesto? (ADR-0008) */
export async function isWhatsAppPaused(db: SupabaseClient): Promise<boolean> {
  const { data } = await db.from('system_config').select('whatsapp_paused').eq('id', true).single();
  return Boolean(data?.whatsapp_paused);
}

/**
 * Crea la fila del ledger (si no existe) y envía. Devuelve true si envió.
 * Un idempotency_key ya presente = ya se manejó: no hace nada.
 */
export async function notify(input: NotifyInput): Promise<boolean> {
  const { db } = input;

  // 1) Ledger primero: la unicidad de idempotency_key previene el duplicado.
  const { data: row, error } = await db
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
  if (error || !row) return false; // conflicto de clave = ya encolado antes

  // 2) Kill-switch: si WhatsApp está pausado, desvía a email cuando se pueda.
  let channel = input.channel;
  let to = input.to;
  let notificationId = row.id as string;
  if (channel === 'whatsapp' && (await isWhatsAppPaused(db))) {
    if (input.fallbackEmail) {
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
    } else {
      return false; // sin email: queda 'queued'; retry-pending lo revisará
    }
  }

  // 3) Envío.
  try {
    if (channel === 'whatsapp') {
      const providerMessageId = await sendWhatsAppTemplate(to, input.template, input.variables);
      await db
        .from('notifications')
        .update({ status: 'sent', provider_message_id: providerMessageId, sent_at: new Date().toISOString() })
        .eq('id', notificationId);
    } else {
      await sendEmail(to, input.template, input.variables);
      await db
        .from('notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', notificationId);
    }
    return true;
  } catch (err) {
    await db.from('notifications').update({ status: 'failed', error: String(err) }).eq('id', notificationId);
    return false;
  }
}

/** Email plano (Resend, ADR-0008 fallback). Sin plantillas HTML ricas en MVP. */
async function sendEmail(to: string, template: string, variables: Record<string, string>): Promise<void> {
  const apiKey = optionalEnv('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY no configurada.');
  const { subject, html } = EMAIL_BODIES[template]?.(variables) ?? {
    subject: 'LomitoDeVuelta',
    html: '<p>Tienes una novedad en tu reporte.</p>',
  };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: optionalEnv('RESEND_FROM') ?? 'LomitoDeVuelta <onboarding@resend.dev>',
      to,
      subject,
      html,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Resend respondió ${response.status}: ${await response.text()}`);
}

const EMAIL_BODIES: Record<string, (v: Record<string, string>) => { subject: string; html: string }> = {
  match_found: (v) => ({
    subject: '🐕 Hay una posible coincidencia — LomitoDeVuelta',
    html: `<p>Encontramos un reporte que podría coincidir con el tuyo.</p><p><a href="${v.share_url}">Ver la ficha</a>. Abre tu enlace de gestión para aceptar o descartar.</p>`,
  }),
  renewal_reminder: (v) => ({
    subject: 'Tu reporte vence pronto — ¿lo renuevas?',
    html: `<p>Tu reporte sigue en búsqueda pero vence pronto.</p><p><a href="${v.manage_url}">Renovar 60 días más</a></p>`,
  }),
  contact_reveal: (v) => ({
    subject: 'Contacto de la coincidencia — LomitoDeVuelta',
    html: `<p>Ambas partes aceptaron. Contacto de la otra persona: <strong>${v.counterpart_contact}</strong></p><p>⚠️ Nunca deposites dinero por adelantado. Si te piden un pago para "devolverte" a tu perro, es extorsión: repórtalo. Acuerden verse en un lugar público o una veterinaria aliada.</p>`,
  }),
};

/** Cuántas notificaciones de match recibió hoy un reporte (anti-spam, §4.3). */
export async function matchNotificationsTodayForDog(db: SupabaseClient, dogId: string): Promise<number> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { data: contacts } = await db.from('contacts').select('id').eq('dog_id', dogId);
  const contactIds = (contacts ?? []).map((c) => c.id as string);
  if (contactIds.length === 0) return 0;
  const { count } = await db
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('template_key', 'match_found')
    .in('recipient_contact_id', contactIds)
    .gte('created_at', since.toISOString());
  return count ?? 0;
}

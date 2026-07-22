// ============================================================================
// Edge Function: lifecycle — ciclo de vida y retención (security-privacy.md §5)
// ----------------------------------------------------------------------------
// Disparador: pg_cron diario. Cuatro tareas:
//   1. Reportes por vencer (~día 50) → aviso de renovación (una vez por vigencia).
//   2. expires_at vencido → status 'expired' (sale del matching y de lo público).
//   3. Purga mensual: expirados/reunidos +30 días → anonimización en firme
//      (RPC purge_personal_data, migración 9).
//   4. Kill-switch de presupuesto (ADR-0008): cuenta los mensajes de pago del
//      mes; al 80% avisa (log del fundador), al 100% pausa WhatsApp. Se
//      auto-reactiva cuando el mes cambia y el consumo baja del presupuesto.
// ============================================================================

import { adminClient } from '../_shared/db.ts';
import { requireEnv } from '../_shared/env.ts';
import { buildManageUrl, generateManageToken, hashManageToken } from '../_shared/manage-token.ts';
import { notify } from '../_shared/notify.ts';

/** Días antes del vencimiento en que se ofrece renovar. */
const RENEWAL_REMINDER_DAYS = 10;
const BUDGET_ALERT_FRACTION = 0.8;

Deno.serve(async (req) => {
  if (req.headers.get('authorization') !== `Bearer ${requireEnv('EDGE_WEBHOOK_SECRET')}`) {
    return json({ error: { code: 'unauthorized', message: 'Secreto inválido.' } }, 401);
  }
  const db = adminClient();
  const summary = { reminded: 0, expired: 0, purged: 0, whatsappPaused: false };

  // -------------------------------------------------------------------------
  // 1) Avisos de renovación (~10 días antes de vencer)
  // -------------------------------------------------------------------------
  const soon = new Date(Date.now() + RENEWAL_REMINDER_DAYS * 24 * 3600 * 1000).toISOString();
  const { data: expiring } = await db
    .from('dogs')
    .select('id, expires_at')
    .eq('status', 'active')
    .is('deleted_at', null)
    .not('expires_at', 'is', null)
    .lt('expires_at', soon)
    .gt('expires_at', new Date().toISOString());

  const appBaseUrl = requireEnv('APP_BASE_URL');
  for (const dog of expiring ?? []) {
    const { data: contact } = await db
      .from('contacts')
      .select('id, channel, value')
      .eq('dog_id', dog.id)
      .order('channel', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!contact) continue;

    // El enlace de gestión no es reconstruible (solo hay hash): se emite uno
    // nuevo y se entrega en el mismo aviso (ADR-0006). idempotency por vigencia.
    const expiresEpoch = Math.floor(new Date(dog.expires_at as string).getTime() / 1000);
    const token = generateManageToken();
    const sent = await notify({
      db,
      idempotencyKey: `renewal:${dog.id}:${expiresEpoch}`,
      contactId: contact.id as string,
      channel: contact.channel as 'whatsapp' | 'email',
      to: contact.value as string,
      template: 'renewal_reminder',
      variables: { manage_url: buildManageUrl(appBaseUrl, dog.id as string, token) },
    });
    // Solo rota el token si el aviso realmente salió (no invalidar el enlace en balde).
    if (sent) {
      await db.from('dogs').update({ manage_token_hash: await hashManageToken(token) }).eq('id', dog.id);
      summary.reminded++;
    }
  }

  // -------------------------------------------------------------------------
  // 2) Expiración
  // -------------------------------------------------------------------------
  const { data: expiredRows } = await db
    .from('dogs')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .lt('expires_at', new Date().toISOString())
    .select('id');
  summary.expired = (expiredRows ?? []).length;
  for (const row of expiredRows ?? []) {
    await db.from('events').insert({ event_type: 'report_expired', actor_type: 'system', dog_id: row.id });
  }

  // -------------------------------------------------------------------------
  // 3) Purga de datos personales (+30 días)
  // -------------------------------------------------------------------------
  const { data: purgedCount } = await db.rpc('purge_personal_data');
  summary.purged = typeof purgedCount === 'number' ? purgedCount : 0;

  // -------------------------------------------------------------------------
  // 4) Kill-switch de presupuesto (ADR-0008)
  // -------------------------------------------------------------------------
  const { data: config } = await db.from('system_config').select('*').eq('id', true).single();
  if (config) {
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
    const shouldPause = used >= budget;
    const currentMonth = monthStart.toISOString().slice(0, 7); // YYYY-MM

    const patch: Record<string, unknown> = {};
    // Auto-reactiva/desactiva según el consumo del mes vigente.
    if (shouldPause !== config.whatsapp_paused) patch.whatsapp_paused = shouldPause;
    summary.whatsappPaused = shouldPause;

    if (used >= budget * BUDGET_ALERT_FRACTION && config.budget_alerted_month !== currentMonth) {
      // Aviso al fundador: en MVP queda en el log de la función (la observabilidad
      // primaria es la vista metrics_costs_monthly; §4-§5). Sin plantilla de
      // marketing propia para no arriesgar el número (ADR-0008).
      console.warn(
        JSON.stringify({ msg: 'budget_alert', used, budget, month: currentMonth, founder: config.founder_whatsapp ?? null }),
      );
      patch.budget_alerted_month = currentMonth;
    }
    if (Object.keys(patch).length > 0) {
      await db.from('system_config').update(patch).eq('id', true);
    }
  }

  return json(summary, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

// ============================================================================
// Edge Function: whatsapp-webhook — webhook de Meta (ADR-0008)
// ----------------------------------------------------------------------------
//   GET  → verificación del endpoint (Meta repite el verify token).
//   POST → estados de entrega (sent/delivered/failed) firmados con
//          X-Hub-Signature-256 → actualiza el ledger `notifications`;
//          la PRIMERA entrega al contacto marca contacts.verified_at:
//          la entrega ES la verificación del número (ADR-0006).
//   Los mensajes entrantes (renovación, baja) llegan aquí también: se
//   responden 200 y se procesarán en el Sprint 3 (lifecycle).
// ============================================================================

import { adminClient } from '../_shared/db.ts';
import { requireEnv } from '../_shared/env.ts';

/** Estados del proveedor → estados del ledger. 'read' no aporta sobre 'delivered'. */
const STATUS_MAP: Record<string, 'sent' | 'delivered' | 'failed' | null> = {
  sent: 'sent',
  delivered: 'delivered',
  read: 'delivered',
  failed: 'failed',
};

/** Orden de progreso: nunca degradar un estado (p. ej. delivered → sent). */
const STATUS_RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, failed: 1 };

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ---- Verificación del endpoint (una sola vez, al configurarlo en Meta) ----
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === requireEnv('WHATSAPP_WEBHOOK_VERIFY_TOKEN') && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  // ---- Validación de firma (X-Hub-Signature-256 sobre el cuerpo crudo) -----
  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature-256');
  if (!signature || !(await verifySignature(rawBody, signature))) {
    return new Response('invalid signature', { status: 401 });
  }

  const db = adminClient();
  const payload = JSON.parse(rawBody) as {
    entry?: Array<{ changes?: Array<{ value?: { statuses?: Array<{ id: string; status: string }> } }> }>;
  };

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        const mapped = STATUS_MAP[status.status] ?? null;
        if (!mapped) continue;

        const { data: notification } = await db
          .from('notifications')
          .select('id, status, recipient_contact_id')
          .eq('provider_message_id', status.id)
          .maybeSingle();
        if (!notification) continue;

        const currentRank = STATUS_RANK[notification.status as string] ?? 0;
        const newRank = STATUS_RANK[mapped] ?? 0;
        if (mapped === 'failed' || newRank > currentRank) {
          await db.from('notifications').update({ status: mapped }).eq('id', notification.id);
        }

        // La entrega verifica el número sin OTP ni fricción (ADR-0006).
        if (mapped === 'delivered') {
          await db
            .from('contacts')
            .update({ verified_at: new Date().toISOString() })
            .eq('id', notification.recipient_contact_id)
            .is('verified_at', null);
        }
      }
      // TODO(Sprint 3): procesar change.value.messages (renovación/baja por chat).
    }
  }

  // Meta espera 200 rápido; un fallo interno no debe provocar reintentos infinitos.
  return new Response('ok', { status: 200 });
});

/** HMAC-SHA256 del cuerpo con WHATSAPP_APP_SECRET, comparación en tiempo constante. */
async function verifySignature(rawBody: string, header: string): Promise<boolean> {
  const expectedPrefix = 'sha256=';
  if (!header.startsWith(expectedPrefix)) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(requireEnv('WHATSAPP_APP_SECRET')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const expected =
    expectedPrefix +
    Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  if (expected.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
  }
  return diff === 0;
}

import { requireEnv } from './env.ts';

// ============================================================================
// Envío por WhatsApp Cloud API desde Edge Functions (ADR-0008). Espejo de
// apps/web/src/lib/providers/whatsapp.ts — la idempotencia la garantiza el
// ledger `notifications` ANTES de llamar aquí.
// ============================================================================

const GRAPH_API_VERSION = 'v20.0';

const TEMPLATE_VARIABLE_ORDER: Record<string, string[]> = {
  manage_link: ['manage_url'],
  match_found: ['share_url'],
  contact_reveal: ['counterpart_contact'],
  renewal_reminder: ['manage_url'],
};

export async function sendWhatsAppTemplate(
  to: string,
  template: string,
  variables: Record<string, string>,
): Promise<string> {
  const order = TEMPLATE_VARIABLE_ORDER[template];
  if (!order) throw new Error(`Plantilla desconocida: ${template}`);
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${requireEnv('WHATSAPP_PHONE_NUMBER_ID')}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requireEnv('WHATSAPP_ACCESS_TOKEN')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: template,
          language: { code: 'es_MX' },
          components: [
            {
              type: 'body',
              parameters: order.map((name) => ({ type: 'text', text: variables[name] ?? '' })),
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) {
    throw new Error(`WhatsApp Cloud API respondió ${response.status}: ${await response.text()}`);
  }
  const body = (await response.json()) as { messages?: Array<{ id: string }> };
  const id = body.messages?.[0]?.id;
  if (!id) throw new Error('WhatsApp no devolvió ID de mensaje.');
  return id;
}

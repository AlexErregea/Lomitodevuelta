import type {
  NotificationProvider,
  SendNotificationInput,
  SendNotificationResult,
} from '@lomito/shared';
import { requireEnv } from '../env';

// ============================================================================
// NotificationProvider con Meta WhatsApp Cloud API directo (ADR-0008).
// La idempotencia NO vive aquí: la garantiza el ledger `notifications`
// (idempotency_key única) ANTES de llamar a send(). Las plantillas deben
// estar aprobadas en el Business Manager de Meta (guia-whatsapp-setup.md).
// ============================================================================

const GRAPH_API_VERSION = 'v20.0';

/** Variables posicionales {{1}}, {{2}}… por plantilla, en orden. */
const TEMPLATE_VARIABLE_ORDER: Record<string, string[]> = {
  manage_link: ['manage_url'],
  match_found: ['share_url'],
  contact_reveal: ['counterpart_contact'],
  renewal_reminder: ['manage_url'],
};

export class WhatsAppNotificationProvider implements NotificationProvider {
  async send(input: SendNotificationInput): Promise<SendNotificationResult> {
    if (input.channel !== 'whatsapp') {
      throw new Error(`WhatsAppNotificationProvider no maneja el canal ${input.channel}.`);
    }
    const phoneNumberId = requireEnv('WHATSAPP_PHONE_NUMBER_ID');
    const order = TEMPLATE_VARIABLE_ORDER[input.template];
    if (!order) throw new Error(`Plantilla desconocida: ${input.template}`);

    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${requireEnv('WHATSAPP_ACCESS_TOKEN')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: input.to.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: input.template,
            language: { code: 'es_MX' },
            components: [
              {
                type: 'body',
                parameters: order.map((name) => ({
                  type: 'text',
                  text: input.variables[name] ?? '',
                })),
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
    const providerMessageId = body.messages?.[0]?.id;
    if (!providerMessageId) throw new Error('WhatsApp no devolvió ID de mensaje.');
    return { providerMessageId };
  }
}

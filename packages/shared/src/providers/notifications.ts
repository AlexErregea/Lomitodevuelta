import type { ContactChannel } from '../api/schemas';

// ============================================================================
// Interfaz del proveedor de notificaciones (ADR-0008).
// Implementación MVP: Meta WhatsApp Cloud API directo + Resend como fallback.
// La idempotencia NO vive aquí: la garantiza el ledger `notifications`
// (idempotency_key única) antes de llamar a esta interfaz.
// ============================================================================

/** Plantillas aprobadas del sistema. Añadir una = aprobarla en Meta primero. */
export type NotificationTemplate =
  | 'manage_link' // entrega del enlace de gestión (verifica el número, ADR-0006)
  | 'match_found' // hay una coincidencia para tu reporte
  | 'contact_reveal' // doble aceptación: contacto de la contraparte + guía segura
  | 'renewal_reminder'; // tu reporte vence pronto, ¿renovar?

export interface SendNotificationInput {
  channel: ContactChannel;
  /** E.164 o email según el canal (el valor real solo lo ve el servidor) */
  to: string;
  template: NotificationTemplate;
  /** Variables de la plantilla (nombres definidos por plantilla) */
  variables: Record<string, string>;
}

export interface SendNotificationResult {
  /** ID del mensaje en el proveedor (para conciliar webhooks de estado) */
  providerMessageId: string;
}

export interface NotificationProvider {
  send(input: SendNotificationInput): Promise<SendNotificationResult>;
}

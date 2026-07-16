import { z } from 'zod';
import { dogAttributesSchema, geoPointSchema, reportTypeSchema } from '../types/dog';

// ============================================================================
// Contratos de la API (docs/api-contracts.md). Los esquemas Zod validan los
// requests en el servidor; los tipos de response son interfaces (los
// construye el servidor, no hace falta validarlos en runtime).
// ============================================================================

// ----------------------------------------------------------------------------
// Códigos de error (envelope estable: { error: { code, message } })
// ----------------------------------------------------------------------------
export const errorCodeSchema = z.enum([
  'validation_error',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'inference_unavailable',
  'internal_error',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export interface ApiError {
  error: { code: ErrorCode; message: string };
}

// ----------------------------------------------------------------------------
// POST /api/uploads/sign
// ----------------------------------------------------------------------------
export const signUploadRequestSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/webp']),
});
export type SignUploadRequest = z.infer<typeof signUploadRequestSchema>;

export interface SignUploadResponse {
  uploadUrl: string;
  storagePath: string;
  expiresAt: string;
}

// ----------------------------------------------------------------------------
// POST /api/reports — Flujos A y B
// ----------------------------------------------------------------------------
export const contactChannelSchema = z.enum(['whatsapp', 'email']);
export type ContactChannel = z.infer<typeof contactChannelSchema>;

export const createReportRequestSchema = z.object({
  reportType: reportTypeSchema,
  /** 1..5 rutas devueltas por /api/uploads/sign */
  photoPaths: z.array(z.string()).min(1).max(5),
  /** Punto exacto: el servidor lo guarda privado y difumina lo público */
  geo: geoPointSchema,
  /** Fecha del extravío o hallazgo (ISO, YYYY-MM-DD) */
  eventDate: z.string().date(),
  contact: z.object({
    channel: contactChannelSchema,
    /** E.164 para whatsapp (+52...), email para email */
    value: z.string().min(5),
  }),
  /** Literal true: sin consentimiento expreso no hay reporte (LFPDPPP) */
  consentAccepted: z.literal(true),
  // Flujo A (opcionales; la IA los completa y el usuario corrige):
  attributes: dogAttributesSchema.optional(),
  distinctiveMarks: z.string().max(500).optional(),
  // Flujo B:
  finderNote: z.string().max(500).optional(),
});
export type CreateReportRequest = z.infer<typeof createReportRequestSchema>;

// ----------------------------------------------------------------------------
// Matches — aceptar / rechazar / confirmar reunión
// ----------------------------------------------------------------------------
export const matchSideSchema = z.enum(['lost', 'found']);
export type MatchSide = z.infer<typeof matchSideSchema>;

/** Prueba de propiedad ligera (security-privacy.md §6): solo el lado 'lost'. */
export const ownershipProofSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('historic_photo'), storagePath: z.string() }),
  z.object({ kind: z.literal('private_mark'), description: z.string().min(10).max(500) }),
]);
export type OwnershipProof = z.infer<typeof ownershipProofSchema>;

export const acceptMatchRequestSchema = z.object({
  side: matchSideSchema,
  ownershipProof: ownershipProofSchema.optional(),
});
export type AcceptMatchRequest = z.infer<typeof acceptMatchRequestSchema>;

export const rejectMatchRequestSchema = z.object({
  side: matchSideSchema,
  /** El motivo alimenta el dataset de calibración (ADR-0004) */
  reason: z.string().max(500).optional(),
});
export type RejectMatchRequest = z.infer<typeof rejectMatchRequestSchema>;

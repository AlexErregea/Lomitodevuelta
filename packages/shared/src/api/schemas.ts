import { z } from 'zod';
import { dogAttributesSchema, geoPointSchema, reportTypeSchema } from '../types/dog';
import type { DogAttributes, GeoPoint, ReportType } from '../types/dog';

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
  /**
   * Referencia humana de la zona ("Col. Roma Norte, Coyoacán"). La aporta quien
   * reporta sin GPS (elige alcaldía) o como precisión adicional; la ficha
   * pública la muestra en vez de las coordenadas difuminadas.
   */
  addressText: z.string().max(120).optional(),
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
// PATCH /api/reports/:id — corregir ficha (auth: manage-token o JWT)
// ----------------------------------------------------------------------------
export const updateReportRequestSchema = z
  .object({
    /** La corrección humana SIEMPRE gana sobre lo extraído por la IA */
    attributes: dogAttributesSchema.optional(),
    /** null = borrar el texto */
    distinctiveMarks: z.string().max(500).nullable().optional(),
    finderNote: z.string().max(500).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Debe incluirse al menos un campo a corregir.',
  });
export type UpdateReportRequest = z.infer<typeof updateReportRequestSchema>;

export interface UpdateReportResponse {
  reportId: string;
  attributes: DogAttributes;
  distinctiveMarks: string | null;
  finderNote: string | null;
}

// ----------------------------------------------------------------------------
// POST /api/reports/:id/renew · DELETE /api/reports/:id (ARCO)
// ----------------------------------------------------------------------------
export interface RenewReportResponse {
  reportId: string;
  /** Nueva fecha de vencimiento (ISO) tras extender la vigencia */
  expiresAt: string;
}

export interface DeleteReportResponse {
  reportId: string;
  /** true = borrado lógico aplicado; la purga física es programada */
  deleted: true;
}

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

export const confirmReunionRequestSchema = z.object({
  side: matchSideSchema,
});
export type ConfirmReunionRequest = z.infer<typeof confirmReunionRequestSchema>;

/** Estados de un match (espejo del enum match_status en la BD). */
export type MatchStatus =
  | 'suggested'
  | 'notified'
  | 'accepted'
  | 'rejected'
  | 'confirmed_reunion'
  | 'expired';

export interface AcceptMatchResponse {
  status: MatchStatus;
  /** true → la doble aceptación abrió el puente y se enviaron los contactos */
  contactRevealed: boolean;
}

export interface RejectMatchResponse {
  status: MatchStatus;
}

export interface ConfirmReunionResponse {
  status: MatchStatus;
}

/** Fila de la bandeja de coincidencias del enlace de gestión. */
export interface ManagedMatch {
  matchId: string;
  status: MatchStatus;
  /** Lado de ESTE reporte dentro del match (para la prueba de propiedad) */
  side: MatchSide;
  totalScore: number;
  scoreBand: CandidateScoreBand;
  explanation: string;
  flags: CandidateFlag[];
  /** Ficha pública de la contraparte (foto firmada, ubicación difuminada) */
  counterpart: {
    reportId: string;
    photoUrl: string | null;
    approxLocation: GeoPoint;
    daysBetween: number;
  };
  /** ¿Ya aceptó este lado? / ¿ya aceptó la contraparte? */
  selfAccepted: boolean;
  counterpartAccepted: boolean;
  /** Prueba de propiedad que aportó el lado 'lost' (visible para el lado 'found') */
  ownershipProof: OwnershipProof | null;
}

// ----------------------------------------------------------------------------
// DTOs de respuesta (el servidor los construye; no se validan en runtime).
// Espejo por cable de los tipos del dominio: este paquete no puede importar
// @lomito/matching (la dependencia va en el otro sentido), así que las
// uniones literales se declaran aquí y TypeScript garantiza la compatibilidad
// estructural en apps/web.
// ----------------------------------------------------------------------------

/** Espejo de MatchFlag (packages/matching/src/types.ts). */
export type CandidateFlag =
  | 'visual_ambiguity'
  | 'sex_conflict'
  | 'timeline_implausible'
  | 'no_embedding'
  | 'low_photo_quality';

/** Espejo de ScoreBand (packages/matching/src/explain.ts). */
export type CandidateScoreBand = 'muy_alta' | 'alta' | 'posible';

/** Candidato puntuado tal como viaja por la API (api-contracts.md §4). */
export interface ScoredCandidate {
  reportId: string;
  /** URL firmada, TTL 1 h; difuminada si is_sensitive */
  photoUrl: string | null;
  totalScore: number;
  scoreBand: CandidateScoreBand;
  /** renderExplanation() — ya en español */
  explanation: string;
  flags: CandidateFlag[];
  /** Ubicación difuminada (~110 m) */
  approxLocation: GeoPoint;
  daysBetween: number;
  /** Contacto SIEMPRE enmascarado aquí */
  displayMask: string;
  /** Si la capa 3 ya creó el match formal (Sprint 3); null en búsqueda inmediata */
  matchId: string | null;
}

export interface CreateReportResponse {
  reportId: string;
  /** Enlace de gestión firmado — se muestra UNA vez y se envía por WhatsApp */
  manageUrl: string;
  /** null si la IA quedó pendiente (ruta pending, ADR-0003) */
  extracted: {
    attributes: DogAttributes;
    marksTags: string[];
    qualityScore: number;
  } | null;
  /** Búsqueda inmediata (vacío si la IA quedó pendiente) */
  candidates: ScoredCandidate[];
  /** Ficha pública para compartir por WhatsApp */
  shareUrl: string;
}

/** Respuesta de GET /api/reports/:id — solo campos de la vista dogs_public. */
export interface ReportPublicResponse {
  reportId: string;
  reportType: ReportType;
  attributes: DogAttributes;
  distinctiveMarks: string | null;
  isSensitive: boolean;
  rewardOffered: boolean;
  eventDate: string;
  approxLocation: GeoPoint;
  addressText: string | null;
  /** URLs firmadas de lectura, TTL 1 h */
  photoUrls: string[];
  createdAt: string;
}

/** Respuesta de GET /api/reports/:id/candidates. */
export interface CandidatesResponse {
  candidates: ScoredCandidate[];
}

import { type NextRequest, type NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from './api-response';
import { verifyManageToken } from './manage-token';
import { supabaseAdmin } from './supabase-admin';

// ============================================================================
// Autenticación por token de gestión (ADR-0006), compartida por todas las
// rutas de gestión: candidatos, edición, renovación y borrado. Los errores
// no filtran información: un id inexistente y un token ajeno se distinguen
// solo por 404/403, nunca por detalle.
// ============================================================================

const idSchema = z.string().uuid();

/** Fila de dogs con lo que las rutas de gestión necesitan. */
export interface ManagedDog {
  id: string;
  report_type: 'lost' | 'found';
  status: string;
  moderation_status: string;
  attributes: unknown;
  marks_tags: string[] | null;
  distinctive_marks: string | null;
  finder_note: string | null;
  event_date: string;
  expires_at: string | null;
}

export type ManageAuthResult = { ok: true; dog: ManagedDog } | { ok: false; response: NextResponse };

export async function authenticateManageRequest(
  request: NextRequest,
  id: string,
): Promise<ManageAuthResult> {
  if (!idSchema.safeParse(id).success) {
    return { ok: false, response: apiError('not_found', 'Reporte no encontrado.') };
  }
  const token = request.headers.get('x-manage-token');
  if (!token) {
    return { ok: false, response: apiError('unauthorized', 'Falta el token de gestión.') };
  }

  const { data: dog } = await supabaseAdmin()
    .from('dogs')
    .select(
      'id, report_type, status, moderation_status, attributes, marks_tags, distinctive_marks, finder_note, event_date, expires_at, deleted_at, manage_token_hash',
    )
    .eq('id', id)
    .single();
  if (!dog || dog.deleted_at !== null) {
    return { ok: false, response: apiError('not_found', 'Reporte no encontrado.') };
  }
  if (!dog.manage_token_hash || !verifyManageToken(token, dog.manage_token_hash as string)) {
    return { ok: false, response: apiError('forbidden', 'El token no corresponde a este reporte.') };
  }
  return { ok: true, dog: dog as unknown as ManagedDog };
}

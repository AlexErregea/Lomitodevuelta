import type { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { MatchSide, MatchStatus, OwnershipProof } from '@lomito/shared';
import { apiError } from './api-response';
import { verifyManageToken } from './manage-token';
import { supabaseAdmin } from './supabase-admin';

// ============================================================================
// Autenticación de una acción de match por LADO (ADR-0006). El token de
// gestión viaja en X-Manage-Token; `side` dice cuál de los dos reportes del
// match es el del solicitante. El token se compara contra el hash del dog de
// ese lado: pedir una acción del lado ajeno da 403 (el token no cuadra).
// ============================================================================

const idSchema = z.string().uuid();

export interface MatchDogSide {
  dogId: string;
  status: string;
  contactId: string | null;
}

export interface AuthenticatedMatch {
  matchId: string;
  status: MatchStatus;
  lostAcceptedAt: string | null;
  foundAcceptedAt: string | null;
  ownershipProof: OwnershipProof | null;
  /** El dog del lado del solicitante (autenticado) */
  self: MatchDogSide;
  /** El dog de la contraparte */
  counterpart: MatchDogSide;
}

export type MatchAuthResult =
  | { ok: true; match: AuthenticatedMatch }
  | { ok: false; response: NextResponse };

export async function authenticateMatchSide(
  request: NextRequest,
  matchId: string,
  side: MatchSide,
): Promise<MatchAuthResult> {
  if (!idSchema.safeParse(matchId).success) {
    return { ok: false, response: apiError('not_found', 'Coincidencia no encontrada.') };
  }
  const token = request.headers.get('x-manage-token');
  if (!token) return { ok: false, response: apiError('unauthorized', 'Falta el token de gestión.') };

  const db = supabaseAdmin();
  const { data: match } = await db
    .from('matches')
    .select('id, status, dog_lost_id, dog_found_id, lost_accepted_at, found_accepted_at, ownership_proof')
    .eq('id', matchId)
    .single();
  if (!match) return { ok: false, response: apiError('not_found', 'Coincidencia no encontrada.') };

  const selfDogId = (side === 'lost' ? match.dog_lost_id : match.dog_found_id) as string;
  const otherDogId = (side === 'lost' ? match.dog_found_id : match.dog_lost_id) as string;

  const { data: dogs } = await db
    .from('dogs')
    .select('id, status, manage_token_hash, deleted_at')
    .in('id', [selfDogId, otherDogId]);
  const selfDog = (dogs ?? []).find((d) => d.id === selfDogId);
  const otherDog = (dogs ?? []).find((d) => d.id === otherDogId);
  if (!selfDog || selfDog.deleted_at !== null) {
    return { ok: false, response: apiError('not_found', 'Coincidencia no encontrada.') };
  }
  if (!selfDog.manage_token_hash || !verifyManageToken(token, selfDog.manage_token_hash as string)) {
    return { ok: false, response: apiError('forbidden', 'El token no corresponde a este reporte.') };
  }

  const [selfContact, otherContact] = await Promise.all([
    contactIdFor(db, selfDogId),
    contactIdFor(db, otherDogId),
  ]);

  return {
    ok: true,
    match: {
      matchId: match.id as string,
      status: match.status as MatchStatus,
      lostAcceptedAt: (match.lost_accepted_at as string | null) ?? null,
      foundAcceptedAt: (match.found_accepted_at as string | null) ?? null,
      ownershipProof: (match.ownership_proof as OwnershipProof | null) ?? null,
      self: { dogId: selfDogId, status: selfDog.status as string, contactId: selfContact },
      counterpart: {
        dogId: otherDogId,
        status: (otherDog?.status as string) ?? 'unknown',
        contactId: otherContact,
      },
    },
  };
}

async function contactIdFor(db: ReturnType<typeof supabaseAdmin>, dogId: string): Promise<string | null> {
  const { data } = await db
    .from('contacts')
    .select('id')
    .eq('dog_id', dogId)
    .order('channel', { ascending: false }) // 'whatsapp' > 'email' → prioriza WhatsApp
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

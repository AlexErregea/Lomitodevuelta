import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from './env';

// ============================================================================
// Cliente Supabase con service_role: omite RLS. SOLO código de servidor
// (el import de 'server-only' rompe el build si algo lo arrastra al cliente).
// Toda escritura pasa por aquí con validación Zod previa (ADR-0002).
// ============================================================================

let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!cached) {
    cached = createClient(
      requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
      // Sin sesión: es un cliente de servidor por request, no de usuario.
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return cached;
}

/** Bucket privado de fotos (security-privacy.md §7). */
export const PHOTOS_BUCKET = 'dog-photos';

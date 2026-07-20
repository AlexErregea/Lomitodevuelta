import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { requireEnv } from './env.ts';

// ============================================================================
// Cliente Supabase con service_role para Edge Functions (omite RLS; toda la
// lógica de estas funciones es de servidor por definición, ADR-0002).
// ============================================================================

export function adminClient(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Bucket privado de fotos (security-privacy.md §7). */
export const PHOTOS_BUCKET = 'dog-photos';

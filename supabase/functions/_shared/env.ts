// ============================================================================
// Acceso a secretos en Edge Functions (inventario en /.env.example, sección
// [supabase]). SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta la
// plataforma; el resto se configura con `supabase secrets set`.
// ============================================================================

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Falta el secreto ${name} (configúralo con: supabase secrets set ${name}=...)`);
  }
  return value;
}

export function optionalEnv(name: string): string | null {
  return Deno.env.get(name) ?? null;
}

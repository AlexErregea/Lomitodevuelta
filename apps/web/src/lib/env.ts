// ============================================================================
// Acceso a variables de entorno del servidor (inventario en /.env.example).
// Lectura perezosa: el build de Next no necesita secretos; si falta una
// variable, el error salta en el primer uso con un mensaje accionable.
// ============================================================================

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copia .env.example a apps/web/.env.local y rellénala.`,
    );
  }
  return value;
}

export function optionalEnv(name: string): string | null {
  return process.env[name] || null;
}

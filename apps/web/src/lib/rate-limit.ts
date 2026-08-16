import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { requireEnv } from './env';
import { supabaseAdmin } from './supabase-admin';

// ============================================================================
// Rate limiting (api-contracts.md §6, security-privacy.md §6). Contadores en
// Postgres: a los volúmenes del MVP sobra, y evita meter un proveedor más al
// stack (Upstash/Redis queda como palanca de fase posterior, no como default).
//
// Toda la evaluación ocurre en un solo RPC atómico (consume_rate_limits): un
// viaje a la base por request, sin la carrera del "leer, comparar, escribir".
//
// Regla de privacidad: en las cubetas NUNCA va un dato personal en claro. La
// IP se guarda hasheada con pepper (la IP es dato personal bajo LFPDPPP) y el
// contacto entra ya hasheado como value_hash.
// ============================================================================

export interface RateLimitSpec {
  /** Identificador de cubeta; sin datos personales en claro. */
  key: string;
  windowSeconds: number;
  limit: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Segundos hasta que la cubeta bloqueada se reinicia (para Retry-After). */
  retryAfterSeconds: number;
  blockedKey: string | null;
}

const HOUR = 3600;
const DAY = 86400;

/**
 * Ventanas de cada cubeta. Viven en el código a propósito: una ventana es
 * parte del diseño del limitador (la ráfaga y el acumulado miden cosas
 * distintas), no una perilla que se afloje en caliente. Los umbrales sí se
 * ajustan sin desplegar — ver `loadRateLimitConfig`.
 */
export const WINDOWS = {
  reportsPerIpHour: HOUR,
  reportsPerIpDay: DAY,
  reportsPerContactDay: DAY,
  uploadSignsPerIpHour: HOUR,
  globalReportsDay: DAY,
} as const;

/**
 * Umbrales de respaldo, usados solo si `system_config` no responde. Nunca
 * "sin límite": una base caída no puede convertirse en una puerta abierta.
 * Son los mismos valores que los DEFAULT de la migración 12.
 */
export const FALLBACK_LIMITS = {
  reportsPerIpHour: 3,
  reportsPerIpDay: 10,
  reportsPerContactDay: 5,
  uploadSignsPerIpHour: 15,
  maxReportsPerDay: 200,
} as const;

export type RateLimitConfig = { -readonly [K in keyof typeof FALLBACK_LIMITS]: number };

/**
 * Lee los umbrales vigentes de `system_config`.
 *
 * Están en la tabla y no en el código porque el momento en que hacen falta
 * ajustar es justo el peor para desplegar: una prueba en campo donde el propio
 * fundador se bloquea tras 3 altas, o el día del lanzamiento con tráfico
 * inesperado. Un UPDATE surte efecto en el siguiente request.
 */
export async function loadRateLimitConfig(): Promise<RateLimitConfig> {
  const { data, error } = await supabaseAdmin()
    .from('system_config')
    .select(
      'reports_per_ip_hour, reports_per_ip_day, reports_per_contact_day, upload_signs_per_ip_hour, max_reports_per_day',
    )
    .eq('id', true)
    .maybeSingle();

  if (error || !data) {
    console.error(JSON.stringify({ msg: 'rate_limit_config_unavailable', error: error?.message }));
    return { ...FALLBACK_LIMITS };
  }

  const pick = (value: unknown, fallback: number): number =>
    typeof value === 'number' && value > 0 ? value : fallback;

  return {
    reportsPerIpHour: pick(data.reports_per_ip_hour, FALLBACK_LIMITS.reportsPerIpHour),
    reportsPerIpDay: pick(data.reports_per_ip_day, FALLBACK_LIMITS.reportsPerIpDay),
    reportsPerContactDay: pick(data.reports_per_contact_day, FALLBACK_LIMITS.reportsPerContactDay),
    uploadSignsPerIpHour: pick(data.upload_signs_per_ip_hour, FALLBACK_LIMITS.uploadSignsPerIpHour),
    maxReportsPerDay: pick(data.max_reports_per_day, FALLBACK_LIMITS.maxReportsPerDay),
  };
}

/**
 * IP del cliente detrás del proxy de Vercel. `x-forwarded-for` puede traer una
 * cadena de saltos: el primero es el cliente real.
 */
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Cubeta por IP. Se hashea con el pepper del servidor: los contadores no
 * deben ser un registro de quién visitó el sitio (§6). El prefijo separa este
 * uso del pepper de cualquier otro (dominio de hash distinto).
 */
export function ipBucket(scope: string, ip: string): string {
  const digest = createHash('sha256')
    .update(`rate-limit:${requireEnv('MANAGE_TOKEN_PEPPER')}:${ip}`)
    .digest('hex')
    .slice(0, 32);
  return `${scope}:ip:${digest}`;
}

/** Cubeta por contacto: recibe el value_hash ya calculado, nunca el número. */
export function contactBucket(scope: string, valueHash: string): string {
  return `${scope}:contact:${valueHash.slice(0, 32)}`;
}

/**
 * Evalúa e incrementa todas las cubetas de una vez.
 *
 * Falla abierto a propósito: si la base no responde, el request seguirá su
 * curso y morirá igual más adelante (crear un reporte necesita la base). Un
 * limitador que tira tráfico legítimo por un hipo de red es peor defensa que
 * la que intenta ser.
 */
export async function consumeRateLimits(specs: RateLimitSpec[]): Promise<RateLimitResult> {
  const payload = specs.map((s) => ({
    key: s.key,
    window_seconds: s.windowSeconds,
    limit: s.limit,
  }));

  const { data, error } = await supabaseAdmin().rpc('consume_rate_limits', { p_specs: payload });
  if (error || !data) {
    console.error(JSON.stringify({ msg: 'rate_limit_check_failed', error: error?.message }));
    return { allowed: true, retryAfterSeconds: 0, blockedKey: null };
  }

  const result = data as { allowed: boolean; blocked_key: string | null; retry_after_seconds: number };
  return {
    allowed: Boolean(result.allowed),
    retryAfterSeconds: Number(result.retry_after_seconds ?? 0),
    blockedKey: result.blocked_key ?? null,
  };
}

/** Minutos redondeados hacia arriba, para redactar la espera en español. */
export function humanizeWait(seconds: number): string {
  if (seconds <= 90) return 'en un minuto';
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `en ${minutes} minutos`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? 'en una hora' : `en ${hours} horas`;
}

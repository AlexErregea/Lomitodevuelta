import { describe, expect, it } from 'vitest';
import {
  ReplicateThrottleError,
  isThrottleError,
  parseRetryAfterSeconds,
} from '@/lib/providers/replicate-embedding';

// El 429 de Replicate trae la espera exacta en el cuerpo y hasta el 2026-08-16
// la tirábamos: se reintentaba al instante, volvía a chocar y cada choque
// quemaba un intento del reporte. Este es el cuerpo real que devolvió.
const CUERPO_REAL_429 = JSON.stringify({
  detail:
    'Request was throttled. Your rate limit for creating predictions is reduced to 6 requests per minute with a burst of 1 requests while you have less than $5.0 in credit. Your rate limit resets in ~10s.',
  status: 429,
  retry_after: 10,
});

describe('parseRetryAfterSeconds', () => {
  it('lee retry_after del cuerpo real de Replicate', () => {
    expect(parseRetryAfterSeconds(CUERPO_REAL_429, null)).toBe(10);
  });

  it('cae a la cabecera estándar cuando el cuerpo no la trae', () => {
    expect(parseRetryAfterSeconds('{"detail":"throttled"}', '7')).toBe(7);
  });

  it('sobrevive a un cuerpo que no es JSON', () => {
    expect(parseRetryAfterSeconds('<html>502</html>', '3')).toBe(3);
  });

  it('usa un valor por defecto si no hay ninguna pista', () => {
    expect(parseRetryAfterSeconds('', null)).toBe(10);
  });

  it('redondea hacia arriba: esperar de menos es volver a chocar', () => {
    expect(parseRetryAfterSeconds('{"retry_after":2.3}', null)).toBe(3);
  });

  it('acota la espera para que un valor absurdo no cuelgue el reintento', () => {
    expect(parseRetryAfterSeconds('{"retry_after":86400}', null)).toBe(30);
    expect(parseRetryAfterSeconds('{"retry_after":0}', null)).toBe(1);
  });
});

describe('isThrottleError', () => {
  it('distingue el freno del fallo real', () => {
    expect(isThrottleError(new ReplicateThrottleError(10, 'throttled'))).toBe(true);
    expect(isThrottleError(new Error('Replicate respondió 500'))).toBe(false);
    expect(isThrottleError(null)).toBe(false);
  });

  // La distinción no es cosmética: de ella depende que un throttle no gaste un
  // intento y, por tanto, que un límite de tasa no pueda matar un reporte.
  it('conserva los segundos que pidió el proveedor', () => {
    expect(new ReplicateThrottleError(9, 'x').retryAfterSeconds).toBe(9);
  });
});

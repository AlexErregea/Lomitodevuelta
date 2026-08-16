import { beforeAll, describe, expect, it } from 'vitest';

// Las cubetas de rate limit son la memoria de quién tocó la puerta: la prueba
// que importa es que esa memoria NO contenga la IP en claro (§6). El pepper se
// fija antes de importar el módulo porque se lee al construir la cubeta.
beforeAll(() => {
  process.env.MANAGE_TOKEN_PEPPER = 'pepper-de-prueba';
});

const { FALLBACK_LIMITS, WINDOWS, contactBucket, humanizeWait, ipBucket } = await import(
  '@/lib/rate-limit'
);

describe('cubetas de rate limit', () => {
  it('nunca guardan la IP en claro', () => {
    const bucket = ipBucket('report-hour', '187.190.44.12');
    expect(bucket).not.toContain('187.190.44.12');
    expect(bucket).not.toContain('187.190');
  });

  it('la misma IP cae siempre en la misma cubeta (si no, no hay límite)', () => {
    expect(ipBucket('report-hour', '10.0.0.1')).toBe(ipBucket('report-hour', '10.0.0.1'));
  });

  it('IPs distintas no comparten cubeta', () => {
    expect(ipBucket('report-hour', '10.0.0.1')).not.toBe(ipBucket('report-hour', '10.0.0.2'));
  });

  it('separa los alcances: la ráfaga por hora y el acumulado del día se cuentan aparte', () => {
    expect(ipBucket('report-hour', '10.0.0.1')).not.toBe(ipBucket('report-day', '10.0.0.1'));
  });

  it('la cubeta por contacto usa el hash, jamás el número', () => {
    const valueHash = 'a'.repeat(64);
    const bucket = contactBucket('report-day', valueHash);
    expect(bucket).toContain('a'.repeat(32));
    expect(bucket).not.toContain('+52');
  });
});

// Los umbrales vigentes viven en system_config (se ajustan sin desplegar);
// estos son los de respaldo, que solo se usan si la base no responde. Deben
// seguir siendo coherentes entre sí: es la configuración con la que el sistema
// se defiende justo cuando algo ya salió mal.
describe('umbrales de respaldo', () => {
  it('nunca son "sin límite"', () => {
    for (const [name, value] of Object.entries(FALLBACK_LIMITS)) {
      expect(value, name).toBeGreaterThan(0);
    }
  });

  // Un alta legítima consume varias firmas de subida (hasta 5 fotos en Flujo A),
  // así que el límite de firmas tiene que ser holgado frente al de reportes o
  // se bloquearía a sí mismo.
  it('las firmas de subida son más holgadas que las altas', () => {
    expect(FALLBACK_LIMITS.uploadSignsPerIpHour).toBeGreaterThan(FALLBACK_LIMITS.reportsPerIpHour);
  });

  it('el acumulado del día es mayor que la ráfaga de una hora', () => {
    expect(FALLBACK_LIMITS.reportsPerIpDay).toBeGreaterThan(FALLBACK_LIMITS.reportsPerIpHour);
    expect(WINDOWS.reportsPerIpDay).toBe(24 * WINDOWS.reportsPerIpHour);
  });

  it('el tope global es muy superior al de una sola IP (si no, una persona apaga el sitio)', () => {
    expect(FALLBACK_LIMITS.maxReportsPerDay).toBeGreaterThan(10 * FALLBACK_LIMITS.reportsPerIpDay);
  });
});

describe('humanizeWait', () => {
  it('redondea hacia arriba y habla en español', () => {
    expect(humanizeWait(30)).toBe('en un minuto');
    expect(humanizeWait(300)).toBe('en 5 minutos');
    expect(humanizeWait(3600)).toBe('en una hora');
    expect(humanizeWait(7200)).toBe('en 2 horas');
  });

  it('nunca promete "0 minutos"', () => {
    expect(humanizeWait(1)).toBe('en un minuto');
  });
});

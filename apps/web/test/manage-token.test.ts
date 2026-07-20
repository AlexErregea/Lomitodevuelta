import { beforeAll, describe, expect, it } from 'vitest';

// El pepper se fija ANTES de importar el módulo (lectura perezosa de env).
beforeAll(() => {
  process.env.MANAGE_TOKEN_PEPPER = 'pepper-de-pruebas-no-usar-en-produccion';
});

describe('manage token (ADR-0006)', () => {
  it('genera tokens únicos, largos y aptos para URL', async () => {
    const { generateManageToken } = await import('@/lib/manage-token');
    const a = generateManageToken();
    const b = generateManageToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40); // 256 bits en base64url
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('verifica el token correcto contra su hash y rechaza otros', async () => {
    const { generateManageToken, hashManageToken, verifyManageToken } = await import(
      '@/lib/manage-token'
    );
    const token = generateManageToken();
    const hash = hashManageToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyManageToken(token, hash)).toBe(true);
    expect(verifyManageToken(generateManageToken(), hash)).toBe(false);
  });

  it('construye el enlace de gestión con la forma esperada', async () => {
    const { buildManageUrl } = await import('@/lib/manage-token');
    expect(buildManageUrl('https://lomito.mx', 'abc-123', 'tok')).toBe(
      'https://lomito.mx/r/abc-123/gestionar?t=tok',
    );
  });
});

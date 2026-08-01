import { describe, expect, it } from 'vitest';
import { CDMX_ALCALDIAS, findAlcaldia } from '@/lib/cdmx-alcaldias';

// Estos centros son el respaldo cuando no hay GPS: si una coordenada estuviera
// mal, el reporte entraría al matching en el lugar equivocado y no coincidiría
// nunca. Estas pruebas son la red que evita un dedazo silencioso.
describe('CDMX_ALCALDIAS', () => {
  it('tiene las 16 alcaldías, con id y nombre únicos', () => {
    expect(CDMX_ALCALDIAS).toHaveLength(16);
    expect(new Set(CDMX_ALCALDIAS.map((a) => a.id)).size).toBe(16);
    expect(new Set(CDMX_ALCALDIAS.map((a) => a.name)).size).toBe(16);
  });

  it('todas caen dentro del recuadro geográfico de la CDMX', () => {
    // Caja generosa alrededor de la ciudad: detecta signos invertidos y
    // lat/lng intercambiados, que es el error clásico.
    for (const alcaldia of CDMX_ALCALDIAS) {
      expect(alcaldia.lat, alcaldia.name).toBeGreaterThan(19.0);
      expect(alcaldia.lat, alcaldia.name).toBeLessThan(19.6);
      expect(alcaldia.lng, alcaldia.name).toBeGreaterThan(-99.4);
      expect(alcaldia.lng, alcaldia.name).toBeLessThan(-98.9);
    }
  });

  it('están ordenadas alfabéticamente (el <select> se lee de corrido)', () => {
    const names = CDMX_ALCALDIAS.map((a) => a.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'es')));
  });
});

describe('findAlcaldia', () => {
  it('encuentra por id y devuelve undefined si no existe', () => {
    expect(findAlcaldia('coyoacan')?.name).toBe('Coyoacán');
    expect(findAlcaldia('narnia')).toBeUndefined();
  });
});

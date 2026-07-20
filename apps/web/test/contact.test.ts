import { describe, expect, it } from 'vitest';
import { hashContactValue, maskContactValue, normalizeContactValue } from '@/lib/contact';

// El contacto es EL dato personal del sistema: estas funciones son la
// frontera entre el valor real (solo service_role) y lo que ve el mundo.
describe('normalizeContactValue', () => {
  it('normaliza teléfonos a E.164 quitando separadores visuales', () => {
    expect(normalizeContactValue('whatsapp', '+52 55 1234-5678')).toBe('+525512345678');
    expect(normalizeContactValue('whatsapp', '52 (55) 1234 5678')).toBe('+525512345678');
  });

  it('normaliza emails a minúsculas', () => {
    expect(normalizeContactValue('email', '  Persona@Ejemplo.COM ')).toBe('persona@ejemplo.com');
  });
});

describe('hashContactValue', () => {
  it('produce el mismo hash para el mismo contacto escrito distinto (dedupe)', () => {
    const a = hashContactValue('whatsapp', '+52 55 1234 5678');
    const b = hashContactValue('whatsapp', '525512345678');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('maskContactValue', () => {
  it('enmascara teléfonos dejando solo los últimos 4 dígitos', () => {
    const mask = maskContactValue('whatsapp', '+52 55 1234 5678');
    expect(mask).toBe('•• •• 5678');
    expect(mask).not.toContain('12345');
  });

  it('enmascara emails dejando inicial y dominio', () => {
    expect(maskContactValue('email', 'persona@ejemplo.com')).toBe('p•••@ejemplo.com');
  });

  it('no revela nada con un email malformado', () => {
    expect(maskContactValue('email', 'sin-arroba')).toBe('•••');
  });
});

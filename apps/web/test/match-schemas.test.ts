import { describe, expect, it } from 'vitest';
import {
  acceptMatchRequestSchema,
  confirmReunionRequestSchema,
  rejectMatchRequestSchema,
} from '@lomito/shared';

// Las acciones de match son transiciones sensibles: el esquema es la frontera.
describe('acceptMatchRequestSchema', () => {
  it('acepta el lado found sin prueba', () => {
    expect(acceptMatchRequestSchema.safeParse({ side: 'found' }).success).toBe(true);
  });

  it('acepta el lado lost con prueba de seña privada', () => {
    const parsed = acceptMatchRequestSchema.safeParse({
      side: 'lost',
      ownershipProof: { kind: 'private_mark', description: 'cicatriz en la pata trasera izquierda' },
    });
    expect(parsed.success).toBe(true);
  });

  it('acepta el lado lost con prueba de foto histórica', () => {
    const parsed = acceptMatchRequestSchema.safeParse({
      side: 'lost',
      ownershipProof: { kind: 'historic_photo', storagePath: 'citizen/2026/07/x.jpg' },
    });
    expect(parsed.success).toBe(true);
  });

  it('rechaza una seña privada demasiado corta', () => {
    expect(
      acceptMatchRequestSchema.safeParse({
        side: 'lost',
        ownershipProof: { kind: 'private_mark', description: 'corta' },
      }).success,
    ).toBe(false);
  });

  it('rechaza un lado inválido', () => {
    expect(acceptMatchRequestSchema.safeParse({ side: 'ambos' }).success).toBe(false);
  });
});

describe('rejectMatchRequestSchema', () => {
  it('acepta un rechazo con motivo opcional', () => {
    expect(rejectMatchRequestSchema.safeParse({ side: 'found', reason: 'otro perro' }).success).toBe(true);
    expect(rejectMatchRequestSchema.safeParse({ side: 'lost' }).success).toBe(true);
  });
});

describe('confirmReunionRequestSchema', () => {
  it('requiere un lado válido', () => {
    expect(confirmReunionRequestSchema.safeParse({ side: 'lost' }).success).toBe(true);
    expect(confirmReunionRequestSchema.safeParse({}).success).toBe(false);
  });
});

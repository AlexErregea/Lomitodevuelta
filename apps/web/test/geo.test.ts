import { describe, expect, it } from 'vitest';
import { blurLocation, toWkt } from '@/lib/geo';

describe('blurLocation', () => {
  it('difumina a 3 decimales (~110 m), igual que la vista dogs_public', () => {
    expect(blurLocation({ lat: 19.432608, lng: -99.133209 })).toEqual({
      lat: 19.433,
      lng: -99.133,
    });
  });
});

describe('toWkt', () => {
  it('produce EWKT con orden lng lat (convención PostGIS)', () => {
    expect(toWkt({ lat: 19.4326, lng: -99.1332 })).toBe('SRID=4326;POINT(-99.1332 19.4326)');
  });
});

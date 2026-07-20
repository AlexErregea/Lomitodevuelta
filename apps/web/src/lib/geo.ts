import type { GeoPoint } from '@lomito/shared';

// ============================================================================
// La ubicación exacta es dato personal (security-privacy.md §1.4): todo lo
// público la difumina a ~110 m. Mismo criterio que la vista dogs_public
// (redondeo a 3 decimales) para que API y SQL cuenten la misma historia.
// ============================================================================

export function blurLocation(point: GeoPoint): GeoPoint {
  return {
    lat: Math.round(point.lat * 1000) / 1000,
    lng: Math.round(point.lng * 1000) / 1000,
  };
}

/** WKT para columnas geography de PostGIS (orden lng lat). */
export function toWkt(point: GeoPoint): string {
  return `SRID=4326;POINT(${point.lng} ${point.lat})`;
}

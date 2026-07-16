// @lomito/shared — tipos, esquemas Zod e interfaces compartidas por toda la
// plataforma (apps/web, packages/matching, supabase/functions).
// REGLA (ADR-0001): este paquete es TypeScript puro, sin I/O ni APIs de Node.

export * from './types/dog';
export * from './api/schemas';
export * from './providers/embedding';
export * from './providers/attributes';
export * from './providers/notifications';

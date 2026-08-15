// @lomito/shared — tipos, esquemas Zod e interfaces compartidas por toda la
// plataforma (apps/web, packages/matching, supabase/functions).
// REGLA (ADR-0001): este paquete es TypeScript puro, sin I/O ni APIs de Node.

export * from './types/dog.ts';
export * from './api/schemas.ts';
export * from './providers/embedding.ts';
export * from './providers/attributes.ts';
export * from './providers/extraction-prompt.ts';
export * from './providers/notifications.ts';

import type { SignUploadResponse } from '@lomito/shared';
import { compressImage } from './compress';

// ============================================================================
// Subida de una foto: compresión client-side (elimina EXIF/GPS) → URL firmada
// dictada por el servidor → PUT directo a Storage (evita el límite de Vercel
// y no consume cómputo del servidor). Compartida por los Flujos A y B.
// ============================================================================

export async function uploadPhoto(file: File): Promise<string> {
  const compressed = await compressImage(file);

  const signResponse = await fetch('/api/uploads/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType: 'image/jpeg' }),
  });
  if (!signResponse.ok) throw new Error('sign failed');
  const sign = (await signResponse.json()) as SignUploadResponse;

  const uploadResponse = await fetch(sign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: compressed,
  });
  if (!uploadResponse.ok) throw new Error('upload failed');

  return sign.storagePath;
}

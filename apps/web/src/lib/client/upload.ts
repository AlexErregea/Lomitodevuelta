import type { SignUploadResponse } from '@lomito/shared';
import { compressImage } from './compress';
import { nextPaint } from './next-paint';

// ============================================================================
// Subida de una foto: compresión client-side (elimina EXIF/GPS) → URL firmada
// dictada por el servidor → PUT directo a Storage (evita el límite de Vercel
// y no consume cómputo del servidor). Compartida por los Flujos A y B.
//
// Reporta en qué fase va (`onPhase`) porque la compresión no es instantánea:
// en un teléfono de gama media una foto de 12 MP tarda segundos, y sin avisar
// se percibe como que el botón no hizo nada.
// ============================================================================

export type UploadPhase = 'compressing' | 'uploading';

export async function uploadPhoto(
  file: File,
  onPhase?: (phase: UploadPhase) => void,
): Promise<string> {
  onPhase?.('compressing');
  // El aviso de fase tiene que alcanzar la pantalla ANTES de que el canvas
  // bloquee el hilo principal; si no, se muestra cuando ya terminó.
  await nextPaint();
  const compressed = await compressImage(file);

  onPhase?.('uploading');
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

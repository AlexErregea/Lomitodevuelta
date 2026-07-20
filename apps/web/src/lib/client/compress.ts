// ============================================================================
// Compresión de imagen en el navegador (security-privacy.md §7):
//   · reduce el peso para la subida en 4G (objetivo < 5 s percibidos),
//   · re-encodificar en canvas ELIMINA los metadatos EXIF (incluido el GPS):
//     la única ubicación que viaja es la que la persona declara.
// ============================================================================

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no disponible en este navegador.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo comprimir la imagen.'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

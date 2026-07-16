// ============================================================================
// Interfaz del proveedor de embeddings visuales (ADR-0003).
// La implementación MVP (Replicate) vive en apps/web; migrar a self-hosting
// es escribir otra implementación de esta interfaz + re-embed (runbook en
// docs/matching-engine.md §7). El dominio jamás conoce al proveedor.
// ============================================================================

export interface EmbeddingProvider {
  /**
   * Identifica modelo + proveedor, p. ej. "siglip-base-768/v1".
   * Se persiste junto a CADA vector (dog_photos.embedding_model_version):
   * vectores de versiones distintas NUNCA se comparan.
   */
  readonly modelVersion: string;

  /** Dimensión del vector (la fija el modelo; la columna SQL debe coincidir). */
  readonly dimensions: number;

  /**
   * Calcula el embedding de una imagen accesible por URL (firmada, TTL corto).
   * Errores/timeouts los maneja el llamador: el reporte queda 'pending' y
   * pg_cron reintenta — una inferencia fallida jamás pierde un reporte.
   */
  embed(imageUrl: string): Promise<Float32Array>;
}

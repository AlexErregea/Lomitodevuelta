import type { MatchingParams } from '@lomito/matching';
import { supabaseAdmin } from './supabase-admin';

// ============================================================================
// Carga la fila ACTIVA de matching_params (ADR-0004: pesos y umbrales jamás
// cableados en código) y la mapea al espejo tipado del dominio.
// ============================================================================

interface MatchingParamsRow {
  id: number;
  weights: { visual: number; attributes: number; spatiotemporal: number; marks: number };
  thresholds: { show: number; notify: number; visual_floor: number; visual_ceil: number };
  geo_config: {
    base_radius_km: number;
    km_per_day: number;
    max_radius_km: number;
    max_days_window: number;
  };
  embedding_model_version: string;
}

export interface ActiveMatchingConfig {
  params: MatchingParams;
  embeddingModelVersion: string;
}

export async function loadActiveMatchingConfig(): Promise<ActiveMatchingConfig> {
  const { data, error } = await supabaseAdmin()
    .from('matching_params')
    .select('id, weights, thresholds, geo_config, embedding_model_version')
    .eq('is_active', true)
    .single();
  if (error || !data) {
    throw new Error(`No hay configuración activa de matching: ${error?.message ?? 'sin fila'}`);
  }
  const row = data as MatchingParamsRow;
  return {
    embeddingModelVersion: row.embedding_model_version,
    params: {
      paramsId: row.id,
      weights: row.weights,
      thresholds: {
        show: row.thresholds.show,
        notify: row.thresholds.notify,
        visualFloor: row.thresholds.visual_floor,
        visualCeil: row.thresholds.visual_ceil,
      },
      geo: {
        baseRadiusKm: row.geo_config.base_radius_km,
        kmPerDay: row.geo_config.km_per_day,
        maxRadiusKm: row.geo_config.max_radius_km,
        maxDaysWindow: row.geo_config.max_days_window,
      },
    },
  };
}

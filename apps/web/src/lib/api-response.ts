import { NextResponse } from 'next/server';
import type { ApiError, ErrorCode } from '@lomito/shared';

// ============================================================================
// Envelope de error estable de toda la API (api-contracts.md §1):
//   { error: { code, message } } — message legible y en español.
// ============================================================================

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  validation_error: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal_error: 500,
  inference_unavailable: 503,
  service_unavailable: 503,
};

export function apiError(
  code: ErrorCode,
  message: string,
  /** Cabeceras extra del contrato: `Retry-After` en los 429 (§6). */
  headers?: Record<string, string>,
): NextResponse<ApiError> {
  return NextResponse.json(
    { error: { code, message } },
    { status: STATUS_BY_CODE[code], ...(headers ? { headers } : {}) },
  );
}

// ============================================================================
// Analítica de producto (PostHog, ADR-0011) sin dependencia: un POST directo
// al endpoint de captura. Best-effort SIEMPRE: sin clave configurada o con
// PostHog caído, el producto ni se entera. Los nombres de evento son los
// canónicos del embudo (observability.md §2) — idénticos a los de `events`.
// ============================================================================

export function captureEvent(event: string, properties: Record<string, unknown> = {}): void {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

  // distinct_id anónimo por dispositivo (no identifica a la persona).
  let distinctId = localStorage.getItem('ph_distinct_id');
  if (!distinctId) {
    distinctId = crypto.randomUUID();
    localStorage.setItem('ph_distinct_id', distinctId);
  }

  void fetch(`${host}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      event,
      distinct_id: distinctId,
      properties,
      timestamp: new Date().toISOString(),
    }),
    keepalive: true,
  }).catch(() => {
    // Silencio deliberado: la analítica jamás rompe la experiencia.
  });
}

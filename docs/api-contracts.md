# Contratos de API — LomitoDeVuelta

> Rutas, payloads, autenticación y errores de la API. Los tipos TypeScript de este
> documento son el contrato: viven como esquemas Zod en `packages/shared` (fuente
> única) y de ahí se derivan los tipos. Última actualización: 2026-07-16.

## 1. Principios

1. **Tipos compartidos en lugar de OpenAPI** (MVP): con un solo consumidor (nuestra
   propia PWA) y desarrollo AI-assisted, la fuente de verdad son los esquemas Zod en
   `packages/shared/src/api/` — validan en servidor Y tipan el cliente, sin
   generadores de por medio. Generar OpenAPI desde Zod (`zod-to-openapi`) queda como
   fase posterior, cuando exista un consumidor externo (API institucional pública).
2. **Envelope de error estable** en toda la API:
   ```ts
   { error: { code: ErrorCode, message: string } }   // message: legible, en español,
                                                     // desde catálogo i18n-ready
   ```
3. **Versionado aditivo**: los campos nuevos son opcionales; nunca se renombra ni se
   elimina un campo publicado. Un cambio incompatible estrenaría prefijo `/api/v2/`
   (no se espera en MVP).
4. **El cliente nunca toca Postgres**: todo pasa por estas rutas (ADR-0002).

## 2. Autenticación por actor

| Actor | Mecanismo | Cabecera |
|---|---|---|
| Público anónimo | Nada (solo rutas públicas) | — |
| Ciudadano gestionando su reporte | Token de gestión del enlace firmado (ADR-0006) | `X-Manage-Token: <token>` |
| Cuenta institucional | JWT de Supabase Auth (magic link) | `Authorization: Bearer <jwt>` |
| Webhook de WhatsApp | Verificación de firma de Meta (`X-Hub-Signature-256`) + verify token | — |
| DB webhook → Edge Function | Secreto compartido en cabecera | `Authorization: Bearer <secret>` |

## 3. Rutas (Next.js Route Handlers, prefijo `/api`)

| # | Método y ruta | Auth | Descripción |
|---|---|---|---|
| 1 | `POST /api/uploads/sign` | pública* | URL firmada de subida a Storage (el servidor dicta la ruta) |
| 2 | `POST /api/reports` | pública* | Crear reporte (Flujos A y B); dispara pipeline de visión |
| 3 | `GET /api/reports/:id` | pública | Ficha pública (campos de `dogs_public` + fotos firmadas) |
| 4 | `GET /api/reports/:id/candidates` | manage-token | Candidatos puntuados (capas 1+2) del propio reporte |
| 5 | `PATCH /api/reports/:id` | manage-token / JWT | Corregir ficha (atributos, señas, nota) |
| 6 | `POST /api/reports/:id/renew` | manage-token / JWT | Renovar vigencia (+60 días) |
| 7 | `DELETE /api/reports/:id` | manage-token / JWT | Borrado (ARCO): lógico ya, purga programada |
| 8 | `POST /api/matches/:id/accept` | manage-token / JWT | Aceptar match (lado dueño: incluye prueba de propiedad) |
| 9 | `POST /api/matches/:id/reject` | manage-token / JWT | Rechazar match con motivo (dataset de calibración) |
| 10 | `POST /api/matches/:id/confirm-reunion` | manage-token / JWT | Confirmar reunión (la North Star) |

\* Con rate-limit estricto (ver §6). Las páginas (`/r/:id` ficha, `/r/:id/opengraph-image`)
no son API: son rutas de Next.js documentadas en el ADR de og:image (Bloque 6).

### Edge Functions (Supabase, prefijo `/functions/v1`)

| Función | Disparador | Qué hace |
|---|---|---|
| `on-report-created` | DB webhook (INSERT en `dogs` con embedding listo) | Capa 3: candidatos + score + `matches` + notificaciones |
| `whatsapp-webhook` | Meta (GET verify / POST eventos) | Estados de entrega → `notifications`; mensajes entrantes (renovación, baja) |
| `retry-pending` | pg_cron (5 min) | Reintenta embeddings `pending/failed` y notificaciones `failed` |
| `lifecycle` | pg_cron (diario) | Expiración de reportes, aviso de renovación, purga mensual de datos personales |

## 4. Payloads principales (contrato Zod)

```ts
// ---------- POST /api/uploads/sign ----------
interface SignUploadRequest  { contentType: 'image/jpeg' | 'image/webp'; }
interface SignUploadResponse { uploadUrl: string; storagePath: string; expiresAt: string; }

// ---------- POST /api/reports ----------
interface CreateReportRequest {
  reportType: 'lost' | 'found';
  photoPaths: string[];              // 1..5, rutas devueltas por /uploads/sign
  geo: { lat: number; lng: number }; // punto exacto; el servidor difumina lo público
  eventDate: string;                 // ISO date
  contact: { channel: 'whatsapp' | 'email'; value: string };  // E.164 o email
  turnstileToken?: string;           // solo se exige si el entorno tiene llaves de Turnstile
  // Sin campo de consentimiento: es TÁCITO (decisión 2026-08-12). Publicar el
  // reporte es el acto de consentimiento y el formulario referencia el aviso
  // justo antes del botón; el servidor registra la evidencia en `contacts`
  // (consent_given_at + consent_version). Ver security-privacy.md §4.
  // Flujo A (opcionales; la IA los completa y el usuario corrige después):
  attributes?: DogAttributes;        // packages/shared (ver matching-engine.md §8)
  distinctiveMarks?: string;
  // Flujo B:
  finderNote?: string;               // "¿dónde está el perro ahora?"
}
interface CreateReportResponse {
  reportId: string;
  manageUrl: string;        // enlace de gestión firmado — se muestra UNA vez y se envía por WhatsApp
  extracted: { attributes: DogAttributes; marksTags: string[]; qualityScore: number } | null; // null si la IA quedó pendiente
  candidates: ScoredCandidate[];     // búsqueda inmediata (vacío si IA pendiente)
  shareUrl: string;                  // ficha pública para WhatsApp
}

// ---------- GET /api/reports/:id/candidates ----------
interface ScoredCandidate {
  reportId: string;
  photoUrl: string;                  // firmada, TTL 1 h; difuminada si is_sensitive
  totalScore: number;                // [0,1]
  scoreBand: 'muy_alta' | 'alta' | 'posible';
  explanation: string;               // renderExplanation() — ya en español
  flags: MatchFlag[];                // packages/matching
  approxLocation: { lat: number; lng: number };  // difuminada
  daysBetween: number;
  displayMask: string;               // contacto SIEMPRE enmascarado aquí
  matchId: string | null;            // si la capa 3 ya creó el match formal
}

// ---------- POST /api/matches/:id/accept ----------
interface AcceptMatchRequest {
  side: 'lost' | 'found';
  // Solo side='lost' (prueba de propiedad ligera, security-privacy.md §6):
  ownershipProof?: { kind: 'historic_photo'; storagePath: string }
                 | { kind: 'private_mark';  description: string };
}
interface AcceptMatchResponse {
  status: MatchStatus;               // 'accepted' cuando ambos lados aceptaron
  contactRevealed: boolean;          // true → el puente envió los contactos por WhatsApp
}

// ---------- POST /api/matches/:id/reject ----------
interface RejectMatchRequest { side: 'lost' | 'found'; reason?: string; }
```

## 5. Códigos de error

| `code` | HTTP | Cuándo |
|---|---|---|
| `validation_error` | 400 | Zod rechazó el payload (detalle por campo en `message`) |
| `unauthorized` | 401 | Token de gestión o JWT ausente/inválido |
| `forbidden` | 403 | Token válido pero de otro reporte; tenant ajeno |
| `not_found` | 404 | Recurso inexistente, expirado o borrado (indistinguibles a propósito) |
| `conflict` | 409 | Transición de estado inválida (p. ej. aceptar un match rechazado) |
| `rate_limited` | 429 | Ver §6; incluye `Retry-After` |
| `inference_unavailable` | 503 | Pipeline de visión caído — el reporte SE CREÓ (queda `pending`); el cliente lo comunica así |
| `service_unavailable` | 503 | Circuit breaker global: se alcanzó `system_config.max_reports_per_day` y NO se creó nada. Incluye `Retry-After` |
| `internal_error` | 500 | Todo lo demás; sin detalles internos en `message` |

## 6. Rate limits (anti-abuso y anti-scraping, security-privacy.md §6)

Todos los umbrales activos son **columnas de `system_config`**: se ajustan con un
UPDATE y surten efecto en el siguiente request, sin desplegar. Las **ventanas**
sí viven en el código (`WINDOWS` en `lib/rate-limit.ts`): una ventana es parte
del diseño del limitador, no una perilla de operación.

| Límite | Alcance | Columna de `system_config` | Default | Estado |
|---|---|---|---|---|
| Creación de reportes | por IP / hora | `reports_per_ip_hour` | 3 | ✅ S3-A |
| Creación de reportes | por IP / día | `reports_per_ip_day` | 10 | ✅ S3-A |
| Creación de reportes | por `value_hash` de contacto / día | `reports_per_contact_day` | 5 | ✅ S3-A |
| Creación de reportes | **global (circuit breaker)** → 503 | `max_reports_per_day` | 200 | ✅ S3-A |
| Firmas de subida | por IP / hora | `upload_signs_per_ip_hour` | 15 | ✅ S3-A |
| Mensajes salientes | por `value_hash` destino / día | `max_messages_per_contact_per_day` | 3 | ✅ S3-A |
| Lectura de candidatos | por manage-token | — | 60/hora | pendiente (S4) |
| Fichas públicas | por IP | — | 300/hora (el share masivo de WhatsApp es legítimo) | pendiente (S4) |

Si `system_config` no responde, se usan los umbrales de respaldo de
`FALLBACK_LIMITS` (los mismos defaults): una base caída nunca abre la puerta.

La ráfaga por hora (3) se agregó en el S3-A junto al acumulado diario: sin ella,
las 10 altas del día podían salir en diez segundos, que es exactamente la forma
de un script. Las firmas de subida bajaron de 30 a 15/hora — sigue siendo el
triple de lo que consume un Flujo A completo (5 fotos).

Implementación: contadores en Postgres (`rate_limit_counters` +
`consume_rate_limits()`, migración 12), una sola llamada atómica por request.
Upstash/Redis solo si algún límite se vuelve cuello de botella (fase posterior).
Las cubetas guardan hashes, nunca la IP en claro (la IP es dato personal).

**Turnstile** (Cloudflare, invisible) protege `POST /api/reports` cuando el
entorno tiene llaves; sin ellas, el servidor no exige token y el sitio se
comporta igual que antes.

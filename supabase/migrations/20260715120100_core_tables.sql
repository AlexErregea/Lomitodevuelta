-- ============================================================================
-- LomitoDeVuelta · Migración 2 — Tablas núcleo
-- ----------------------------------------------------------------------------
-- Decisiones transversales (justificación completa en /docs/data-model.md):
--   · Multi-zona desde el día 1 (tabla zones), aunque el MVP solo opere CDMX.
--   · Multi-tenant desde el día 1 (tenant_id nullable en dogs): añadirlo
--     después obligaría a reescribir todas las políticas RLS.
--   · Privacidad por diseño: el contacto vive en su propia tabla (contacts)
--     con acceso restringido; la ubicación exacta nunca se expone en crudo.
--   · species con CHECK = 'dog': ampliar a gatos será relajar un CHECK,
--     no rediseñar el esquema. (Fase posterior.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- zones — zonas geográficas de operación (estrategia hiperlocal)
-- ----------------------------------------------------------------------------
create table public.zones (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,          -- 'cdmx', 'guadalajara', ...
  name         text not null,
  country_code char(2) not null,              -- ISO 3166-1 ('MX'); no cablear un solo país
  timezone     text not null,                 -- 'America/Mexico_City'
  center       geography(point, 4326) not null,
  radius_km    numeric(6,1) not null default 35,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- institutions — veterinarias, refugios, control animal (Flujo C, fase 3)
-- La tabla existe desde el MVP porque tenant_id de dogs apunta aquí.
-- ----------------------------------------------------------------------------
create table public.institutions (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  institution_type institution_type not null,
  zone_id          uuid references public.zones(id),
  geo_point        geography(point, 4326),
  address_text     text,
  whatsapp_e164    text,                      -- contacto público de la institución
  email            text,
  plan             text not null default 'free' check (plan in ('free', 'pro')),
  verified_at      timestamptz,               -- verificación manual antes de operar
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Vínculo entre usuarios de Supabase Auth y su institución.
-- Los ciudadanos NO tienen cuenta (ver ADR-0006, Bloque 4): solo el personal
-- institucional se autentica.
create table public.institution_members (
  user_id        uuid not null references auth.users(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  role           institution_role not null default 'member',
  created_at     timestamptz not null default now(),
  primary key (user_id, institution_id)
);

-- ----------------------------------------------------------------------------
-- dogs — un reporte de perro perdido o encontrado (la tabla central)
-- ----------------------------------------------------------------------------
create table public.dogs (
  id                   uuid primary key default gen_random_uuid(),
  species              text not null default 'dog' check (species = 'dog'),
  report_type          report_type not null,
  status               dog_status not null default 'active',

  -- Atributos extraídos por el LLM y corregibles por el usuario. JSONB y no
  -- columnas porque: (a) el vocabulario evolucionará con el modelo de visión,
  -- (b) el matching los consume en la capa 2 (TypeScript), no en filtros SQL.
  -- Forma esperada (contrato Zod en packages/shared):
  --   { "breed_mix": ["labrador"], "colors": ["negro"], "size": "large",
  --     "sex": "male", "sex_confirmed": true, "age_range": "adult",
  --     "coat_length": "short" }
  attributes           jsonb not null default '{}'::jsonb,

  -- Señas particulares en dos formas: texto libre (se muestra en la ficha)
  -- y etiquetas normalizadas a vocabulario controlado (las usa el matching).
  distinctive_marks    text,
  marks_tags           text[] not null default '{}',

  -- Ubicación EXACTA del extravío/hallazgo. Es dato personal (LFPDPPP):
  -- nunca se expone en crudo; la vista pública la difumina (~110 m).
  geo_point            geography(point, 4326) not null,
  address_text         text,                  -- referencia humana opcional ("Col. Roma Norte")
  zone_id              uuid not null references public.zones(id),
  event_date           date not null,         -- fecha del extravío o hallazgo

  finder_note          text,                  -- Flujo B: "¿dónde está el perro ahora?"
  reward_offered       boolean not null default false,  -- solo badge; sin dinero en MVP
  is_sensitive         boolean not null default false,  -- herido/fallecido → difuminado opt-in

  -- Multi-tenant: null = reporte ciudadano; con valor = reporte institucional.
  tenant_id            uuid references public.institutions(id),

  -- Los ciudadanos no tienen cuenta: gestionan su reporte con un enlace
  -- firmado (se guarda solo el hash del token). Ver ADR-0006 (Bloque 4).
  manage_token_hash    text,

  -- Estado del pipeline de visión (ADR-0003).
  embedding_status     embedding_status not null default 'pending',
  embedding_attempts   smallint not null default 0,
  embedding_last_error text,

  -- Moderación post-publicación (ADR-0010, Bloque 4).
  moderation_status    moderation_status not null default 'approved',
  moderation_reason    text,

  -- Retención (LFPDPPP): expires_at marca el fin de vigencia (renovable por
  -- el usuario); deleted_at es borrado lógico previo a la purga programada.
  expires_at           timestamptz,
  deleted_at           timestamptz,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- Todo reporte debe ser gestionable por alguien: una institución o un
  -- ciudadano con su enlace firmado.
  constraint dogs_manageable check (tenant_id is not null or manage_token_hash is not null)
);

-- ----------------------------------------------------------------------------
-- dog_photos — fotos y sus embeddings visuales
-- ----------------------------------------------------------------------------
create table public.dog_photos (
  id                      uuid primary key default gen_random_uuid(),
  dog_id                  uuid not null references public.dogs(id) on delete cascade,
  storage_path            text not null,      -- ruta en el bucket privado de Storage
  is_primary              boolean not null default false,
  is_sensitive            boolean not null default false,
  quality_score           real check (quality_score between 0 and 1),

  -- Embedding visual. La dimensión (768) la fija el modelo activo; cambiar a
  -- un modelo con otra dimensión requiere columna nueva (ADR-0003). Todo
  -- vector lleva su versión de modelo: NUNCA se comparan versiones distintas.
  embedding               vector(768),
  embedding_model_version text,

  created_at              timestamptz not null default now(),

  constraint photo_embedding_versioned
    check (embedding is null or embedding_model_version is not null)
);

-- ----------------------------------------------------------------------------
-- contacts — datos de contacto (dato personal: tabla propia, acceso mínimo)
-- ----------------------------------------------------------------------------
create table public.contacts (
  id               uuid primary key default gen_random_uuid(),
  dog_id           uuid not null references public.dogs(id) on delete cascade,
  channel          contact_channel not null,
  value            text not null,   -- E.164 o email. Solo accesible vía service_role.
  value_hash       text not null,   -- sha256: dedupe y rate-limit sin exponer el dato
  display_mask     text not null,   -- "•• •• 1234" para cualquier UI
  verified_at      timestamptz,
  consent_given_at timestamptz not null default now(),
  consent_version  text not null default 'v1',  -- versión del aviso de privacidad aceptado
  created_at       timestamptz not null default now(),
  unique (dog_id, channel)
);

-- ----------------------------------------------------------------------------
-- matching_params — parámetros del score, versionados (ADR-0004)
-- Los pesos NO viven en el código: ajustarlos no requiere despliegue y cada
-- match registra con qué versión se calculó (sin eso el feedback histórico
-- sería ininterpretable).
-- ----------------------------------------------------------------------------
create table public.matching_params (
  id                      int generated always as identity primary key,
  is_active               boolean not null default false,
  weights                 jsonb not null,  -- { visual, attributes, spatiotemporal, marks }
  thresholds              jsonb not null,  -- { show, notify, visual_floor, visual_ceil }
  geo_config              jsonb not null,  -- { base_radius_km, km_per_day, max_radius_km, max_days_window }
  embedding_model_version text not null,   -- versión activa del modelo de embeddings
  notes                   text,
  created_at              timestamptz not null default now()
);

-- Solo puede haber una configuración activa a la vez.
create unique index matching_params_one_active
  on public.matching_params (is_active) where is_active;

-- ----------------------------------------------------------------------------
-- matches — el activo de datos más valioso del sistema
-- Cada fila es una hipótesis "estos dos reportes son el mismo perro", con su
-- score desglosado y el veredicto humano. Es el dataset de calibración.
-- ----------------------------------------------------------------------------
create table public.matches (
  id                uuid primary key default gen_random_uuid(),
  dog_lost_id       uuid not null references public.dogs(id) on delete cascade,
  dog_found_id      uuid not null references public.dogs(id) on delete cascade,
  source            text not null check (source in ('sync_search', 'proactive')),
  params_id         int not null references public.matching_params(id),

  -- Desglose del score (capa 2). Se persiste completo: es lo que permite
  -- re-analizar y calibrar después.
  visual_score      real,
  attribute_score   real,
  geo_score         real,
  marks_score       real,
  total_score       real not null,

  -- Evidencia estructurada (lista de objetos Evidence, ver matching-engine.md).
  -- El texto legible se genera al mostrar, no se guarda.
  explanation       jsonb not null default '[]'::jsonb,

  status            match_status not null default 'suggested',
  lost_accepted_at  timestamptz,   -- aceptación del lado "perdí"
  found_accepted_at timestamptz,   -- aceptación del lado "encontré"
  feedback_note     text,          -- motivo de rechazo u observaciones

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint matches_distinct_dogs check (dog_lost_id <> dog_found_id),
  unique (dog_lost_id, dog_found_id)
);

-- ----------------------------------------------------------------------------
-- events — auditoría y base de las métricas de producto (North Star:
-- reuniones confirmadas). Solo se inserta, nunca se actualiza.
-- ----------------------------------------------------------------------------
create table public.events (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  event_type  text not null,       -- 'report_created', 'match_suggested', 'reunion_confirmed', ...
  actor_type  actor_type not null default 'system',
  actor_id    uuid,                -- user_id institucional; null para ciudadanos anónimos
  dog_id      uuid references public.dogs(id) on delete set null,
  match_id    uuid references public.matches(id) on delete set null,
  payload     jsonb not null default '{}'::jsonb
);

-- ----------------------------------------------------------------------------
-- notifications — salidas por WhatsApp/email con idempotencia (ADR-0008, Bloque 4)
-- ----------------------------------------------------------------------------
create table public.notifications (
  id                   uuid primary key default gen_random_uuid(),
  idempotency_key      text not null unique,  -- p. ej. 'match:{id}:notify:{contact_id}'
  recipient_contact_id uuid not null references public.contacts(id) on delete cascade,
  match_id             uuid references public.matches(id) on delete set null,
  channel              contact_channel not null,
  template_key         text not null,         -- plantilla aprobada de WhatsApp
  status               notification_status not null default 'queued',
  provider_message_id  text,
  error                text,
  created_at           timestamptz not null default now(),
  sent_at              timestamptz
);

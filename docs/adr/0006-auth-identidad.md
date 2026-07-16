# ADR-0006 — Identidad: ciudadanos sin cuenta (enlace firmado), instituciones con Supabase Auth

- **Estado**: Aceptado
- **Fecha**: 2026-07-16

## Contexto

El Flujo B es sagrado: una foto, cero fricción, sin cuenta. Pero quien reporta debe
poder **gestionar** su reporte después (corregir, renovar, borrar, aceptar matches) y
el sistema debe poder **contactarlo** cuando haya match. Las instituciones (fase 3)
sí necesitan cuentas: panel, varios empleados, permisos.

El contacto (WhatsApp) es el dato personal central y debe permanecer enmascarado
hasta la doble aceptación (security-privacy.md §3).

## Decisión

### Ciudadanos: cero cuentas; identidad = enlace de gestión firmado

1. Al crear el reporte se genera un token aleatorio (256 bits); en `dogs` se guarda
   **solo su hash** (`manage_token_hash`, como una contraseña). El enlace
   `…/r/{id}/gestionar?t={token}` se muestra una vez en pantalla y se envía por
   WhatsApp al contacto declarado.
2. **La entrega del WhatsApp ES la verificación del número**: si el mensaje llega
   (webhook de estado, ADR-0008), se marca `contacts.verified_at`. Sin OTP, sin
   costo extra, sin fricción.
3. El enlace vive en el historial de WhatsApp del usuario: sobrevive a cambios de
   dispositivo y de navegador — mejor recuperación que una sesión anónima.
4. Toda operación de gestión exige el token (`X-Manage-Token`); el servidor compara
   contra el hash. Perder el enlace → recuperación reenviándolo al MISMO WhatsApp
   registrado (nunca a uno nuevo: eso sería un vector de robo de reportes).

### Instituciones: Supabase Auth con magic link (sin contraseñas)

- Alta manual verificada (el equipo valida que la veterinaria/refugio existe →
  `institutions.verified_at`); el alta crea la institución y el primer `admin`.
- Login por **magic link a su email**: cero contraseñas que soportar/resetear —
  relevante con un solo operador humano detrás de la plataforma.
- Autorización vía `institution_members` + RLS (ADR-0007). Roles: `admin`
  (gestiona miembros y perfil) y `member` (opera reportes).

### Revelación de contacto (el puente)

Solo tras doble aceptación (`lost_accepted_at` + `found_accepted_at`, con prueba de
propiedad del lado dueño), el **servidor** envía a cada parte el contacto del otro
por WhatsApp. Nunca se muestra en la web (una página es capturable/scrapeable; un
mensaje dirigido no). El evento queda auditado en `events`.

## Consecuencias

- (+) Flujo B intacto: cero fricción, y aun así el reporte es gestionable y el
  número queda verificado de gratis.
- (+) Sin tabla de usuarios ciudadanos = menos datos personales que custodiar
  (minimización LFPDPPP).
- (−) Quien tenga el enlace gestiona el reporte (como un enlace de Google Docs).
  Mitigado: el token solo se reenvía al WhatsApp original, las acciones sensibles
  quedan en `events`, y el alcance del daño es un solo reporte.
- (−) Si WhatsApp falla al entregar el enlace, el usuario depende de haberlo
  guardado de pantalla. Mitigado: fallback por email si lo dio, y el enlace se
  muestra con botón "copiar" + aviso explícito.
- Fase posterior: si aparece la necesidad de historial multi-reporte por persona
  ("mis reportes"), se evalúa cuenta ligera opcional — nunca obligatoria en Flujo B.

## Alternativas descartadas

1. **Cuentas anónimas de Supabase Auth** — Rechazado: la sesión vive en el
   dispositivo/navegador; se pierde al limpiar cookies o cambiar de teléfono —
   exactamente el escenario de un usuario estresado semanas después. El enlace en
   WhatsApp persiste donde el usuario ya vive.
2. **OTP por SMS/WhatsApp para crear cuenta ciudadana** — Rechazado: fricción en el
   momento más crítico (Flujo B) y costo por verificación; nuestra verificación por
   entrega logra lo mismo gratis.
3. **Contraseñas para instituciones** — Rechazado: soporte de resets para usuarios
   no técnicos sin equipo de soporte. Magic link elimina la clase entera de
   problemas.
4. **Mostrar el contacto tras aceptación en la web** — Rechazado: scrapeable y
   capturable; el envío dirigido por WhatsApp deja rastro auditable y llega al
   canal donde seguirá la conversación real.

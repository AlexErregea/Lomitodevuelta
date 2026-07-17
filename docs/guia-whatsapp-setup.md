# Guía: dar de alta WhatsApp Cloud API (tarea del fundador)

> Trámite con Meta para el canal principal del producto (ADR-0008). **Empieza ya**:
> la verificación puede tardar de días a semanas y bloquea el Sprint 3 (lanzamiento).
> Costo: $0 fijo; solo pagas por mensaje de plantilla (~1-2 ¢ USD).

## Qué necesitas antes de empezar

1. **Un número de teléfono dedicado** que NO esté registrado en ninguna cuenta de
   WhatsApp (ni personal ni Business App). Una SIM nueva de prepago sirve; solo
   debe poder recibir UNA llamada o SMS de verificación. No uses tu número personal:
   quedaría inutilizado para tu WhatsApp normal.
2. **Cuenta de Meta (Facebook)** tuya y, deseable, datos del negocio (aun sin
   negocio constituido puedes operar como desarrollador, con límites).

## Pasos

1. **Crear la app en Meta for Developers** — https://developers.facebook.com →
   "My Apps" → Create App → tipo "Business" → añadir el producto **WhatsApp**.
   Esto crea automáticamente una WhatsApp Business Account (WABA) de prueba con un
   número temporal y tokens de sandbox (sirve para desarrollar YA, sprints 1-2).
2. **Registrar tu número real** — WhatsApp → API Setup → "Add phone number":
   nombre visible ("LomitoDeVuelta"), categoría, verificación por SMS/llamada.
3. **Verificación del negocio (Business Verification)** — Meta Business Suite →
   Settings → Business verification. Sin esto el número queda limitado (~250
   conversaciones/día — suficiente para el piloto, pero inicia el trámite igual).
4. **Token permanente** — crear un "System User" en Business Settings → generar
   token con permisos `whatsapp_business_messaging` y `whatsapp_business_management`.
   Ese es `WHATSAPP_ACCESS_TOKEN` (se guarda con `supabase secrets set`, jamás en
   el repo). El `WHATSAPP_PHONE_NUMBER_ID` sale de API Setup.
5. **Webhook** — cuando la Edge Function `whatsapp-webhook` esté desplegada
   (Sprint 3): configurar la URL en la app de Meta + tu `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   (lo inventas tú) y suscribirse a `messages` y `message_status`.
6. **Plantillas** (revisadas por Meta, tardan horas-días) — crear en el WhatsApp
   Manager, categoría **utility** (nunca marketing), las cuatro del sistema:
   `manage_link`, `match_found`, `contact_reveal`, `renewal_reminder` (textos
   exactos se redactan en el Sprint 1/3).

## Errores comunes

- Registrar el número en la app normal de WhatsApp "para probar" → luego no se
  puede usar en la API sin liberarlo (proceso lento).
- Pedir plantillas con lenguaje promocional → rechazo; las nuestras son
  transaccionales puras.
- Token temporal (24 h) en producción → usar siempre el de System User.

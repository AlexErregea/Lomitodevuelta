// ============================================================================
// Aviso de privacidad integral — VERSIÓN v1 (security-privacy.md §4).
// Esta versión es la que registra contacts.consent_version: si el texto
// cambia de fondo, se crea privacidad-v2.ts y las altas nuevas registran v2 —
// NUNCA se edita en silencio una versión ya aceptada.
// ⚠️ Plantilla de MVP: DEBE revisarla un abogado antes de la fase
// institucional/B2B (security-privacy.md §8).
// ============================================================================

export const PRIVACY_VERSION = 'v1';

export const privacyNotice = {
  title: 'Aviso de privacidad',
  version: PRIVACY_VERSION,
  updatedAt: '2026-07-19',
  sections: [
    {
      heading: 'Responsable del tratamiento',
      body: 'LomitoDeVuelta (en adelante, "la plataforma") es responsable del tratamiento de los datos personales que se recaban a través de este sitio, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP). Contacto para asuntos de privacidad: el correo indicado al pie de este aviso.',
    },
    {
      heading: 'Datos que recabamos',
      body: 'Recabamos únicamente lo necesario para reunir perros con sus familias: (a) un canal de contacto (número de WhatsApp o correo electrónico); (b) la ubicación y fecha del extravío o hallazgo; (c) las fotos del perro que subes. No pedimos tu nombre, dirección ni ningún otro dato de identidad.',
    },
    {
      heading: 'Para qué los usamos (finalidades)',
      body: 'Una sola finalidad: operar el servicio de reunificación. En concreto: (1) contactarte por WhatsApp o correo cuando exista una posible coincidencia con tu reporte y para entregarte tu enlace de gestión; (2) mostrar públicamente la ficha del reporte con la foto y una ubicación APROXIMADA (difuminada a ~110 metros — nunca el punto exacto). No usamos tus datos para publicidad ni los vendemos a nadie.',
    },
    {
      heading: 'Cómo protegemos tu contacto',
      body: 'Tu número o correo jamás se muestra públicamente: cualquier persona que vea tu ficha solo ve una máscara (por ejemplo "•• •• 1234"). El contacto real solo se comparte con la otra parte de una coincidencia cuando AMBAS partes la aceptan expresamente, y se envía por mensaje directo, no en la web.',
    },
    {
      heading: 'Cuánto tiempo los conservamos',
      body: 'Cada reporte tiene una vigencia de 60 días, renovable desde tu enlace de gestión. Treinta días después de que un reporte expira o se resuelve, tus datos personales (contacto, nota y ubicación exacta) se eliminan de forma definitiva y automática. Las fotos y características del perro pueden conservarse de forma anónima —sin vínculo alguno contigo— para mejorar el sistema de búsqueda.',
    },
    {
      heading: 'Tus derechos (ARCO)',
      body: 'Puedes acceder, rectificar, cancelar u oponerte al tratamiento de tus datos en cualquier momento y sin necesidad de cuenta: tu enlace de gestión permite editar y borrar tu reporte al instante. El borrado retira la ficha de inmediato y programa la purga definitiva de tus datos personales. Para solicitudes manuales, escribe al correo del responsable.',
    },
    {
      heading: 'Con quién se comparten (encargados)',
      body: 'Para operar, la plataforma usa proveedores de infraestructura que procesan datos por cuenta nuestra: alojamiento y base de datos (Supabase, Vercel), mensajería (Meta/WhatsApp, Resend), análisis de imagen (Anthropic, Replicate) y métricas de producto (PostHog). Ninguno está autorizado a usar tus datos para fines propios.',
    },
    {
      heading: 'Cambios a este aviso',
      body: 'Cada versión de este aviso está numerada. Si cambia de fondo, la versión nueva se publicará aquí y los reportes nuevos registrarán la versión que aceptaron; los cambios no aplican retroactivamente a lo ya consentido.',
    },
  ],
  // Dominio definitivo: se registró .com, no .mx. El buzón TIENE que existir de
  // verdad — este es el canal designado para ejercer derechos ARCO y un correo
  // que rebota vuelve ficticio el derecho (requiere registros MX en Cloudflare).
  contactEmail: 'privacidad@lomitodevuelta.com',
} as const;

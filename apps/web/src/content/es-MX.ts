// ============================================================================
// Textos de UI del MVP (es-MX). Regla i18n del proyecto: los textos viven en
// módulos de contenido como este, nunca cableados en JSX profundo — cambiar
// de idioma es cambiar de módulo, no cazar cadenas.
// ============================================================================

export const content = {
  home: {
    title: 'LomitoDeVuelta 🐕',
    tagline: 'Sube una foto y la IA busca por ti.',
  },
  flowB: {
    heading: 'Encontré un perro',
    photoLabel: 'Foto del perro (una basta)',
    locationLabel: 'Ubicación donde lo encontraste',
    useMyLocation: 'Usar mi ubicación actual',
    locationCaptured: 'Ubicación capturada',
    locationError: 'No pudimos obtener tu ubicación. Activa el GPS y vuelve a intentar.',
    dateLabel: '¿Cuándo lo encontraste?',
    noteLabel: '¿Dónde está el perro ahora? (opcional)',
    notePlaceholder: 'Ej. "Lo tengo en mi casa" o "Sigue en el parque de la esquina"',
    whatsappLabel: 'Tu WhatsApp (para avisarte si aparece su familia)',
    whatsappPlaceholder: '+52 55 1234 5678',
    consentLabel:
      'Acepto que mi contacto se use únicamente para conectarme si hay coincidencia, y que la foto y la ubicación aproximada se muestren públicamente.',
    privacyLink: 'Aviso de privacidad',
    submit: 'Buscar a su familia',
    stages: {
      compressing: 'Preparando la foto…',
      uploading: 'Subiendo la foto…',
      analyzing: 'La IA está analizando la foto…',
      searching: 'Buscando perros perdidos cerca de ti…',
    },
    errors: {
      missingPhoto: 'Necesitamos al menos una foto.',
      missingLocation: 'Necesitamos la ubicación para buscar cerca.',
      missingConsent: 'Necesitamos tu consentimiento para crear el reporte.',
      generic: 'Algo salió mal. Tu foto no se perdió: intenta de nuevo.',
    },
  },
  results: {
    candidatesHeading: 'Posibles coincidencias cerca de ti',
    noCandidatesHeading: 'Tu reporte quedó registrado',
    noCandidatesBody:
      'Aún no hay reportes que coincidan. El sistema seguirá buscando solo y te avisará por WhatsApp si aparece una familia buscando a este perro.',
    manageLinkHeading: 'Guarda tu enlace de gestión',
    manageLinkBody:
      'Con este enlace puedes editar o cerrar tu reporte. Te lo enviamos también por WhatsApp. Se muestra UNA sola vez:',
    copyLink: 'Copiar enlace',
    copied: '¡Copiado!',
    ambiguityWarning: 'Hay varios perros parecidos en la zona — revisa las señas particulares.',
    contactMasked: 'Contacto',
    bandLabels: {
      muy_alta: 'Coincidencia muy alta',
      alta: 'Coincidencia alta',
      posible: 'Posible coincidencia',
    } as Record<string, string>,
  },
} as const;

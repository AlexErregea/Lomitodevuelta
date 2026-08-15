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
  // Landing (puerta de entrada, ruta /). Copy del diseño del fundador.
  landing: {
    brandA: 'Lomito',
    brandB: 'DeVuelta',
    nav: {
      como: 'Cómo funciona',
      cerca: 'Cerca de ti',
      cta: 'Reportar perro',
    },
    hero: {
      badge: 'Gratis · Hecho para México',
      titleA: 'Ayúdanos a traerlo ',
      titleAccent: 'de vuelta a casa.',
      subtitle:
        'Sube su foto y nosotros hacemos el resto: la comparamos con los perros que aparecen cerca de ti y te avisamos apenas alguien lo vea. Sin costo, sin trámites.',
      ctaLost: 'Perdí a mi perro',
      ctaFound: 'Encontré un perro',
      note: 'Listo en menos de 2 minutos.',
      moduleTag: 'Así lo encontramos por ti',
      moduleYours: 'tu perro',
      moduleSimilar: 'se parecen',
      moduleSeen: 'visto ayer',
      moduleQuote: '"Creemos que vimos a tu perro en Del Valle."',
      moduleSub: 'Comparamos su carita; tú confirmas.',
    },
    features: [
      {
        title: 'Alertas por zona',
        body: 'Los vecinos cerca de donde se perdió reciben aviso al instante — no solo tus contactos.',
      },
      {
        title: 'Compara sus rasgos',
        body: 'Cruzamos su foto con los perros reportados cerca por su hocico, manchas y forma — no solo por suerte.',
      },
      {
        title: 'Gratis, sin letras chiquitas',
        body: 'Publicar un perro perdido o encontrado no cuesta nada. Nunca.',
      },
    ],
    cerca: {
      heading: 'Pasando cerca de ti ahora',
      body: 'No necesitas una ciudad llena de gente usándolo: cada foto que se sube ya sirve para encontrar a alguien.',
      cards: [
        {
          type: 'lost' as const,
          name: 'Toby',
          meta: 'Álvaro Obregón · hace 3 h · mestizo café',
          status: '2 posibles coincidencias',
          statusHighlight: true,
        },
        {
          type: 'found' as const,
          name: 'Perrito',
          meta: 'Iztapalapa · hace 1 día · negro con blanco',
          status: 'Busca a su familia',
          statusHighlight: false,
        },
        {
          type: 'lost' as const,
          name: 'Canela',
          meta: 'Tlalpan · hace 6 h · chica, collar rojo',
          status: 'Buscando en tu zona…',
          statusHighlight: false,
        },
      ],
    },
    como: {
      heading: 'Cómo funciona',
      steps: [
        {
          n: '1',
          title: 'Subes su foto',
          body: 'Una foto, dónde se perdió y cómo es. Con eso basta.',
          accent: false,
        },
        {
          n: '2',
          title: 'Avisamos a tu zona',
          body: 'Comparamos su foto con los perros reportados cerca y avisamos a los vecinos. Se comparte fácil por WhatsApp.',
          accent: false,
        },
        {
          n: '3',
          title: 'Se reencuentran',
          body: 'Cuando algo coincide, te mostramos las fotos lado a lado para que confirmes y vayas por él.',
          accent: true,
        },
      ],
      badges: ['Nunca cobramos por publicar', 'Hecho para México', 'Funciona desde el primer reporte'],
    },
    finalCta: {
      heading: '¿Se te perdió tu lomito?',
      body: 'Entre todos lo encontramos más rápido.',
      cta: 'Reportar ahora',
    },
    footer: {
      tagline: 'Reunimos perros perdidos con su familia en México. Gratis, siempre.',
      domain: 'lomitodevuelta.com',
      productHeading: 'Producto',
      productLinks: {
        lost: 'Reportar perdido',
        found: 'Reportar encontrado',
        como: 'Cómo funciona',
        privacidad: 'Aviso de privacidad',
      },
      socialHeading: 'Síguenos',
      // URLs reales pendientes: el fundador las rellena (placeholders inofensivos).
      social: [
        { label: 'Instagram · @lomitodevuelta', href: 'https://instagram.com/lomitodevuelta' },
        { label: 'Facebook · @lomitodevuelta', href: 'https://facebook.com/lomitodevuelta' },
        { label: 'TikTok · @lomitodevuelta', href: 'https://tiktok.com/@lomitodevuelta' },
      ],
      legal: 'LomitoDeVuelta nunca cobra por publicar perros perdidos o encontrados. © 2026 lomitodevuelta.com',
    },
    badges: {
      lost: 'PERDIDO',
      found: 'ENCONTRADO',
    },
  },
  // Marco común de los flujos de reporte (cabecera, controles compartidos).
  flowShell: {
    backHome: 'Volver al inicio',
  },
  // Selector de fotos: reemplaza el texto del control nativo ("Ningún archivo
  // seleccionado"), que en el flujo B es la acción más importante de la app.
  photoPicker: {
    ctaOne: 'Tomar o elegir una foto',
    ctaMany: 'Tomar o elegir fotos',
    hintOne: 'Toca para usar la cámara o tu galería.',
    hintMany: 'Toca para usar la cámara o tu galería. La primera será la principal.',
    selectedOne: '1 foto lista',
    selectedMany: 'fotos listas',
    change: 'Cambiar',
  },
  // Campo de ubicación, compartido por los dos flujos. El respaldo manual no es
  // un caso borde: mucha gente niega el permiso de ubicación por instinto.
  location: {
    useGps: 'Usar mi ubicación actual',
    locating: 'Buscando tu ubicación…',
    capturedGps: 'Ubicación capturada',
    capturedManual: 'Ubicación aproximada',
    retry: 'Reintentar',
    manualToggle: 'O elegir la alcaldía a mano',
    alcaldiaLabel: 'Alcaldía',
    alcaldiaPlaceholder: 'Elige tu alcaldía',
    referenceLabel: 'Colonia o referencia (opcional)',
    referencePlaceholder: 'Ej. Col. Roma Norte, cerca del metro',
    approxNote:
      'Con la alcaldía ya podemos empezar a buscar. Si agregas la colonia, las coincidencias salen mejor.',
    errors: {
      denied: 'No diste permiso de ubicación. No pasa nada: elige tu alcaldía aquí abajo y seguimos.',
      unavailable: 'No pudimos obtener tu ubicación. Puedes reintentar o elegir tu alcaldía aquí abajo.',
      unsupported: 'Tu navegador no comparte la ubicación. Elige tu alcaldía aquí abajo.',
    },
  },
  flowB: {
    heading: 'Encontré un perro',
    promise: 'Con una foto basta. La comparamos con los perros reportados como perdidos cerca de ti y avisamos a su familia.',
    photoLabel: 'Foto del perro (una basta)',
    locationLabel: 'Ubicación donde lo encontraste',
    dateLabel: '¿Cuándo lo encontraste?',
    noteLabel: '¿Dónde está el perro ahora? (opcional)',
    notePlaceholder: 'Ej. "Lo tengo en mi casa" o "Sigue en el parque de la esquina"',
    whatsappLabel: 'Tu WhatsApp (para avisarte si aparece su familia)',
    whatsappPlaceholder: '+52 55 1234 5678',
    consentLabel:
      'Acepto que mi contacto se use únicamente para conectarme si hay coincidencia, y que la foto y la ubicación aproximada se muestren públicamente.',
    // Responde la objeción real antes de que la persona entregue su WhatsApp:
    // el miedo no es legal, es "¿quién va a ver mi número?".
    consentReassurance:
      'Tu número nunca se muestra en público: quien vea tu ficha solo verá una máscara como •• •• 1234.',
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
  flowA: {
    heading: 'Perdí a mi perro',
    promise: 'Sube sus fotos: la IA arma su ficha y busca de inmediato entre los perros que ya reportaron encontrados.',
    homeLink: '¿Perdiste a tu perro? Repórtalo aquí',
    photosLabel: 'Fotos de tu perro (1 a 5; la primera es la principal)',
    tooManyPhotos: 'Máximo 5 fotos.',
    locationLabel: '¿Dónde se perdió?',
    dateLabel: '¿Cuándo se perdió?',
    marksLabel: 'Señas particulares (opcional — la IA también detecta algunas)',
    marksPlaceholder: 'Ej. "mancha blanca en el pecho, collar rojo"',
    submit: 'Crear reporte y buscar',
    editHeading: 'Revisa la ficha que armó la IA',
    editBody: 'Corrige lo que no coincida: tu corrección siempre gana.',
  },
  editor: {
    breedMix: 'Raza(s), separadas por coma',
    colors: 'Colores, separados por coma',
    size: 'Tamaño',
    sex: 'Sexo',
    sexConfirmedHint: 'Al elegir el sexo confirmas que lo sabes de cierto.',
    ageRange: 'Edad',
    coatLength: 'Pelo',
    distinctiveMarks: 'Señas particulares',
    unknown: '(no sé)',
    save: 'Guardar corrección',
    saved: 'Guardado ✓',
    saveError: 'No se pudo guardar. Intenta de nuevo.',
    options: {
      size: { small: 'chico', medium: 'mediano', large: 'grande' },
      sex: { male: 'macho', female: 'hembra' },
      ageRange: { puppy: 'cachorro', young: 'joven', adult: 'adulto', senior: 'senior' },
      coatLength: { short: 'corto', medium: 'mediano', long: 'largo' },
    } as Record<string, Record<string, string>>,
  },
  matches: {
    heading: 'Coincidencias',
    empty: 'Aún no hay coincidencias. El sistema sigue buscando y te avisará por WhatsApp.',
    counterpartLost: 'Perro perdido que podría ser el que encontraste',
    counterpartFound: 'Perro encontrado que podría ser el tuyo',
    viewFicha: 'Ver ficha completa',
    // Aceptación
    acceptFound: 'Sí, es el perro que encontré',
    acceptLost: 'Sí, es mi perro',
    proofHeading: 'Prueba de que es tu perro',
    proofBody:
      'Antes de conectar, comparte algo que solo el dueño sabría. Lo revisa la otra persona, no la plataforma.',
    proofKindMark: 'Describir una seña no visible en la ficha',
    proofKindPhoto: 'Subir una foto histórica del perro',
    proofMarkPlaceholder: 'Ej. "tiene una cicatriz pequeña en la pata trasera izquierda"',
    proofRequired: 'Necesitamos la prueba para continuar.',
    proofFromClaimant: 'La persona que dice ser el dueño aportó:',
    proofPhotoLabel: '(foto histórica adjunta)',
    // Estados
    waitingCounterpart: 'Aceptaste. Esperando a que la otra parte acepte para conectarlos.',
    bridgeOpen: 'Ambos aceptaron. Les enviamos el contacto por WhatsApp. 🎉',
    confirmReunionButton: 'Confirmar que se reunieron',
    reunionConfirmed: '¡Reunión confirmada! Gracias por cerrar el círculo. 🐾',
    // Rechazo
    rejectButton: 'No es',
    rejectReasonPlaceholder: '¿Por qué no? (opcional, nos ayuda a mejorar)',
    // Anti-extorsión
    safetyWarning:
      '⚠️ Nunca deposites dinero por adelantado. Si te piden un pago para "devolverte" al perro, es extorsión: repórtalo. Acuerden verse en un lugar público o una veterinaria.',
    genericError: 'Algo salió mal. Intenta de nuevo.',
  },
  manage: {
    heading: 'Gestionar tu reporte',
    promise: 'Desde aquí revisas coincidencias, corriges la ficha, renuevas la vigencia o borras todo. No necesitas cuenta: este enlace es tu llave.',
    matchesBody: 'Cuando el sistema encuentra un perro que podría ser el tuyo, aparece aquí y te avisamos por WhatsApp.',
    invalidTitle: 'Enlace de gestión inválido',
    invalidBody:
      'El enlace no corresponde a ningún reporte activo. Si perdiste tu enlace, se te puede reenviar al MISMO WhatsApp con el que creaste el reporte.',
    statusLabel: 'Estado',
    statusValues: {
      active: 'activo',
      reunited: 'reunido 🎉',
      expired: 'expirado',
      removed: 'retirado',
    } as Record<string, string>,
    expiresLabel: 'Vigente hasta',
    viewFicha: 'Ver la ficha pública',
    editHeading: 'Corregir la ficha',
    renewHeading: 'Renovar vigencia',
    renewBody: 'Extiende tu reporte 60 días más a partir de hoy.',
    renewButton: 'Renovar 60 días',
    renewed: (date: string) => `Renovado: vigente hasta ${date} ✓`,
    renewError: 'No se pudo renovar. Intenta de nuevo.',
    deleteHeading: 'Borrar el reporte',
    deleteBody:
      'El reporte deja de ser visible de inmediato y tus datos personales se purgan de forma definitiva en el siguiente ciclo programado (LFPDPPP).',
    deleteConfirm: '¿Seguro? Esta acción no se puede deshacer.',
    deleteButton: 'Borrar mi reporte',
    deleted: 'Reporte borrado. Gracias por usar LomitoDeVuelta.',
    deleteError: 'No se pudo borrar. Intenta de nuevo.',
  },
  ficha: {
    lostBadge: 'PERDIDO',
    foundBadge: 'ENCONTRADO',
    lostHeading: 'Se busca a este perro',
    foundHeading: 'Este perro fue encontrado',
    eventDateLost: 'Se perdió el',
    eventDateFound: 'Encontrado el',
    nearLabel: 'Cerca de',
    marksLabel: 'Señas particulares',
    rewardBadge: 'Ofrece recompensa',
    // La ficha llega por WhatsApp a alguien que no conoce el producto: hay que
    // decirle qué hacer con lo que está viendo, no solo mostrárselo.
    helpHeading: '¿Puedes ayudar?',
    helpBody: 'Compartirlo multiplica las probabilidades. Cada persona que lo vea es una posibilidad más de que vuelva a casa.',
    sensitiveWarning: 'Imagen sensible: el perro podría verse herido.',
    tapToReveal: 'Toca para ver',
    shareButton: 'Compartir por WhatsApp',
    shareText: (badge: string) => `${badge} 🐕 Ayúdalo a volver con su familia:`,
    ctaLost: '¿Lo encontraste tú? Repórtalo aquí',
    ctaFound: '¿Es tu perro? Crea tu reporte para conectar',
    cta: 'Ayúdalo a volver 🐾',
    notFoundTitle: 'Este reporte ya no está disponible',
    notFoundBody: 'Puede haber expirado, haberse retirado, o el enlace es incorrecto.',
    attributeLabels: {
      breedMix: 'Raza',
      colors: 'Colores',
      size: 'Tamaño',
      sex: 'Sexo',
      ageRange: 'Edad',
      coatLength: 'Pelo',
    } as Record<string, string>,
    attributeValues: {
      small: 'chico',
      medium: 'mediano',
      large: 'grande',
      male: 'macho',
      female: 'hembra',
      puppy: 'cachorro',
      young: 'joven',
      adult: 'adulto',
      senior: 'senior',
      short: 'corto',
      long: 'largo',
    } as Record<string, string>,
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

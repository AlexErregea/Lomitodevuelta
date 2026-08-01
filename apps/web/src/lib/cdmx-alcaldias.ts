// ============================================================================
// Alcaldías de la CDMX con su centro aproximado. Es el respaldo cuando no hay
// GPS: quien niega el permiso de ubicación (o no lo tiene) igual puede reportar
// eligiendo su alcaldía. Sin esto el formulario queda intransitable y se pierde
// el reporte — inaceptable en el Flujo B, que es el lado escaso de la red.
//
// Por qué una lista estática y no la BD ni un geocodificador:
//   · La tabla `zones` modela zonas de OPERACIÓN (ciudades), no divisiones
//     internas; meter alcaldías ahí mezclaría dos conceptos.
//   · Un geocodificador sería un servicio externo nuevo (ADR + costo + red);
//     esto funciona sin conexión y sin dependencias.
// Al abrir una segunda ciudad, este archivo crece a un mapa por zona.
//
// ⚠️ Precisión: son centros aproximados, no centroides oficiales. El error
// (~2-5 km) degrada suavemente el score espaciotemporal — S_geo decae
// exponencial, no descarta (matching-engine.md §4.2) — y la ubicación pública
// se difumina de todos modos. Un reporte aproximado siempre vale más que
// ningún reporte. Los nombres son topónimos: no se traducen (no van a i18n).
// ============================================================================

export interface Alcaldia {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export const CDMX_ALCALDIAS: readonly Alcaldia[] = [
  { id: 'alvaro-obregon', name: 'Álvaro Obregón', lat: 19.3587, lng: -99.2432 },
  { id: 'azcapotzalco', name: 'Azcapotzalco', lat: 19.4828, lng: -99.1847 },
  { id: 'benito-juarez', name: 'Benito Juárez', lat: 19.3727, lng: -99.1565 },
  { id: 'coyoacan', name: 'Coyoacán', lat: 19.3467, lng: -99.1618 },
  { id: 'cuajimalpa', name: 'Cuajimalpa de Morelos', lat: 19.3573, lng: -99.2996 },
  { id: 'cuauhtemoc', name: 'Cuauhtémoc', lat: 19.4326, lng: -99.145 },
  { id: 'gustavo-a-madero', name: 'Gustavo A. Madero', lat: 19.4833, lng: -99.1167 },
  { id: 'iztacalco', name: 'Iztacalco', lat: 19.3958, lng: -99.0972 },
  { id: 'iztapalapa', name: 'Iztapalapa', lat: 19.3574, lng: -99.0678 },
  { id: 'magdalena-contreras', name: 'La Magdalena Contreras', lat: 19.305, lng: -99.24 },
  { id: 'miguel-hidalgo', name: 'Miguel Hidalgo', lat: 19.4333, lng: -99.2 },
  { id: 'milpa-alta', name: 'Milpa Alta', lat: 19.1925, lng: -99.0233 },
  { id: 'tlahuac', name: 'Tláhuac', lat: 19.2686, lng: -99.0047 },
  { id: 'tlalpan', name: 'Tlalpan', lat: 19.2911, lng: -99.1667 },
  { id: 'venustiano-carranza', name: 'Venustiano Carranza', lat: 19.42, lng: -99.11 },
  { id: 'xochimilco', name: 'Xochimilco', lat: 19.257, lng: -99.103 },
];

export function findAlcaldia(id: string): Alcaldia | undefined {
  return CDMX_ALCALDIAS.find((a) => a.id === id);
}

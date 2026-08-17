// ============================================================================
// Dálmata de marca, en dos ángulos. Su trabajo en el hero es explicar sin texto
// lo que hace el producto: EL MISMO perro, fotografiado por dos personas
// distintas, reconocido como uno solo. Por eso son dos vistas del mismo animal
// y no dos perros diferentes — si fueran distintos, la ilustración contaría lo
// contrario de lo que hace el motor.
//
// Se eligió dálmata por una razón práctica: las manchas dan puntos de
// referencia inequívocos entre las dos vistas. Un perro de color liso no
// dejaría "ver" el parecido de un vistazo.
//
// Vectorial y no imagen generada: pesa un par de KB, es nítido en cualquier
// pantalla y comparte el trazo geométrico plano del logo (components/brand.tsx),
// del que reutiliza literalmente la silueta de la cabeza.
// ============================================================================

const CREMA = '#F5EEE1';
const TINTA = '#2E241C';
const AMBAR = '#A6661B';

/** Vista de frente — la foto que sube la familia. */
export function DalmataFrente({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      {/* Orejas caídas, detrás de la cabeza */}
      <path d="M34 48 Q18 52 16 68 Q15 82 25 86 Q33 88 34 76 Q33 62 34 48 Z" fill={CREMA} />
      <path d="M86 48 Q102 52 104 68 Q105 82 95 86 Q87 88 86 76 Q87 62 86 48 Z" fill={CREMA} />
      <ellipse cx="24" cy="68" rx="5" ry="6.5" fill={TINTA} opacity=".9" />
      <ellipse cx="96" cy="70" rx="4.5" ry="5.5" fill={TINTA} opacity=".9" />

      {/* Cabeza: misma silueta que el logo */}
      <path d="M32 48 Q32 88 60 96 Q88 88 88 48 Q88 34 60 34 Q32 34 32 48 Z" fill={CREMA} />

      {/* Manchas */}
      <ellipse cx="45" cy="45" rx="6.5" ry="5.5" fill={TINTA} opacity=".9" />
      <ellipse cx="76" cy="48" rx="5" ry="4.5" fill={TINTA} opacity=".9" />
      <ellipse cx="61" cy="38" rx="3.5" ry="3" fill={TINTA} opacity=".75" />
      <ellipse cx="38" cy="62" rx="3" ry="3.5" fill={TINTA} opacity=".7" />

      {/* Hocico, ojos y nariz — posiciones del logo */}
      <path d="M48 70 Q60 78 72 70 Q72 84 60 86 Q48 84 48 70 Z" fill="#fff" />
      <circle cx="47" cy="56" r="3.4" fill={TINTA} />
      <circle cx="73" cy="56" r="3.4" fill={TINTA} />
      <ellipse cx="60" cy="72" rx="5" ry="4" fill={TINTA} />
    </svg>
  );
}

/**
 * Cabeza y pecho, ligeramente inclinada — la foto que toma quien lo encuentra.
 *
 * Se descartaron dos alternativas y vale la pena registrar por qué. El perfil
 * lateral era el ángulo más limpio, pero casi ninguna mancha coincidía con la
 * vista de frente y se leía como OTRO perro: rompía justo el mensaje. Girar el
 * frente sin más decía "misma foto inclinada", no "otra persona la tomó".
 *
 * Esta cambia el encuadre —muestra el pecho— conservando la cara reconocible,
 * así que suma referencias nuevas sin perder las viejas. La inclinación de unos
 * grados es deliberada: una segunda foto de la calle nunca sale centrada.
 */
export function DalmataPerfil({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <g transform="rotate(-9 60 62)">
        {/* Pecho: las manchas de aquí son las referencias nuevas */}
        <path d="M30 88 Q26 104 30 120 L92 120 Q96 102 90 88 Q76 80 60 80 Q42 80 30 88 Z" fill={CREMA} />
        <ellipse cx="44" cy="103" rx="6" ry="5" fill={TINTA} opacity=".85" />
        <ellipse cx="76" cy="110" rx="5" ry="4.4" fill={TINTA} opacity=".8" />

        {/* Orejas */}
        <path d="M36 44 Q22 48 20 62 Q19 74 28 78 Q35 80 36 69 Q35 56 36 44 Z" fill={CREMA} />
        <path d="M84 44 Q98 48 100 62 Q101 74 92 78 Q85 80 84 69 Q85 56 84 44 Z" fill={CREMA} />
        <ellipse cx="27" cy="62" rx="4.6" ry="6" fill={TINTA} opacity=".9" />

        {/* Cabeza: misma silueta del logo, un poco más chica por el encuadre */}
        <path d="M36 46 Q36 80 60 87 Q84 80 84 46 Q84 34 60 34 Q36 34 36 46 Z" fill={CREMA} />

        {/* Las MISMAS manchas de la cara: es lo que prueba que es el mismo perro */}
        <ellipse cx="47" cy="44" rx="6" ry="5" fill={TINTA} opacity=".9" />
        <ellipse cx="74" cy="47" rx="4.6" ry="4" fill={TINTA} opacity=".9" />

        <path d="M50 66 Q60 73 70 66 Q70 78 60 80 Q50 78 50 66 Z" fill="#fff" />
        <circle cx="50" cy="54" r="3.1" fill={TINTA} />
        <circle cx="71" cy="54" r="3.1" fill={TINTA} />
        <ellipse cx="60" cy="68" rx="4.4" ry="3.5" fill={TINTA} />
      </g>
    </svg>
  );
}

/** Marca de coincidencia: el gesto de "estos dos son el mismo". */
export function HuellaMatch({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <ellipse cx="17" cy="21" rx="8" ry="7" fill={AMBAR} />
      <ellipse cx="8" cy="12" rx="3.2" ry="4" fill={AMBAR} />
      <ellipse cx="14" cy="8" rx="3" ry="4.2" fill={AMBAR} />
      <ellipse cx="21" cy="8" rx="3" ry="4.2" fill={AMBAR} />
      <ellipse cx="27" cy="12" rx="3.2" ry="4" fill={AMBAR} />
    </svg>
  );
}

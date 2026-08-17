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

/** Tres cuartos, mirando a la izquierda — la foto que toma quien lo encuentra. */
export function DalmataPerfil({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      {/* Oreja del lado lejano, apenas asomada */}
      <path d="M84 46 Q98 50 100 66 Q101 78 92 82 Q85 84 84 72 Z" fill={CREMA} opacity=".75" />

      {/* Cabeza girada: misma proporción, desplazada y con el hocico saliendo */}
      <path d="M38 50 Q36 88 62 95 Q88 88 88 50 Q88 36 62 36 Q38 36 38 50 Z" fill={CREMA} />

      {/* Oreja cercana, más grande por la perspectiva */}
      <path d="M40 48 Q22 54 20 72 Q19 86 30 89 Q39 90 40 77 Q39 62 40 48 Z" fill={CREMA} />
      <ellipse cx="29" cy="72" rx="5.5" ry="7" fill={TINTA} opacity=".9" />

      {/* Las MISMAS manchas, corridas por el giro: es el mismo perro */}
      <ellipse cx="52" cy="47" rx="6" ry="5" fill={TINTA} opacity=".9" />
      <ellipse cx="79" cy="52" rx="4.5" ry="4" fill={TINTA} opacity=".85" />
      <ellipse cx="66" cy="40" rx="3.2" ry="2.8" fill={TINTA} opacity=".75" />

      {/* Hocico proyectado hacia la izquierda */}
      <path d="M38 66 Q26 68 24 76 Q24 84 34 84 Q46 83 50 76 Q50 68 38 66 Z" fill="#fff" />
      <ellipse cx="27" cy="74" rx="4.2" ry="3.4" fill={TINTA} />
      <circle cx="52" cy="58" r="3.4" fill={TINTA} />
      <circle cx="76" cy="60" r="3" fill={TINTA} opacity=".85" />
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

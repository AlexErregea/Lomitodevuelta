import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

// Textos de UI: siempre desde este tipo de constantes/props, nunca cableados
// en JSX profundo — regla i18n del proyecto (el MVP es es-MX, pero no se
// asume un solo idioma para siempre).
export const metadata: Metadata = {
  title: 'LomitoDeVuelta',
  description:
    'Sube una foto y la IA busca por ti. Red de reunificación de perros perdidos y encontrados.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-MX">
      <body>{children}</body>
    </html>
  );
}

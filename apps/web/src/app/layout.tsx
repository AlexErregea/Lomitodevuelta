import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, Work_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

// Fuentes del diseño (next/font las auto-hospeda; sin <link> externo en runtime).
// Se exponen como CSS variables que globals.css mapea a --font-display/--font-sans.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});
const workSans = Work_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-work-sans',
  display: 'swap',
});

// Textos de UI: siempre desde módulos de contenido (src/content), nunca
// cableados en JSX profundo — regla i18n del proyecto (MVP es-MX).
export const metadata: Metadata = {
  title: 'LomitoDeVuelta — Ayúdanos a traerlo de vuelta a casa',
  description:
    'Sube su foto y nosotros hacemos el resto: la comparamos con los perros que aparecen cerca de ti y te avisamos apenas alguien lo vea. Gratis, hecho para México.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-MX" className={`${spaceGrotesk.variable} ${workSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}

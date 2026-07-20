import Link from 'next/link';
import { content } from '@/content/es-MX';
import { ReportForm } from './report-form';

// Página raíz del MVP: el Flujo B ("encontré un perro") es el flujo sagrado
// de fricción cero y vive directo en la home; el Flujo A tiene su página.
export default function HomePage() {
  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: '1rem' }}>
      <h1>{content.home.title}</h1>
      <p>{content.home.tagline}</p>
      <ReportForm />
      <p>
        <Link href="/perdi">{content.flowA.homeLink}</Link>
      </p>
    </main>
  );
}

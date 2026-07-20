import { content } from '@/content/es-MX';
import { ReportForm } from './report-form';

// Página raíz del MVP: el Flujo B ("encontré un perro") es el flujo sagrado
// de fricción cero y vive directo en la home. El Flujo A llega en Sprint 2.
export default function HomePage() {
  return (
    <main>
      <h1>{content.home.title}</h1>
      <p>{content.home.tagline}</p>
      <ReportForm />
    </main>
  );
}

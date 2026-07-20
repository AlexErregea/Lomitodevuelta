import Link from 'next/link';
import { content } from '@/content/es-MX';
import { LostForm } from './lost-form';

// Flujo A — "perdí a mi perro" (Sprint 2): multi-foto, ficha autocompletada
// por la IA y corregible, búsqueda inmediata contra perros encontrados.
export default function PerdiPage() {
  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: '1rem' }}>
      <p>
        <Link href="/">← {content.home.title}</Link>
      </p>
      <LostForm />
    </main>
  );
}

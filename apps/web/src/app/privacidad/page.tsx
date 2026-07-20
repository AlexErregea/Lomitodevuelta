import type { Metadata } from 'next';
import Link from 'next/link';
import { content } from '@/content/es-MX';
import { privacyNotice } from '@/content/privacidad-v1';

// Aviso de privacidad integral (/privacidad) — versión registrada en
// contacts.consent_version en cada alta (security-privacy.md §4).
export const metadata: Metadata = {
  title: `${privacyNotice.title} · LomitoDeVuelta`,
};

export default function PrivacidadPage() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '1rem' }}>
      <p>
        <Link href="/">← {content.home.title}</Link>
      </p>
      <h1>{privacyNotice.title}</h1>
      <p>
        Versión {privacyNotice.version} · Última actualización: {privacyNotice.updatedAt}
      </p>
      {privacyNotice.sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          <p>{section.body}</p>
        </section>
      ))}
      <p>
        Contacto: <a href={`mailto:${privacyNotice.contactEmail}`}>{privacyNotice.contactEmail}</a>
      </p>
    </main>
  );
}

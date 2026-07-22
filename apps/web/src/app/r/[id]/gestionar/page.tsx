import { z } from 'zod';
import { MatchesPanel } from '@/components/matches-panel';
import { content } from '@/content/es-MX';
import { parseAttributes } from '@/lib/candidates';
import { verifyManageToken } from '@/lib/manage-token';
import { loadReportMatches } from '@/lib/matches';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ManagePanel } from './manage-panel';

// ============================================================================
// /r/:id/gestionar?t=... — la puerta de gestión del ciudadano (ADR-0006).
// El token viaja en la URL que recibió por WhatsApp; se valida en el servidor
// ANTES de montar el panel. Un token inválido muestra el mismo mensaje que un
// id inexistente: nada que aprender para un atacante.
// ============================================================================

const t = content.manage;
const idSchema = z.string().uuid();

export const dynamic = 'force-dynamic';

export default async function GestionarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t: token } = await searchParams;

  const invalid = (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: '1rem' }}>
      <h1>{t.invalidTitle}</h1>
      <p>{t.invalidBody}</p>
    </main>
  );

  if (!idSchema.safeParse(id).success || !token) return invalid;

  const { data: dog } = await supabaseAdmin()
    .from('dogs')
    .select('id, status, expires_at, attributes, distinctive_marks, manage_token_hash, deleted_at')
    .eq('id', id)
    .single();
  if (
    !dog ||
    dog.deleted_at !== null ||
    !dog.manage_token_hash ||
    !verifyManageToken(token, dog.manage_token_hash as string)
  ) {
    return invalid;
  }

  const matches = await loadReportMatches(dog.id as string);

  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: '1rem' }}>
      <h1>{t.heading}</h1>

      <h2>{content.matches.heading}</h2>
      <MatchesPanel matches={matches} manageToken={token} />

      <ManagePanel
        reportId={dog.id}
        manageToken={token}
        status={dog.status as string}
        expiresAt={(dog.expires_at as string | null) ?? null}
        attributes={parseAttributes(dog.attributes)}
        distinctiveMarks={(dog.distinctive_marks as string | null) ?? null}
      />
    </main>
  );
}

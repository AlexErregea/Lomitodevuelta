import { z } from 'zod';
import { FlowShell, FlowHeading } from '@/components/flow-shell';
import { MatchesPanel } from '@/components/matches-panel';
import { content } from '@/content/es-MX';
import { parseAttributes } from '@/lib/candidates';
import { verifyManageToken } from '@/lib/manage-token';
import { authenticateMatchLink } from '@/lib/match-auth';
import { loadReportMatches } from '@/lib/matches';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ManagePanel } from './manage-panel';

// ============================================================================
// /r/:id/gestionar?t=... — la puerta de gestión del ciudadano (ADR-0006).
// El token viaja en la URL que recibió por WhatsApp; se valida en el servidor
// ANTES de montar el panel. Un token inválido muestra el mismo mensaje que un
// id inexistente: nada que aprender para un atacante.
//
// Dos niveles de permiso en la misma ruta:
//
//   · `?t=` con el token de gestión → el panel completo (coincidencias +
//     editar, renovar y borrar).
//   · `?m={matchId}&t=` con el token del aviso de coincidencia → SOLO esa
//     coincidencia y sus botones. Es el enlace que llega por WhatsApp cuando
//     hay match, y a propósito no da acceso ARCO: se reenvía por chat con
//     facilidad y nadie debería poder borrar un reporte con un mensaje
//     reenviado (migración 13).
//
// Que sea la misma ruta no es casualidad: encaja con el cuerpo de la plantilla
// `match_found` ya aprobada en Meta, que apunta a /gestionar.
// ============================================================================

const t = content.manage;
const idSchema = z.string().uuid();

export const dynamic = 'force-dynamic';

export default async function GestionarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string; m?: string }>;
}) {
  const { id } = await params;
  const { t: token, m: matchId } = await searchParams;

  // Mismo mensaje para token inválido, id inexistente o reporte borrado: no hay
  // nada que un atacante pueda deducir de la diferencia.
  const invalid = (
    <FlowShell>
      <div className="rounded-[14px] border border-borde bg-crema-card p-5">
        <h1 className="font-display text-[22px] font-bold leading-[1.2]">{t.invalidTitle}</h1>
        <p className="mt-2 text-[15px] leading-[1.6] text-[#5b4b3a]">{t.invalidBody}</p>
      </div>
    </FlowShell>
  );

  if (!idSchema.safeParse(id).success || !token) return invalid;

  // ---- Modo coincidencia: el enlace que llega por WhatsApp cuando hay match --
  // Se resuelve primero porque su token NO es el de gestión y no abriría el
  // panel completo. Lo único que puede hacer es responder esa coincidencia.
  if (matchId) {
    const link = await authenticateMatchLink(id, matchId, token);
    if (!link) return invalid;

    const match = (await loadReportMatches(id)).find((m) => m.matchId === matchId);
    // Un match ya rechazado o cerrado no está en la bandeja visible: se trata
    // como enlace vencido en vez de mostrar una página vacía.
    if (!match) return invalid;

    return (
      <FlowShell>
        {/* El encabezado dice a qué viniste. Llegar aquí desde el aviso y leer
            "gestiona tu reporte" obligaba a adivinar qué se esperaba de ti. */}
        <FlowHeading title={content.matches.linkHeading} promise={content.matches.linkPromise} />
        <section className="rounded-[14px] border border-borde bg-white p-4">
          <MatchesPanel matches={[match]} manageToken={token} />
        </section>
        <p className="mt-4 text-[13px] leading-[1.6] text-[#6b5a48]">{content.matches.linkScopeNote}</p>
      </FlowShell>
    );
  }

  const { data: dog } = await supabaseAdmin()
    .from('dogs')
    .select('id, status, expires_at, attributes, distinctive_marks, pet_name, report_type, manage_token_hash, deleted_at')
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
    <FlowShell>
      <FlowHeading title={t.heading} promise={t.promise} />

      {/* Las coincidencias van primero: es lo único que puede cambiar sin que
          la persona haga nada, y la razón por la que vuelve a abrir el enlace. */}
      <section className="mb-4 rounded-[14px] border border-borde bg-white p-4">
        <h2 className="font-display text-lg font-bold">{content.matches.heading}</h2>
        <p className="mt-1 text-[14px] leading-[1.55] text-[#5b4b3a]">{t.matchesBody}</p>
        <div className="mt-4">
          <MatchesPanel matches={matches} manageToken={token} />
        </div>
      </section>

      <ManagePanel
        reportId={dog.id}
        manageToken={token}
        status={dog.status as string}
        expiresAt={(dog.expires_at as string | null) ?? null}
        attributes={parseAttributes(dog.attributes)}
        distinctiveMarks={(dog.distinctive_marks as string | null) ?? null}
        // Solo el Flujo A tiene nombre; en el B se pasa null y el editor lo oculta.
        petName={dog.report_type === 'lost' ? ((dog.pet_name as string | null) ?? '') : null}
      />
    </FlowShell>
  );
}

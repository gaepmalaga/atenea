import 'server-only';

import { supabaseAdmin } from '../actions/core';
import { sendMail } from './mailer';
import { plantillaSolicitudAdmin } from './app-email-templates';
import { ACCESS_STATUS, type MembershipRow } from './membership';

/**
 * EL PRIMER CONTACTO DE UN ALUMNO NUEVO (P12).
 *
 * Antes, "pendiente" era la AUSENCIA de fila en `memberships` (regla 52) — no
 * hacía falta más porque nadie avisaba de nada, el admin tenía que abrir el
 * panel para enterarse. Ahora la norma global es que TODO alumno nuevo espera
 * a que su academia lo acepte (incluida `atenea`, la casa), y el aviso llega
 * por correo — así que el primer contacto necesita dejar rastro: una fila
 * real con `access_status = 'pending'`, para poder decir "esto ya se avisó"
 * y no volver a mandar el correo cada vez que el alumno abre la app.
 *
 * Se llama desde `checkAccess` (`auth.ts`), en cada sesión de un alumno sin
 * fila. El aviso solo sale la PRIMERA vez: el upsert es `ignoreDuplicates`
 * (regla 3), así que dos peticiones a la vez (dos pestañas abriéndose juntas)
 * ven la fila ya creada por la otra y ninguna manda el correo dos veces.
 *
 * LA EXCEPCIÓN: `membership_exemptions` es la lista blanca que deja el admin
 * de antemano — un correo ahí entra directo, `active` y `exempt`, sin
 * solicitud ni aviso a nadie.
 *
 * Nunca lanza: un fallo aquí cae en el mismo `catch` de `checkAccess`, que
 * abre la puerta (regla 34) — más grave dejar fuera a alguien por un fallo de
 * escritura que dejar pasar una sesión sin fila materializada todavía.
 */
export async function resolveFirstContact(
  organizationId: string,
  userId: string,
  email: string,
): Promise<MembershipRow> {
  const correo = email.trim().toLowerCase();

  if (correo) {
    const { data: exento } = await supabaseAdmin
      .from('membership_exemptions')
      .select('email')
      .eq('organization_id', organizationId)
      .eq('email', correo)
      .maybeSingle();

    if (exento) {
      const { data } = await supabaseAdmin
        .from('memberships')
        .upsert(
          {
            organization_id: organizationId,
            user_id: userId,
            access_status: ACCESS_STATUS.ACTIVE,
            exempt: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id,user_id' },
        )
        .select('access_status, payment_status, exempt')
        .maybeSingle();
      return (data as MembershipRow) ?? { access_status: ACCESS_STATUS.ACTIVE, exempt: true };
    }
  }

  const { data: creada, error } = await supabaseAdmin
    .from('memberships')
    .upsert(
      { organization_id: organizationId, user_id: userId, access_status: ACCESS_STATUS.PENDING },
      { onConflict: 'organization_id,user_id', ignoreDuplicates: true },
    )
    .select('access_status, payment_status, exempt');

  if (!error && creada && creada.length > 0) {
    avisarAdmins(organizationId, correo).catch((e) =>
      console.error('[solicitud-alta] aviso al admin:', e instanceof Error ? e.message : e),
    );
  }

  return { access_status: ACCESS_STATUS.PENDING, exempt: false };
}

/** Manda el aviso a los `admin` de ESTA academia. Un `superadmin` no administra ninguna (regla 65), así que no cuenta aquí. */
async function avisarAdmins(organizationId: string, alumnoEmail: string): Promise<void> {
  const [{ data: academia }, { data: miembros }] = await Promise.all([
    supabaseAdmin.from('academies').select('slug, name').eq('id', organizationId).maybeSingle(),
    supabaseAdmin.from('academy_members').select('user_id').eq('academy_id', organizationId),
  ]);
  if (!academia || !miembros?.length) return;

  const ids = miembros.map((m) => m.user_id as string);
  const { data: perfiles } = await supabaseAdmin.from('profiles').select('id, email, role').in('id', ids);
  const correosAdmin = (perfiles ?? [])
    .filter((p) => p.role === 'admin')
    .map((p) => p.email as string | null)
    .filter((e): e is string => !!e);
  if (!correosAdmin.length) return;

  const panelUrl = `${siteUrl()}/${academia.slug}`;
  const { subject, html } = plantillaSolicitudAdmin({
    alumnoEmail: alumnoEmail || '(correo desconocido)',
    academiaName: academia.name,
    panelUrl,
  });
  await sendMail({ to: correosAdmin, subject, html });
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://atenea-eight.vercel.app';
}

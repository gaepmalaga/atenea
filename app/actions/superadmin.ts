'use server'

import { supabaseAdmin } from './core';
import { requireSuperadmin } from '../lib/auth';
import { registraAccion } from '../lib/admin-audit';
import {
  normalizeAcademyInput,
  resumeAcademias,
  type AcademyStats,
} from '../lib/academies';
import { periodoActual } from '../lib/payments';
import { fallo } from '../lib/fallos';
import { sendMail } from '../lib/mailer';
import { siteUrl } from '../lib/registration-requests';
import { plantillaInvitacionAdmin } from '../lib/app-email-templates';

/**
 * EL PANEL TRANSVERSAL DEL SUPERADMIN (P11f) Y EL ALTA DE ACADEMIAS (P11i).
 *
 * Todo con `requireSuperadmin`, no `requireAdmin`: esto no es «más admin», es
 * ver y decidir cosas de TODAS las academias a la vez — exactamente lo que un
 * `admin` normal no puede hacer (regla 65). Va con la clave de servicio por
 * lo mismo de siempre (regla 34/35): estas tablas no tienen política que deje
 * pasar a nadie con su propia sesión.
 *
 * La aritmética de la comparativa vive en `lib/academies.ts`
 * (`resumeAcademias`), no aquí (regla 21).
 */

const MAX_FILAS_GASTO = 50_000;
const MAX_PERFILES = 5_000;

export async function getAcademiesOverview(): Promise<
  { success: true; data: AcademyStats[] } | { success: false; error: string }
> {
  const auth = await requireSuperadmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const periodo = periodoActual();
  const [academiasRes, miembrosRes, perfilesRes, gastoRes, pagosRes, usuariosRes] = await Promise.all([
    supabaseAdmin.from('academies').select('id, slug, name').order('name'),
    supabaseAdmin.from('academy_members').select('academy_id, user_id'),
    supabaseAdmin.from('profiles').select('id, role, email').limit(MAX_PERFILES),
    supabaseAdmin.from('ai_usage').select('user_id, cost_usd').limit(MAX_FILAS_GASTO),
    supabaseAdmin.from('monthly_payments').select('organization_id, amount_eur, paid').eq('period', periodo),
    // Si esto falla, se sigue: se pierde el estado (pendiente/activo) y el
    // último acceso de cada admin, no el panel entero.
    supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }).catch(() => null),
  ]);

  if (academiasRes.error) {
    console.error('getAcademiesOverview:', academiasRes.error.message);
    return { success: false as const, error: fallo('getAcademiesOverview', academiasRes.error) };
  }

  const roles = new Map<string, string>();
  const correos = new Map<string, string | null>();
  for (const p of perfilesRes.data ?? []) {
    roles.set(p.id as string, (p.role as string) ?? 'student');
    correos.set(p.id as string, (p.email as string) ?? null);
  }

  // `cost_usd` es `numeric` en Postgres: PostgREST lo sirve como CADENA
  // (regla del panel de consumo de IA, `lib/ai-cost.ts`). Sumarlo sin
  // `parseFloat` daría 0 y la comparativa mentiría diciendo que todo es gratis.
  const costePorUsuario = new Map<string, number>();
  for (const f of gastoRes.data ?? []) {
    const uid = f.user_id as string | null;
    if (!uid) continue;
    const raw = f.cost_usd as number | string | null;
    const coste = typeof raw === 'string' ? Number.parseFloat(raw) : typeof raw === 'number' ? raw : 0;
    if (!Number.isFinite(coste) || coste <= 0) continue;
    costePorUsuario.set(uid, (costePorUsuario.get(uid) ?? 0) + coste);
  }

  // Pendiente/activo y última conexión de cada admin, del mismo
  // `listUsers()` que ya usan `academy.ts` (panel de UNA academia) y
  // `audit.ts` («Logs»): `email_confirmed_at` nulo es una invitación sin
  // canjear todavía.
  const pendientes = new Map<string, boolean>();
  const ultimosAccesos = new Map<string, string | null>();
  for (const u of usuariosRes?.data?.users ?? []) {
    pendientes.set(u.id, !u.email_confirmed_at);
    ultimosAccesos.set(u.id, u.last_sign_in_at ?? null);
  }

  const data = resumeAcademias(
    (academiasRes.data ?? []) as { id: string; slug: string; name: string }[],
    (miembrosRes.data ?? []) as { academy_id: string; user_id: string }[],
    roles,
    costePorUsuario,
    (pagosRes.data ?? []) as { organization_id: string | null; amount_eur: number | null; paid: boolean }[],
    correos,
    pendientes,
    ultimosAccesos,
  );

  return { success: true as const, data };
}

/**
 * Da de alta una academia (P11i). No es un guion de línea de comandos ni un
 * flujo de autorregistro (decidido): el `superadmin` ya es quien controla el
 * banco global y ve todas las academias, así que dar de alta una nueva es una
 * pantalla más de su panel.
 *
 * No hace falta sembrar nada más: `academy_settings`, `membership_settings` y
 * `academy_convocatoria` no tienen fila hasta que un admin de esa academia
 * guarda algo por primera vez, y las acciones que las leen ya degradan con
 * gracia sin ella (regla 8). `membership_settings.required` sin fila se lee
 * como `false` — la academia nace abierta, como el resto (regla 52).
 */
export async function createAcademy(
  input: unknown,
): Promise<{ success: true; id: string; slug: string } | { success: false; error: string }> {
  const auth = await requireSuperadmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const clean = normalizeAcademyInput((input ?? {}) as Record<string, unknown>);
  if (!clean) return { success: false as const, error: 'Falta el nombre, o el slug no es válido.' };

  const { data, error } = await supabaseAdmin
    .from('academies')
    .insert({ slug: clean.slug, name: clean.name })
    .select('id')
    .single();

  if (error) {
    const duplicada = /duplicate key|unique/i.test(error.message);
    return { success: false as const, error: duplicada ? `Ya existe una academia con el enlace «${clean.slug}».` : fallo('createAcademy', error) };
  }

  registraAccion({ actorId: auth.user.id, action: 'create_academy', target: clean.name, detail: { slug: clean.slug } });
  return { success: true as const, id: data.id as string, slug: clean.slug };
}

/**
 * Añade a alguien como admin de una academia, por su correo.
 *
 * Una academia recién creada no tiene a nadie que pueda administrarla — sin
 * esto, darla de alta sería un callejón sin salida. Dos caminos:
 *
 *  - **La cuenta ya existe**: si es `student`, la sube a `admin`; si ya es
 *    `admin` o `superadmin`, se deja el rol como está.
 *  - **No existe ninguna cuenta con ese correo**: se INVITA
 *    (`auth.admin.inviteUserByEmail`) — Supabase crea la cuenta y le manda un
 *    correo con un enlace para que ponga su contraseña. No hace falta que se
 *    registre antes por su cuenta: es justo el hueco que se encontró al
 *    probarlo (un superadmin dando de alta una academia nueva normalmente
 *    está pensando en gente que TODAVÍA no tiene cuenta en la plataforma).
 *    La invitación lleva la academia como metadata
 *    (`academia_slug`), así que el disparador de P11j
 *    (`docs/sql/P11j-asignar-academia-en-registro.sql`) la asigna sola, en
 *    la misma operación — sin eso, entraría por defecto en `atenea`.
 *
 * `ignoreDuplicates` en `academy_members`: añadir dos veces al mismo no es un
 * error, y sirve de red por si el disparador ya la asignó.
 */
export async function addAcademyAdmin(
  academyId: string,
  email: string,
): Promise<{ success: boolean; error?: string; invitada?: boolean }> {
  const auth = await requireSuperadmin();
  if (!auth.ok) return { success: false, error: auth.error };
  if (!academyId || !email) return { success: false, error: 'Falta la academia o el correo.' };

  const correo = email.trim().toLowerCase();
  if (!correo) return { success: false, error: 'Falta el correo.' };

  const { data: academia, error: acadErr } = await supabaseAdmin
    .from('academies')
    .select('slug')
    .eq('id', academyId)
    .maybeSingle();
  if (acadErr) return { success: false, error: fallo('addAcademyAdmin', acadErr) };
  if (!academia) return { success: false, error: 'Esa academia no existe.' };

  let { data: perfil, error: leer } = await supabaseAdmin
    .from('profiles')
    .select('id, role')
    .ilike('email', correo)
    .maybeSingle();
  if (leer) return { success: false, error: fallo('addAcademyAdmin', leer) };

  let invitada = false;
  if (!perfil) {
    const invite = await supabaseAdmin.auth.admin.inviteUserByEmail(correo, {
      data: { academia_slug: academia.slug },
    });
    if (invite.error || !invite.data.user) {
      return { success: false, error: invite.error?.message ?? 'No se pudo invitar a esa cuenta.' };
    }
    perfil = { id: invite.data.user.id, role: 'student' };
    invitada = true;
  }

  if (perfil.role === 'student') {
    const { error: rolErr } = await supabaseAdmin.from('profiles').update({ role: 'admin' }).eq('id', perfil.id);
    if (rolErr) return { success: false, error: fallo('addAcademyAdmin', rolErr) };
  }

  const { error } = await supabaseAdmin
    .from('academy_members')
    .upsert({ academy_id: academyId, user_id: perfil.id }, { onConflict: 'academy_id,user_id', ignoreDuplicates: true });

  if (!error) {
    registraAccion({ actorId: auth.user.id, action: 'add_academy_admin', target: correo, detail: { academyId, invitada } });
  }
  return { success: !error, error: fallo('addAcademyAdmin', error), invitada };
}

/**
 * Quita a alguien de la lista de admins de UNA academia.
 *
 * Nunca borra la cuenta ni le toca el rol (decidido): si administra otra
 * academia, sigue siendo `admin` ahí, sin tocar nada más. Solo desaparece la
 * fila de `academy_members` que lo unía a ESTA — exactamente el mismo gesto
 * que «dar de alta», pero al revés.
 */
export async function removeAcademyAdmin(
  academyId: string,
  adminUserId: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireSuperadmin();
  if (!auth.ok) return { success: false, error: auth.error };
  if (!academyId || !adminUserId) return { success: false, error: 'Falta la academia o el administrador.' };

  const { data: perfil } = await supabaseAdmin.from('profiles').select('email').eq('id', adminUserId).maybeSingle();

  const { error } = await supabaseAdmin
    .from('academy_members')
    .delete()
    .eq('academy_id', academyId)
    .eq('user_id', adminUserId);

  if (!error) {
    registraAccion({
      actorId: auth.user.id,
      action: 'remove_academy_admin',
      target: (perfil?.email as string | undefined) ?? adminUserId,
      detail: { academyId, adminUserId },
    });
  }
  return { success: !error, error: fallo('removeAcademyAdmin', error) };
}

/**
 * Reenvía la invitación a un admin que todavía no ha puesto su contraseña.
 *
 * `inviteUserByEmail` (lo que usa `addAcademyAdmin` la primera vez) falla si
 * el correo ya tiene cuenta — y la tiene, desde la primera invitación. El
 * camino para un enlace NUEVO es el mismo que «¿Olvidaste tu contraseña?»
 * (regla 129): `generateLink({ type: 'recovery' })` da un enlace de un solo
 * uso que `SetPasswordScreen` sabe atender igual que una invitación (misma
 * sesión implícita, mismo paso de poner una contraseña antes de entrar). Se
 * manda con la app (`sendMail`), no con el correo de Supabase, para que lleve
 * la marca de la academia.
 */
export async function resendAcademyAdminInvite(
  academyId: string,
  adminUserId: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireSuperadmin();
  if (!auth.ok) return { success: false, error: auth.error };
  if (!academyId || !adminUserId) return { success: false, error: 'Falta la academia o el administrador.' };

  const [{ data: academia, error: acadErr }, { data: miembro, error: miembroErr }, { data: perfil, error: perfilErr }] =
    await Promise.all([
      supabaseAdmin.from('academies').select('name').eq('id', academyId).maybeSingle(),
      supabaseAdmin.from('academy_members').select('user_id').eq('academy_id', academyId).eq('user_id', adminUserId).maybeSingle(),
      supabaseAdmin.from('profiles').select('email').eq('id', adminUserId).maybeSingle(),
    ]);
  if (acadErr) return { success: false, error: fallo('resendAcademyAdminInvite', acadErr) };
  if (miembroErr) return { success: false, error: fallo('resendAcademyAdminInvite', miembroErr) };
  if (perfilErr) return { success: false, error: fallo('resendAcademyAdminInvite', perfilErr) };
  if (!academia) return { success: false, error: 'Esa academia no existe.' };
  if (!miembro) return { success: false, error: 'Ese administrador no pertenece a esta academia.' };
  if (!perfil?.email) return { success: false, error: 'Esa cuenta no tiene correo.' };

  // Solo tiene sentido si sigue pendiente: si ya puso su contraseña, mandarle
  // otro enlace de recuperación confundiría más que ayudaría.
  const { data: cuenta, error: cuentaErr } = await supabaseAdmin.auth.admin.getUserById(adminUserId);
  if (cuentaErr) return { success: false, error: fallo('resendAcademyAdminInvite', cuentaErr) };
  if (cuenta.user?.email_confirmed_at) {
    return { success: false, error: 'Esa cuenta ya tiene contraseña: no hace falta reenviar nada.' };
  }

  const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email: perfil.email as string,
    options: { redirectTo: siteUrl() },
  });
  if (linkErr) return { success: false, error: fallo('resendAcademyAdminInvite', linkErr) };
  if (!link) return { success: false, error: 'No se pudo generar el enlace.' };

  const { subject, html } = plantillaInvitacionAdmin({
    academiaName: academia.name as string,
    enlace: link.properties.action_link,
  });
  await sendMail({ to: perfil.email as string, subject, html });

  registraAccion({
    actorId: auth.user.id,
    action: 'resend_academy_admin_invite',
    target: perfil.email as string,
    detail: { academyId },
  });
  return { success: true };
}

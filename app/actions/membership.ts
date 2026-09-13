'use server'

import { supabaseAdmin } from './core';
import { requireAdmin, olvidaMembershipRequired } from '../lib/auth';
import { registraAccion } from '../lib/admin-audit';
import { ACCESS_STATUS, type AccessStatus } from '../lib/membership';
import { sendMail } from '../lib/mailer';
import { plantillaAccesoConcedido, plantillaAccesoRechazado } from '../lib/app-email-templates';
import { siteUrl } from '../lib/registration-requests';

/**
 * CONTROL DE ACCESO (P6 · rehecho en P8 · aviso por correo y exentos en P12).
 *
 * El registro de pagos se movió a `actions/payments.ts` (rejilla mensual). Aquí
 * queda la PUERTA (el interruptor global y el acceso de cada alumno), la lista
 * blanca de exentos, y la invitación de alumnos por correo.
 *
 * Todo con la clave de servicio y `requireAdmin` (regla 34/35): `memberships`,
 * `membership_settings` y `membership_exemptions` tienen RLS y cero políticas.
 * La decisión de si un alumno entra la aplica `auth.ts` con `decideAccess`;
 * aquí solo se escribe.
 */

const MAX_PERFILES = 5_000;

export async function getMembershipRequired(): Promise<
  { success: true; required: boolean } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: true as const, required: true };

  const { data, error } = await supabaseAdmin
    .from('membership_settings')
    .select('required')
    .eq('organization_id', auth.user.organizationId)
    .maybeSingle();

  if (error) return { success: false as const, error: error.message };
  // P12: sin fila, ENCENDIDO por defecto — misma lectura que `checkAccess`.
  return { success: true as const, required: data?.required !== false };
}

/** El interruptor global. Al cambiarlo se tira la caché para verlo al momento. */
export async function setMembershipRequired(required: boolean) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };

  const { error } = await supabaseAdmin
    .from('membership_settings')
    .upsert({
      organization_id: auth.user.organizationId,
      required: required === true,
      updated_at: new Date().toISOString(),
    });

  if (!error) {
    olvidaMembershipRequired(auth.user.organizationId);
    registraAccion({
      actorId: auth.user.id,
      action: 'set_membership_required',
      detail: { required },
      organizationId: auth.user.organizationId,
    });
  }
  return { success: !error, error: error?.message };
}

/**
 * Da o quita el acceso a un alumno. Crear la fila = resolverlo por primera vez
 * (aceptar o rechazar su solicitud, P12); volver a llamarla es lo mismo que
 * suspenderlo o reactivarlo más adelante — mismo botón, mismo email.
 *
 * Manda al alumno el correo de la resolución (regla P12: "todo alumno... con
 * la resolución de la solicitud al alumno"), pero solo si el estado CAMBIA de
 * verdad: pulsar dos veces el mismo botón, o marcar lo que ya estaba marcado,
 * no tiene que mandar un segundo correo. El envío nunca bloquea la escritura
 * ni la hace fallar (regla 41/49: un fallo de correo no es un fallo de acción).
 */
export async function setMemberAccess(studentId: string, status: AccessStatus) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };
  if (!studentId) return { success: false as const, error: 'Falta el alumno.' };

  const valor = status === ACCESS_STATUS.SUSPENDED ? ACCESS_STATUS.SUSPENDED : ACCESS_STATUS.ACTIVE;

  const { data: antes } = await supabaseAdmin
    .from('memberships')
    .select('access_status')
    .eq('organization_id', auth.user.organizationId)
    .eq('user_id', studentId)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from('memberships')
    .upsert(
      {
        organization_id: auth.user.organizationId,
        user_id: studentId,
        access_status: valor,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,user_id' },
    );

  if (!error) {
    registraAccion({
      actorId: auth.user.id,
      action: 'set_member_access',
      target: studentId,
      detail: { status: valor },
      organizationId: auth.user.organizationId,
    });

    if (antes?.access_status !== valor) {
      avisaResolucion(auth.user.organizationId, studentId, valor === ACCESS_STATUS.ACTIVE).catch((e) =>
        console.error('[correo-resolucion]', e instanceof Error ? e.message : e),
      );
    }
  }
  return { success: !error, error: error?.message };
}

async function avisaResolucion(organizationId: string, studentId: string, aceptado: boolean): Promise<void> {
  const [{ data: alumno }, { data: academia }] = await Promise.all([
    supabaseAdmin.from('profiles').select('email').eq('id', studentId).maybeSingle(),
    supabaseAdmin.from('academies').select('name').eq('id', organizationId).maybeSingle(),
  ]);
  if (!alumno?.email || !academia?.name) return;

  const { subject, html } = aceptado
    ? plantillaAccesoConcedido({ academiaName: academia.name, appUrl: siteUrl() })
    : plantillaAccesoRechazado({ academiaName: academia.name });
  await sendMail({ to: alumno.email, subject, html });
}

/**
 * Da acceso de golpe a todos los alumnos que ya existen. Es el botón de ANTES
 * de encender el interruptor global: sin él, encenderlo dejaría fuera a toda la
 * academia. `ignoreDuplicates`: no resucita a un suspendido.
 *
 * SOLO a los alumnos de LA MISMA academia (P11): `profiles` no lleva
 * `organization_id` (la pertenencia va por `academy_members`), así que el
 * roster sale de cruzar las dos, no de `profiles` a secas — sin esto, activar
 * "a todos" en una academia habría dado acceso a los alumnos de todas.
 */
export async function activateAllCurrentStudents() {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };
  const organizationId = auth.user.organizationId;

  const { data: miembros, error: leerMiembros } = await supabaseAdmin
    .from('academy_members')
    .select('user_id')
    .eq('academy_id', organizationId)
    .limit(MAX_PERFILES);
  if (leerMiembros) return { success: false as const, error: leerMiembros.message };

  const idsAcademia = (miembros ?? []).map((m) => m.user_id as string);
  if (!idsAcademia.length) return { success: true as const, error: undefined, activados: 0 };

  const { data: perfiles, error: leer } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('role', 'student')
    .in('id', idsAcademia)
    .limit(MAX_PERFILES);
  if (leer) return { success: false as const, error: leer.message };

  const filas = (perfiles ?? []).map((p) => ({
    organization_id: organizationId,
    user_id: p.id as string,
    access_status: ACCESS_STATUS.ACTIVE,
    updated_at: new Date().toISOString(),
  }));
  if (!filas.length) return { success: true as const, error: undefined, activados: 0 };

  const { error } = await supabaseAdmin
    .from('memberships')
    .upsert(filas, { onConflict: 'organization_id,user_id', ignoreDuplicates: true });

  if (!error) {
    registraAccion({
      actorId: auth.user.id,
      action: 'activate_all_students',
      detail: { total: filas.length },
      organizationId,
    });
  }
  return { success: !error, error: error?.message, activados: filas.length };
}

// ============================================================
// EXENTOS DE PAGO (P12) — la lista blanca de cada academia.
//
// Un correo aquí entra directo, `active` y `exempt`, sin pasar por la
// solicitud ni avisar a nadie (`resolveFirstContact`, `registration-requests.ts`).
// Si ya se había registrado y está `pending` o `suspended`, añadirlo a la
// lista NO lo reactiva solo — eso seguiría siendo una decisión del admin con
// `setMemberAccess`; la lista blanca solo decide lo que pasa la PRIMERA vez.
// ============================================================

export async function listExemptEmails(): Promise<
  { success: true; emails: string[] } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: true as const, emails: [] };

  const { data, error } = await supabaseAdmin
    .from('membership_exemptions')
    .select('email')
    .eq('organization_id', auth.user.organizationId)
    .order('email');

  if (error) return { success: false as const, error: error.message };
  return { success: true as const, emails: (data ?? []).map((f) => f.email as string) };
}

export async function addExemptEmail(email: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };

  const correo = (email ?? '').trim().toLowerCase();
  if (!correo || !correo.includes('@')) return { success: false as const, error: 'Ese correo no es válido.' };

  const { error } = await supabaseAdmin
    .from('membership_exemptions')
    .upsert(
      { organization_id: auth.user.organizationId, email: correo },
      { onConflict: 'organization_id,email', ignoreDuplicates: true },
    );

  if (!error) {
    registraAccion({
      actorId: auth.user.id,
      action: 'add_exempt_email',
      target: correo,
      organizationId: auth.user.organizationId,
    });
  }
  return { success: !error, error: error?.message };
}

export async function removeExemptEmail(email: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };

  const correo = (email ?? '').trim().toLowerCase();
  if (!correo) return { success: false as const, error: 'Falta el correo.' };

  const { error } = await supabaseAdmin
    .from('membership_exemptions')
    .delete()
    .eq('organization_id', auth.user.organizationId)
    .eq('email', correo);

  if (!error) {
    registraAccion({
      actorId: auth.user.id,
      action: 'remove_exempt_email',
      target: correo,
      organizationId: auth.user.organizationId,
    });
  }
  return { success: !error, error: error?.message };
}

// ============================================================
// INVITAR UN ALUMNO POR CORREO (P12)
//
// El admin ya está decidiendo por él al invitarlo, así que NO pasa por la
// solicitud (P12): entra `active` directamente. Mismo patrón que
// `addAcademyAdmin` (superadmin.ts) — si la cuenta no existe, se invita con
// `inviteUserByEmail` y la academia viaja como metadata para que el
// disparador de P11j la asigne sola; si ya existe, solo se le da acceso.
// ============================================================

export async function inviteStudent(email: string): Promise<{ success: boolean; error?: string; invitada?: boolean }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  if (!auth.user.organizationId) return { success: false, error: 'No hay una academia seleccionada.' };
  const organizationId = auth.user.organizationId;

  const correo = (email ?? '').trim().toLowerCase();
  if (!correo || !correo.includes('@')) return { success: false, error: 'Ese correo no es válido.' };

  const { data: academia, error: acadErr } = await supabaseAdmin
    .from('academies')
    .select('slug')
    .eq('id', organizationId)
    .maybeSingle();
  if (acadErr) return { success: false, error: acadErr.message };
  if (!academia) return { success: false, error: 'No se encuentra tu academia.' };

  const { data: perfilExistente, error: leer } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .ilike('email', correo)
    .maybeSingle();
  if (leer) return { success: false, error: leer.message };

  let perfil = perfilExistente;
  let invitada = false;
  if (!perfil) {
    const invite = await supabaseAdmin.auth.admin.inviteUserByEmail(correo, {
      data: { academia_slug: academia.slug },
    });
    if (invite.error || !invite.data.user) {
      return { success: false, error: invite.error?.message ?? 'No se pudo invitar a esa cuenta.' };
    }
    perfil = { id: invite.data.user.id };
    invitada = true;
  }

  const [{ error: miembroErr }, { error: accesoErr }] = await Promise.all([
    supabaseAdmin
      .from('academy_members')
      .upsert({ academy_id: organizationId, user_id: perfil.id }, { onConflict: 'academy_id,user_id', ignoreDuplicates: true }),
    supabaseAdmin
      .from('memberships')
      .upsert(
        { organization_id: organizationId, user_id: perfil.id, access_status: ACCESS_STATUS.ACTIVE, updated_at: new Date().toISOString() },
        { onConflict: 'organization_id,user_id' },
      ),
  ]);
  const error = miembroErr ?? accesoErr;

  if (!error) {
    registraAccion({
      actorId: auth.user.id,
      action: 'invite_student',
      target: correo,
      detail: { invitada },
      organizationId,
    });
  }
  return { success: !error, error: error?.message, invitada };
}

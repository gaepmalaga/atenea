'use server'

import { after } from 'next/server';
import { supabaseAdmin } from './core';
import { requireAdmin, olvidaMembershipRequired } from '../lib/auth';
import { registraAccion } from '../lib/admin-audit';
import { ACCESS_STATUS, type AccessStatus } from '../lib/membership';
import { sendMail } from '../lib/mailer';
import { plantillaAccesoConcedido, plantillaAccesoRechazado } from '../lib/app-email-templates';
import { MARCA } from '../lib/marca';
import { siteUrl } from '../lib/registration-requests';
import { randomBytes } from 'node:crypto';
import { leeCorreos, claveProvisional, MAX_POR_CLAVE, MAX_POR_CORREO, type ModoAlta, type ResultadoAlta } from '../lib/alta-masiva';
import { fallo } from '../lib/fallos';
import { META_CLAVE_PROVISIONAL } from '../lib/clave';

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

  if (error) return { success: false as const, error: fallo('getMembershipRequired', error) };
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
  return { success: !error, error: fallo('setMembershipRequired', error) };
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
  // Capturado en una constante: TS no conserva el estrechamiento de
  // `auth.user.organizationId` dentro del cierre de `after()` más abajo.
  const organizationId = auth.user.organizationId;

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
      // `after()`, mismo motivo que `resolveFirstContact` (registration-requests.ts):
      // sin él, el runtime serverless corta la función en cuanto sale la
      // respuesta y este correo se queda a medias, sin ni intentar la llamada
      // a Resend.
      after(() =>
        avisaResolucion(organizationId, studentId, valor === ACCESS_STATUS.ACTIVE).catch((e) =>
          console.error('[correo-resolucion]', e instanceof Error ? e.message : e),
        ),
      );
    }
  }
  return { success: !error, error: fallo('setMemberAccess', error) };
}

async function avisaResolucion(organizationId: string, studentId: string, aceptado: boolean): Promise<void> {
  const [{ data: alumno }, { data: academia }] = await Promise.all([
    supabaseAdmin.from('profiles').select('email').eq('id', studentId).maybeSingle(),
    supabaseAdmin.from('academies').select('name').eq('id', organizationId).maybeSingle(),
  ]);
  if (!alumno?.email || !academia?.name) return;

  // Las respuestas van al correo de la academia, no a `notificaciones@`, que
  // no lee nadie (regla 81).
  const { subject, html } = aceptado
    ? plantillaAccesoConcedido({ academiaName: academia.name, appUrl: siteUrl() })
    : plantillaAccesoRechazado({ academiaName: academia.name });
  await sendMail({ to: alumno.email, subject, html, replyTo: MARCA.correoContacto });
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
  if (leerMiembros) return { success: false as const, error: fallo('activateAllCurrentStudents', leerMiembros) };

  const idsAcademia = (miembros ?? []).map((m) => m.user_id as string);
  if (!idsAcademia.length) return { success: true as const, error: undefined, activados: 0 };

  const { data: perfiles, error: leer } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('role', 'student')
    .in('id', idsAcademia)
    .limit(MAX_PERFILES);
  if (leer) return { success: false as const, error: fallo('activateAllCurrentStudents', leer) };

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
  return { success: !error, error: fallo('activateAllCurrentStudents', error), activados: filas.length };
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

  if (error) return { success: false as const, error: fallo('listExemptEmails', error) };
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
  return { success: !error, error: fallo('addExemptEmail', error) };
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
  return { success: !error, error: fallo('removeExemptEmail', error) };
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
  if (acadErr) return { success: false, error: fallo('inviteStudent', acadErr) };
  if (!academia) return { success: false, error: 'No se encuentra tu academia.' };

  const { data: perfilExistente, error: leer } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .ilike('email', correo)
    .maybeSingle();
  if (leer) return { success: false, error: fallo('inviteStudent', leer) };

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
  return { success: !error, error: fallo('inviteStudent', error), invitada };
}


/**
 * ALTA DE VARIOS ALUMNOS DE GOLPE (regla 83).
 *
 * `texto` es lo que el admin ha pegado; se vuelve a leer AQUÍ con `leeCorreos`
 * (una Server Action es un endpoint público, regla 1: no se fía de la lista
 * que ya leyó la pantalla). Uno a uno y en orden, no en paralelo: son cuentas
 * de Supabase Auth, y cien altas a la vez es la forma de chocar con su límite
 * de peticiones.
 *
 * Por cada correo:
 *   · si ya tiene cuenta -> se le da acceso a esta academia y los grupos;
 *   · si no, en modo `clave` -> cuenta creada YA CONFIRMADA con una contraseña
 *     provisional (sin correo: sin límite), que se devuelve UNA vez y no se
 *     guarda en ningún sitio más;
 *   · si no, en modo `correo` -> invitación de Supabase (cuenta como un correo
 *     del límite de 30 por hora: por eso el tope de `MAX_POR_CORREO`).
 *
 * Los grupos se AÑADEN, no sustituyen: a un alumno que ya existía no se le
 * quita ninguno de los que tuviera.
 */
export async function altaMasivaAlumnos(params: {
  texto: string;
  modo: ModoAlta;
  classIds?: string[];
}): Promise<{ success: true; resultados: ResultadoAlta[]; sinProcesar: number } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const organizationId = auth.user.organizationId;
  if (!organizationId) return { success: false, error: 'No hay una academia seleccionada.' };

  const modo: ModoAlta = params?.modo === 'correo' ? 'correo' : 'clave';
  const { correos } = leeCorreos(params?.texto ?? '');
  if (!correos.length) return { success: false, error: 'No hay ningún correo válido en la lista.' };
  const tope = modo === 'correo' ? MAX_POR_CORREO : MAX_POR_CLAVE;
  const lote = correos.slice(0, tope);

  const { data: academia } = await supabaseAdmin.from('academies').select('slug').eq('id', organizationId).maybeSingle();
  if (!academia) return { success: false, error: 'No se encuentra tu academia.' };

  // Solo grupos DE ESTA academia (mismo motivo que `setStudentGroups`).
  const pedidos = (Array.isArray(params?.classIds) ? params.classIds : []).filter((id) => typeof id === 'string' && id);
  const { data: grupos } = pedidos.length
    ? await supabaseAdmin.from('class_groups').select('id').eq('organization_id', organizationId).in('id', pedidos)
    : { data: [] as { id: string }[] };
  const classIds = (grupos ?? []).map((g) => g.id as string);

  const resultados: ResultadoAlta[] = [];
  for (const correo of lote) {
    try {
      const { data: perfil } = await supabaseAdmin.from('profiles').select('id').ilike('email', correo).maybeSingle();
      let userId = perfil?.id as string | undefined;
      let estado: ResultadoAlta['estado'] = 'ya_tenia_cuenta';
      let clave: string | undefined;

      if (!userId) {
        if (modo === 'clave') {
          clave = claveProvisional(randomBytes(8));
          const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email: correo,
            password: clave,
            email_confirm: true,
            // La marca que obliga a cambiarla en la primera entrada (regla 111).
            user_metadata: { academia_slug: academia.slug, [META_CLAVE_PROVISIONAL]: true },
          });
          if (error || !data.user) throw new Error(error?.message ?? 'no se pudo crear la cuenta');
          userId = data.user.id;
          estado = 'creada';
          // El rol vive en `profiles`. Solo para cuentas RECIÉN creadas: a una
          // que ya existía no se le toca el rol (podría ser un admin).
          const { error: perfilErr } = await supabaseAdmin
            .from('profiles')
            .upsert({ id: userId, email: correo, role: 'student' }, { onConflict: 'id' });
          if (perfilErr) throw new Error(perfilErr.message);
        } else {
          const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(correo, { data: { academia_slug: academia.slug } });
          if (error || !data.user) throw new Error(error?.message ?? 'no se pudo invitar');
          userId = data.user.id;
          estado = 'invitada';
        }
      }

      const escrituras = [
        supabaseAdmin.from('academy_members').upsert({ academy_id: organizationId, user_id: userId }, { onConflict: 'academy_id,user_id', ignoreDuplicates: true }),
        supabaseAdmin.from('memberships').upsert(
          { organization_id: organizationId, user_id: userId, access_status: ACCESS_STATUS.ACTIVE, updated_at: new Date().toISOString() },
          { onConflict: 'organization_id,user_id' },
        ),
        ...(classIds.length
          ? [supabaseAdmin.from('class_members').upsert(classIds.map((class_id) => ({ class_id, user_id: userId })), { onConflict: 'class_id,user_id', ignoreDuplicates: true })]
          : []),
      ];
      const fallo = (await Promise.all(escrituras)).find((r) => r.error)?.error;
      if (fallo) throw new Error(fallo.message);

      resultados.push({ correo, estado, ...(clave ? { clave } : {}) });
    } catch (e) {
      resultados.push({ correo, estado: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  }

  registraAccion({
    actorId: auth.user.id,
    action: 'bulk_add_students',
    target: `${resultados.length} alumnos`,
    detail: {
      modo,
      creadas: resultados.filter((r) => r.estado === 'creada').length,
      invitadas: resultados.filter((r) => r.estado === 'invitada').length,
      existentes: resultados.filter((r) => r.estado === 'ya_tenia_cuenta').length,
      errores: resultados.filter((r) => r.estado === 'error').length,
      grupos: classIds.length,
    },
    organizationId,
  });

  return { success: true, resultados, sinProcesar: correos.length - lote.length };
}

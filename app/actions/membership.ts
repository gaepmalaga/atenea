'use server'

import { supabaseAdmin } from './core';
import { requireAdmin, olvidaMembershipRequired } from '../lib/auth';
import { registraAccion } from '../lib/admin-audit';
import { ACCESS_STATUS, type AccessStatus } from '../lib/membership';

/**
 * CONTROL DE ACCESO (P6 · rehecho en P8).
 *
 * El registro de pagos se movió a `actions/payments.ts` (rejilla mensual). Aquí
 * queda solo la PUERTA: el interruptor global y el acceso de cada alumno.
 *
 * Todo con la clave de servicio y `requireAdmin` (regla 34/35): `memberships` y
 * `membership_settings` tienen RLS y cero políticas. La decisión de si un alumno
 * entra la aplica `auth.ts` con `decideAccess`; aquí solo se escribe.
 */

const MAX_PERFILES = 5_000;

export async function getMembershipRequired(): Promise<
  { success: true; required: boolean } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: true as const, required: false };

  const { data, error } = await supabaseAdmin
    .from('membership_settings')
    .select('required')
    .eq('organization_id', auth.user.organizationId)
    .maybeSingle();

  if (error) return { success: false as const, error: error.message };
  return { success: true as const, required: data?.required === true };
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

/** Da o quita el acceso a un alumno. Crear la fila = activarlo por primera vez. */
export async function setMemberAccess(studentId: string, status: AccessStatus) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };
  if (!studentId) return { success: false as const, error: 'Falta el alumno.' };

  const valor = status === ACCESS_STATUS.SUSPENDED ? ACCESS_STATUS.SUSPENDED : ACCESS_STATUS.ACTIVE;
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
  }
  return { success: !error, error: error?.message };
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

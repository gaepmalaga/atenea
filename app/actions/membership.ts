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

  const { data, error } = await supabaseAdmin
    .from('membership_settings')
    .select('required')
    .eq('id', 1)
    .maybeSingle();

  if (error) return { success: false as const, error: error.message };
  return { success: true as const, required: data?.required === true };
}

/** El interruptor global. Al cambiarlo se tira la caché para verlo al momento. */
export async function setMembershipRequired(required: boolean) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const { error } = await supabaseAdmin
    .from('membership_settings')
    .upsert({ id: 1, required: required === true, updated_at: new Date().toISOString() });

  if (!error) {
    olvidaMembershipRequired();
    registraAccion({ actorId: auth.user.id, action: 'set_membership_required', detail: { required } });
  }
  return { success: !error, error: error?.message };
}

/** Da o quita el acceso a un alumno. Crear la fila = activarlo por primera vez. */
export async function setMemberAccess(studentId: string, status: AccessStatus) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!studentId) return { success: false as const, error: 'Falta el alumno.' };

  const valor = status === ACCESS_STATUS.SUSPENDED ? ACCESS_STATUS.SUSPENDED : ACCESS_STATUS.ACTIVE;
  const { error } = await supabaseAdmin
    .from('memberships')
    .upsert(
      { user_id: studentId, access_status: valor, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );

  if (!error) {
    registraAccion({ actorId: auth.user.id, action: 'set_member_access', target: studentId, detail: { status: valor } });
  }
  return { success: !error, error: error?.message };
}

/**
 * Da acceso de golpe a todos los alumnos que ya existen. Es el botón de ANTES
 * de encender el interruptor global: sin él, encenderlo dejaría fuera a toda la
 * academia. `ignoreDuplicates`: no resucita a un suspendido.
 */
export async function activateAllCurrentStudents() {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const { data: perfiles, error: leer } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('role', 'student')
    .limit(MAX_PERFILES);
  if (leer) return { success: false as const, error: leer.message };

  const filas = (perfiles ?? []).map((p) => ({
    user_id: p.id as string,
    access_status: ACCESS_STATUS.ACTIVE,
    updated_at: new Date().toISOString(),
  }));
  if (!filas.length) return { success: true as const, error: undefined, activados: 0 };

  const { error } = await supabaseAdmin
    .from('memberships')
    .upsert(filas, { onConflict: 'user_id', ignoreDuplicates: true });

  if (!error) registraAccion({ actorId: auth.user.id, action: 'activate_all_students', detail: { total: filas.length } });
  return { success: !error, error: error?.message, activados: filas.length };
}

'use server';

/**
 * EL REGISTRO DEL ENTRENAMIENTO DE GRUPO (regla 84).
 *
 * `group_workout_logs` tiene RLS y CERO políticas (`docs/sql/registro-fisico.sql`),
 * igual que `class_absences` (regla 82): solo la clave de servicio. Cada acción
 * del alumno filtra SIEMPRE por su propio id y comprueba que es del grupo, que
 * el grupo es de su academia y que ese día existe en el plan; las del
 * preparador van detrás de `requireAdmin` y acotadas a su academia.
 *
 * Lo que se decide (qué fecha es cada día, qué días se pueden apuntar, el
 * resumen de la semana) vive en `app/lib/registro-fisico.ts`, puro y con tests.
 */

import { supabaseAdmin } from './core';
import { requireUser, requireAdmin } from '../lib/auth';
import { normalizePlan } from '../lib/training-plan';
import { ahoraEnZona, esFecha, sumaDias, diaSemanaDe } from '../lib/asistencia';
import {
  diasEntrenables, sePuedeRegistrar, normalizaRegistro, resumenSemanaGrupo,
  type ResumenSemanaGrupo,
} from '../lib/registro-fisico';

/** El lunes de la semana de una fecha. */
const lunesDe = (fecha: string) => sumaDias(fecha, -(diaSemanaDe(fecha) - 1));

export type MiRegistro = { classId: string; fecha: string; rpe: number | null; comment: string | null };

/** Lo que el alumno ha apuntado en sus grupos las últimas semanas, y qué día es hoy en la academia. */
export async function getMiRegistroFisico(): Promise<
  { success: true; registros: MiRegistro[]; hoy: string } | { success: false; error: string }
> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const hoy = ahoraEnZona(Date.now()).fecha;
  const organizationId = auth.user.organizationId;
  if (!organizationId) return { success: true as const, registros: [], hoy };

  const { data: miembros } = await supabaseAdmin
    .from('class_members')
    .select('class_id, class_groups!inner(organization_id)')
    .eq('user_id', auth.user.id)
    .eq('class_groups.organization_id', organizationId);
  const ids = (miembros ?? []).map((m) => m.class_id as string);
  if (!ids.length) return { success: true as const, registros: [], hoy };

  const { data, error } = await supabaseAdmin
    .from('group_workout_logs')
    .select('class_id, session_date, rpe, comment')
    .eq('user_id', auth.user.id)
    .in('class_id', ids)
    .gte('session_date', sumaDias(hoy, -60));
  if (error) return { success: false as const, error: error.message };

  return {
    success: true as const,
    hoy,
    registros: (data ?? []).map((r) => ({
      classId: r.class_id as string,
      fecha: r.session_date as string,
      rpe: (r.rpe as number | null) ?? null,
      comment: (r.comment as string | null) ?? null,
    })),
  };
}

/**
 * Apunta un día como hecho (con esfuerzo y comentario opcionales), lo corrige,
 * o lo quita (`hecho: false`).
 */
export async function setMiRegistroFisico(params: {
  classId: string;
  fecha: string;
  hecho: boolean;
  rpe?: number | null;
  comment?: string | null;
}) {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const organizationId = auth.user.organizationId;
  const { classId, fecha, hecho } = params ?? ({} as typeof params);
  if (!organizationId || !classId || !esFecha(fecha)) return { success: false as const, error: 'Datos no válidos.' };

  const hoy = ahoraEnZona(Date.now()).fecha;
  if (!sePuedeRegistrar(fecha, hoy)) {
    return { success: false as const, error: 'Ese día no se puede apuntar: o aún no ha llegado o ya queda muy atrás.' };
  }

  const [{ data: grupo }, { data: miembro }, { data: planFila }] = await Promise.all([
    supabaseAdmin.from('class_groups').select('id').eq('id', classId).eq('organization_id', organizationId).maybeSingle(),
    supabaseAdmin.from('class_members').select('user_id').eq('class_id', classId).eq('user_id', auth.user.id).maybeSingle(),
    supabaseAdmin.from('group_training_plans').select('plan_data').eq('class_id', classId).eq('week_start', lunesDe(fecha)).maybeSingle(),
  ]);
  if (!grupo || !miembro) return { success: false as const, error: 'No eres de ese grupo.' };

  // Solo días que EXISTEN en el plan de esa semana y no son descanso.
  const plan = normalizePlan(planFila?.plan_data);
  if (!plan || !diasEntrenables(plan, lunesDe(fecha)).some((d) => d.fecha === fecha)) {
    return { success: false as const, error: 'Ese día no tiene entrenamiento en el plan de tu grupo.' };
  }

  if (!hecho) {
    const { error } = await supabaseAdmin
      .from('group_workout_logs')
      .delete()
      .eq('class_id', classId)
      .eq('user_id', auth.user.id)
      .eq('session_date', fecha);
    return { success: !error, error: error?.message };
  }

  const { rpe, comment } = normalizaRegistro({ rpe: params.rpe, comment: params.comment });
  const { error } = await supabaseAdmin
    .from('group_workout_logs')
    .upsert(
      { class_id: classId, user_id: auth.user.id, session_date: fecha, rpe, comment, updated_at: new Date().toISOString() },
      { onConflict: 'class_id,user_id,session_date' },
    );
  return { success: !error, error: error?.message };
}

/** La semana de un grupo para el preparador: quién ha entrenado cada día, con su esfuerzo y comentarios. */
export async function getRegistroGrupo(params: { groupId: string; weekStart: string }): Promise<
  { success: true; resumen: ResumenSemanaGrupo | null } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const organizationId = auth.user.organizationId;
  const { groupId, weekStart } = params ?? ({} as typeof params);
  if (!organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };
  if (!groupId || !esFecha(weekStart?.slice(0, 10))) return { success: false as const, error: 'Datos no válidos.' };
  const lunes = lunesDe(weekStart.slice(0, 10));

  const { data: grupo } = await supabaseAdmin.from('class_groups').select('id').eq('id', groupId).eq('organization_id', organizationId).maybeSingle();
  if (!grupo) return { success: false as const, error: 'Ese grupo no es de tu academia.' };

  const [{ data: planFila }, { data: miembros }, { data: logs, error }] = await Promise.all([
    supabaseAdmin.from('group_training_plans').select('plan_data').eq('class_id', groupId).eq('week_start', lunes).maybeSingle(),
    supabaseAdmin.from('class_members').select('user_id').eq('class_id', groupId),
    supabaseAdmin
      .from('group_workout_logs')
      .select('user_id, session_date, rpe, comment')
      .eq('class_id', groupId)
      .gte('session_date', lunes)
      .lte('session_date', sumaDias(lunes, 6)),
  ]);
  if (error) return { success: false as const, error: error.message };

  const plan = normalizePlan(planFila?.plan_data);
  if (!plan) return { success: true as const, resumen: null };

  const ids = (miembros ?? []).map((m) => m.user_id as string);
  const { data: perfiles } = ids.length
    ? await supabaseAdmin.from('profiles').select('id, email').in('id', ids)
    : { data: [] as { id: string; email: string | null }[] };

  return {
    success: true as const,
    resumen: resumenSemanaGrupo({
      plan,
      weekStart: lunes,
      hoy: ahoraEnZona(Date.now()).fecha,
      miembros: (perfiles ?? []).map((p) => ({ id: p.id as string, email: (p.email as string) ?? '—' })),
      registros: (logs ?? []).map((l) => ({
        userId: l.user_id as string,
        fecha: l.session_date as string,
        rpe: (l.rpe as number | null) ?? null,
        comment: (l.comment as string | null) ?? null,
      })),
    }),
  };
}

'use server'

import { supabaseAdmin } from './core';
import { requireAdmin } from '../lib/auth';
import { registraAccion } from '../lib/admin-audit';
import { normalizeGroupInput, admitePlan, type GroupKind } from '../lib/groups';
import { normalizePlan, buildManualPlan, type Exercise, type WeeklyPlan } from '../lib/training-plan';

/**
 * GRUPOS DE LA ACADEMIA Y PLANES DE ENTRENAMIENTO DE GRUPO (P7).
 *
 * Todo con la clave de servicio y `requireAdmin` (regla 34/35): `class_groups`,
 * `class_members` y `group_training_plans` son de administración. El plan de
 * grupo lo LEE el alumno (política de SELECT abierta), pero eso lo hace
 * `getActiveTrainingPlan` en `training.ts`, no aquí.
 *
 * La lógica pura —normalizar la entrada, decidir qué tipo admite plan— vive en
 * `lib/groups.ts`.
 */

export type GroupRow = {
  id: string;
  name: string;
  kind: string;
  schedule: string | null;
  staffId: string | null;
  staffName: string | null;
  /** Los `user_id` de sus miembros — para precargar el selector de alumnos. */
  memberIds: string[];
  /** `memberIds.length`, para no recalcularlo en cada sitio. */
  miembros: number;
  /** true si es un grupo que lleva plan de entrenamiento (kind = 'fisicas'). */
  llevaPlan: boolean;
  /** true si ese plan ya está escrito. */
  tienePlan: boolean;
};

export async function getGroups(): Promise<
  { success: true; groups: GroupRow[] } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const [gruposRes, miembrosRes, staffRes, planesRes] = await Promise.all([
    supabaseAdmin.from('class_groups').select('id, name, kind, schedule, staff_id').order('name'),
    supabaseAdmin.from('class_members').select('class_id, user_id'),
    supabaseAdmin.from('academy_staff').select('id, name'),
    supabaseAdmin.from('group_training_plans').select('class_id'),
  ]);

  if (gruposRes.error) {
    console.error('getGroups:', gruposRes.error.message);
    return { success: false as const, error: gruposRes.error.message };
  }

  const porGrupo = new Map<string, string[]>();
  for (const m of miembrosRes.data ?? []) {
    const id = m.class_id as string;
    const lista = porGrupo.get(id) ?? [];
    lista.push(m.user_id as string);
    porGrupo.set(id, lista);
  }
  const nombreStaff = new Map<string, string>();
  for (const s of staffRes.data ?? []) nombreStaff.set(s.id as string, (s.name as string) ?? '');
  const conPlan = new Set((planesRes.data ?? []).map((p) => p.class_id as string));

  const groups: GroupRow[] = (gruposRes.data ?? []).map((g) => ({
    id: g.id as string,
    name: g.name as string,
    kind: g.kind as string,
    schedule: (g.schedule as string) ?? null,
    staffId: (g.staff_id as string) ?? null,
    staffName: g.staff_id ? nombreStaff.get(g.staff_id as string) ?? null : null,
    memberIds: porGrupo.get(g.id as string) ?? [],
    miembros: (porGrupo.get(g.id as string) ?? []).length,
    llevaPlan: admitePlan(g.kind as string),
    tienePlan: conPlan.has(g.id as string),
  }));

  return { success: true as const, groups };
}

export async function createGroup(input: unknown) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const clean = normalizeGroupInput((input ?? {}) as Record<string, unknown>);
  if (!clean) return { success: false as const, error: 'El grupo necesita un nombre.' };

  const { error } = await supabaseAdmin.from('class_groups').insert({
    name: clean.name,
    kind: clean.kind,
    schedule: clean.schedule,
    staff_id: clean.staffId,
  });

  if (!error) registraAccion({ actorId: auth.user.id, action: 'create_group', target: clean.name });
  return { success: !error, error: error?.message };
}

export async function updateGroup(groupId: string, input: unknown) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!groupId) return { success: false as const, error: 'Falta el grupo.' };

  const clean = normalizeGroupInput((input ?? {}) as Record<string, unknown>);
  if (!clean) return { success: false as const, error: 'El grupo necesita un nombre.' };

  const { error } = await supabaseAdmin
    .from('class_groups')
    .update({ name: clean.name, kind: clean.kind, schedule: clean.schedule, staff_id: clean.staffId })
    .eq('id', groupId);

  if (!error) registraAccion({ actorId: auth.user.id, action: 'update_group', target: clean.name });
  return { success: !error, error: error?.message };
}

export async function deleteGroup(groupId: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!groupId) return { success: false as const, error: 'Falta el grupo.' };

  // `on delete cascade` en class_members y group_training_plans se encarga del
  // resto: borrar el grupo saca a todos sus miembros y tira su plan.
  const { error } = await supabaseAdmin.from('class_groups').delete().eq('id', groupId);
  if (!error) registraAccion({ actorId: auth.user.id, action: 'delete_group', target: groupId });
  return { success: !error, error: error?.message };
}

/**
 * Reemplaza la lista de miembros de un grupo por la que llega. Un solo camino
 * para «meter» y «sacar»: la pantalla manda la lista entera que quiere, y aquí
 * se calcula la diferencia. Así no hay dos acciones que puedan divergir.
 */
export async function setGroupMembers(groupId: string, userIds: string[]) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!groupId) return { success: false as const, error: 'Falta el grupo.' };

  const quieren = new Set((Array.isArray(userIds) ? userIds : []).filter((id) => typeof id === 'string' && id));

  const { data: actuales, error: leer } = await supabaseAdmin
    .from('class_members')
    .select('user_id')
    .eq('class_id', groupId);
  if (leer) return { success: false as const, error: leer.message };

  const tienen = new Set((actuales ?? []).map((m) => m.user_id as string));
  const aMeter = [...quieren].filter((id) => !tienen.has(id));
  const aSacar = [...tienen].filter((id) => !quieren.has(id));

  if (aMeter.length) {
    const { error } = await supabaseAdmin
      .from('class_members')
      .insert(aMeter.map((user_id) => ({ class_id: groupId, user_id })));
    if (error) return { success: false as const, error: error.message };
  }
  if (aSacar.length) {
    const { error } = await supabaseAdmin
      .from('class_members')
      .delete()
      .eq('class_id', groupId)
      .in('user_id', aSacar);
    if (error) return { success: false as const, error: error.message };
  }

  registraAccion({
    actorId: auth.user.id,
    action: 'set_group_members',
    target: groupId,
    detail: { total: quieren.size, meter: aMeter.length, sacar: aSacar.length },
  });
  return { success: true as const, error: undefined };
}

// ============================================================
// EL PLAN DE ENTRENAMIENTO DE UN GRUPO
// ============================================================

export async function getGroupTrainingPlan(
  groupId: string,
): Promise<
  { success: true; plan: WeeklyPlan | null } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!groupId) return { success: false as const, error: 'Falta el grupo.' };

  const { data, error } = await supabaseAdmin
    .from('group_training_plans')
    .select('plan_data')
    .eq('class_id', groupId)
    .maybeSingle();

  if (error) return { success: false as const, error: error.message };
  return { success: true as const, plan: data ? normalizePlan(data.plan_data) : null };
}

/**
 * Guarda el plan de entrenamiento de un grupo. Mismo `buildManualPlan` +
 * `normalizePlan` que el plan individual (regla 27): un preparador se equivoca
 * con un campo vacío igual que Gemini.
 *
 * Solo tiene sentido en un grupo de tipo `fisicas`. Se comprueba el tipo antes
 * de escribir: un plan de entrenamiento colgado de «Inglés B2» no le sirve a
 * nadie y confunde.
 */
export async function saveGroupTrainingPlan(params: {
  groupId: string;
  weekFocus: string;
  days: Array<{ day: string; type: string; title: string; exercises: Exercise[] }>;
}) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!params.groupId) return { success: false as const, error: 'Falta el grupo.' };

  const { data: grupo, error: leer } = await supabaseAdmin
    .from('class_groups')
    .select('kind, name')
    .eq('id', params.groupId)
    .maybeSingle();
  if (leer) return { success: false as const, error: leer.message };
  if (!grupo) return { success: false as const, error: 'Ese grupo no existe.' };
  if (!admitePlan(grupo.kind as string)) {
    return { success: false as const, error: 'Solo los grupos de físicas llevan plan de entrenamiento.' };
  }

  const plan = normalizePlan(buildManualPlan({ weekFocus: params.weekFocus, days: params.days }));
  if (!plan) return { success: false as const, error: 'El plan no tiene ningún día con ejercicios.' };

  const { error } = await supabaseAdmin
    .from('group_training_plans')
    .upsert(
      { class_id: params.groupId, plan_data: plan, week_start: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() },
      { onConflict: 'class_id' },
    );

  if (!error) {
    registraAccion({ actorId: auth.user.id, action: 'save_group_training_plan', target: grupo.name as string });
  }
  return { success: !error, error: error?.message };
}

export async function deleteGroupTrainingPlan(groupId: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!groupId) return { success: false as const, error: 'Falta el grupo.' };

  const { error } = await supabaseAdmin.from('group_training_plans').delete().eq('class_id', groupId);
  if (!error) registraAccion({ actorId: auth.user.id, action: 'delete_group_training_plan', target: groupId });
  return { success: !error, error: error?.message };
}

export type { GroupKind };

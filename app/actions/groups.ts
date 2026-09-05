'use server'

import { supabaseAdmin } from './core';
import { requireAdmin } from '../lib/auth';
import { registraAccion } from '../lib/admin-audit';
import {
  normalizeGroupInput,
  normalizeKindInput,
  llevaPlan,
  type GroupKindRow,
} from '../lib/groups';
import { normalizePlan, buildManualPlan, type Exercise, type WeeklyPlan } from '../lib/training-plan';

/**
 * GRUPOS Y TIPOS DE GRUPO (P7 · rehecho en P8).
 *
 * P8: el tipo de grupo vive en `group_kinds` (editable), un grupo tiene VARIOS
 * profesores (`class_group_staff`), y los alumnos se asignan DESDE EL ALUMNO
 * (`setStudentGroups`), no metiéndolos grupo a grupo.
 *
 * Todo con la clave de servicio y `requireAdmin` (regla 34/35). La lógica pura
 * está en `lib/groups.ts`.
 */

// ============================================================
// TIPOS DE GRUPO
// ============================================================

export async function getGroupKinds(): Promise<
  { success: true; kinds: GroupKindRow[] } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const { data, error } = await supabaseAdmin
    .from('group_kinds')
    .select('id, label, lleva_plan, sort_order')
    .order('sort_order')
    .order('label');

  if (error) return { success: false as const, error: error.message };
  return { success: true as const, kinds: (data ?? []) as GroupKindRow[] };
}

export async function saveGroupKind(input: unknown) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const clean = normalizeKindInput((input ?? {}) as Record<string, unknown>);
  if (!clean) return { success: false as const, error: 'El tipo necesita un nombre.' };

  const { error } = await supabaseAdmin
    .from('group_kinds')
    .upsert({ id: clean.id, label: clean.label, lleva_plan: clean.lleva_plan }, { onConflict: 'id' });

  if (!error) registraAccion({ actorId: auth.user.id, action: 'save_group_kind', target: clean.label });
  return { success: !error, error: error?.message };
}

export async function deleteGroupKind(kindId: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!kindId) return { success: false as const, error: 'Falta el tipo.' };

  // Si algún grupo lo usa, no se borra: dejaría grupos con un tipo huérfano.
  const { count } = await supabaseAdmin
    .from('class_groups')
    .select('id', { count: 'exact', head: true })
    .eq('kind', kindId);
  if ((count ?? 0) > 0) {
    return { success: false as const, error: `Ese tipo lo usan ${count} grupo(s). Cámbiaselos primero.` };
  }

  const { error } = await supabaseAdmin.from('group_kinds').delete().eq('id', kindId);
  if (!error) registraAccion({ actorId: auth.user.id, action: 'delete_group_kind', target: kindId });
  return { success: !error, error: error?.message };
}

// ============================================================
// GRUPOS
// ============================================================

export type GroupRow = {
  id: string;
  name: string;
  kind: string;
  kindLabel: string;
  schedule: string | null;
  staffIds: string[];
  staffNames: string[];
  memberIds: string[];
  miembros: number;
  llevaPlan: boolean;
  tienePlan: boolean;
};

export async function getGroups(): Promise<
  { success: true; groups: GroupRow[] } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const [gruposRes, miembrosRes, staffRes, staffGrupoRes, planesRes, kindsRes] = await Promise.all([
    supabaseAdmin.from('class_groups').select('id, name, kind, schedule').order('name'),
    supabaseAdmin.from('class_members').select('class_id, user_id'),
    supabaseAdmin.from('academy_staff').select('id, name'),
    supabaseAdmin.from('class_group_staff').select('class_id, staff_id'),
    supabaseAdmin.from('group_training_plans').select('class_id'),
    supabaseAdmin.from('group_kinds').select('id, label, lleva_plan'),
  ]);

  if (gruposRes.error) {
    console.error('getGroups:', gruposRes.error.message);
    return { success: false as const, error: gruposRes.error.message };
  }

  const kinds = (kindsRes.data ?? []) as GroupKindRow[];
  const kindMap = new Map(kinds.map((k) => [k.id, k]));

  const miembrosPorGrupo = new Map<string, string[]>();
  for (const m of miembrosRes.data ?? []) {
    const l = miembrosPorGrupo.get(m.class_id as string) ?? [];
    l.push(m.user_id as string);
    miembrosPorGrupo.set(m.class_id as string, l);
  }
  const nombreStaff = new Map<string, string>();
  for (const s of staffRes.data ?? []) nombreStaff.set(s.id as string, (s.name as string) ?? '');
  const staffPorGrupo = new Map<string, string[]>();
  for (const s of staffGrupoRes.data ?? []) {
    const l = staffPorGrupo.get(s.class_id as string) ?? [];
    l.push(s.staff_id as string);
    staffPorGrupo.set(s.class_id as string, l);
  }
  const conPlan = new Set((planesRes.data ?? []).map((p) => p.class_id as string));

  const groups: GroupRow[] = (gruposRes.data ?? []).map((g) => {
    const staffIds = staffPorGrupo.get(g.id as string) ?? [];
    return {
      id: g.id as string,
      name: g.name as string,
      kind: g.kind as string,
      kindLabel: kindMap.get(g.kind as string)?.label ?? (g.kind as string),
      schedule: (g.schedule as string) ?? null,
      staffIds,
      staffNames: staffIds.map((id) => nombreStaff.get(id) ?? '').filter(Boolean),
      memberIds: miembrosPorGrupo.get(g.id as string) ?? [],
      miembros: (miembrosPorGrupo.get(g.id as string) ?? []).length,
      llevaPlan: llevaPlan(g.kind as string, kinds),
      tienePlan: conPlan.has(g.id as string),
    };
  });

  return { success: true as const, groups };
}

/** `staffIds` -> `class_group_staff`: se calcula la diferencia, un solo camino. */
async function sincronizaProfesores(classId: string, staffIds: string[]) {
  const { data: actuales } = await supabaseAdmin
    .from('class_group_staff')
    .select('staff_id')
    .eq('class_id', classId);
  const tienen = new Set((actuales ?? []).map((s) => s.staff_id as string));
  const quieren = new Set(staffIds);
  const aMeter = [...quieren].filter((id) => !tienen.has(id));
  const aSacar = [...tienen].filter((id) => !quieren.has(id));

  if (aMeter.length) {
    await supabaseAdmin.from('class_group_staff').insert(aMeter.map((staff_id) => ({ class_id: classId, staff_id })));
  }
  if (aSacar.length) {
    await supabaseAdmin.from('class_group_staff').delete().eq('class_id', classId).in('staff_id', aSacar);
  }
}

export async function createGroup(input: unknown) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const clean = normalizeGroupInput((input ?? {}) as Record<string, unknown>);
  if (!clean) return { success: false as const, error: 'El grupo necesita un nombre.' };

  const { data, error } = await supabaseAdmin
    .from('class_groups')
    .insert({ name: clean.name, kind: clean.kind, schedule: clean.schedule })
    .select('id')
    .single();

  if (error) return { success: false as const, error: error.message };
  await sincronizaProfesores(data.id as string, clean.staffIds);
  registraAccion({ actorId: auth.user.id, action: 'create_group', target: clean.name });
  return { success: true as const, error: undefined };
}

export async function updateGroup(groupId: string, input: unknown) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!groupId) return { success: false as const, error: 'Falta el grupo.' };

  const clean = normalizeGroupInput((input ?? {}) as Record<string, unknown>);
  if (!clean) return { success: false as const, error: 'El grupo necesita un nombre.' };

  const { error } = await supabaseAdmin
    .from('class_groups')
    .update({ name: clean.name, kind: clean.kind, schedule: clean.schedule })
    .eq('id', groupId);
  if (error) return { success: false as const, error: error.message };

  await sincronizaProfesores(groupId, clean.staffIds);
  registraAccion({ actorId: auth.user.id, action: 'update_group', target: clean.name });
  return { success: true as const, error: undefined };
}

export async function deleteGroup(groupId: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!groupId) return { success: false as const, error: 'Falta el grupo.' };

  const { error } = await supabaseAdmin.from('class_groups').delete().eq('id', groupId);
  if (!error) registraAccion({ actorId: auth.user.id, action: 'delete_group', target: groupId });
  return { success: !error, error: error?.message };
}

/**
 * Los grupos de UN alumno, de golpe. Es el camino de P8: se gestiona desde el
 * alumno, no metiendo alumnos en cada grupo. La pantalla manda la lista entera
 * de grupos que quiere y aquí se calcula la diferencia.
 */
export async function setStudentGroups(studentId: string, classIds: string[]) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!studentId) return { success: false as const, error: 'Falta el alumno.' };

  const quieren = new Set((Array.isArray(classIds) ? classIds : []).filter((id) => typeof id === 'string' && id));

  const { data: actuales, error: leer } = await supabaseAdmin
    .from('class_members')
    .select('class_id')
    .eq('user_id', studentId);
  if (leer) return { success: false as const, error: leer.message };

  const tienen = new Set((actuales ?? []).map((m) => m.class_id as string));
  const aMeter = [...quieren].filter((id) => !tienen.has(id));
  const aSacar = [...tienen].filter((id) => !quieren.has(id));

  if (aMeter.length) {
    const { error } = await supabaseAdmin
      .from('class_members')
      .insert(aMeter.map((class_id) => ({ class_id, user_id: studentId })));
    if (error) return { success: false as const, error: error.message };
  }
  if (aSacar.length) {
    const { error } = await supabaseAdmin
      .from('class_members')
      .delete()
      .eq('user_id', studentId)
      .in('class_id', aSacar);
    if (error) return { success: false as const, error: error.message };
  }

  registraAccion({
    actorId: auth.user.id,
    action: 'set_student_groups',
    target: studentId,
    detail: { total: quieren.size, meter: aMeter.length, sacar: aSacar.length },
  });
  return { success: true as const, error: undefined };
}

// ============================================================
// EL PLAN DE ENTRENAMIENTO DE UN GRUPO
// ============================================================

export async function getGroupTrainingPlan(
  groupId: string,
): Promise<{ success: true; plan: WeeklyPlan | null } | { success: false; error: string }> {
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

export async function saveGroupTrainingPlan(params: {
  groupId: string;
  weekFocus: string;
  days: Array<{ day: string; type: string; title: string; exercises: Exercise[] }>;
}) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!params.groupId) return { success: false as const, error: 'Falta el grupo.' };

  const [grupoRes, kindsRes] = await Promise.all([
    supabaseAdmin.from('class_groups').select('kind, name').eq('id', params.groupId).maybeSingle(),
    supabaseAdmin.from('group_kinds').select('id, label, lleva_plan'),
  ]);
  if (grupoRes.error) return { success: false as const, error: grupoRes.error.message };
  if (!grupoRes.data) return { success: false as const, error: 'Ese grupo no existe.' };
  if (!llevaPlan(grupoRes.data.kind as string, (kindsRes.data ?? []) as GroupKindRow[])) {
    return { success: false as const, error: 'Ese tipo de grupo no lleva plan de entrenamiento.' };
  }

  const plan = normalizePlan(buildManualPlan({ weekFocus: params.weekFocus, days: params.days }));
  if (!plan) return { success: false as const, error: 'El plan no tiene ningún día con ejercicios.' };

  const { error } = await supabaseAdmin
    .from('group_training_plans')
    .upsert(
      { class_id: params.groupId, plan_data: plan, week_start: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() },
      { onConflict: 'class_id' },
    );

  if (!error) registraAccion({ actorId: auth.user.id, action: 'save_group_training_plan', target: grupoRes.data.name as string });
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

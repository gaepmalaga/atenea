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
import { normalizeHorario, horarioDeFila, type HorarioGrupo } from '../lib/asistencia';
import { fallo } from '../lib/fallos';
import { paginaCompleta } from '../lib/pagination';

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
  if (!auth.user.organizationId) return { success: true as const, kinds: [] };

  const { data, error } = await supabaseAdmin
    .from('group_kinds')
    .select('id, label, lleva_plan, sort_order')
    .eq('organization_id', auth.user.organizationId)
    .order('sort_order')
    .order('label');

  if (error) return { success: false as const, error: fallo('getGroupKinds', error) };
  return { success: true as const, kinds: (data ?? []) as GroupKindRow[] };
}

export async function saveGroupKind(input: unknown) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };

  const clean = normalizeKindInput((input ?? {}) as Record<string, unknown>);
  if (!clean) return { success: false as const, error: 'El tipo necesita un nombre.' };

  const { error } = await supabaseAdmin
    .from('group_kinds')
    .upsert(
      { organization_id: auth.user.organizationId, id: clean.id, label: clean.label, lleva_plan: clean.lleva_plan },
      { onConflict: 'organization_id,id' },
    );

  if (!error) {
    registraAccion({ actorId: auth.user.id, action: 'save_group_kind', target: clean.label, organizationId: auth.user.organizationId });
  }
  return { success: !error, error: fallo('saveGroupKind', error) };
}

export async function deleteGroupKind(kindId: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };
  if (!kindId) return { success: false as const, error: 'Falta el tipo.' };
  const organizationId = auth.user.organizationId;

  // Si algún grupo lo usa, no se borra: dejaría grupos con un tipo huérfano.
  const { count } = await supabaseAdmin
    .from('class_groups')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('kind', kindId);
  if ((count ?? 0) > 0) {
    return { success: false as const, error: `Ese tipo lo usan ${count} grupo(s). Cámbiaselos primero.` };
  }
  // Ni si está en un pack de precios (regla 102): el pack quedaría cobrando un
  // tipo que no existe.
  const { data: packs, error: packsErr } = await supabaseAdmin
    .from('fee_packs')
    .select('name')
    .eq('organization_id', organizationId)
    .contains('kinds', [kindId]);
  if (packsErr) return { success: false as const, error: fallo('deleteGroupKind', packsErr) };
  if (packs?.length) {
    return { success: false as const, error: `Ese tipo está en el pack «${packs[0].name}». Quítalo del pack primero.` };
  }

  const { error } = await supabaseAdmin
    .from('group_kinds')
    .delete()
    .eq('id', kindId)
    .eq('organization_id', organizationId);
  if (!error) registraAccion({ actorId: auth.user.id, action: 'delete_group_kind', target: kindId, organizationId });
  return { success: !error, error: fallo('deleteGroupKind', error) };
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
  /** El horario estructurado (regla 82): días, horas y plazas. */
  horario: HorarioGrupo;
  staffIds: string[];
  staffNames: string[];
  memberIds: string[];
  miembros: number;
  llevaPlan: boolean;
  /** El grupo de los multidisciplinares (regla 96). */
  esMulti: boolean;
};

export async function getGroups(): Promise<
  { success: true; groups: GroupRow[] } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: true as const, groups: [] };
  const organizationId = auth.user.organizationId;

  const [gruposRes, staffRes, kindsRes] = await Promise.all([
    supabaseAdmin.from('class_groups').select('id, name, kind, schedule, weekdays, start_time, end_time, capacity, is_multi').eq('organization_id', organizationId).order('name'),
    supabaseAdmin.from('academy_staff').select('id, name').eq('organization_id', organizationId),
    supabaseAdmin.from('group_kinds').select('id, label, lleva_plan').eq('organization_id', organizationId),
  ]);

  if (gruposRes.error) {
    return { success: false as const, error: fallo('getGroups', gruposRes.error) };
  }

  // `class_members` y `class_group_staff` no llevan `organization_id`: se
  // acotan por los grupos de ESTA academia, dentro de la consulta (regla 65).
  // Antes se leían enteras, de todas las academias, y sin paginar: con más de
  // 1.000 apuntados faltarían alumnos en los grupos sin avisar (regla 74).
  const idsGrupo = (gruposRes.data ?? []).map((g) => g.id as string);
  const [miembrosRes, staffGrupoRes] = idsGrupo.length
    ? await Promise.all([
        paginaCompleta<{ class_id: string; user_id: string }>(async (d, h) => await
          supabaseAdmin.from('class_members').select('class_id, user_id').in('class_id', idsGrupo).order('class_id').order('user_id').range(d, h)),
        paginaCompleta<{ class_id: string; staff_id: string }>(async (d, h) => await
          supabaseAdmin.from('class_group_staff').select('class_id, staff_id').in('class_id', idsGrupo).order('class_id').order('staff_id').range(d, h)),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  const errorHijas = miembrosRes.error ?? staffGrupoRes.error;
  if (errorHijas) return { success: false as const, error: errorHijas };

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

  const groups: GroupRow[] = (gruposRes.data ?? []).map((g) => {
    const staffIds = staffPorGrupo.get(g.id as string) ?? [];
    return {
      id: g.id as string,
      name: g.name as string,
      kind: g.kind as string,
      kindLabel: kindMap.get(g.kind as string)?.label ?? (g.kind as string),
      schedule: (g.schedule as string) ?? null,
      horario: horarioDeFila(g as Record<string, unknown>),
      staffIds,
      staffNames: staffIds.map((id) => nombreStaff.get(id) ?? '').filter(Boolean),
      memberIds: miembrosPorGrupo.get(g.id as string) ?? [],
      miembros: (miembrosPorGrupo.get(g.id as string) ?? []).length,
      llevaPlan: llevaPlan(g.kind as string, kinds),
      esMulti: g.is_multi === true,
    };
  });

  return { success: true as const, groups };
}

/** El horario limpio -> las columnas de `class_groups` (regla 6: la traducción, en un sitio). */
function columnasHorario(h: HorarioGrupo) {
  return { weekdays: h.weekdays, start_time: h.startTime, end_time: h.endTime, capacity: h.capacity };
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
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };

  const clean = normalizeGroupInput((input ?? {}) as Record<string, unknown>);
  if (!clean) return { success: false as const, error: 'El grupo necesita un nombre.' };
  const horario = normalizeHorario((input ?? {}) as Record<string, unknown>);
  if (!horario.ok) return { success: false as const, error: horario.error };

  const { data, error } = await supabaseAdmin
    .from('class_groups')
    .insert({ organization_id: auth.user.organizationId, name: clean.name, kind: clean.kind, schedule: clean.schedule, is_multi: clean.isMulti, ...columnasHorario(horario.horario) })
    .select('id')
    .single();

  if (error) return { success: false as const, error: fallo('createGroup', error) };
  await sincronizaProfesores(data.id as string, clean.staffIds);
  registraAccion({ actorId: auth.user.id, action: 'create_group', target: clean.name, organizationId: auth.user.organizationId });
  return { success: true as const, error: undefined };
}

export async function updateGroup(groupId: string, input: unknown) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };
  if (!groupId) return { success: false as const, error: 'Falta el grupo.' };

  const clean = normalizeGroupInput((input ?? {}) as Record<string, unknown>);
  if (!clean) return { success: false as const, error: 'El grupo necesita un nombre.' };
  const horario = normalizeHorario((input ?? {}) as Record<string, unknown>);
  if (!horario.ok) return { success: false as const, error: horario.error };

  const { error } = await supabaseAdmin
    .from('class_groups')
    .update({ name: clean.name, kind: clean.kind, schedule: clean.schedule, is_multi: clean.isMulti, ...columnasHorario(horario.horario) })
    .eq('id', groupId)
    .eq('organization_id', auth.user.organizationId);
  if (error) return { success: false as const, error: fallo('updateGroup', error) };

  await sincronizaProfesores(groupId, clean.staffIds);
  registraAccion({ actorId: auth.user.id, action: 'update_group', target: clean.name, organizationId: auth.user.organizationId });
  return { success: true as const, error: undefined };
}

export async function deleteGroup(groupId: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };
  if (!groupId) return { success: false as const, error: 'Falta el grupo.' };

  const { error } = await supabaseAdmin
    .from('class_groups')
    .delete()
    .eq('id', groupId)
    .eq('organization_id', auth.user.organizationId);
  if (!error) registraAccion({ actorId: auth.user.id, action: 'delete_group', target: groupId, organizationId: auth.user.organizationId });
  return { success: !error, error: fallo('deleteGroup', error) };
}

/**
 * Los grupos de UN alumno, de golpe. Es el camino de P8: se gestiona desde el
 * alumno, no metiendo alumnos en cada grupo. La pantalla manda la lista entera
 * de grupos que quiere y aquí se calcula la diferencia.
 */
export async function setStudentGroups(studentId: string, classIds: string[]) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };
  if (!studentId) return { success: false as const, error: 'Falta el alumno.' };
  const organizationId = auth.user.organizationId;

  // Los grupos que se pueden marcar son los DE ESTA academia (P11): sin este
  // filtro, la pantalla podría mandar el id de un grupo de otra academia y
  // este alumno acabaría metido en él.
  const pedidos = (Array.isArray(classIds) ? classIds : []).filter((id) => typeof id === 'string' && id);
  const { data: gruposDeLaAcademia, error: leerGrupos } = await supabaseAdmin
    .from('class_groups')
    .select('id')
    .eq('organization_id', organizationId)
    .in('id', pedidos.length ? pedidos : ['00000000-0000-0000-0000-000000000000']);
  if (leerGrupos) return { success: false as const, error: fallo('setStudentGroups', leerGrupos) };
  const quieren = new Set((gruposDeLaAcademia ?? []).map((g) => g.id as string));

  // Solo los grupos de ESTA academia cuentan como "los que tiene ahora": un
  // alumno puede pertenecer a varias academias (P11, decidido), y tocar solo
  // el interruptor de una no puede sacarlo de los grupos de otra.
  const { data: actuales, error: leer } = await supabaseAdmin
    .from('class_members')
    .select('class_id, class_groups!inner(organization_id)')
    .eq('user_id', studentId)
    .eq('class_groups.organization_id', organizationId);
  if (leer) return { success: false as const, error: fallo('setStudentGroups', leer) };

  const tienen = new Set((actuales ?? []).map((m) => m.class_id as string));
  const aMeter = [...quieren].filter((id) => !tienen.has(id));
  const aSacar = [...tienen].filter((id) => !quieren.has(id));

  if (aMeter.length) {
    const { error } = await supabaseAdmin
      .from('class_members')
      .insert(aMeter.map((class_id) => ({ class_id, user_id: studentId })));
    if (error) return { success: false as const, error: fallo('setStudentGroups', error) };
  }
  if (aSacar.length) {
    const { error } = await supabaseAdmin
      .from('class_members')
      .delete()
      .eq('user_id', studentId)
      .in('class_id', aSacar);
    if (error) return { success: false as const, error: fallo('setStudentGroups', error) };
  }

  registraAccion({
    actorId: auth.user.id,
    action: 'set_student_groups',
    target: studentId,
    detail: { total: quieren.size, meter: aMeter.length, sacar: aSacar.length },
  });
  return { success: true as const, error: undefined };
}

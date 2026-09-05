/**
 * GRUPOS DE LA ACADEMIA (P7).
 *
 * La academia organiza a sus alumnos en grupos —«Promoción 41 tarde», «Inglés»,
 * «Físicas»— y un alumno puede estar en varios. P5f montó UN texto libre por
 * alumno (`profiles.class_group`); no servía para una relación muchos-a-muchos.
 * Se retiró y se sustituyó por `class_groups` + `class_members`.
 *
 * Módulo puro (regla 21): lo que se testea aquí es la normalización de la
 * entrada y la decisión de qué plan de entrenamiento ve un alumno.
 */

import type { WeeklyPlan } from './training-plan';

/**
 * El TIPO de un grupo decide qué se le puede colgar: a uno de `fisicas`, un
 * plan de entrenamiento; a uno de `teoria`, no. Es un `CHECK` en la BD y aquí
 * una constante — añadir un tipo no puede pedir una migración (regla 50).
 */
export const GROUP_KINDS = ['teoria', 'ingles', 'fisicas', 'otro'] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

export const GROUP_KIND_LABEL: Record<GroupKind, string> = {
  teoria: 'Teoría',
  ingles: 'Inglés',
  fisicas: 'Físicas',
  otro: 'Otro',
};

export function etiquetaTipo(kind: string): string {
  return (GROUP_KIND_LABEL as Record<string, string>)[kind] ?? kind;
}

/** Solo los grupos de este tipo llevan plan de entrenamiento. */
export function admitePlan(kind: string): boolean {
  return kind === 'fisicas';
}

export type GroupInput = {
  name: string;
  kind: GroupKind;
  schedule: string | null;
  staffId: string | null;
};

/**
 * Normaliza lo que llega del formulario. Devuelve `null` si el grupo no tiene
 * nombre: un grupo sin nombre es un formulario a medio rellenar, no un dato
 * ausente legítimo (misma decisión que `normalizeStaffInput`, regla 50).
 */
export function normalizeGroupInput(raw: Record<string, unknown>): GroupInput | null {
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 120) : '';
  if (!name) return null;

  const kindBruto = typeof raw.kind === 'string' ? raw.kind : '';
  const kind: GroupKind = (GROUP_KINDS as readonly string[]).includes(kindBruto)
    ? (kindBruto as GroupKind)
    : 'otro';

  const schedule =
    typeof raw.schedule === 'string' && raw.schedule.trim() ? raw.schedule.trim().slice(0, 200) : null;
  const staffId = typeof raw.staffId === 'string' && raw.staffId ? raw.staffId : null;

  return { name, kind, schedule, staffId };
}

// ============================================================
// QUÉ PLAN DE ENTRENAMIENTO VE UN ALUMNO
// ============================================================

export type PlanEfectivo = {
  plan: WeeklyPlan | null;
  /** De dónde sale: su plan individual, el de su grupo de físicas, o ninguno. */
  origen: 'individual' | 'grupo' | 'ninguno';
};

/**
 * EL PLAN INDIVIDUAL MANDA SOBRE EL DE GRUPO.
 *
 * Es lo que pidió el dueño: no tener que ponerle un plan a cada uno (para eso
 * está el de grupo), pero poder afinar cuando alguien lo necesita. El alumno ve
 * el de su grupo por defecto; en cuanto tiene uno individual activo, ese gana.
 *
 * Devolver el ORIGEN, y no solo el plan, no es un extra: el alumno tiene
 * derecho a saber si lo que ve es «tu plan» o «el plan de tu grupo», y el
 * profesor a saber a quién le ha puesto uno propio.
 */
export function planEfectivo(
  individual: WeeklyPlan | null | undefined,
  grupo: WeeklyPlan | null | undefined,
): PlanEfectivo {
  if (individual) return { plan: individual, origen: 'individual' };
  if (grupo) return { plan: grupo, origen: 'grupo' };
  return { plan: null, origen: 'ninguno' };
}

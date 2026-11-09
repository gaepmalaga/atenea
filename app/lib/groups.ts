/**
 * GRUPOS DE LA ACADEMIA (P7 · rehecho en P8).
 *
 * La academia organiza a sus alumnos en grupos —«Promoción 41 tarde», «Inglés»,
 * «Físicas»— y un alumno puede estar en varios. La asignación se hace DESDE EL
 * ALUMNO (panel de Alumnos, P8), no grupo a grupo.
 *
 * P8 cambió dos cosas:
 *  · El TIPO de grupo dejó de ser una lista fija en el código: ahora vive en
 *    `group_kinds`, que el admin edita. `lleva_plan` marca el/los tipos que
 *    llevan plan de entrenamiento (antes era `kind === 'fisicas'` a pelo).
 *  · Un grupo puede tener VARIOS profesores (`class_group_staff`).
 *
 * Módulo puro (regla 21): normalización de la entrada y la decisión de qué plan
 * de entrenamiento ve un alumno.
 */

import type { WeeklyPlan } from './training-plan';

/** Una fila de `group_kinds`. */
export type GroupKindRow = {
  id: string;
  label: string;
  lleva_plan: boolean;
  sort_order?: number;
};

/** `true` si un grupo de este tipo lleva plan de entrenamiento. */
export function llevaPlan(kindId: string, kinds: GroupKindRow[]): boolean {
  return (kinds ?? []).some((k) => k.id === kindId && k.lleva_plan === true);
}

/** La etiqueta de un tipo, o el propio id si no está en la lista. */
export function etiquetaTipo(kindId: string, kinds: GroupKindRow[]): string {
  return (kinds ?? []).find((k) => k.id === kindId)?.label ?? kindId;
}

/**
 * Slug de un tipo a partir de su nombre: «Oposición completa» -> «oposicion-completa».
 * Es el `id` de `group_kinds`. Estable y legible; si dos labels colisionan, el
 * `on conflict do nothing` del upsert lo resuelve sin duplicar.
 */
export function slugDeTipo(label: string): string {
  return label
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'tipo';
}

export type KindInput = { id: string; label: string; lleva_plan: boolean };

export function normalizeKindInput(raw: Record<string, unknown>): KindInput | null {
  const label = typeof raw.label === 'string' ? raw.label.trim().slice(0, 60) : '';
  if (!label) return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : slugDeTipo(label);
  return { id, label, lleva_plan: raw.lleva_plan === true };
}

export type GroupInput = {
  name: string;
  kind: string;
  schedule: string | null;
  staffIds: string[];
  /**
   * El grupo de los multidisciplinares (reglas 96 y 99): no tiene días
   * propios; sus alumnos se apuntan a las clases de otros grupos.
   */
  isMulti: boolean;
};

/**
 * Normaliza lo que llega del formulario de un grupo. `null` si no tiene nombre:
 * un grupo sin nombre es un formulario a medio rellenar (regla 50). El `kind`
 * no se valida aquí contra `group_kinds` —eso lo hace la acción— pero sí se
 * limpia.
 */
export function normalizeGroupInput(raw: Record<string, unknown>): GroupInput | null {
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 120) : '';
  if (!name) return null;

  const kind = typeof raw.kind === 'string' && raw.kind.trim() ? raw.kind.trim().slice(0, 40) : 'otro';
  const schedule =
    typeof raw.schedule === 'string' && raw.schedule.trim() ? raw.schedule.trim().slice(0, 200) : null;
  const staffIds = Array.isArray(raw.staffIds)
    ? [...new Set(raw.staffIds.filter((s): s is string => typeof s === 'string' && !!s))]
    : [];

  return { name, kind, schedule, staffIds, isMulti: raw.isMulti === true };
}

// ============================================================
// QUÉ PLAN DE ENTRENAMIENTO VE UN ALUMNO
// ============================================================

export type PlanEfectivo = {
  plan: WeeklyPlan | null;
  origen: 'individual' | 'grupo' | 'ninguno';
};

/**
 * EL PLAN INDIVIDUAL MANDA SOBRE EL DE GRUPO (P7).
 *
 * El alumno ve el de su grupo de físicas por defecto; en cuanto tiene uno
 * individual activo, ese gana. Devolver el ORIGEN no es un extra: el alumno
 * tiene derecho a saber si lo que ve es «tu plan» o «el plan de tu grupo».
 */
export function planEfectivo(
  individual: WeeklyPlan | null | undefined,
  grupo: WeeklyPlan | null | undefined,
): PlanEfectivo {
  if (individual) return { plan: individual, origen: 'individual' };
  if (grupo) return { plan: grupo, origen: 'grupo' };
  return { plan: null, origen: 'ninguno' };
}

// ============================================================
// EL CUADRANTE DE GRUPOS: CARRILES Y TRAMOS
// ============================================================

/**
 * Las clases de un día que se pisan van en CARRILES, una al lado de otra.
 * En Alphapol, Alpha y Kappa son las dos de 8 a 9 los lunes: pintadas en la
 * misma columna, una tapaba a la otra y en el cuadrante solo había una.
 * `carriles` es cuántos hay en su bloque de clases solapadas.
 */
export function enCarriles<T extends { ini: number; fin: number }>(xs: T[]): (T & { carril: number; carriles: number })[] {
  const orden = [...xs].sort((a, b) => a.ini - b.ini || a.fin - b.fin);
  const out: (T & { carril: number; carriles: number })[] = [];
  let bloque: (T & { carril: number; carriles: number })[] = [];
  let finBloque = -Infinity;
  const cierra = () => {
    const n = Math.max(1, ...bloque.map((b) => b.carril + 1));
    for (const b of bloque) b.carriles = n;
    out.push(...bloque);
    bloque = [];
    finBloque = -Infinity;
  };
  for (const x of orden) {
    if (bloque.length && x.ini >= finBloque) cierra();
    const finCarril: number[] = [];
    for (const b of bloque) finCarril[b.carril] = Math.max(finCarril[b.carril] ?? -Infinity, b.fin);
    let carril = finCarril.findIndex((f) => f <= x.ini);
    if (carril < 0) carril = finCarril.length;
    bloque.push({ ...x, carril, carriles: 1 });
    finBloque = Math.max(finBloque, x.fin);
  }
  if (bloque.length) cierra();
  return out;
}

/**
 * Las horas que se pintan: los tramos con alguna clase, en horas enteras. Lo
 * que queda entre dos tramos (de 9 a 20 en Alphapol) no se pinta hora a hora:
 * es un salto. Así el cuadrante no es un pasillo de 13 horas vacías.
 */
export function tramosDeHoras(clases: { ini: number; fin: number }[]): { desde: number; hasta: number }[] {
  const xs = clases
    .map((c) => ({ desde: Math.floor(c.ini), hasta: Math.ceil(c.fin) }))
    .sort((a, b) => a.desde - b.desde);
  const out: { desde: number; hasta: number }[] = [];
  for (const x of xs) {
    const ultimo = out[out.length - 1];
    // Un hueco de una hora o menos no merece un salto.
    if (ultimo && x.desde <= ultimo.hasta + 1) ultimo.hasta = Math.max(ultimo.hasta, x.hasta);
    else out.push({ ...x });
  }
  return out;
}

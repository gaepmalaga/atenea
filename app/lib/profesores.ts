/**
 * LO QUE DA CADA PROFESOR (regla 100).
 *
 * FÍSICA: el profesor HABITUAL de cada clase («Boxeo lo da Juan»), en orden
 * («FLK: José y, si no puede, Olivares»). En el cuadrante, al escribir el
 * título, el profesor se rellena solo con el primero que esté LIBRE a esa
 * hora. Nunca se bloquea: si un día lo da otro, se cambia a mano.
 *
 * TEORÍA: los temas de cada profesor («1-10, 14, 17, 18») y cómo van los
 * alumnos de la academia en ellos.
 *
 * Módulo PURO (regla 21).
 */

// ============================================================
// FÍSICA: EL PROFESOR HABITUAL DE CADA CLASE
// ============================================================

/** Lo que tienen en común «F.M + RDL» y «f.m+rdl»: sin acentos, mayúsculas ni signos. */
export function claveActividad(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export const MAX_ACTIVIDAD = 60;

/** El nombre de una clase tal como se escribe: recortado, sin NUL. Vacío o sin letras ni números, `null`. */
export function normalizaActividad(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\0/g, '').replace(/\s+/g, ' ').trim();
  if (!t || t.length > MAX_ACTIVIDAD || !claveActividad(t)) return null;
  return t;
}

/** Una clase y sus profesores habituales, el primero el preferido. */
export type ClaseHabitual = { actividad: string; profesorIds: string[] };

/** Las filas de `staff_activities` → una entrada por clase, con sus profesores en orden. */
export function agrupaHabituales(filas: { actividad: string; profesorId: string; prioridad: number }[]): ClaseHabitual[] {
  const por = new Map<string, { actividad: string; filas: { profesorId: string; prioridad: number }[] }>();
  for (const f of filas) {
    const x = por.get(f.actividad) ?? { actividad: f.actividad, filas: [] };
    x.filas.push(f);
    por.set(f.actividad, x);
  }
  return [...por.values()]
    .map((x) => ({ actividad: x.actividad, profesorIds: x.filas.sort((a, b) => a.prioridad - b.prioridad).map((f) => f.profesorId) }))
    .sort((a, b) => a.actividad.localeCompare(b.actividad, 'es'));
}

/**
 * La clase habitual de un título: aquella cuyo nombre es el PRINCIPIO del
 * título («FLK» vale para «FLK 5.0» y «FLK 5.1»). Si varias encajan, la más
 * larga («Boxeo técnico» antes que «Boxeo»).
 */
export function habitualDeTitulo(titulo: string, habituales: ClaseHabitual[]): ClaseHabitual | null {
  const t = claveActividad(titulo);
  if (!t) return null;
  let mejor: ClaseHabitual | null = null;
  let largo = 0;
  for (const h of habituales) {
    const k = claveActividad(h.actividad);
    if (k && t.startsWith(k) && k.length > largo) { mejor = h; largo = k.length; }
  }
  return mejor;
}

export type Sugerencia = {
  profesorId: string;
  actividad: string;
  /** Los habituales que se han saltado porque ya están en otra clase a esa hora. */
  ocupados: string[];
};

/**
 * El profesor que se propone para una clase: el primer habitual LIBRE a esa
 * hora. Si todos están ocupados, el primero (y el cuadrante avisará del
 * choque, como siempre). Los que ya no están activos no se proponen.
 */
export function profesorSugerido(params: {
  titulo: string;
  habituales: ClaseHabitual[];
  /** Los profesores que ya tienen otra clase a esa hora. */
  ocupados: Set<string>;
  /** Los profesores activos (los que se pueden elegir en el cuadrante). */
  activos: Set<string>;
}): Sugerencia | null {
  const h = habitualDeTitulo(params.titulo, params.habituales);
  if (!h) return null;
  const candidatos = h.profesorIds.filter((id) => params.activos.has(id));
  if (!candidatos.length) return null;
  const libre = candidatos.find((id) => !params.ocupados.has(id));
  return {
    profesorId: libre ?? candidatos[0],
    actividad: h.actividad,
    ocupados: candidatos.filter((id) => params.ocupados.has(id) && id !== libre),
  };
}

// ============================================================
// TEORÍA: LOS TEMAS DE CADA PROFESOR
// ============================================================

/**
 * «1-10, 14, 17, 18» → [1…10, 14, 17, 18]. Admite comas, punto y coma o
 * espacios, rangos con guion, raya o «a» («1 a 10»), y repetidos. Vacío es la
 * lista vacía: el profesor no tiene temas. Lo que no se entiende se dice.
 */
export function leeListaTemas(texto: unknown, max = 50): { ok: true; temas: number[] } | { ok: false; error: string } {
  if (texto === null || texto === undefined) return { ok: true, temas: [] };
  if (typeof texto !== 'string') return { ok: false, error: 'Escribe los temas como 1-10, 14, 17.' };
  const limpio = texto.toLowerCase().replace(/temas?/g, ' ').replace(/\s+a\s+/g, '-').replace(/[–—]/g, '-').replace(/\s*-\s*/g, '-');
  const trozos = limpio.split(/[\s,;y]+/).filter(Boolean);
  const set = new Set<number>();
  for (const t of trozos) {
    const m = t.match(/^(\d{1,3})(?:-(\d{1,3}))?$/);
    if (!m) return { ok: false, error: `No entiendo «${t}». Escribe los temas como 1-10, 14, 17.` };
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    if (a < 1 || b < 1 || a > max || b > max) return { ok: false, error: `Los temas van del 1 al ${max}.` };
    if (b < a) return { ok: false, error: `El rango «${t}» va al revés.` };
    for (let n = a; n <= b; n++) set.add(n);
  }
  return { ok: true, temas: [...set].sort((x, y) => x - y) };
}

/** [1…10, 14, 17, 18] → «1–10, 14, 17–18». Vacío, la cadena vacía. */
export function formateaTemas(temas: number[]): string {
  const xs = [...new Set(temas)].sort((a, b) => a - b);
  const partes: string[] = [];
  for (let i = 0; i < xs.length; i++) {
    let j = i;
    while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
    partes.push(j > i ? `${xs[i]}–${xs[j]}` : String(xs[i]));
    i = j;
  }
  return partes.join(', ');
}

/** Cuántas respuestas hacen falta para opinar de un tema: con menos, es ruido. */
export const MIN_RESPUESTAS_TEMA = 20;

export type TemaConDatos = {
  numero: number;
  titulo: string;
  /** Alumnos de la academia que han respondido algo de ese tema. */
  alumnos: number;
  /** Respuestas contestadas (sin los blancos, regla 24). */
  contestadas: number;
  aciertos: number;
};

/** El acierto de un tema en %, o `null` si nadie ha contestado (regla 8: no es un 0). */
export const aciertoDe = (t: Pick<TemaConDatos, 'contestadas' | 'aciertos'>): number | null =>
  t.contestadas > 0 ? Math.round((100 * t.aciertos) / t.contestadas) : null;

export type ResumenTemas = {
  /** Acierto medio de los alumnos en esos temas, ponderado por respuestas; `null` sin datos. */
  acierto: number | null;
  contestadas: number;
  /** El tema con menos acierto, entre los que tienen datos suficientes. */
  masFlojo: (TemaConDatos & { acierto: number }) | null;
  /** Cuántos de sus temas aún no tienen datos suficientes para opinar. */
  conPocosDatos: number;
};

/** Cómo van los alumnos en los temas de un profesor. */
export function resumenTemas(temas: TemaConDatos[]): ResumenTemas {
  const contestadas = temas.reduce((n, t) => n + t.contestadas, 0);
  const aciertos = temas.reduce((n, t) => n + t.aciertos, 0);
  const suficientes = temas.filter((t) => t.contestadas >= MIN_RESPUESTAS_TEMA);
  let masFlojo: ResumenTemas['masFlojo'] = null;
  for (const t of suficientes) {
    const a = aciertoDe(t)!;
    if (!masFlojo || a < masFlojo.acierto || (a === masFlojo.acierto && t.numero < masFlojo.numero)) masFlojo = { ...t, acierto: a };
  }
  return {
    acierto: contestadas > 0 ? Math.round((100 * aciertos) / contestadas) : null,
    contestadas,
    masFlojo,
    conPocosDatos: temas.length - suficientes.length,
  };
}

// ============================================================
// LA CARGA SEMANAL DE CADA PROFESOR
// ============================================================

/** Las horas entre dos `HH:MM`; 0 si falta alguna o van al revés. */
export function horasEntre(ini: string | null | undefined, fin: string | null | undefined): number {
  const h = (t: string | null | undefined) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '');
    return m ? Number(m[1]) + Number(m[2]) / 60 : null;
  };
  const a = h(ini);
  const b = h(fin);
  return a !== null && b !== null && b > a ? b - a : 0;
}

export type ClaseDeSemana = {
  clave: string;
  /** 1 = lunes … 7 = domingo. */
  dia: number;
  inicio: string | null;
  fin: string | null;
  texto: string;
  fisica: boolean;
};

/**
 * Lo que da un profesor en una semana, de DOS sitios (regla 100):
 *  · teoría, inglés…: los grupos en los que está, por su horario;
 *  · física: las sesiones del cuadrante de esa semana que lleva su nombre.
 * Un grupo de física no cuenta por su horario aunque el profesor esté
 * asignado: lo que da es lo del cuadrante. Antes solo se contaba lo primero, y
 * un preparador con cuatro clases de física salía con 0 h.
 */
export function clasesDeLaSemana(
  profesorId: string,
  grupos: { id: string; name: string; llevaPlan: boolean; esMulti: boolean; staffIds: string[]; horario: { weekdays: number[] | null; startTime: string | null; endTime: string | null } }[],
  fisica: { fecha: string; dia: number; grupo: string; titulo: string; hora: string | null; fin: string | null }[],
): ClaseDeSemana[] {
  const teoria = grupos
    .filter((g) => !g.llevaPlan && !g.esMulti && g.staffIds.includes(profesorId) && g.horario.weekdays?.length)
    .flatMap((g) => (g.horario.weekdays ?? []).map((d) => ({
      clave: `${g.id}|${d}`, dia: d, inicio: g.horario.startTime, fin: g.horario.endTime, texto: g.name, fisica: false,
    })));
  const deFisica = fisica.map((c, i) => ({
    clave: `${c.fecha}|${c.grupo}|${i}`, dia: c.dia, inicio: c.hora, fin: c.fin, texto: `${c.titulo} · ${c.grupo}`, fisica: true,
  }));
  return [...teoria, ...deFisica].sort((a, b) => a.dia - b.dia || (a.inicio ?? '99').localeCompare(b.inicio ?? '99'));
}

/** Las horas de una lista de clases. */
export const horasDeClases = (cs: ClaseDeSemana[]) => cs.reduce((n, c) => n + horasEntre(c.inicio, c.fin), 0);

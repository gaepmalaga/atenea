/**
 * EL REGISTRO DEL ENTRENAMIENTO DE GRUPO (regla 84).
 *
 * Lo que hacía por Alphapol la herramienta externa con la que mandaba la física:
 * el alumno marca cada día del plan de su grupo como hecho, con el esfuerzo
 * (1-10) y un comentario, y el preparador ve quién entrena y cómo le va.
 *
 * El plan de grupo es COMPARTIDO (regla 53): el registro no se escribe dentro de
 * él, sino aparte, una fila por alumno y FECHA (`group_workout_logs`). La fecha
 * de cada día sale del lunes de la semana del plan + el día de la semana que
 * dice el propio día («Miércoles» -> lunes + 2).
 *
 * Módulo PURO (regla 21).
 */

import { esDiaDeDescanso, type WeeklyPlan, type TrainingDay } from './training-plan.ts';
import { sumaDias } from './asistencia.ts';

/** Cuántos días hacia atrás se puede apuntar un entrenamiento olvidado. */
export const DIAS_PARA_REGISTRAR = 14;
export const MAX_COMENTARIO = 500;

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * «Miércoles», «miercoles», «Mié», «X»… -> 0 (lunes) … 6 (domingo), o `null`.
 * Es la que usaba el calendario del alumno por su cuenta; vive aquí para que el
 * alumno y el preparador calculen la MISMA fecha para el mismo día.
 */
export function indiceDiaPlan(nombre: string | undefined | null): number | null {
  const n = sinTildes(nombre ?? '');
  if (!n) return null;
  if (n === 'x') return 2;
  const i = DIAS.findIndex((d) => d.startsWith(n.slice(0, 3)));
  return i >= 0 ? i : null;
}

/** La fecha `YYYY-MM-DD` de un día del plan, o `null` si su nombre no es un día. */
export function fechaDeDiaPlan(weekStart: string, dia: Pick<TrainingDay, 'day'>): string | null {
  const i = indiceDiaPlan(dia.day);
  return i === null ? null : sumaDias(weekStart.slice(0, 10), i);
}

/** Los días con entrenamiento del plan, con su fecha. Los descansos no se registran. */
export function diasEntrenables(plan: WeeklyPlan, weekStart: string): { fecha: string; dia: TrainingDay }[] {
  return plan.days
    .filter((d) => !esDiaDeDescanso(d))
    .map((dia) => ({ fecha: fechaDeDiaPlan(weekStart, dia), dia }))
    .filter((x): x is { fecha: string; dia: TrainingDay } => x.fecha !== null)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/**
 * ¿Se puede apuntar (o quitar) ese día? Ni en el futuro —no se marca lo que
 * aún no se ha hecho— ni más atrás de `DIAS_PARA_REGISTRAR`.
 */
export function sePuedeRegistrar(fecha: string, hoy: string): boolean {
  return fecha <= hoy && fecha >= sumaDias(hoy, -(DIAS_PARA_REGISTRAR - 1));
}

/** Esfuerzo y comentario limpios. Vacío es `null`, nunca 0 (regla 16). */
export function normalizaRegistro(raw: { rpe?: unknown; comment?: unknown }): { rpe: number | null; comment: string | null } {
  const vacio = raw.rpe === null || raw.rpe === undefined || raw.rpe === '';
  const n = Number(raw.rpe);
  const rpe = !vacio && Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
  const texto = typeof raw.comment === 'string' ? raw.comment.trim().slice(0, MAX_COMENTARIO) : '';
  return { rpe, comment: texto || null };
}

export type Registro = { userId: string; fecha: string; rpe: number | null; comment: string | null };

export type FilaAlumnoSemana = {
  userId: string;
  email: string;
  /** Por fecha de cada día entrenable: el registro, o `null` si no lo ha marcado. */
  dias: Record<string, { rpe: number | null; comment: string | null } | null>;
  hechos: number;
};

export type ResumenSemanaGrupo = {
  dias: { fecha: string; titulo: string; hechos: number; vencido: boolean }[];
  alumnos: FilaAlumnoSemana[];
  /** Esfuerzo medio de lo registrado; `null` si nadie lo ha puesto (regla 8). */
  rpeMedio: number | null;
  comentarios: { email: string; fecha: string; rpe: number | null; comment: string }[];
  /** Los que no han marcado nada de lo que ya tocaba esta semana. */
  sinRegistrar: string[];
};

/**
 * La semana de un grupo vista por el preparador: cada día entrenable con
 * cuántos lo han hecho, cada alumno con lo que ha marcado, los comentarios y
 * quién no ha apuntado nada de lo que ya tocaba (`vencido`: la fecha ya ha
 * llegado). Solo cuentan los registros de quien SIGUE en el grupo.
 */
export function resumenSemanaGrupo(params: {
  plan: WeeklyPlan;
  weekStart: string;
  miembros: { id: string; email: string }[];
  registros: Registro[];
  hoy: string;
}): ResumenSemanaGrupo {
  const { plan, weekStart, miembros, registros, hoy } = params;
  const dias = diasEntrenables(plan, weekStart);
  const fechas = new Set(dias.map((d) => d.fecha));
  const deMiembro = new Set(miembros.map((m) => m.id));
  const validos = registros.filter((r) => fechas.has(r.fecha) && deMiembro.has(r.userId));

  const alumnos: FilaAlumnoSemana[] = miembros
    .map((m) => {
      const suyos = validos.filter((r) => r.userId === m.id);
      const porDia: FilaAlumnoSemana['dias'] = {};
      for (const d of dias) {
        const r = suyos.find((x) => x.fecha === d.fecha);
        porDia[d.fecha] = r ? { rpe: r.rpe, comment: r.comment } : null;
      }
      return { userId: m.id, email: m.email, dias: porDia, hechos: suyos.length };
    })
    .sort((a, b) => a.hechos - b.hechos || a.email.localeCompare(b.email));

  const conRpe = validos.filter((r) => r.rpe !== null);
  const vencidas = dias.filter((d) => d.fecha <= hoy).map((d) => d.fecha);

  return {
    dias: dias.map((d) => ({
      fecha: d.fecha,
      titulo: d.dia.title || d.dia.type || d.dia.day,
      hechos: validos.filter((r) => r.fecha === d.fecha).length,
      vencido: d.fecha <= hoy,
    })),
    alumnos,
    rpeMedio: conRpe.length ? Math.round((conRpe.reduce((s, r) => s + (r.rpe ?? 0), 0) / conRpe.length) * 10) / 10 : null,
    comentarios: validos
      .filter((r) => r.comment)
      .map((r) => ({ email: miembros.find((m) => m.id === r.userId)?.email ?? '—', fecha: r.fecha, rpe: r.rpe, comment: r.comment as string }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    sinRegistrar: vencidas.length
      ? alumnos.filter((a) => vencidas.every((f) => a.dias[f] === null)).map((a) => a.email)
      : [],
  };
}

// El enlace de vídeo de cada ejercicio se limpia al normalizar el plan.
export { normalizaVideo } from './training-plan.ts';

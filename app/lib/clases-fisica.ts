/**
 * LAS CLASES DE GRUPO DE UN ALUMNO, EN SU CALENDARIO DE FÍSICA (regla 97).
 *
 * Hay DOS capas y no se mezclan:
 *
 *   1. CLASES DE GRUPO: lo que hace todo un grupo cada día y qué profesor lo
 *      da (el cuadrante, regla 96). Salen del HORARIO del grupo, aunque el
 *      preparador aún no haya escrito qué toca: el alumno sabe que el lunes a
 *      las 08:00 tiene clase. Un día marcado «sin clase» se ve así. Un multi
 *      ve las clases de otros grupos a las que se ha apuntado.
 *   2. ENTRENOS: lo suyo, individual, que le planifica el preparador. No
 *      pasan por aquí.
 *
 * Una clase lleva su sesión (si la hay) para leerla y apuntarla.
 *
 * Módulo PURO (regla 21): lo usan el calendario del alumno y la vista del
 * alumno en «Planificar», donde las clases salen aparte y en solo lectura.
 */

import { sumaDias, diaSemanaDe, sePuedeAvisar, horaCorta, type HorarioGrupo, type Ahora } from './asistencia.ts';
import type { Sesion } from './sesiones.ts';
import { nombreCorto } from './cuadrante.ts';

export type GrupoClase = {
  id: string;
  nombre: string;
  esMulti: boolean;
  horario: HorarioGrupo;
};

/** Una sesión de grupo con lo que dice el cuadrante: profesor y hora propia. */
export type SesionDeClase = Sesion & { profesorId: string | null; horaPropia: string | null };

export type ClaseFisica = {
  classId: string;
  /** «Kappa». */
  grupo: string;
  fecha: string;
  /** `HH:MM`: la propia de la sesión o la del grupo. */
  hora: string | null;
  /** Lo que toca, si ya está escrito; `null` = aún sin publicar. */
  sesion: SesionDeClase | null;
  /** Nombre del profesor, si está puesto. */
  profesor: string | null;
  /** Marcada «sin clase» (festivo, sin profesor…). */
  sinClase: boolean;
  motivo: string | null;
  /** `grupo`: la de su grupo. `multi`: la de otro grupo a la que se ha apuntado. */
  origen: 'grupo' | 'multi';
  /** Ha avisado de que falta (solo en las de su grupo). */
  falta: boolean;
  /** Aún puede avisar de que falta, o quitarse si es multi: la clase no ha empezado. */
  editable: boolean;
};

const clave = (classId: string, fecha: string) => `${classId}|${fecha}`;

function fechasEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let f = desde; f <= hasta; f = sumaDias(f, 1)) out.push(f);
  return out;
}

/** ¿Es un grupo que da CLASES (con horario semanal) o de Multi? Un grupo sin días es un plan común. */
export const daClases = (g: Pick<GrupoClase, 'esMulti' | 'horario'>) => g.esMulti || !!g.horario.weekdays?.length;

/**
 * Las clases de un alumno entre dos fechas.
 *
 *  - De sus grupos con horario: una por cada día de clase (con o sin sesión
 *    escrita), y además las sesiones que su grupo tenga otro día (una clase
 *    extra).
 *  - De Multi, si lo es: las sesiones propias de Multi (las 18:30) y las clases
 *    de otros grupos a las que se ha apuntado.
 *  - Lo marcado «sin clase» sale como tal, no desaparece: el alumno tiene que
 *    saber que el martes no hay.
 */
export function armaClasesAlumno(p: {
  desde: string;
  hasta: string;
  /** Sus grupos (los que no dan clases se ignoran). */
  grupos: GrupoClase[];
  /** Grupos de las clases a las que se ha apuntado como multi. */
  gruposAjenos: GrupoClase[];
  uniones: { classId: string; fecha: string }[];
  sesiones: SesionDeClase[];
  sinClase: { classId: string; fecha: string; motivo: string | null }[];
  faltas: { classId: string; fecha: string }[];
  profesores: Record<string, string>;
  ahora: Ahora;
}): ClaseFisica[] {
  const off = new Map(p.sinClase.map((x) => [clave(x.classId, x.fecha), x.motivo]));
  const faltas = new Set(p.faltas.map((x) => clave(x.classId, x.fecha)));
  const porCelda = new Map<string, SesionDeClase[]>();
  for (const s of [...p.sesiones].sort((a, b) => a.position - b.position || a.title.localeCompare(b.title, 'es'))) {
    if (!s.classId) continue;
    const k = clave(s.classId, s.fecha);
    porCelda.set(k, [...(porCelda.get(k) ?? []), s]);
  }
  const dentro = (f: string) => f >= p.desde && f <= p.hasta;
  const out = new Map<string, ClaseFisica>();

  const pon = (g: GrupoClase, fecha: string, origen: ClaseFisica['origen']) => {
    const k = clave(g.id, fecha);
    if (out.has(k)) return;
    const sesion = porCelda.get(k)?.[0] ?? null;
    const sinClase = off.has(k);
    // Avisar de una falta (o quitarse, si es multi) solo en un día de su
    // horario y antes de que empiece: es lo que comprueba el servidor.
    const editable = !sinClase && !g.esMulti && sePuedeAvisar(g.horario, fecha, p.ahora);
    out.set(k, {
      classId: g.id,
      grupo: nombreCorto(g.nombre),
      fecha,
      hora: horaCorta(sesion?.horaPropia ?? g.horario.startTime ?? null),
      sesion,
      profesor: sesion?.profesorId ? p.profesores[sesion.profesorId] ?? null : null,
      sinClase,
      motivo: off.get(k) ?? null,
      origen,
      falta: origen === 'grupo' && faltas.has(k),
      editable,
    });
  };

  for (const g of p.grupos.filter(daClases)) {
    if (!g.esMulti) {
      for (const f of fechasEntre(p.desde, p.hasta)) if (g.horario.weekdays!.includes(diaSemanaDe(f))) pon(g, f, 'grupo');
    }
    // Las sesiones del grupo fuera de su horario (la de Multi, una extra).
    for (const s of p.sesiones) if (s.classId === g.id && dentro(s.fecha)) pon(g, s.fecha, 'grupo');
  }
  const ajenos = new Map(p.gruposAjenos.map((g) => [g.id, g]));
  for (const u of p.uniones) {
    const g = ajenos.get(u.classId);
    if (g && dentro(u.fecha)) pon(g, u.fecha, 'multi');
  }

  return [...out.values()].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora ?? '99').localeCompare(b.hora ?? '99') || a.grupo.localeCompare(b.grupo, 'es'));
}

/** Las clases de cada día. */
export function clasesPorDia(clases: ClaseFisica[]): Map<string, ClaseFisica[]> {
  const m = new Map<string, ClaseFisica[]>();
  for (const c of clases) m.set(c.fecha, [...(m.get(c.fecha) ?? []), c]);
  return m;
}

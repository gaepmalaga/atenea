/**
 * «PLANIFICAR» POR ALUMNO (regla 97).
 *
 * El entreno es de CADA alumno: varios pueden coincidir en el mismo entreno la
 * misma semana, pero cada uno tiene SU copia y cambiar la de uno no cambia
 * las demás. Lo único común a un grupo es su clase del cuadrante.
 *
 * La vista principal es la lista de alumnos de física, por grupo: de un
 * vistazo, a quién le falta la semana planificada y quién no ha apuntado lo
 * que ha hecho. Aquí vive la aritmética de esa lista y de copiar a varios.
 *
 * Módulo PURO (regla 21).
 */

import { sumaDias } from './asistencia.ts';
import { ordenaSesiones, type ContenidoSesion, type Sesion } from './sesiones.ts';

export type ResumenSemanaAlumno = {
  lunes: string;
  /** Sesiones de entreno que tiene esa semana (los descansos no cuentan). */
  sesiones: number;
  /** Las que ya tocaban (de hoy hacia atrás). */
  vencidas: number;
  /** De las vencidas, cuántas ha apuntado (hecha o no hecha). */
  apuntadas: number;
};

/** Cómo va un alumno una semana: lo que se ve en la lista. */
export type EstadoSemana = 'sin_planificar' | 'por_apuntar' | 'al_dia' | 'planificada';

export function estadoSemana(r: ResumenSemanaAlumno): EstadoSemana {
  if (r.sesiones === 0) return 'sin_planificar';
  if (r.vencidas === 0) return 'planificada';
  return r.apuntadas < r.vencidas ? 'por_apuntar' : 'al_dia';
}

/**
 * El resumen de unas semanas para un alumno: cuántas sesiones tiene, cuántas
 * tocaban ya y cuántas ha apuntado. Un descanso no es una sesión que
 * planificar ni que apuntar.
 */
export function resumenSemanasAlumno(params: {
  sesiones: Pick<Sesion, 'id' | 'fecha' | 'kind'>[];
  apuntadas: Set<string>;
  lunes: string[];
  hoy: string;
}): ResumenSemanaAlumno[] {
  return params.lunes.map((l) => {
    const fin = sumaDias(l, 6);
    const deLaSemana = params.sesiones.filter((s) => s.fecha >= l && s.fecha <= fin && s.kind !== 'descanso');
    const vencidas = deLaSemana.filter((s) => s.fecha <= params.hoy);
    return {
      lunes: l,
      sesiones: deLaSemana.length,
      vencidas: vencidas.length,
      apuntadas: vencidas.filter((s) => params.apuntadas.has(s.id)).length,
    };
  });
}

export type GrupoPlan = { id: string; nombre: string; esMulti: boolean; conHorario: boolean };
export type AlumnoPlan = { id: string; email: string; grupos: string[] };

/** Sin acentos ni mayúsculas, para buscar. */
const plano = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Los alumnos por grupo, en el orden de los grupos (el del cuadrante). Un
 * alumno en dos grupos sale en el PRIMERO: en dos sitios parecería que hay
 * que planificarlo dos veces. `busca` filtra por correo (sin acentos).
 */
export function agrupaAlumnos<A extends AlumnoPlan>(alumnos: A[], grupos: GrupoPlan[], busca = ''): { grupo: GrupoPlan; alumnos: A[] }[] {
  const q = plano(busca.trim());
  const visto = new Set<string>();
  const out: { grupo: GrupoPlan; alumnos: A[] }[] = [];
  const orden = [...grupos].sort((a, b) => Number(a.esMulti) - Number(b.esMulti) || Number(b.conHorario) - Number(a.conHorario));
  for (const g of orden) {
    const suyos = alumnos
      .filter((a) => a.grupos.includes(g.id) && !visto.has(a.id))
      .sort((a, b) => a.email.localeCompare(b.email, 'es'));
    for (const a of suyos) visto.add(a.id);
    const filtrados = q ? suyos.filter((a) => plano(a.email).includes(q)) : suyos;
    if (filtrados.length) out.push({ grupo: g, alumnos: filtrados });
  }
  return out;
}

export type CopiaParaAlumno = ContenidoSesion & { alumnoId: string; fecha: string; position: number };

/**
 * Lo que se crea al copiar unas sesiones de un alumno a otros: UNA FILA NUEVA
 * POR ALUMNO Y SESIÓN, con la fecha movida `salto` días. Cada alumno recibe
 * su copia: no hay nada compartido, así que cambiar la de uno no toca las de
 * los demás. Copiar a uno mismo sin moverse de fecha duplicaría: se salta.
 */
export function copiasParaAlumnos<T extends ContenidoSesion & Pick<Sesion, 'fecha' | 'position' | 'title'>>(
  sesiones: T[], destinos: string[], salto: number, origen?: string,
): CopiaParaAlumno[] {
  const unicos = [...new Set(destinos)].filter((d) => !(d === origen && salto === 0));
  return unicos.flatMap((alumnoId) => ordenaSesiones(sesiones).map((s) => ({
    alumnoId,
    fecha: sumaDias(s.fecha, salto),
    position: s.position,
    kind: s.kind,
    title: s.title,
    description: s.description,
    durationMin: s.durationMin,
    distanceKm: s.distanceKm,
    video: s.video,
    cargas: (s.cargas ?? []).map((c) => ({ ...c })),
  })));
}

/** Días entre dos fechas `YYYY-MM-DD` (puede ser negativo). */
export function diasEntre(desde: string, hasta: string): number {
  const ms = (f: string) => Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)));
  return Math.round((ms(hasta) - ms(desde)) / 86_400_000);
}

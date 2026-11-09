/**
 * EL CALENDARIO DE LA ACADEMIA (regla 105).
 *
 * Lo pidió el dueño: «un calendario con todos los eventos que existan, con
 * vista diaria, semanal y mensual, y filtros para quitar y poner por grupo,
 * por profesor… que de un vistazo se vea toda la programación».
 *
 * Nada de esto se guarda aparte: se DERIVA de lo que ya existe, para que el
 * calendario no pueda contradecir al resto de la plataforma.
 *  · Las CLASES de cada grupo salen de su horario (días, hora y profesores,
 *    regla 82), menos los días «sin clase» (regla 97).
 *  · En física, lo que toca cada día es la sesión del cuadrante (título y
 *    profesor de esa sesión, regla 96); un grupo sin sesión ese día sale
 *    «sin planificar». Las sesiones de un día añadido y las sueltas de Multi
 *    (las de las 18:30) también salen.
 *  · El ENTRENO de cada alumno (regla 97) sale aparte: son muchos, y por eso
 *    su filtro empieza apagado.
 *  · La fecha del EXAMEN (regla 64).
 *
 * Módulo PURO (regla 21).
 */

import { sumaDias, diaSemanaDe, horaCorta, cuentaSesion, type HorarioGrupo, type CuentaSesion } from './asistencia.ts';
import { colorDeGrupo, nombreCorto } from './cuadrante.ts';

export type TipoEvento = 'clase' | 'fisica' | 'suelta' | 'entreno' | 'sin_clase' | 'examen';

export const ETIQUETA_TIPO_EVENTO: Record<TipoEvento, string> = {
  clase: 'Clase',
  fisica: 'Física',
  suelta: 'Sesión suelta',
  entreno: 'Entreno de un alumno',
  sin_clase: 'Sin clase',
  examen: 'Examen oficial',
};

export type GrupoCal = {
  id: string;
  nombre: string;
  kind: string;
  kindLabel: string;
  llevaPlan: boolean;
  esMulti: boolean;
  horario: HorarioGrupo;
  profesorIds: string[];
};

export type SesionCal = {
  id: string;
  classId: string | null;
  userId: string | null;
  fecha: string;
  inicio: string | null;
  titulo: string;
  profesorId: string | null;
  duracionMin: number | null;
};

export type EventoCalendario = {
  id: string;
  tipo: TipoEvento;
  fecha: string;
  /** `HH:MM`; `null` = todo el día. */
  inicio: string | null;
  fin: string | null;
  titulo: string;
  grupoId: string | null;
  grupo: string | null;
  /** El tipo de grupo (`teoria`, `fisicas`…): es por lo que se filtra «qué». */
  kind: string | null;
  kindLabel: string | null;
  profesorIds: string[];
  profesores: string[];
  alumnoId: string | null;
  alumno: string | null;
  /** Una clase de física sin sesión puesta en el cuadrante. */
  sinPlanificar: boolean;
  plazas: CuentaSesion | null;
  motivo: string | null;
  color: { fondo: string; texto: string };
};

/** Los colores por tipo de grupo; los de física van por grupo (los del cuadrante). */
const COLOR_KIND: Record<string, { fondo: string; texto: string }> = {
  teoria: { fondo: '#1e3a8a', texto: '#ffffff' },
  ingles: { fondo: '#0e7490', texto: '#ffffff' },
};
const COLOR_OTRO = { fondo: '#475569', texto: '#ffffff' };
const COLOR_ENTRENO = { fondo: '#e2e8f0', texto: '#0f172a' };
const COLOR_SIN_CLASE = { fondo: '#f1f5f9', texto: '#64748b' };
const COLOR_EXAMEN = { fondo: '#c8a24a', texto: '#0b1530' };

export function colorDe(g: Pick<GrupoCal, 'nombre' | 'kind' | 'llevaPlan'>): { fondo: string; texto: string } {
  if (g.llevaPlan) return colorDeGrupo(nombreCorto(g.nombre));
  return COLOR_KIND[g.kind] ?? COLOR_OTRO;
}

/** `08:00` + 60 min → `09:00`. */
export function sumaMinutos(hhmm: string, min: number): string {
  const t = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) + min;
  const m = Math.max(0, Math.min(t, 24 * 60 - 1));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

const tieneClase = (g: GrupoCal) => !g.esMulti && !!g.horario.weekdays?.length && !!horaCorta(g.horario.startTime);

/**
 * Todos los eventos entre `desde` y `hasta` (incluidos), ordenados por día y
 * hora (los de todo el día, primero).
 */
export function armaCalendario(p: {
  desde: string;
  hasta: string;
  grupos: GrupoCal[];
  sesiones: SesionCal[];
  sinClase: { classId: string; fecha: string; motivo: string | null }[];
  profesores: Map<string, string>;
  alumnos: Map<string, string>;
  /** `classId|fecha` → inscritos, faltas y multis de esa sesión. */
  cuentas?: Map<string, { inscritos: number; faltan: number; multis: number }>;
  /** Inscritos de cada grupo, para una sesión sin faltas ni multis. */
  inscritos?: Map<string, number>;
  examen: string | null;
}): EventoCalendario[] {
  const out: EventoCalendario[] = [];
  const grupoDe = new Map(p.grupos.map((g) => [g.id, g]));
  const sinClase = new Map(p.sinClase.map((s) => [`${s.classId}|${s.fecha}`, s]));
  const sesionesDe = new Map<string, SesionCal[]>();
  for (const s of p.sesiones) {
    if (!s.classId || s.fecha < p.desde || s.fecha > p.hasta) continue;
    const k = `${s.classId}|${s.fecha}`;
    sesionesDe.set(k, [...(sesionesDe.get(k) ?? []), s]);
  }
  const nombres = (ids: string[]) => ids.map((id) => p.profesores.get(id)).filter((x): x is string => !!x);
  const plazas = (g: GrupoCal, fecha: string): CuentaSesion | null => {
    if (g.horario.capacity === null && !p.cuentas && !p.inscritos) return null;
    const c = p.cuentas?.get(`${g.id}|${fecha}`) ?? { inscritos: p.inscritos?.get(g.id) ?? 0, faltan: 0, multis: 0 };
    return cuentaSesion(g.horario.capacity, c.inscritos, c.faltan, c.multis);
  };
  const base = (g: GrupoCal | null) => ({
    grupoId: g?.id ?? null,
    grupo: g?.nombre ?? null,
    kind: g?.kind ?? null,
    kindLabel: g?.kindLabel ?? null,
    alumnoId: null,
    alumno: null,
    sinPlanificar: false,
    motivo: null,
  });
  const usadas = new Set<string>();

  // 1 · Las clases del horario de cada grupo, día a día.
  for (let f = p.desde; f <= p.hasta; f = sumaDias(f, 1)) {
    const dia = diaSemanaDe(f);
    for (const g of p.grupos) {
      if (!tieneClase(g) || !g.horario.weekdays!.includes(dia)) continue;
      const ini = horaCorta(g.horario.startTime);
      const fin = horaCorta(g.horario.endTime);
      const off = sinClase.get(`${g.id}|${f}`);
      if (off) {
        out.push({
          ...base(g), id: `off|${g.id}|${f}`, tipo: 'sin_clase', fecha: f, inicio: ini, fin, titulo: g.nombre,
          profesorIds: [], profesores: [], plazas: null, motivo: off.motivo, color: COLOR_SIN_CLASE,
        });
        continue;
      }
      const ses = sesionesDe.get(`${g.id}|${f}`) ?? [];
      if (g.llevaPlan && ses.length) {
        for (const s of ses) {
          usadas.add(s.id);
          const i = horaCorta(s.inicio) ?? ini;
          const ids = s.profesorId ? [s.profesorId] : g.profesorIds;
          out.push({
            ...base(g), id: `ses|${s.id}`, tipo: 'fisica', fecha: f, inicio: i,
            fin: i && i !== ini ? sumaMinutos(i, s.duracionMin ?? 60) : fin,
            titulo: s.titulo || g.nombre, profesorIds: ids, profesores: nombres(ids), plazas: plazas(g, f), color: colorDe(g),
          });
        }
      } else {
        out.push({
          ...base(g), id: `clase|${g.id}|${f}`, tipo: g.llevaPlan ? 'fisica' : 'clase', fecha: f, inicio: ini, fin,
          titulo: g.llevaPlan ? 'Sin planificar' : g.nombre, profesorIds: g.profesorIds, profesores: nombres(g.profesorIds),
          sinPlanificar: g.llevaPlan, plazas: plazas(g, f), color: colorDe(g),
        });
      }
    }
  }

  // 2 · Las sesiones de grupo que no caen en su horario: un día añadido, o
  //     las sueltas de Multi.
  for (const s of p.sesiones) {
    if (!s.classId || usadas.has(s.id) || s.fecha < p.desde || s.fecha > p.hasta) continue;
    const g = grupoDe.get(s.classId);
    if (!g) continue;
    if (sinClase.has(`${g.id}|${s.fecha}`)) continue;
    const i = horaCorta(s.inicio) ?? horaCorta(g.horario.startTime);
    const ids = s.profesorId ? [s.profesorId] : g.profesorIds;
    out.push({
      ...base(g), id: `ses|${s.id}`, tipo: g.esMulti ? 'suelta' : 'fisica', fecha: s.fecha, inicio: i,
      fin: i ? sumaMinutos(i, s.duracionMin ?? 60) : null,
      titulo: s.titulo || g.nombre, profesorIds: ids, profesores: nombres(ids), plazas: g.esMulti ? null : plazas(g, s.fecha), color: colorDe(g),
    });
  }

  // 3 · El entreno de cada alumno.
  for (const s of p.sesiones) {
    if (!s.userId || s.classId || s.fecha < p.desde || s.fecha > p.hasta) continue;
    const ids = s.profesorId ? [s.profesorId] : [];
    const i = horaCorta(s.inicio);
    out.push({
      ...base(null), id: `ent|${s.id}`, tipo: 'entreno', fecha: s.fecha, inicio: i, fin: i ? sumaMinutos(i, s.duracionMin ?? 60) : null,
      titulo: s.titulo || 'Entreno', profesorIds: ids, profesores: nombres(ids),
      alumnoId: s.userId, alumno: p.alumnos.get(s.userId) ?? null, plazas: null, color: COLOR_ENTRENO,
    });
  }

  // 4 · El examen.
  if (p.examen && p.examen >= p.desde && p.examen <= p.hasta) {
    out.push({
      ...base(null), id: `examen|${p.examen}`, tipo: 'examen', fecha: p.examen, inicio: null, fin: null,
      titulo: 'Examen de la oposición', profesorIds: [], profesores: [], plazas: null, color: COLOR_EXAMEN,
    });
  }

  return out.sort((a, b) =>
    a.fecha.localeCompare(b.fecha)
    || (a.inicio ?? '').localeCompare(b.inicio ?? '')
    || (a.grupo ?? a.alumno ?? '').localeCompare(b.grupo ?? b.alumno ?? '', 'es'));
}

// ============================================================
// LOS FILTROS
// ============================================================

/**
 * Qué se ve. Cada lista es lo que se ESCONDE (vacía = se ve todo): así un
 * grupo o un profesor nuevo sale sin tener que marcarlo.
 */
export type FiltroCalendario = {
  /** Tipos de grupo escondidos (`teoria`…) y categorías sin grupo (`entreno`, `sin_clase`, `examen`). */
  ocultosQue: string[];
  ocultosGrupos: string[];
  /** Profesores escondidos; `''` es «sin profesor». */
  ocultosProfesores: string[];
  busca: string;
};

export const FILTRO_INICIAL: FiltroCalendario = {
  // Los entrenos de cada alumno son muchos: se encienden a propósito.
  ocultosQue: ['entreno'],
  ocultosGrupos: [],
  ocultosProfesores: [],
  busca: '',
};

/** La categoría «qué» de un evento: el tipo de su grupo, o la suya si no tiene grupo. */
export const queEs = (e: Pick<EventoCalendario, 'tipo' | 'kind'>): string =>
  e.tipo === 'entreno' || e.tipo === 'examen' || e.tipo === 'sin_clase' ? e.tipo : e.kind ?? 'otro';

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtraEventos(eventos: EventoCalendario[], f: FiltroCalendario): EventoCalendario[] {
  const q = sinAcentos(f.busca.trim());
  return eventos.filter((e) => {
    if (f.ocultosQue.includes(queEs(e))) return false;
    if (e.grupoId && f.ocultosGrupos.includes(e.grupoId)) return false;
    if (f.ocultosProfesores.length && e.tipo !== 'examen') {
      if (!e.profesorIds.length) { if (f.ocultosProfesores.includes('')) return false; }
      else if (e.profesorIds.every((id) => f.ocultosProfesores.includes(id))) return false;
    }
    if (q) {
      const texto = sinAcentos([e.titulo, e.grupo, e.kindLabel, e.alumno, ...e.profesores, e.motivo].filter(Boolean).join(' '));
      if (!texto.includes(q)) return false;
    }
    return true;
  });
}

// ============================================================
// LAS VISTAS
// ============================================================

export type VistaCalendario = 'dia' | 'semana' | 'mes';

/** El lunes de la semana de `fecha`. */
export const lunesDeFecha = (fecha: string) => sumaDias(fecha, 1 - diaSemanaDe(fecha));

/** El rango de fechas que pinta cada vista: el mes, en semanas enteras de lunes a domingo. */
export function rangoDeVista(vista: VistaCalendario, fecha: string): { desde: string; hasta: string } {
  if (vista === 'dia') return { desde: fecha, hasta: fecha };
  if (vista === 'semana') { const l = lunesDeFecha(fecha); return { desde: l, hasta: sumaDias(l, 6) }; }
  const primero = `${fecha.slice(0, 7)}-01`;
  const desde = lunesDeFecha(primero);
  const [y, m] = fecha.slice(0, 7).split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { desde, hasta: sumaDias(lunesDeFecha(ultimo), 6) };
}

/** Un paso adelante o atrás en la vista: un día, una semana o un mes. */
export function mueveVista(vista: VistaCalendario, fecha: string, n: number): string {
  if (vista === 'dia') return sumaDias(fecha, n);
  if (vista === 'semana') return sumaDias(fecha, 7 * n);
  const [y, m] = fecha.slice(0, 7).split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

/** Las fechas entre dos días, incluidos. */
export function fechasEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let f = desde; f <= hasta; f = sumaDias(f, 1)) out.push(f);
  return out;
}

/** «7:00», como lo ve el que lo lee; `null` = todo el día. */
export const horaLegible = (h: string | null) => (h ? `${Number(h.slice(0, 2))}:${h.slice(3, 5)}` : 'Todo el día');

/** Horas decimales de un `HH:MM` (para pintar en la rejilla). */
export const aHoras = (h: string) => Number(h.slice(0, 2)) + Number(h.slice(3, 5)) / 60;

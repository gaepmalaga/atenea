/**
 * ASISTENCIA: EL HORARIO DE UN GRUPO, SUS SESIONES Y LOS HUECOS (regla 82).
 *
 * Lo pidió Alphapol: cada alumno avisa de las clases a las que va a faltar, y
 * la academia ve cuántas plazas quedan libres en cada clase cuando alguien pide
 * un cambio. Cada grupo tiene un número de plazas fijo.
 *
 * LAS SESIONES NO SE GUARDAN: se derivan del horario del grupo (días de la
 * semana + hora). Solo se guarda la FALTA (`class_absences`). Mismo criterio
 * que las semanas del plan de grupo (regla 54): lo que se puede derivar, se
 * deriva, y así no hay un calendario que se quede desfasado del horario.
 *
 * TODO VA EN LA HORA DE LA ACADEMIA (`MARCA.zonaHoraria`). El servidor corre en
 * UTC: calcular «hoy» o «ya ha empezado la clase de las 17:00» con la hora del
 * servidor se correría una o dos horas según la época del año, y un alumno
 * podría avisar de una falta con la clase ya empezada (o no poder hacerlo una
 * hora antes de que empiece). Las fechas viajan como `YYYY-MM-DD` y se operan
 * con aritmética de calendario en UTC, que no tiene cambios de hora.
 *
 * Módulo PURO (regla 21).
 */

import { MARCA } from './marca.ts';

/** 1 = lunes … 7 = domingo (ISO), como `class_groups.weekdays`. */
export const DIAS_SEMANA = [
  { n: 1, corto: 'L', largo: 'lunes' },
  { n: 2, corto: 'M', largo: 'martes' },
  { n: 3, corto: 'X', largo: 'miércoles' },
  { n: 4, corto: 'J', largo: 'jueves' },
  { n: 5, corto: 'V', largo: 'viernes' },
  { n: 6, corto: 'S', largo: 'sábado' },
  { n: 7, corto: 'D', largo: 'domingo' },
] as const;

/** Cuántos días por delante se enseñan y se dejan avisar. */
export const DIAS_VISIBLES = 21;

/** Tope de plazas que se admite al escribirlas: más es casi seguro un error. */
const MAX_PLAZAS = 500;

export type HorarioGrupo = {
  /** Días de clase, 1-7 ordenados. `null` = el grupo no tiene horario. */
  weekdays: number[] | null;
  /** `HH:MM`, o `null` si no se ha puesto. */
  startTime: string | null;
  endTime: string | null;
  /** Plazas. `null` = no se ha dicho: hay faltas, pero no «huecos». */
  capacity: number | null;
};

export const HORARIO_VACIO: HorarioGrupo = { weekdays: null, startTime: null, endTime: null, capacity: null };

// ============================================================
// ENTRADA
// ============================================================

/** `HH:MM` o `HH:MM:SS` (como lo devuelve Postgres) -> `HH:MM`. `null` si no es una hora. */
export function horaCorta(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const m = valor.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

const minutosDe = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * Lo que llega del formulario del grupo -> horario limpio, o el motivo por el
 * que no vale. Se usa también en el servidor: una Server Action es un endpoint
 * público (regla 1).
 *
 * Un campo vacío es `null`, nunca `0` (regla 16): «sin plazas puestas» no es
 * «cero plazas», que sería un grupo en el que no cabe nadie.
 */
export function normalizeHorario(
  raw: Record<string, unknown>,
): { ok: true; horario: HorarioGrupo } | { ok: false; error: string } {
  const dias = Array.isArray(raw.weekdays)
    ? [...new Set(raw.weekdays.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7))].sort((a, b) => a - b)
    : [];

  const vacio = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  const startTime = vacio(raw.startTime) ? null : horaCorta(raw.startTime);
  const endTime = vacio(raw.endTime) ? null : horaCorta(raw.endTime);
  if (!vacio(raw.startTime) && !startTime) return { ok: false, error: 'La hora de inicio no es válida.' };
  if (!vacio(raw.endTime) && !endTime) return { ok: false, error: 'La hora de fin no es válida.' };
  if (startTime && endTime && minutosDe(endTime) <= minutosDe(startTime)) {
    return { ok: false, error: 'La hora de fin tiene que ser posterior a la de inicio.' };
  }

  let capacity: number | null = null;
  if (!vacio(raw.capacity)) {
    const n = Number(raw.capacity);
    if (!Number.isInteger(n) || n < 1 || n > MAX_PLAZAS) {
      return { ok: false, error: `Las plazas tienen que ser un número entre 1 y ${MAX_PLAZAS}.` };
    }
    capacity = n;
  }

  return { ok: true, horario: { weekdays: dias.length ? dias : null, startTime, endTime, capacity } };
}

/** La fila de `class_groups` -> horario. Defensivo: las filas de antes no lo traen. */
export function horarioDeFila(fila: Record<string, unknown>): HorarioGrupo {
  const r = normalizeHorario({
    weekdays: fila.weekdays,
    startTime: fila.start_time,
    endTime: fila.end_time,
    capacity: fila.capacity,
  });
  return r.ok ? r.horario : HORARIO_VACIO;
}

// ============================================================
// FECHAS EN LA HORA DE LA ACADEMIA
// ============================================================

export type Ahora = { fecha: string; minutos: number };

/** El momento `ms` en la hora de la academia: la fecha `YYYY-MM-DD` y los minutos del día. */
export function ahoraEnZona(ms: number, zona: string = MARCA.zonaHoraria): Ahora {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? '00';
  return { fecha: `${p('year')}-${p('month')}-${p('day')}`, minutos: Number(p('hour')) * 60 + Number(p('minute')) };
}

const aUTC = (fecha: string) => {
  const [y, m, d] = fecha.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** `fecha` + `n` días, en calendario (sin cambios de hora). */
export function sumaDias(fecha: string, n: number): string {
  return new Date(aUTC(fecha) + n * 86_400_000).toISOString().slice(0, 10);
}

/** 1 = lunes … 7 = domingo. */
export function diaSemanaDe(fecha: string): number {
  const d = new Date(aUTC(fecha)).getUTCDay();
  return d === 0 ? 7 : d;
}

export function esFecha(valor: unknown): valor is string {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(aUTC(valor))
    && new Date(aUTC(valor)).toISOString().slice(0, 10) === valor;
}

// ============================================================
// SESIONES
// ============================================================

/**
 * Las fechas de clase del grupo desde hoy, durante `dias` días. La de hoy
 * entra mientras la clase no haya TERMINADO: la academia tiene que ver las
 * faltas de la clase que está en marcha.
 */
export function proximasSesiones(h: HorarioGrupo, ahora: Ahora, dias = DIAS_VISIBLES): string[] {
  if (!h.weekdays?.length) return [];
  const fechas: string[] = [];
  for (let i = 0; i < dias; i++) {
    const fecha = sumaDias(ahora.fecha, i);
    if (!h.weekdays.includes(diaSemanaDe(fecha))) continue;
    if (i === 0 && h.endTime && ahora.minutos >= minutosDe(h.endTime)) continue;
    fechas.push(fecha);
  }
  return fechas;
}

/**
 * ¿Se puede avisar (o retirar el aviso) de una falta en esta sesión?
 *
 * Hasta que EMPIEZA la clase. Sin hora de inicio puesta, todo ese día: no se
 * puede saber antes. Y solo en fechas que son de verdad días de clase del
 * grupo y dentro de la ventana visible — una Server Action es un endpoint
 * público y no se puede fiar de que la fecha venga de la pantalla.
 */
export function sePuedeAvisar(h: HorarioGrupo, fecha: string, ahora: Ahora): boolean {
  if (!esFecha(fecha) || !h.weekdays?.includes(diaSemanaDe(fecha))) return false;
  if (fecha < ahora.fecha || fecha > sumaDias(ahora.fecha, DIAS_VISIBLES - 1)) return false;
  if (fecha > ahora.fecha) return true;
  return h.startTime ? ahora.minutos < minutosDe(h.startTime) : true;
}

export type CuentaSesion = {
  aforo: number | null;
  inscritos: number;
  faltan: number;
  asisten: number;
  /**
   * Plazas libres ESE día: aforo − los que van. `null` sin aforo puesto (no es
   * cero, regla 8). Puede ser negativo si hay más alumnos que plazas.
   */
  libres: number | null;
  sobreaforo: boolean;
};

export function cuentaSesion(aforo: number | null, inscritos: number, faltan: number, multis = 0): CuentaSesion {
  // Un multi apuntado a la sesión (regla 96) ocupa plaza igual que uno del grupo.
  const asisten = Math.max(0, inscritos - faltan) + Math.max(0, multis);
  const libres = aforo === null ? null : aforo - asisten;
  return { aforo, inscritos, faltan, asisten, libres, sobreaforo: libres !== null && libres < 0 };
}

// ============================================================
// TEXTOS
// ============================================================

/** «L · X · V», «17:00–19:00», «20 plazas». Lo que se ve del horario en una línea. */
export function horarioEnTexto(h: HorarioGrupo): string | null {
  if (!h.weekdays?.length && !h.startTime && h.capacity === null) return null;
  const partes: string[] = [];
  if (h.weekdays?.length) partes.push(h.weekdays.map((n) => DIAS_SEMANA[n - 1].corto).join(' · '));
  if (h.startTime) partes.push(h.endTime ? `${h.startTime}–${h.endTime}` : `${h.startTime}`);
  if (h.capacity !== null) partes.push(`${h.capacity} ${h.capacity === 1 ? 'plaza' : 'plazas'}`);
  return partes.join(' · ');
}

/** «mar 11 nov». En UTC a propósito: la fecha ya es de la academia. */
export function etiquetaFecha(fecha: string): string {
  return new Date(aUTC(fecha)).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

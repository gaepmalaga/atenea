/**
 * LAS SESIONES DE FÍSICA, COMO LAS PLANIFICA UN PREPARADOR (regla 86).
 *
 * El modelo es el de la herramienta con la que Alphapol mandaba la física: el
 * plan no es «una semana con ejercicios por día» sino SESIONES sueltas en el
 * calendario. Cada una tiene un tipo (fuerza, carrera…), un título, una
 * descripción escrita como la escribe el preparador, y opcionalmente duración,
 * distancia y un vídeo. Es de un GRUPO o de UN alumno; el alumno ve las de sus
 * grupos y las suyas juntas.
 *
 * El alumno apunta cada sesión: hecha o no, esfuerzo (1-10), sensaciones, y el
 * tiempo y la distancia reales. El preparador lo ve y puede contestar.
 *
 * Las fechas son `YYYY-MM-DD` en la hora de la academia (regla 82).
 *
 * Módulo PURO (regla 21).
 */

import { normalizaVideo } from './training-plan.ts';
import { normalizaCargas, type Carga } from './rm.ts';
import { sumaDias, diaSemanaDe, esFecha } from './asistencia.ts';

export const TIPOS_SESION = ['fuerza', 'carrera', 'agilidad', 'circuito', 'movilidad', 'descanso', 'otro'] as const;
export type TipoSesion = (typeof TIPOS_SESION)[number];

export const ETIQUETA_TIPO: Record<TipoSesion, string> = {
  fuerza: 'Fuerza',
  carrera: 'Carrera',
  agilidad: 'Agilidad',
  circuito: 'Circuito',
  movilidad: 'Movilidad',
  descanso: 'Descanso',
  otro: 'Otro',
};

export const esTipoSesion = (v: unknown): v is TipoSesion =>
  typeof v === 'string' && (TIPOS_SESION as readonly string[]).includes(v);

export const MAX_TITULO = 120;
export const MAX_DESCRIPCION = 4000;
export const MAX_COMENTARIO = 500;
export const MAX_NOTA_SEMANA = 300;
/** Cuántos días hacia atrás puede el alumno apuntar una sesión olvidada. */
export const DIAS_PARA_APUNTAR = 60;

/** Para quién es una sesión: un grupo entero o un alumno. */
export type Destino = { tipo: 'grupo'; id: string } | { tipo: 'alumno'; id: string };

export const esDestino = (v: unknown): v is Destino =>
  !!v && typeof v === 'object'
  && ((v as Destino).tipo === 'grupo' || (v as Destino).tipo === 'alumno')
  && typeof (v as Destino).id === 'string' && (v as Destino).id.length > 0;

export type ContenidoSesion = {
  kind: TipoSesion;
  title: string;
  description: string | null;
  durationMin: number | null;
  distanceKm: number | null;
  video: string | null;
  /** Las cargas en % del 1RM (regla 89). Vacío si la sesión no las lleva. */
  cargas: Carga[];
};

export type Sesion = ContenidoSesion & {
  id: string;
  fecha: string;
  /** De qué grupo es (`null` si es individual). */
  classId: string | null;
  /** De qué alumno es (`null` si es de grupo). */
  userId: string | null;
  position: number;
};

export type Plantilla = ContenidoSesion & { id: string };

export type EstadoApunte = 'hecha' | 'no_hecha';

export type Apunte = {
  sessionId: string;
  userId: string;
  status: EstadoApunte;
  rpe: number | null;
  comment: string | null;
  durationMin: number | null;
  distanceKm: number | null;
  coachReply: string | null;
};

type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };

const vacio = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** Minutos enteros de 1 a 600. Vacío es `null`, nunca 0 (regla 16). */
export function leeMinutos(v: unknown): Resultado<number | null> {
  if (vacio(v)) return { ok: true, valor: null };
  const n = Number(String(v).trim().replace(',', '.'));
  if (!Number.isInteger(n) || n < 1 || n > 600) return { ok: false, error: 'La duración va en minutos, de 1 a 600.' };
  return { ok: true, valor: n };
}

/** Kilómetros con coma o punto, mayores que 0. Vacío es `null`. */
export function leeKilometros(v: unknown): Resultado<number | null> {
  if (vacio(v)) return { ok: true, valor: null };
  const n = Number(String(v).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n >= 1000) return { ok: false, error: 'La distancia va en kilómetros (por ejemplo, 8 o 2,5).' };
  return { ok: true, valor: Math.round(n * 100) / 100 };
}

/**
 * Lo que escribe el preparador → una sesión que se puede guardar. Se usa igual
 * para la sesión y para la plantilla, y también en el servidor: una Server
 * Action es un endpoint público (regla 1).
 */
export function normalizaContenido(raw: Record<string, unknown> | null | undefined): Resultado<ContenidoSesion> {
  const r = raw ?? {};
  if (!esTipoSesion(r.kind)) return { ok: false, error: 'Elige el tipo de sesión.' };
  const title = typeof r.title === 'string' ? r.title.trim() : '';
  if (!title) return { ok: false, error: 'Ponle un título a la sesión.' };
  if (title.length > MAX_TITULO) return { ok: false, error: `El título no puede pasar de ${MAX_TITULO} caracteres.` };
  const descripcion = typeof r.description === 'string' ? r.description.replace(/\r\n/g, '\n').trim() : '';
  if (descripcion.length > MAX_DESCRIPCION) return { ok: false, error: `La descripción no puede pasar de ${MAX_DESCRIPCION} caracteres.` };
  const min = leeMinutos(r.durationMin);
  if (!min.ok) return min;
  const km = leeKilometros(r.distanceKm);
  if (!km.ok) return km;
  let video: string | null = null;
  if (!vacio(r.video)) {
    video = normalizaVideo(r.video);
    if (!video) return { ok: false, error: 'El enlace del vídeo tiene que empezar por https://' };
  }
  const cargas = normalizaCargas(r.cargas);
  if (!cargas.ok) return cargas;
  return {
    ok: true,
    valor: { kind: r.kind, title, description: descripcion || null, durationMin: min.valor, distanceKm: km.valor, video, cargas: cargas.valor },
  };
}

/** Lo que apunta el alumno. Si no la hizo, solo cuenta el motivo. */
export function normalizaApunte(raw: Record<string, unknown> | null | undefined): Resultado<Omit<Apunte, 'sessionId' | 'userId' | 'coachReply'>> {
  const r = raw ?? {};
  if (r.status !== 'hecha' && r.status !== 'no_hecha') return { ok: false, error: 'Di si la has hecho o no.' };
  const texto = typeof r.comment === 'string' ? r.comment.trim().slice(0, MAX_COMENTARIO) : '';
  if (r.status === 'no_hecha') {
    return { ok: true, valor: { status: 'no_hecha', rpe: null, comment: texto || null, durationMin: null, distanceKm: null } };
  }
  const n = Number(r.rpe);
  const rpe = !vacio(r.rpe) && Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
  const min = leeMinutos(r.durationMin);
  if (!min.ok) return min;
  const km = leeKilometros(r.distanceKm);
  if (!km.ok) return km;
  return { ok: true, valor: { status: 'hecha', rpe, comment: texto || null, durationMin: min.valor, distanceKm: km.valor } };
}

/**
 * El estado de una sesión para un alumno: lo que apuntó, o —si no apuntó
 * nada— `pendiente` si la fecha ya llegó y `planificada` si aún no.
 */
export function estadoSesion(fecha: string, apunte: Pick<Apunte, 'status'> | null | undefined, hoy: string): EstadoApunte | 'pendiente' | 'planificada' {
  if (apunte) return apunte.status;
  return fecha <= hoy ? 'pendiente' : 'planificada';
}

/** ¿Puede el alumno apuntar esa sesión? Ni en el futuro ni más atrás de `DIAS_PARA_APUNTAR`. */
export function sePuedeApuntar(fecha: string, hoy: string): boolean {
  return esFecha(fecha) && fecha <= hoy && fecha >= sumaDias(hoy, -(DIAS_PARA_APUNTAR - 1));
}

// ── El calendario ──────────────────────────────────────────────────────────

/** El lunes de la semana de una fecha. */
export const lunesDe = (fecha: string) => sumaDias(fecha, -(diaSemanaDe(fecha) - 1));

/** Los siete días de una semana, de lunes a domingo. */
export const diasDeSemana = (lunes: string) => Array.from({ length: 7 }, (_, i) => sumaDias(lunes, i));

/** `YYYY-MM` de una fecha. */
export const mesDe = (fecha: string) => fecha.slice(0, 7);

/** Suma meses a un `YYYY-MM`. */
export function sumaMeses(mes: string, n: number): string {
  const [y, m] = mes.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Los lunes de las semanas que tocan un mes, para pintarlo en rejilla. */
export function semanasDelMes(mes: string): string[] {
  const primero = `${mes}-01`;
  const ultimo = sumaDias(`${sumaMeses(mes, 1)}-01`, -1);
  const out: string[] = [];
  for (let l = lunesDe(primero); l <= ultimo; l = sumaDias(l, 7)) out.push(l);
  return out;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/** «noviembre 2026». */
export function etiquetaMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} ${y}`;
}

/** «lun 3 nov». */
export function etiquetaDia(fecha: string): string {
  const [, m, d] = fecha.split('-').map(Number);
  return `${DIAS_CORTOS[diaSemanaDe(fecha) - 1]} ${d} ${MESES_CORTOS[m - 1]}`;
}

/** «3–9 nov» o «27 oct – 2 nov». */
export function etiquetaSemana(lunes: string): string {
  const fin = sumaDias(lunes, 6);
  const [, m1, d1] = lunes.split('-').map(Number);
  const [, m2, d2] = fin.split('-').map(Number);
  return m1 === m2 ? `${d1}–${d2} ${MESES_CORTOS[m2 - 1]}` : `${d1} ${MESES_CORTOS[m1 - 1]} – ${d2} ${MESES_CORTOS[m2 - 1]}`;
}

/** «45′», «1 h 20′». */
export function formateaMinutos(min: number | null | undefined): string | null {
  if (min === null || min === undefined || !Number.isFinite(min) || min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h${m ? ` ${m}′` : ''}` : `${m}′`;
}

/** «8 km», «2,5 km». */
export function formateaKm(km: number | null | undefined): string | null {
  if (km === null || km === undefined || !Number.isFinite(km) || km <= 0) return null;
  return `${km.toLocaleString('es-ES', { maximumFractionDigits: 2 })} km`;
}

/** Ordena como se pintan: por fecha y, dentro del día, por posición. */
export function ordenaSesiones<T extends Pick<Sesion, 'fecha' | 'position' | 'title'>>(sesiones: T[]): T[] {
  return [...sesiones].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.position - b.position || a.title.localeCompare(b.title));
}

/** Las sesiones de cada día. */
export function porDia<T extends Pick<Sesion, 'fecha' | 'position' | 'title'>>(sesiones: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const s of ordenaSesiones(sesiones)) {
    const lista = m.get(s.fecha) ?? [];
    lista.push(s);
    m.set(s.fecha, lista);
  }
  return m;
}

export type ResumenSemana = {
  /** Sesiones de entrenamiento (los descansos no cuentan). */
  sesiones: number;
  minutos: number;
  kilometros: number;
  /** Apuntadas como hechas, de las que ya tocaban. */
  hechas: number;
  /** Las que ya tocaban, por persona: en un grupo, sesiones vencidas × alumnos. */
  posibles: number;
  /** Esfuerzo medio de lo que se ha apuntado con esfuerzo; `null` sin datos (regla 8). */
  rpeMedio: number | null;
};

/**
 * El resumen de una semana: lo planificado y lo cumplido. Con `alumnos` es la
 * vista de un grupo (cada sesión vencida cuenta una vez por alumno); sin él, la
 * de una persona.
 */
export function resumenSemana(params: {
  sesiones: Pick<Sesion, 'id' | 'fecha' | 'kind' | 'durationMin' | 'distanceKm'>[];
  apuntes: Pick<Apunte, 'sessionId' | 'userId' | 'status' | 'rpe'>[];
  hoy: string;
  alumnos?: string[];
}): ResumenSemana {
  const entreno = params.sesiones.filter((s) => s.kind !== 'descanso');
  const vencidas = new Set(entreno.filter((s) => s.fecha <= params.hoy).map((s) => s.id));
  const quienes = params.alumnos ? new Set(params.alumnos) : null;
  const validos = params.apuntes.filter((a) => vencidas.has(a.sessionId) && (!quienes || quienes.has(a.userId)));
  const hechos = validos.filter((a) => a.status === 'hecha');
  const conRpe = hechos.filter((a) => a.rpe !== null);
  return {
    sesiones: entreno.length,
    minutos: entreno.reduce((t, s) => t + (s.durationMin ?? 0), 0),
    kilometros: Math.round(entreno.reduce((t, s) => t + (s.distanceKm ?? 0), 0) * 100) / 100,
    hechas: hechos.length,
    posibles: vencidas.size * (quienes ? quienes.size : 1),
    rpeMedio: conRpe.length ? Math.round((conRpe.reduce((t, a) => t + (a.rpe ?? 0), 0) / conRpe.length) * 10) / 10 : null,
  };
}

/**
 * Copia las sesiones de una semana a otra: la misma sesión, el mismo día de la
 * semana. Devuelve lo que hay que crear; no toca las de la semana de destino.
 */
export function copiaSemana<T extends ContenidoSesion & Pick<Sesion, 'fecha' | 'position'>>(
  sesiones: T[], desdeLunes: string, aLunes: string,
): (ContenidoSesion & { fecha: string; position: number })[] {
  const fin = sumaDias(desdeLunes, 6);
  const salto = Math.round((Date.UTC(...ymd(aLunes)) - Date.UTC(...ymd(desdeLunes))) / 86_400_000);
  return ordenaSesiones(sesiones.filter((s) => s.fecha >= desdeLunes && s.fecha <= fin).map((s) => ({ ...s, title: s.title })))
    .map((s) => ({
      kind: s.kind, title: s.title, description: s.description, durationMin: s.durationMin,
      distanceKm: s.distanceKm, video: s.video, cargas: s.cargas ?? [], fecha: sumaDias(s.fecha, salto), position: s.position,
    }));
}

function ymd(fecha: string): [number, number, number] {
  const [y, m, d] = fecha.split('-').map(Number);
  return [y, m - 1, d];
}

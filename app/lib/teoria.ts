/**
 * LA PROGRAMACIÓN DE TEORÍA (regla 131), desde el Calendario.
 *
 * Cada clase de un grupo de teoría (la que el horario del grupo pone en un día)
 * sale en el calendario sin rellenar. La responsable apunta quién va (UN profesor) y
 * qué tema(s) da, con antelación o después, y lo puede cambiar. De ahí salen
 * los temas dados de cada grupo y las horas reales de cada profesor.
 *
 * No hay fila guardada = clase sin asignar. Módulo PURO (regla 21).
 */


export type GrupoTeoria = {
  id: string;
  nombre: string;
  weekdays: number[];
  inicio: string | null;
  fin: string | null;
};

/** Lo guardado de una clase: quién la da, qué temas y una nota. */
export type AsignacionTeoria = {
  classId: string;
  fecha: string;
  profesorId: string | null;
  temas: number[];
  nota: string | null;
};

export const MAX_TEMAS_CLASE = 8;
export const MAX_NOTA_TEORIA = 200;
export const MAX_TEMA = 200;

/** Números de tema válidos, sin repetir y en orden. Lo que no es un número entero 1..MAX_TEMA se descarta. */
export function normalizaTemas(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const set = new Set<number>();
  for (const x of v) {
    const n = typeof x === 'number' ? x : typeof x === 'string' && /^\d{1,3}$/.test(x.trim()) ? Number(x) : NaN;
    if (Number.isInteger(n) && n >= 1 && n <= MAX_TEMA) set.add(n);
  }
  return [...set].sort((a, b) => a - b).slice(0, MAX_TEMAS_CLASE);
}

/** La nota, sin NUL ni espacios de más; vacía es `null`. */
export function normalizaNotaTeoria(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\0/g, '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, MAX_NOTA_TEORIA) : null;
}

/** «8» · «8 y 9» · «1, 2 y 3». */
export function textoTemas(temas: number[]): string {
  if (!temas.length) return '';
  if (temas.length === 1) return String(temas[0]);
  return `${temas.slice(0, -1).join(', ')} y ${temas[temas.length - 1]}`;
}

/** Un tema dado (o programado) a un grupo. */
export type TemaDado = { classId: string; tema: number; fecha: string; profesorId: string | null };

/** Las asignaciones guardadas → un renglón por grupo y tema, quedándose con la última vez. */
export function temasDeAsignaciones(asignaciones: AsignacionTeoria[]): TemaDado[] {
  const ultimo = new Map<string, TemaDado>();
  for (const a of [...asignaciones].sort((x, y) => x.fecha.localeCompare(y.fecha))) {
    for (const t of a.temas) ultimo.set(`${a.classId}|${t}`, { classId: a.classId, tema: t, fecha: a.fecha, profesorId: a.profesorId });
  }
  return [...ultimo.values()];
}

/**
 * El avance de un grupo: temas ya dados (fecha pasada o de hoy), programados
 * (futura) y pendientes (del temario, ni una cosa ni la otra).
 */
export function avanceDeGrupo(dados: TemaDado[], classId: string, temario: number[], hoy: string) {
  const propios = dados.filter((d) => d.classId === classId);
  const dado = propios.filter((d) => d.fecha <= hoy).sort((a, b) => a.tema - b.tema);
  const programado = propios.filter((d) => d.fecha > hoy).sort((a, b) => a.tema - b.tema);
  const hechos = new Set(propios.map((d) => d.tema));
  return { dado, programado, pendientes: temario.filter((t) => !hechos.has(t)) };
}

/** Lo que se teclea en «Temas»: «8», «8, 9», «1-3 y 5». Rangos incluidos; lo que no es número se ignora. */
export function leeTemas(texto: string): number[] {
  const out: number[] = [];
  for (const parte of texto.split(/[,;\s]+|\by\b/i)) {
    const r = /^(\d{1,3})\s*[-–]\s*(\d{1,3})$/.exec(parte);
    if (r) {
      const [a, b] = [Number(r[1]), Number(r[2])];
      for (let n = Math.min(a, b); n <= Math.max(a, b) && out.length < 50; n++) out.push(n);
    } else if (/^\d{1,3}$/.test(parte)) out.push(Number(parte));
  }
  return normalizaTemas(out);
}

/** Una clase dada (o programada) por un profesor, de teoría o de física. */
export type ClaseDeProfesor = { profesorId: string; classId: string; fecha: string; tipo: 'teoria' | 'fisica' };

export type DiasDeProfesor = { teoria: number; fisica: number; teoriaProgramada: number; fisicaProgramada: number };

/**
 * LAS CLASES QUE HA DADO CADA PROFESOR. A los profesores se les paga un importe
 * por cada clase de teoría y otro por cada clase de física, y cada clase suma
 * 1: dos clases de teoría el mismo día (mañana y tarde) son 2. En teoría, una
 * clase es un grupo en una fecha; en física, cada sesión. Lo mismo repetido
 * (misma `classId` y fecha) cuenta una vez. Hasta hoy (incluido) es
 * «dada»; lo posterior, programada.
 */
export function diasDados(clases: ClaseDeProfesor[], hoy: string): Map<string, DiasDeProfesor> {
  const vistos = new Set<string>();
  const out = new Map<string, DiasDeProfesor>();
  for (const c of clases) {
    const k = `${c.profesorId}|${c.tipo}|${c.classId}|${c.fecha}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const d = out.get(c.profesorId) ?? { teoria: 0, fisica: 0, teoriaProgramada: 0, fisicaProgramada: 0 };
    const futuro = c.fecha > hoy;
    if (c.tipo === 'teoria') d[futuro ? 'teoriaProgramada' : 'teoria'] += 1;
    else d[futuro ? 'fisicaProgramada' : 'fisica'] += 1;
    out.set(c.profesorId, d);
  }
  return out;
}

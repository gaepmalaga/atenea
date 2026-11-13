/**
 * LOS EXÁMENES EN CLASE: guardar, aplicar a un turno y llevar la nota (regla 118).
 *
 * POR QUÉ EXISTE
 * La academia pone un examen en papel a un turno (martes y jueves por la
 * mañana) y quiere un registro por alumno: qué exámenes presenciales ha hecho,
 * qué nota sacó y cómo evoluciona. El profesor NO va a teclear las hojas de 40
 * alumnos en clase: las respuestas las mete cada alumno, en el momento o al
 * llegar a casa, y el servidor las corrige. El profesor, si quiere, solo pone
 * encima la nota oficial del papel.
 *
 * Esas respuestas son DECLARADAS por el alumno, no recogidas por la academia:
 * sirven para que él se corrija y para medir cómo salió cada pregunta, no como
 * nota oficial. Por eso `teacher_score` manda sobre `score`.
 *
 * MÓDULO PURO (regla 21): sin base de datos ni reloj. La nota sale de
 * `scoreExam`, la misma función que el simulacro online (regla 22).
 */

import { CNP_SCORING, scoreExam, type ExamScore } from './scoring';

/** Las preguntas del banco tienen tres opciones: A, B y C. */
export const OPCIONES_CLASE = CNP_SCORING.options;
export const LETRAS_CLASE = ['A', 'B', 'C'] as const;
/** Blanco, como en `question_attempts.selected_index` (regla 24). */
export const BLANCO = -1;

/**
 * La copia de una pregunta que se guarda con el examen.
 *
 * Es una COPIA y no un id: si luego se edita o se descarta la pregunta del
 * banco, el examen que se repartió en papel sigue siendo el mismo y se corrige
 * contra lo que se imprimió.
 */
export type PreguntaGuardada = {
  /** La pregunta del banco de la que salió; sirve para no repetirla y para medirla. */
  id: string | null;
  q: string;
  o: string[];
  /** Índice de la correcta. */
  c: number;
  /** Título del tema. */
  t: string;
  e: string | null;
  r: string | null;
  /** 1 fácil · 2 media · 3 alta. */
  d: number;
};

/** Lo que cuenta de un examen guardado para repartirlo. */
export type FiltrosExamen = {
  temas: number[];
  dificultad: 'easy' | 'medium' | 'hard';
  evitarRepetidas: boolean;
};

export const FILTROS_POR_DEFECTO: FiltrosExamen = { temas: [], dificultad: 'medium', evitarRepetidas: true };

// ---------------------------------------------------------------------------
// Las respuestas que escribe el alumno
// ---------------------------------------------------------------------------

/**
 * Una respuesta que llega de fuera: 0, 1 o 2; cualquier otra cosa es blanco.
 * Mismo criterio que `normalizeSelectedIndex` (regla 24): lo que no es una
 * opción no es un fallo.
 */
export function normalizaRespuesta(v: unknown): number {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) < OPCIONES_CLASE ? (v as number) : BLANCO;
}

/** Exactamente `total` respuestas: si faltan, en blanco; si sobran, se cortan. */
export function normalizaRespuestas(raw: unknown, total: number): number[] {
  const lista = Array.isArray(raw) ? raw : [];
  return Array.from({ length: total }, (_, i) => normalizaRespuesta(lista[i]));
}

/**
 * «abcb-ac…» → [0, 1, 2, 1, -1, 0, 2…].
 *
 * Es la manera rápida de meter una hoja: se escribe de seguido lo que se
 * marcó, con `-` (o `.` o `x`) para lo que se dejó en blanco. Se ignoran
 * espacios, comas y saltos de línea, para poder pegar «a b c» o una columna.
 * Si no salen EXACTAMENTE `total` respuestas no se adivina nada: se dice
 * cuántas faltan o sobran, porque un desfase de una pregunta descuadra todas
 * las demás.
 */
export function parseaRespuestas(texto: string, total: number): { ok: true; respuestas: number[] } | { ok: false; error: string } {
  const limpio = String(texto ?? '').toLowerCase().replace(/[\s,;|]/g, '');
  const respuestas: number[] = [];
  for (const c of limpio) {
    if (c === 'a') respuestas.push(0);
    else if (c === 'b') respuestas.push(1);
    else if (c === 'c') respuestas.push(2);
    else if (c === '-' || c === '.' || c === 'x') respuestas.push(BLANCO);
    else return { ok: false, error: `«${c}» no es una respuesta: usa A, B, C, o «-» para dejarla en blanco.` };
  }
  if (respuestas.length !== total) {
    const dif = respuestas.length - total;
    return {
      ok: false,
      error: dif < 0
        ? `Has escrito ${respuestas.length} de ${total}: te faltan ${-dif}.`
        : `Has escrito ${respuestas.length} y el examen tiene ${total}: te sobran ${dif}.`,
    };
  }
  return { ok: true, respuestas };
}

/** [0, 1, -1] → «ab-»: lo contrario, para enseñar lo que se lleva marcado. */
export function respuestasEnTexto(respuestas: readonly number[]): string {
  return respuestas.map((r) => (r === BLANCO ? '-' : (LETRAS_CLASE[r] ?? '-').toLowerCase())).join('');
}

// ---------------------------------------------------------------------------
// Corregir
// ---------------------------------------------------------------------------

export type Correccion = ExamScore & {
  /** Por pregunta: acertada, fallada o en blanco. */
  flags: ('ok' | 'mal' | 'blanco')[];
};

/**
 * La nota de la convocatoria (`scoreExam`) sobre las preguntas GUARDADAS. El
 * número de preguntas es el del examen, no el de las respuestas que lleguen.
 */
export function corrigeClase(preguntas: readonly PreguntaGuardada[], respuestas: readonly number[]): Correccion {
  const marcadas = normalizaRespuestas(respuestas, preguntas.length);
  const letra = (i: number) => String.fromCharCode(97 + i);
  const s = scoreExam(
    preguntas.map((q, i) => ({ userAnswer: marcadas[i] === BLANCO ? null : letra(marcadas[i]), correctOptionId: letra(q.c) })),
  );
  return { ...s, flags: preguntas.map((q, i) => (marcadas[i] === BLANCO ? 'blanco' : marcadas[i] === q.c ? 'ok' : 'mal')) };
}

/** La nota que vale: la del profesor, que viene del papel, y si no, la calculada. */
export function notaVigente(r: { teacher_score?: number | null; score?: number | null }): number | null {
  if (typeof r.teacher_score === 'number') return r.teacher_score;
  return typeof r.score === 'number' ? r.score : null;
}

/**
 * Lo que `numeric` de Postgres devuelve como texto («6.50»), a número. Vacío o
 * ilegible es `null`, no 0 (regla 16): «sin nota» y «un cero» se llaman a
 * personas distintas.
 */
export function aNota(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** La nota que escribe el profesor: de 0 a 10, con coma o punto, o vacío. */
export function leeNotaProfesor(v: unknown): { ok: true; nota: number | null } | { ok: false; error: string } {
  if (v === null || v === undefined || String(v).trim() === '') return { ok: true, nota: null };
  const n = Number(String(v).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 10) return { ok: false, error: 'La nota va de 0 a 10.' };
  return { ok: true, nota: Math.round(n * 100) / 100 };
}

// ---------------------------------------------------------------------------
// Estados y participantes
// ---------------------------------------------------------------------------

export type EstadoEntrega = 'proximo' | 'pendiente' | 'entregado' | 'ausente' | 'cerrado';

/**
 * Dónde está un alumno respecto a un examen, SOLO con fechas `AAAA-MM-DD` en
 * la hora de la academia (regla 82):
 *   · `proximo`    el examen es otro día: todavía no hay nada que meter;
 *   · `pendiente`  toca meter las respuestas;
 *   · `entregado`  ya las metió;
 *   · `ausente`    el profesor marcó que no se presentó;
 *   · `cerrado`    pasó el plazo y no las metió.
 */
export function estadoEntrega(p: { satOn: string; closesOn: string | null; hoy: string; absent: boolean; entregado: boolean }): EstadoEntrega {
  if (p.absent) return 'ausente';
  if (p.entregado) return 'entregado';
  if (p.hoy < p.satOn) return 'proximo';
  if (p.closesOn && p.hoy > p.closesOn) return 'cerrado';
  return 'pendiente';
}

/** ¿Es de esta aplicación? Sin grupos, toda la academia. */
export function esParticipante(classIds: readonly string[], susGrupos: readonly string[]): boolean {
  return classIds.length === 0 || classIds.some((id) => susGrupos.includes(id));
}

// ---------------------------------------------------------------------------
// Estadísticas
// ---------------------------------------------------------------------------

/** Por debajo de esto, una media de turno señala a alguien. */
export const MIN_PARA_MEDIA = 3;

const redondea = (n: number) => Math.round(n * 100) / 100;

/** La media de las notas, o `null` si no hay (regla 8). Con menos de `MIN_PARA_MEDIA` no se enseña la del turno. */
export function mediaNotas(notas: readonly number[], minimo = 1): number | null {
  return notas.length >= minimo && notas.length > 0 ? redondea(notas.reduce((a, b) => a + b, 0) / notas.length) : null;
}

export type FilaPregunta = {
  /** Número de la pregunta en el examen, desde 1. */
  n: number;
  tema: string;
  enunciado: string;
  contestadas: number;
  aciertos: number;
  blancos: number;
  /** De las que contestaron, qué parte falló (0-1). `null` si nadie contestó. */
  tasaFallo: number | null;
  /** Cuántos marcaron cada opción: A, B, C. */
  porOpcion: number[];
  correcta: number;
};

/**
 * Cómo ha salido cada pregunta entre quienes entregaron. Es la parte valiosa
 * de que las respuestas las meta cada alumno: se ve qué preguntas fallan casi
 * todos (para repasarlas en clase) y qué opción mala es la que más engaña.
 */
export function estadisticasPorPregunta(preguntas: readonly PreguntaGuardada[], entregas: readonly (readonly number[])[]): FilaPregunta[] {
  return preguntas.map((q, i) => {
    const porOpcion = Array.from({ length: OPCIONES_CLASE }, () => 0);
    let aciertos = 0, blancos = 0;
    for (const e of entregas) {
      const r = normalizaRespuesta(e[i]);
      if (r === BLANCO) blancos++;
      else { porOpcion[r]++; if (r === q.c) aciertos++; }
    }
    const contestadas = entregas.length - blancos;
    return {
      n: i + 1, tema: q.t, enunciado: q.q, contestadas, aciertos, blancos,
      tasaFallo: contestadas > 0 ? redondea((contestadas - aciertos) / contestadas) : null,
      porOpcion, correcta: q.c,
    };
  });
}

/** Cuántas notas hay en cada tramo: 0-2, 2-4, 4-6, 6-8, 8-10. Para ver cómo ha ido el turno de un vistazo. */
export function distribucionNotas(notas: readonly number[]): number[] {
  const cubos = [0, 0, 0, 0, 0];
  for (const n of notas) cubos[Math.min(4, Math.max(0, Math.floor(n / 2)))]++;
  return cubos;
}

/**
 * Últimas tres notas contra las tres anteriores, de más vieja a más nueva.
 * Con menos de cuatro no se dice nada (regla 8): no es una tendencia.
 */
export function tendenciaDeNotas(cronologicas: readonly number[]): 'sube' | 'baja' | 'estable' | null {
  if (cronologicas.length < 4) return null;
  const ultimas = cronologicas.slice(-3);
  const previas = cronologicas.slice(-6, -3);
  const d = (mediaNotas(ultimas) ?? 0) - (mediaNotas(previas) ?? 0);
  return d >= 0.5 ? 'sube' : d <= -0.5 ? 'baja' : 'estable';
}

// ---------------------------------------------------------------------------
// Poner un examen a un turno: el nombre se pone solo y no se repite sin avisar
// ---------------------------------------------------------------------------

export const MAX_ETIQUETA = 80;
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;

/** «2026-11-13» → «13 nov». Lo que no es una fecha se devuelve tal cual, no «NaN». */
export function fechaCortaEs(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const mes = MESES_CORTOS[Number(m[2]) - 1];
  return mes ? `${Number(m[3])} ${mes}` : iso;
}

/**
 * El nombre de un examen puesto a un turno cuando nadie le ha puesto uno:
 * «Promo 44 · Alpha, Kappa · 13 nov». El grupo ya dice a quién se pone, así
 * que pedir un nombre aparte era escribir lo mismo dos veces.
 */
export function nombreDeAplicacion(grupos: readonly string[], fecha: string): string {
  const g = grupos.map((x) => x.trim()).filter(Boolean);
  const quien = g.length === 0 ? 'Toda la academia' : g.length <= 3 ? g.join(', ') : `${g.length} grupos`;
  const cuando = fechaCortaEs(fecha);
  const sufijo = ` · ${cuando}`;
  return `${quien.slice(0, Math.max(1, MAX_ETIQUETA - sufijo.length))}${sufijo}`;
}

export type AplicacionPuesta = { id: string; fecha: string; classIds: readonly string[]; etiqueta: string };

/**
 * De los exámenes ya puestos, los que coinciden en algún grupo con el que se
 * quiere poner ahora. «Ningún grupo» es TODA la academia, así que coincide con
 * cualquiera: poner dos veces el mismo examen a la vez a todos y a un grupo
 * duplica a esos alumnos igual que repetir el grupo.
 */
export function aplicacionesQueSeSolapan(existentes: readonly AplicacionPuesta[], nuevos: readonly string[]): AplicacionPuesta[] {
  return existentes.filter((e) => e.classIds.length === 0 || nuevos.length === 0 || e.classIds.some((c) => nuevos.includes(c)));
}

// ---------------------------------------------------------------------------
// Las notas oficiales pegadas desde un Excel o el chat
// ---------------------------------------------------------------------------

export type AlumnoParaNotas = { id: string; nombre: string };
export type NotaPegada = { alumnoId: string; nombre: string; nota: number | null; ausente: boolean; linea: string };
export type ResultadoPegado = {
  reconocidas: NotaPegada[];
  /** El nombre encaja con más de un alumno: no se adivina cuál. */
  ambiguas: { linea: string; candidatos: string[] }[];
  /** Ningún alumno encaja; si uno se parece, se sugiere. */
  sinCoincidencia: { linea: string; sugerencia: string | null }[];
  invalidas: { linea: string; motivo: string }[];
  /** Alumnos que salen en más de una línea: vale la última. */
  repetidas: string[];
};

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const palabrasDe = (s: string): string[] => sinAcentos(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
const FRASE_AUSENTE = /^(no\s*vino|no\s*se\s*present[oó]|ausente|aus|nv|np|n\.?\s?p\.?|falt[oó])$/i;
const FRASE_AUSENTE_AL_FINAL = /^(.*\S)\s+(no\s+vino|no\s+se\s+present[oó]|ausente)\s*$/i;

/** Parte «nombre» y «valor» de una línea: por tabulador, «;» o «|» si los hay, y si no, por la última palabra. */
function partirLinea(linea: string): { nombre: string; valor: string } {
  // Solo se quitan espacios: un tabulador o un «;» al final son una celda vacía, y la última palabra del nombre no es la nota.
  const base = linea.replace(/^ +/, '').replace(/ +$/, '');
  if (/[;|\t]$/.test(base)) return { nombre: base.replace(/[;|\t]+$/, '').trim(), valor: '' };
  const corte = Math.max(base.lastIndexOf(';'), base.lastIndexOf('\t'), base.lastIndexOf('|'));
  if (corte >= 0) return { nombre: base.slice(0, corte), valor: base.slice(corte + 1).trim() };
  const frase = FRASE_AUSENTE_AL_FINAL.exec(base);
  if (frase) return { nombre: frase[1], valor: frase[2] };
  const m = /^(.*\S)\s+(\S+)$/.exec(base);
  return m ? { nombre: m[1], valor: m[2] } : { nombre: base, valor: '' };
}

/**
 * Lee unas notas pegadas, una línea por alumno («Álvarez Gil;7,5», «Beltrán 5»,
 * «Domínguez;no vino»), y las casa con los alumnos del examen. Casar es que
 * TODAS las palabras del nombre escrito estén en el nombre del alumno, sin
 * mirar acentos, mayúsculas ni el orden: «Álvarez Gil» y «gil alvarez» son la
 * misma persona.
 *
 * Nunca adivina: si dos alumnos encajan, o ninguno, la línea no se guarda y
 * se dice cuál es. Una nota fuera de 0-10 tampoco (regla 27: lo que se pega
 * se valida igual que lo que se escribe a mano).
 */
export function leeNotasPegadas(texto: string, alumnos: readonly AlumnoParaNotas[]): ResultadoPegado {
  const res: ResultadoPegado = { reconocidas: [], ambiguas: [], sinCoincidencia: [], invalidas: [], repetidas: [] };
  const palabrasAlumno = alumnos.map((a) => ({ a, set: new Set(palabrasDe(a.nombre)) }));
  const porAlumno = new Map<string, NotaPegada>();

  for (const cruda of String(texto ?? '').split(/\r?\n/)) {
    const linea = cruda.trim();
    if (!linea) continue;
    const { nombre, valor } = partirLinea(cruda);
    const w = palabrasDe(nombre);
    if (w.length === 0) { res.invalidas.push({ linea, motivo: 'Falta el nombre del alumno.' }); continue; }

    // Sin nota no hay nada que guardar: se salta sin quejarse.
    if (valor === '' || /^[-–—]+$/.test(valor)) continue;
    let nota: number | null = null;
    let ausente = false;
    if (FRASE_AUSENTE.test(valor)) ausente = true;
    else {
      const n = leeNotaProfesor(valor);
      if (!n.ok || n.nota === null) { res.invalidas.push({ linea, motivo: `«${valor}» no es una nota de 0 a 10.` }); continue; }
      nota = n.nota;
    }

    const candidatos = palabrasAlumno.filter(({ set }) => w.every((p) => set.has(p)));
    if (candidatos.length === 1) {
      const { a } = candidatos[0];
      if (porAlumno.has(a.id)) res.repetidas.push(a.nombre);
      porAlumno.set(a.id, { alumnoId: a.id, nombre: a.nombre, nota, ausente, linea });
    } else if (candidatos.length > 1) {
      res.ambiguas.push({ linea, candidatos: candidatos.map(({ a }) => a.nombre) });
    } else {
      // El que más palabras comparte, si es uno solo y comparte alguna.
      const puntos = palabrasAlumno.map(({ a, set }) => ({ a, n: w.filter((p) => set.has(p)).length }));
      const mejor = Math.max(0, ...puntos.map((p) => p.n));
      const mejores = mejor > 0 ? puntos.filter((p) => p.n === mejor) : [];
      res.sinCoincidencia.push({ linea, sugerencia: mejores.length === 1 ? mejores[0].a.nombre : null });
    }
  }
  res.reconocidas = [...porAlumno.values()];
  return res;
}

// ---------------------------------------------------------------------------
// El resumen de un examen puesto: de un vistazo
// ---------------------------------------------------------------------------

export type FilaParaResumen = { nombre: string; estado: EstadoEntrega; nota: number | null; notaProfesor: number | null };

export type ResumenDeNotas = {
  /** Con nota vigente (la oficial si la hay, y si no, la calculada). Los que no vinieron no cuentan. */
  conNota: number;
  maxima: { nombre: string; nota: number } | null;
  minima: { nombre: string; nota: number } | null;
  aprobados: number;
  /** Por debajo del mínimo, de la peor nota a la mejor: a quién hay que mirar. */
  suspensos: { nombre: string; nota: number }[];
};

/**
 * Quién ha sacado qué, de un vistazo. La nota que vale es la vigente
 * (`notaVigente`: la del papel manda sobre la calculada). Sin ninguna nota todo
 * queda en `null` o vacío, no en un 0 (regla 16). Quien no vino no tiene nota y
 * no cuenta ni como suspenso: no se presentó, que es otra cosa.
 */
export function resumenDeNotas(filas: readonly FilaParaResumen[], minimo: number): ResumenDeNotas {
  const con = filas
    .filter((f) => f.estado !== 'ausente')
    .map((f) => ({ nombre: f.nombre, nota: notaVigente({ teacher_score: f.notaProfesor, score: f.nota }) }))
    .filter((f): f is { nombre: string; nota: number } => f.nota !== null);
  if (con.length === 0) return { conNota: 0, maxima: null, minima: null, aprobados: 0, suspensos: [] };

  const porNota = con.slice().sort((a, b) => a.nota - b.nota || a.nombre.localeCompare(b.nombre, 'es'));
  return {
    conNota: con.length,
    maxima: porNota[porNota.length - 1],
    minima: porNota[0],
    aprobados: con.filter((f) => f.nota >= minimo).length,
    suspensos: porNota.filter((f) => f.nota < minimo),
  };
}

/** Cuánto ha subido (+) o bajado (−) la media respecto a la anterior; `null` si falta una de las dos. */
export function variacionDeMedia(actual: number | null, anterior: number | null): number | null {
  if (actual === null || anterior === null) return null;
  return redondea(actual - anterior);
}

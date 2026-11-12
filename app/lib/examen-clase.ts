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

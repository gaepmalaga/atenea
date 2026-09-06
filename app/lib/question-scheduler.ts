/**
 * EL ESTADO DE CADA PREGUNTA PARA UN ALUMNO (P10 · entrenamiento adaptativo).
 *
 * Banco de preguntas común, pero cada alumno tiene sus propios «cajones»: nueva,
 * recaída, en aprendizaje, consolidando, dominada, atascada. El estado NO se
 * guarda en ninguna tabla — se calcula al vuelo a partir de `question_attempts`,
 * que ya registra cada respuesta (misma técnica que `getUserStats`). Ver
 * `docs/P10-entrenamiento-adaptativo.md`.
 *
 * Módulo PURO (regla 21): toda la aritmética del método de estudio se testea
 * aquí, sin BD y sin React.
 */

import { isBlankAnswer } from './exam-results';

// ============================================================
// LO QUE ENTRA
// ============================================================

/** Una respuesta, tal y como la guarda `question_attempts`. */
export type IntentoPregunta = {
  question_id?: string | null;
  topic?: string | null;
  is_correct?: boolean | null;
  error_type?: string | null;
  selected_index?: number | null;
  response_time_ms?: number | null;
  option_changes?: number | null;
  created_at?: string | null;
};

// ============================================================
// LAS CAJAS
// ============================================================

/**
 * Días hasta el siguiente repaso según la caja (índice = `box`).
 *
 *   box 0 = nueva (nunca contestada) · no se programa, está siempre disponible
 *   box 1 = recaída (el último intento fue fallo) · vuelve al día siguiente
 *   box 2-3 = en aprendizaje · box 4 = consolidando · box 5 = dominada
 *
 * El PRIMER acierto lleva a la caja 2, no a la 1: la caja 1 queda reservada para
 * «acabas de fallar esto». Más largos que los de las fichas (`[1,3,7,15,30]`):
 * la oposición es de meses y una pregunta cuesta más de recuperar que una ficha.
 */
export const BOX_INTERVALS_DAYS = [0, 1, 3, 8, 21, 45] as const;
export const MAX_BOX = BOX_INTERVALS_DAYS.length - 1; // 5

/** Fallada 4+ veces desde una caja ≥ 2: no se arregla con más repeticiones. */
export const LAPSES_ATASCADA = 4;

/** Un acierto por debajo de esto (ms) cuenta como fluido para «dominada». */
export const UMBRAL_FLUIDEZ_MS = 25_000;

export type Cajon =
  | 'nueva'
  | 'recaida'
  | 'aprendiendo'
  | 'consolidando'
  | 'dominada'
  | 'atascada';

export type QuestionState = {
  questionId: string;
  /** 0 = nunca contestada de verdad. 1 = recaída. 5 = dominada. */
  box: number;
  cajon: Cajon;
  /** Aciertos seguidos. Un fallo lo pone a 0. */
  streak: number;
  /** Veces que ha caído a la caja 1 desde una caja ≥ 2. */
  lapses: number;
  /** Nº de intentos contestados (sin contar blancos). */
  respuestas: number;
  aciertos: number;
  /** ISO del último acierto/fallo. Los blancos no cuentan. `null` si solo blancos. */
  lastAnsweredAt: string | null;
  /** ISO en el que vuelve a tocar. `null` si nunca contestada. */
  dueAt: string | null;
  /** Media de ms de los aciertos con tiempo medido. `null` si no hay dato. */
  avgTimeMs: number | null;
  /** Media de cambios de opción de los aciertos con dato. `null` si no hay dato. */
  avgChanges: number | null;
  /** Último `error_type` diagnosticado. */
  lastErrorType: string | null;
  /** La ha visto pero SOLO la ha dejado en blanco: la evita. */
  soloBlancos: boolean;
  /**
   * Caja 5 pero los últimos aciertos son lentos o con dudas: la sesión la
   * vuelve a tocar de vez en cuando en vez de darla por cerrada.
   */
  dominadaFragil: boolean;
};

function fecha(v: unknown): number | null {
  if (typeof v !== 'string' || !v) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

function cajonDe(box: number, lapses: number): Cajon {
  if (lapses >= LAPSES_ATASCADA) return 'atascada';
  if (box <= 0) return 'nueva';
  if (box === 1) return 'recaida';
  if (box <= 3) return 'aprendiendo';
  if (box === 4) return 'consolidando';
  return 'dominada';
}

/**
 * Recorre las respuestas de UN alumno y calcula el estado de cada pregunta.
 *
 * - `acierto` → `box = min(5, box + 1)`, `streak++`.
 * - `fallo`   → `box = 1` (recaída), `streak = 0`, `lapses++` si venía de ≥ 2.
 *              Excepción: si el diagnóstico es `fallo_procesamiento` (leíste
 *              mal, no es que no lo sepas) baja solo a la caja 2.
 * - `blanco`  → sin cambio. Dejar en blanco es una decisión, no un fallo
 *              (regla 24). Si SOLO hay blancos, la pregunta cuenta como nueva
 *              pero marcada `soloBlancos`.
 *
 * `dueAt` sale del último acierto/fallo + el intervalo de la caja.
 */
export function computeQuestionStates(
  intentos: IntentoPregunta[],
): Map<string, QuestionState> {
  // Orden cronológico: el estado depende de la secuencia.
  const orden = [...(intentos ?? [])]
    .filter((i): i is IntentoPregunta & { question_id: string } => typeof i?.question_id === 'string' && !!i.question_id)
    .sort((a, b) => (fecha(a.created_at) ?? 0) - (fecha(b.created_at) ?? 0));

  const acc = new Map<
    string,
    QuestionState & { _tiempos: number[]; _cambios: number[] }
  >();

  for (const it of orden) {
    const id = it.question_id;
    let s = acc.get(id);
    if (!s) {
      s = {
        questionId: id, box: 0, cajon: 'nueva', streak: 0, lapses: 0,
        respuestas: 0, aciertos: 0, lastAnsweredAt: null, dueAt: null,
        avgTimeMs: null, avgChanges: null, lastErrorType: null,
        soloBlancos: false, dominadaFragil: false, _tiempos: [], _cambios: [],
      };
      acc.set(id, s);
    }

    const blanco = isBlankAnswer(it.selected_index);
    if (blanco) {
      // No mueve nada. Solo marca «la evita» si aún no ha contestado ninguna.
      if (s.respuestas === 0) s.soloBlancos = true;
      continue;
    }

    s.respuestas++;
    s.soloBlancos = false;
    const cuando = fecha(it.created_at);
    if (cuando !== null) s.lastAnsweredAt = new Date(cuando).toISOString();

    if (it.is_correct) {
      s.aciertos++;
      s.streak++;
      // Primer acierto → caja 2 (la 1 es solo para recaídas). Luego, de una en una.
      s.box = s.box === 0 ? 2 : Math.min(MAX_BOX, s.box + 1);
      s.lastErrorType = null;
      if (typeof it.response_time_ms === 'number' && it.response_time_ms > 0) s._tiempos.push(it.response_time_ms);
      if (typeof it.option_changes === 'number' && it.option_changes >= 0) s._cambios.push(it.option_changes);
    } else {
      s.streak = 0;
      s.lastErrorType = typeof it.error_type === 'string' ? it.error_type : null;
      const veniaDeAprendido = s.box >= 2;
      // Lectura: baja a la 2, no a la 1. No es que no lo sepas.
      s.box = it.error_type === 'fallo_procesamiento' ? 2 : 1;
      if (veniaDeAprendido) s.lapses++;
    }
  }

  const salida = new Map<string, QuestionState>();

  for (const [id, s] of acc) {
    const avgTimeMs = s._tiempos.length
      ? Math.round(s._tiempos.reduce((a, b) => a + b, 0) / s._tiempos.length)
      : null;
    const avgChanges = s._cambios.length
      ? Math.round((s._cambios.reduce((a, b) => a + b, 0) / s._cambios.length) * 100) / 100
      : null;

    const lastMs = s.lastAnsweredAt ? Date.parse(s.lastAnsweredAt) : null;
    const dueAt =
      lastMs !== null && s.box >= 1
        ? new Date(lastMs + BOX_INTERVALS_DAYS[Math.min(s.box, MAX_BOX)] * 86_400_000).toISOString()
        : null;

    const dominadaFragil =
      s.box >= MAX_BOX &&
      ((avgTimeMs !== null && avgTimeMs > UMBRAL_FLUIDEZ_MS) || (avgChanges !== null && avgChanges > 0));

    salida.set(id, {
      questionId: id,
      box: s.box,
      cajon: cajonDe(s.box, s.lapses),
      streak: s.streak,
      lapses: s.lapses,
      respuestas: s.respuestas,
      aciertos: s.aciertos,
      lastAnsweredAt: s.lastAnsweredAt,
      dueAt,
      avgTimeMs,
      avgChanges,
      lastErrorType: s.lastErrorType,
      soloBlancos: s.soloBlancos && s.respuestas === 0,
      dominadaFragil,
    });
  }

  return salida;
}

/** ¿Toca ya esta pregunta? Nueva = siempre; contestada = si venció su repaso. */
export function estaVencida(state: QuestionState | undefined, now: Date = new Date()): boolean {
  if (!state || state.box === 0) return true;
  if (!state.dueAt) return true;
  return Date.parse(state.dueAt) <= now.getTime();
}

/** Cuántos días de retraso lleva (0 si aún no vence o es nueva). Para priorizar. */
export function diasDeRetraso(state: QuestionState | undefined, now: Date = new Date()): number {
  if (!state || !state.dueAt) return 0;
  const d = (now.getTime() - Date.parse(state.dueAt)) / 86_400_000;
  return d > 0 ? Math.round(d * 10) / 10 : 0;
}

// ============================================================
// LA CURVA DE APRENDIZAJE: CÓMO LLEVA CADA TEMA
// ============================================================

export type ResumenTema = {
  topic: string;
  total: number;
  nuevas: number;
  aprendiendo: number;
  consolidando: number;
  dominadas: number;
  atascadas: number;
  /** 0-100: cuánto del tema domina, ponderado por caja. La «curva». */
  progreso: number;
};

/**
 * Por cada tema, cuántas preguntas hay en cada cajón para este alumno.
 *
 * `preguntasPorTema` es el banco disponible (id de pregunta -> título de tema).
 * Una pregunta sin estado cuenta como nueva.
 */
export function resumeCajonesPorTema(
  states: Map<string, QuestionState>,
  preguntasPorTema: Map<string, string>,
): ResumenTema[] {
  const porTema = new Map<string, ResumenTema>();

  for (const [questionId, topic] of preguntasPorTema) {
    const t = (topic ?? '').trim() || 'Sin tema';
    let r = porTema.get(t);
    if (!r) {
      r = { topic: t, total: 0, nuevas: 0, aprendiendo: 0, consolidando: 0, dominadas: 0, atascadas: 0, progreso: 0 };
      porTema.set(t, r);
    }
    r.total++;
    const cajon = states.get(questionId)?.cajon ?? 'nueva';
    if (cajon === 'nueva') r.nuevas++;
    else if (cajon === 'recaida' || cajon === 'aprendiendo') r.aprendiendo++;
    else if (cajon === 'consolidando') r.consolidando++;
    else if (cajon === 'dominada') r.dominadas++;
    else if (cajon === 'atascada') r.atascadas++;
  }

  for (const r of porTema.values()) {
    // Ponderación: dominada = 1, consolidando = 0,66, aprendiendo = 0,33, resto = 0.
    const puntos = r.dominadas * 1 + r.consolidando * 0.66 + r.aprendiendo * 0.33;
    r.progreso = r.total > 0 ? Math.round((puntos / r.total) * 100) : 0;
  }

  return [...porTema.values()].sort((a, b) => a.progreso - b.progreso || a.topic.localeCompare(b.topic, 'es'));
}

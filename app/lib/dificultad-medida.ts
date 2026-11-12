/**
 * LA DIFICULTAD MEDIDA: lo que dicen las respuestas reales (docs/DIFICULTAD.md,
 * capa 3).
 *
 * La estimación del modelo y la mano del preparador son opiniones; esto es lo
 * que de verdad pasó. Con `MIN_RESPUESTAS` respuestas o más, el acierto
 * observado de una pregunta dice cuánta gente la falla.
 *
 * MÓDULO PURO (regla 21): sin base de datos, para poder probarlo. El script
 * `scripts/operacion/medir-dificultad.mjs` lee y escribe; aquí solo se decide.
 *
 * TRES COSAS QUE LO HACEN HONESTO
 *  1. LAS CUENTAS DE DEMOSTRACIÓN NO CUENTAN. Hoy son 9.859 de las 9.911
 *     respuestas del banco: medir con ellas sería medir datos inventados.
 *  2. UNA RESPUESTA POR ALUMNO Y PREGUNTA: la primera. Una pregunta repasada
 *     cinco veces no son cinco alumnos que la saben, y en el entrenamiento
 *     adaptativo la vuelven a ver justo porque la fallaron.
 *  3. UN BLANCO NO ES UN FALLO (regla 24): no cuenta ni como acierto ni como
 *     fallo. Se mide sobre lo contestado.
 */

// Solo tipos, y con extensión: este módulo lo carga un script de Node, que no
// resuelve imports sin `.ts` y no puede arrastrar `examen-clase` (que importa `scoring`).
import type { Nivel } from './dificultad.ts';
import type { PreguntaGuardada } from './examen-clase.ts';

/** Blanco, como en `question_attempts.selected_index` (regla 24). El mismo valor que `BLANCO` de `examen-clase`. */
const BLANCO = -1;

/** Por debajo de esto no se mide: 30 respuestas dan un margen de ±9 puntos como mucho. */
export const MIN_RESPUESTAS = 30;
/** Acierto de quien contesta a partir del cual una pregunta es fácil. */
export const UMBRAL_FACIL = 0.75;
/** Por debajo de este acierto es difícil. Con tres opciones, adivinar da 0,33. */
export const UMBRAL_DIFICIL = 0.5;

export type Observacion = { contestadas: number; aciertos: number };

/** Una respuesta de un alumno a una pregunta, venga de donde venga. */
export type RespuestaMedible = {
  userId: string;
  questionId: string;
  /** `true` acierto · `false` fallo. Un blanco no entra: no es una respuesta medible. */
  acierto: boolean;
  /** ISO. Decide cuál es la PRIMERA respuesta de un alumno a una pregunta. */
  en: string;
};

/** Acierto sobre lo contestado (0-1), o `null` si nadie contestó (regla 8). */
export function tasaDeAcierto(o: Observacion | undefined): number | null {
  return o && o.contestadas > 0 ? o.aciertos / o.contestadas : null;
}

/** El nivel que dice la medida, o `null` si todavía no hay respuestas suficientes. */
export function nivelMedido(o: Observacion | undefined): Nivel | null {
  if (!o || o.contestadas < MIN_RESPUESTAS) return null;
  const t = tasaDeAcierto(o);
  if (t === null) return null;
  return t >= UMBRAL_FACIL ? 1 : t < UMBRAL_DIFICIL ? 3 : 2;
}

/**
 * De las respuestas sueltas al acierto por pregunta: sin las cuentas excluidas
 * (demostración) y con una sola respuesta —la primera— por alumno y pregunta.
 */
export function observaciones(respuestas: readonly RespuestaMedible[], excluidos: ReadonlySet<string>): Map<string, Observacion> {
  const primeras = new Map<string, RespuestaMedible>();
  for (const r of respuestas) {
    if (excluidos.has(r.userId)) continue;
    const clave = `${r.userId}|${r.questionId}`;
    const previa = primeras.get(clave);
    if (!previa || r.en < previa.en) primeras.set(clave, r);
  }
  const por = new Map<string, Observacion>();
  for (const r of primeras.values()) {
    const o = por.get(r.questionId) ?? { contestadas: 0, aciertos: 0 };
    o.contestadas++;
    if (r.acierto) o.aciertos++;
    por.set(r.questionId, o);
  }
  return por;
}

/** Una fila de `question_attempts`, tal cual. */
export type IntentoBruto = {
  user_id: string;
  question_id: string | null;
  selected_index: number | null;
  is_correct: boolean | null;
  created_at: string;
};

/**
 * De las filas de `question_attempts` a respuestas medibles. Se descarta lo que
 * no se sabe (`selected_index` nulo: «no se sabe», regla 24), los blancos
 * (`-1`) y lo que no está ligado a una pregunta del banco.
 */
export function respuestasDeIntentos(intentos: readonly IntentoBruto[]): RespuestaMedible[] {
  const salida: RespuestaMedible[] = [];
  for (const i of intentos) {
    if (!i.question_id || i.selected_index === null || i.selected_index === BLANCO || i.is_correct === null) continue;
    salida.push({ userId: i.user_id, questionId: i.question_id, acierto: i.is_correct, en: i.created_at });
  }
  return salida;
}

/**
 * De la entrega de un examen en clase a respuestas medibles. Las respuestas son
 * las que declaró el alumno (regla 118) y se miden contra la copia GUARDADA de
 * cada pregunta. Un ausente no entra; una pregunta sin id (no salió del banco)
 * tampoco, porque no hay a qué atribuirla.
 */
export function respuestasDeExamenClase(
  userId: string,
  en: string,
  preguntas: readonly PreguntaGuardada[],
  respuestas: readonly number[],
): RespuestaMedible[] {
  const salida: RespuestaMedible[] = [];
  preguntas.forEach((p, i) => {
    const r = respuestas[i];
    if (!p.id || typeof r !== 'number' || r === BLANCO || !Number.isInteger(r)) return;
    salida.push({ userId, questionId: p.id, acierto: r === p.c, en });
  });
  return salida;
}

export type FilaDePregunta = { id: string; difficulty_level: number | null; difficulty_source: string | null };

export type Propuesta = {
  id: string;
  contestadas: number;
  /** 0-1. */
  tasa: number;
  nivel: Nivel;
  /** ¿Hay que escribir el nivel medido? Falso si ya está igual o si manda un preparador. */
  escribeNivel: boolean;
  /** El preparador puso un nivel y la medida dice otra cosa: se enseña, no se toca. */
  conflicto: boolean;
};

/**
 * Qué hacer con cada pregunta que ya tiene respuestas suficientes.
 *
 * Lo que puso un PREPARADOR no se pisa nunca, ni con una medida: una persona
 * de la academia decidió, y la medida puede venir de un turno concreto o de
 * una pregunta mal puesta. Si discrepan se enseña, para que lo mire. En
 * cambio la estimación del modelo y el 2 por defecto sí ceden ante la medida.
 *
 * `global_success_rate` se escribe siempre que haya datos, mande quien mande
 * en el nivel: la tasa es un hecho, no una opinión.
 */
export function decideCambios(filas: readonly FilaDePregunta[], obs: ReadonlyMap<string, Observacion>): Propuesta[] {
  const salida: Propuesta[] = [];
  for (const f of filas) {
    const o = obs.get(f.id);
    const nivel = nivelMedido(o);
    const tasa = tasaDeAcierto(o);
    if (!o || nivel === null || tasa === null) continue;
    const manda = f.difficulty_source === 'preparador';
    const igual = f.difficulty_level === nivel && f.difficulty_source === 'medida';
    salida.push({
      id: f.id,
      contestadas: o.contestadas,
      tasa,
      nivel,
      escribeNivel: !manda && !igual,
      conflicto: manda && f.difficulty_level !== nivel,
    });
  }
  return salida;
}

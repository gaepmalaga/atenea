/**
 * Contrato de los resultados de test entre el cliente y el servidor.
 *
 * Este modulo existe por un fallo concreto: `ExamManager` construia el payload
 * con `response_time_ms` / `option_changes` y `saveExamResults` leia `r.time` /
 * `r.changes`. Como el parametro era `any[]`, nadie se entero: las dos
 * dimensiones de "Atenea Mind" se guardaban a 0 en todos los examenes.
 *
 * Regla: el cliente habla camelCase, la base de datos snake_case, y la
 * traduccion ocurre en UN solo sitio (`toResultRow`).
 */

/** Lo que mide la UI mientras el alumno responde. */
export type AnswerMetrics = {
  /** Milisegundos desde que se mostro la pregunta hasta que se avanzo. */
  responseTimeMs: number;
  /**
   * Veces que el alumno cambio a una opcion DISTINTA habiendo marcado ya una.
   * La primera respuesta no es un cambio, y volver a pulsar la misma tampoco.
   */
  optionChanges: number;
  /** Taxonomia del fallo, si el alumno la etiqueto. */
  errorType?: string | null;
};

/** Una fila de `test_results` tal y como la escribe el servidor. */
export type ResultRow = {
  question_id: string | null;
  subject_id: number | null;
  is_correct: boolean;
  response_time_ms: number;
  option_changes: number;
  error_type: string | null;
};

/** Lo que el cliente envia por cada pregunta al terminar un examen. */
export type ExamResultPayload = {
  questionId: string | null;
  subjectId: number | null;
  isCorrect: boolean;
} & AnswerMetrics;

export const EMPTY_METRICS: AnswerMetrics = {
  responseTimeMs: 0,
  optionChanges: 0,
  errorType: null,
};

/** Numero finito y no negativo, o 0. Protege de NaN e Infinity. */
function safeCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * Unico punto donde camelCase se convierte en las columnas de la tabla.
 * Lo usan tanto el guardado por pregunta (modo entrenamiento) como el guardado
 * en bloque al terminar un examen.
 */
export function toResultRow(
  input: { questionId: string | null; subjectId: number | null; isCorrect: boolean } & Partial<AnswerMetrics>
): ResultRow {
  return {
    question_id: input.questionId ?? null,
    subject_id: input.subjectId ?? null,
    is_correct: Boolean(input.isCorrect),
    response_time_ms: safeCount(input.responseTimeMs),
    option_changes: safeCount(input.optionChanges),
    error_type: input.errorType ?? null,
  };
}

/** Pregunta terminada, tal y como la deja `ActiveTest`. */
type FinishedQuestion = {
  id: string | null;
  subject_id?: number | null;
  userAnswer?: string | null;
  correctOptionId: string;
  errorType?: string | null;
  timeMs?: number;
  changes?: number;
};

/**
 * Convierte las preguntas de un examen terminado en el payload que espera el
 * servidor. Antes esto se hacia en linea en `handleFinish`, con dos `as any`
 * que tapaban precisamente el desajuste de nombres.
 */
export function buildExamResults(questions: FinishedQuestion[]): ExamResultPayload[] {
  return questions.map((q) => ({
    questionId: q.id ?? null,
    subjectId: q.subject_id ?? null,
    isCorrect: q.userAnswer === q.correctOptionId,
    responseTimeMs: safeCount(q.timeMs),
    optionChanges: safeCount(q.changes),
    errorType: q.errorType ?? null,
  }));
}

/**
 * Cuenta un cambio de opcion.
 *
 * `ActiveTest` hacia `setOptionChanges(prev => prev + 1)` y leia `optionChanges`
 * en la misma funcion: por el cierre obsoleto guardaba siempre el valor
 * anterior, o sea 0 en modo entrenamiento. Y contaba respuestas, no cambios.
 */
export function countChange(previousAnswer: string | null | undefined, newAnswer: string): boolean {
  return Boolean(previousAnswer) && previousAnswer !== newAnswer;
}

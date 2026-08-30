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

/**
 * Una fila de `question_attempts` tal y como la escribe el servidor.
 *
 * El tema viaja como TITULO en `topic`, no como `subject_id`: es lo que
 * guarda la tabla y lo que la interfaz pinta en el historial. Antes esto
 * declaraba `subject_id` y se escribia contra `test_results`, que no tiene ni
 * esa columna ni `error_type`: PostgREST rechazaba cada insercion entera y
 * ningun resultado llego a guardarse nunca.
 */
export type ResultRow = {
  question_id: string | null;
  topic: string;
  is_correct: boolean;
  response_time_ms: number;
  option_changes: number;
  error_type: string | null;
  /** Opcion marcada. Ver `BLANK_INDEX`. */
  selected_index: number | null;
};

/**
 * Valor de `selected_index` que significa «la dejo en blanco A PROPOSITO».
 *
 * POR QUE UN CENTINELA Y NO `null`
 * `selected_index` lleva declarada desde siempre y NADIE la escribia: todas las
 * filas anteriores a P3.4 la tienen a null, tambien las contestadas. Si null
 * significara "en blanco", cada fallo del historico se leeria como un blanco.
 *
 * Asi hay tres estados que no se confunden:
 *
 *     0, 1, 2 ...  la opcion que marco
 *     -1           blanco deliberado
 *     null         no se sabe (fila vieja)
 *
 * Ningun indice real es negativo, asi que -1 no colisiona con nada.
 */
export const BLANK_INDEX = -1;

/**
 * Si esta fila es un blanco deliberado.
 *
 * Es una funcion y no una comparacion suelta para que el centinela solo se
 * escriba en este fichero: repartirlo por los modulos que leen resultados es
 * como se olvida la mitad de los sitios.
 */
export function isBlankAnswer(selectedIndex: number | null | undefined): boolean {
  return selectedIndex === BLANK_INDEX;
}

/** Lo que el cliente envia por cada pregunta al terminar un examen. */
export type ExamResultPayload = {
  questionId: string | null;
  /** Titulo del tema. Se guarda tal cual en la columna `topic`. */
  topic: string;
  isCorrect: boolean;
  /** Indice de la opcion marcada, o `BLANK_INDEX` si quedo en blanco. */
  selectedIndex?: number | null;
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
  input: {
    questionId: string | null;
    topic: string;
    isCorrect: boolean;
    selectedIndex?: number | null;
  } & Partial<AnswerMetrics>
): ResultRow {
  const enBlanco = isBlankAnswer(input.selectedIndex);

  return {
    question_id: input.questionId ?? null,
    // NOT NULL en la tabla: mejor una cadena vacia que tumbar la insercion.
    topic: input.topic ?? '',
    // Un blanco NUNCA es correcto, diga lo que diga quien llame. Esta accion
    // es un endpoint publico y `isCorrect` viaja desde el navegador; sin esta
    // linea, un cliente manipulado podria guardar blancos acertados y subirse
    // el porcentaje.
    is_correct: enBlanco ? false : Boolean(input.isCorrect),
    response_time_ms: safeCount(input.responseTimeMs),
    option_changes: safeCount(input.optionChanges),
    // Un blanco no se diagnostica: no hubo error que clasificar.
    error_type: enBlanco ? null : input.errorType ?? null,
    selected_index: normalizeSelectedIndex(input.selectedIndex),
  };
}

/**
 * Deja `selected_index` en uno de sus tres estados validos.
 *
 * Cualquier cosa que no sea un entero >= 0 ni el centinela cae a null, que es
 * "no se sabe": es preferible perder el dato a inventarse una opcion. Un
 * `Number('')` valdria 0 y diria que marco la A (regla 16).
 */
function normalizeSelectedIndex(value: number | null | undefined): number | null {
  if (value === BLANK_INDEX) return BLANK_INDEX;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null;
  return value;
}

/** Pregunta terminada, tal y como la deja `ActiveTest`. */
type FinishedQuestion = {
  id: string | null;
  topic?: string | null;
  userAnswer?: string | null;
  correctOptionId: string;
  errorType?: string | null;
  timeMs?: number;
  changes?: number;
  /** Las opciones, para saber QUE indice marco. Sin ellas no se puede deducir. */
  options?: { id: string }[];
};

/**
 * Que indice guardar para una pregunta terminada.
 *
 * Sin respuesta es un blanco. Con respuesta se busca su posicion entre las
 * opciones; si no se encuentra (o la pregunta no las trae) queda null: "no se
 * sabe" es mejor que un 0 que diria que marco la A.
 */
function indiceElegido(q: FinishedQuestion): number | null {
  if (!q.userAnswer) return BLANK_INDEX;
  const i = q.options?.findIndex((o) => o.id === q.userAnswer) ?? -1;
  return i >= 0 ? i : null;
}

/**
 * Convierte las preguntas de un examen terminado en el payload que espera el
 * servidor. Antes esto se hacia en linea en `handleFinish`, con dos `as any`
 * que tapaban precisamente el desajuste de nombres.
 */
export function buildExamResults(
  questions: FinishedQuestion[],
  /** Tema del examen, para las preguntas que no traigan el suyo. */
  temaPorDefecto = ''
): ExamResultPayload[] {
  return questions.map((q) => ({
    questionId: q.id ?? null,
    topic: q.topic ?? temaPorDefecto,
    // Sin respuesta NO es un acierto, y tampoco un fallo: lo separa
    // `selectedIndex`. Antes esto se guardaba como `is_correct: false` y el
    // blanco contaba como error en las estadisticas, justo lo contrario de lo
    // que dice la formula de la convocatoria.
    isCorrect: Boolean(q.userAnswer) && q.userAnswer === q.correctOptionId,
    selectedIndex: indiceElegido(q),
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

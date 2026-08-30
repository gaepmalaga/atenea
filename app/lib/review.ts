/**
 * El repaso de lo fallado.
 *
 * POR QUE EXISTE
 * La plataforma sabia perfectamente que preguntas habia fallado cada alumno —y
 * ademas POR QUE, porque el diagnostico del error es obligatorio— y no habia
 * ni una pantalla para volver a ellas. El dato se recogia y se moria en la
 * tabla. En una plataforma de estudio eso es al reves de como se aprende:
 * repasar el fallo es el unico momento en que el error sirve de algo.
 *
 * Modulo puro (regla 21): la agregacion se puede testear, que es donde han
 * estado casi todos los errores de aritmetica de este repo.
 */

import { isBlankAnswer } from './exam-results';
import { ERROR_TYPES, type ErrorType } from './stats';

/**
 * Un intento fallado, tal y como llega del join con `question_bank`.
 *
 * El enunciado viaja por JOIN y no desnormalizado (regla 5): si un admin
 * corrige la pregunta, el repaso tiene que enseñar la corregida, no la copia
 * de cuando se fallo.
 */
export type FailedAttemptRow = {
  question_id?: string | null;
  topic?: string | null;
  error_type?: string | null;
  created_at?: string | null;
  is_correct?: boolean | null;
  selected_index?: number | null;
  question_text?: string | null;
  options?: unknown;
  correct_index?: number | null;
  explanation?: string | null;
  legal_reference?: string | null;
};

/** Una pregunta fallada, ya agrupada por todos sus intentos. */
export type FailedQuestion = {
  questionId: string;
  questionText: string;
  options: string[];
  correctIndex: number | null;
  explanation: string;
  /**
   * De que articulo sale (P3.7). `null` si no se sabe: pregunta anterior a la
   * columna, o generada a partir de unos apuntes, que no tienen articulos.
   *
   * En una pantalla de repaso vale casi tanto como la explicacion, porque es
   * lo que dice QUE RELEER.
   */
  legalReference: string | null;
  topic: string;
  /** Cuantas veces se ha fallado. */
  times: number;
  /** Cuando se fallo por ultima vez. ISO, o null si ninguna fila traia fecha. */
  lastFailedAt: string | null;
  /** El diagnostico mas reciente que el alumno le puso. */
  lastErrorType: ErrorType | null;
  /**
   * Las opciones que llego a marcar, sin repetir.
   *
   * Vale mas de lo que parece: si dos intentos cayeron en el MISMO distractor,
   * el problema no es que no se lo sepa, es que esa opcion le convence.
   */
  chosenIndexes: number[];
};

function esTipoDeError(v: unknown): v is ErrorType {
  return typeof v === 'string' && (ERROR_TYPES as readonly string[]).includes(v);
}

/** Las opciones tal y como las guarda `question_bank`: un array de textos. */
function leerOpciones(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((t) => (typeof t === 'string' ? t : JSON.stringify(t)));
}

/** Compara dos fechas ISO tolerando nulos y basura. Devuelve la mas reciente. */
function masReciente(a: string | null, b: string | null | undefined): string | null {
  if (!b) return a;
  if (!a) return b;
  return new Date(b).getTime() > new Date(a).getTime() ? b : a;
}

/**
 * Agrupa los intentos fallados por pregunta.
 *
 * DOS COSAS QUE NO SON OBVIAS:
 *
 * 1. **Un blanco NO entra.** No es un fallo (P3.4), y meterlo aqui mandaria al
 *    alumno a repasar preguntas que decidio no contestar por estrategia. Ojo:
 *    solo se excluye el blanco DELIBERADO; una fila anterior a P3.4 trae
 *    `selected_index` a null, que significa "no se sabe", y esas si cuentan.
 *
 * 2. **Una fila sin `question_id` se descarta.** Son preguntas generadas en
 *    vivo que no llegaron a guardarse: no hay nada que volver a enseñar, y
 *    agruparlas por null las juntaria todas en una sola entrada absurda.
 *
 * El orden de salida es por numero de fallos y, a igualdad, por lo reciente:
 * lo que mas se repite es lo que primero hay que mirar.
 */
export function groupFailedAttempts(rows: FailedAttemptRow[]): FailedQuestion[] {
  const porPregunta = new Map<string, FailedQuestion>();

  for (const r of rows) {
    if (r.is_correct) continue;
    if (isBlankAnswer(r.selected_index)) continue;

    const id = r.question_id;
    if (!id) continue;

    const previo = porPregunta.get(id);

    // El indice elegido solo se apunta si es una opcion de verdad. `null` es
    // "no se sabe" (fila vieja) y no dice nada sobre que le convencio.
    const elegido =
      typeof r.selected_index === 'number' && r.selected_index >= 0 ? r.selected_index : null;

    if (!previo) {
      porPregunta.set(id, {
        questionId: id,
        questionText: r.question_text ?? '',
        options: leerOpciones(r.options),
        correctIndex: typeof r.correct_index === 'number' ? r.correct_index : null,
        explanation: r.explanation ?? '',
        legalReference: r.legal_reference ?? null,
        topic: r.topic ?? '',
        times: 1,
        lastFailedAt: r.created_at ?? null,
        lastErrorType: esTipoDeError(r.error_type) ? r.error_type : null,
        chosenIndexes: elegido === null ? [] : [elegido],
      });
      continue;
    }

    previo.times += 1;

    // El diagnostico que se conserva es el del intento MAS RECIENTE, no el
    // primero: si el alumno fallo por "olvido" y luego por "laguna", lo que
    // describe su estado de hoy es lo segundo.
    const eraMasNuevo = masReciente(previo.lastFailedAt, r.created_at) === r.created_at;
    if (eraMasNuevo && r.created_at) {
      previo.lastFailedAt = r.created_at;
      if (esTipoDeError(r.error_type)) previo.lastErrorType = r.error_type;
    } else if (!previo.lastErrorType && esTipoDeError(r.error_type)) {
      previo.lastErrorType = r.error_type;
    }

    if (elegido !== null && !previo.chosenIndexes.includes(elegido)) {
      previo.chosenIndexes.push(elegido);
    }
  }

  return [...porPregunta.values()].sort((a, b) => {
    if (b.times !== a.times) return b.times - a.times;
    const fa = a.lastFailedAt ? new Date(a.lastFailedAt).getTime() : 0;
    const fb = b.lastFailedAt ? new Date(b.lastFailedAt).getTime() : 0;
    return fb - fa;
  });
}

/** Cuantas preguntas falladas hay por tema, de mayor a menor. */
export function failuresByTopic(items: FailedQuestion[]): { topic: string; count: number }[] {
  const cuenta = new Map<string, number>();
  for (const i of items) {
    // Un tema vacio se agrupa bajo una etiqueta legible en vez de dejar un
    // filtro en blanco que el alumno no sabe que significa.
    const t = i.topic || 'Sin tema';
    cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
}

/**
 * La pregunta que mas urge repasar de una lista.
 *
 * Devuelve `null` con la lista vacia, no un objeto a medias: "sin datos" y
 * "cero" no son lo mismo, y quien lo pinte tiene que poder distinguirlos
 * (regla 8).
 */
export function mostUrgent(items: FailedQuestion[]): FailedQuestion | null {
  return items[0] ?? null;
}

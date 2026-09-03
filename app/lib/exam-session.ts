/**
 * El examen en curso, guardado fuera de la memoria de React.
 *
 * POR QUÉ EXISTE
 * `ExamManager` tenía el examen entero —las preguntas Y las respuestas del
 * alumno— en `useState`, y en modo simulacro nada se guarda en la base de datos
 * hasta que se entrega. Con eso, TODAS estas cosas borraban el examen sin
 * aviso y sin vuelta atrás:
 *
 *   · pulsar Atrás en Android (la aplicación es una sola ruta: Atrás se sale);
 *   · recargar la página, o que se recargue sola;
 *   · que el navegador del móvil descarte la pestaña, que es lo que hace iOS
 *     en cuanto entra una llamada o se abren un par de aplicaciones más.
 *
 * Cuarenta minutos de simulacro a la basura por coger el teléfono. Esto lo
 * evita: el examen se escribe en `localStorage` a cada respuesta y se puede
 * reanudar.
 *
 * NO sustituye a guardar en la base de datos. Es el seguro de lo que todavía
 * no ha llegado allí.
 */

import type { Question } from './questions';

/** Lo que el alumno eligió antes de empezar. */
export type ExamSettings = {
  mode: 'practice' | 'exam';
  questionCount: number;
  difficulty: 'easy' | 'medium' | 'hard';
  selectedTopics: string[];
};

/**
 * La versión del formato.
 *
 * Si cambia la forma de `Question`, un examen guardado con el formato viejo se
 * descarta en vez de restaurarse a medias: reanudar con preguntas corruptas
 * sería peor que no reanudar.
 */
export const EXAM_SNAPSHOT_VERSION = 2 as const;

export type ExamSnapshot = {
  version: typeof EXAM_SNAPSHOT_VERSION;
  questions: Question[];
  settings: ExamSettings;
  /**
   * Cuándo empezó el examen, en milisegundos de reloj.
   *
   * Es lo que hace que reanudar no regale tiempo: sin esto, al volver, el
   * cronómetro del simulacro arrancaría de cero y el alumno tendría los 50
   * minutos otra vez. El reloj se deriva de aquí, no de cuándo se monta el
   * componente.
   */
  startedAt: number;
  /** Cuándo se guardó por última vez. Sirve para caducar. */
  savedAt: number;
};

export const EXAM_STORAGE_KEY = 'atenea:examen-en-curso';

/**
 * Cuánto vale un examen guardado.
 *
 * Seis horas: suficiente para volver después de comer o de un viaje, y poco
 * para que la aplicación no te ofrezca reanudar un simulacro de anteayer que
 * ya no recuerdas. Un examen caducado se descarta en silencio.
 */
export const EXAM_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** Una pregunta con forma reconocible. Se comprueba antes de restaurar nada. */
function esPregunta(v: unknown): v is Question {
  if (typeof v !== 'object' || v === null) return false;
  const q = v as Record<string, unknown>;
  return (
    typeof q.question === 'string' &&
    Array.isArray(q.options) &&
    q.options.length > 0 &&
    typeof q.correctOptionId === 'string'
  );
}

function esSettings(v: unknown): v is ExamSettings {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    (s.mode === 'practice' || s.mode === 'exam') &&
    typeof s.questionCount === 'number' &&
    Array.isArray(s.selectedTopics)
  );
}

/**
 * Lee lo guardado y decide si sirve.
 *
 * Devuelve `null` —y no lanza— ante cualquier problema: JSON roto, formato
 * viejo, examen caducado o sin preguntas. Un fallo al restaurar NO puede
 * impedirle al alumno empezar un examen nuevo, que es lo que pasaría si esto
 * reventara al arrancar la pantalla.
 */
export function leerExamenGuardado(bruto: string | null, ahora: number): ExamSnapshot | null {
  if (!bruto) return null;

  let datos: unknown;
  try {
    datos = JSON.parse(bruto);
  } catch {
    return null;
  }

  if (typeof datos !== 'object' || datos === null) return null;
  const s = datos as Record<string, unknown>;

  if (s.version !== EXAM_SNAPSHOT_VERSION) return null;
  if (typeof s.startedAt !== 'number' || typeof s.savedAt !== 'number') return null;
  if (ahora - s.savedAt > EXAM_MAX_AGE_MS) return null;
  // Un reloj hacia atrás (cambio de hora, fecha del móvil mal) no debe dar por
  // caducado algo recién guardado, pero tampoco fiarse: si el guardado dice ser
  // del futuro, se descarta.
  if (s.savedAt > ahora + 60_000) return null;

  if (!Array.isArray(s.questions) || s.questions.length === 0) return null;
  if (!s.questions.every(esPregunta)) return null;
  if (!esSettings(s.settings)) return null;

  return {
    version: EXAM_SNAPSHOT_VERSION,
    questions: s.questions,
    settings: s.settings,
    startedAt: s.startedAt,
    savedAt: s.savedAt,
  };
}

/** Lo que se escribe en `localStorage`. */
export function serializarExamen(
  questions: Question[],
  settings: ExamSettings,
  startedAt: number,
  ahora: number,
): string {
  const snapshot: ExamSnapshot = {
    version: EXAM_SNAPSHOT_VERSION,
    questions,
    settings,
    startedAt,
    savedAt: ahora,
  };
  return JSON.stringify(snapshot);
}

/** Cuántas lleva contestadas. Es lo que se le enseña al ofrecerle reanudar. */
export function contestadasDe(snapshot: ExamSnapshot): number {
  return snapshot.questions.filter((q) => !!q.userAnswer).length;
}

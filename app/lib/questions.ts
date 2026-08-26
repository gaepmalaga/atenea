/**
 * Mapeo entre el formato de la base de datos / la IA y el formato que consume
 * la UI de examenes. Extraido de ExamManager.tsx para poder testearlo.
 */

export type QuestionOption = { id: string; text: string };

export type Question = {
  id: string;
  question: string;
  options: QuestionOption[];
  correctOptionId: string;
  explanation: string;
  userAnswer?: string | null;
  errorType?: string | null;
  subject_id?: number | null;
  origin?: 'bank' | 'live_ai' | 'candidate';
  timeMs?: number;
  changes?: number;
};

export const OPTION_IDS = ['a', 'b', 'c'] as const;

/** Convierte un indice numerico de opcion (0,1,2) en su id ('a','b','c'). */
export function indexToOptionId(index: number): string {
  return OPTION_IDS[index] ?? OPTION_IDS[OPTION_IDS.length - 1];
}

export function difficultyToNumber(d: 'easy' | 'medium' | 'hard'): number {
  if (d === 'easy') return 1;
  if (d === 'hard') return 3;
  return 2;
}

/** Fila de `question_bank` -> pregunta de UI. */
export function mapBankRowToQuestion(row: any): Question {
  const opts: QuestionOption[] = Array.isArray(row.options)
    ? row.options.map((text: unknown, idx: number) => ({
        id: indexToOptionId(idx),
        text: typeof text === 'string' ? text : JSON.stringify(text),
      }))
    : [];

  return {
    id: row.id,
    subject_id: row.subject_id ?? null,
    question: row.question_text,
    options: opts,
    correctOptionId: indexToOptionId(row.correct_index),
    explanation: row.explanation,
    userAnswer: null,
    errorType: null,
    origin: row.origin || 'bank',
  };
}

/** Respuesta de la IA en vivo -> pregunta de UI. */
export function mapCandidateToQuestion(data: any): Question {
  let formattedOptions: QuestionOption[];

  if (data.options && data.options[0] && typeof data.options[0] === 'object') {
    formattedOptions = data.options;
  } else if (Array.isArray(data.options)) {
    formattedOptions = data.options.map((text: string, idx: number) => ({
      id: indexToOptionId(idx),
      text,
    }));
  } else {
    formattedOptions = [];
  }

  return {
    id: data.id,
    subject_id: data.subject_id ?? null,
    question: data.question || data.question_text,
    options: formattedOptions,
    correctOptionId: data.correctOptionId || indexToOptionId(data.correct_index),
    explanation: data.explanation,
    userAnswer: null,
    errorType: null,
    origin: 'candidate',
  };
}

/** Puntuacion de un examen terminado. */
export function scoreExam(questions: Pick<Question, 'userAnswer' | 'correctOptionId'>[]) {
  const total = questions.length;
  const correct = questions.filter((q) => q.userAnswer === q.correctOptionId).length;
  // Sin preguntas la precision es 0, no NaN.
  const percentage = total === 0 ? 0 : Math.round((correct / total) * 100);
  return { total, correct, wrong: total - correct, percentage };
}

// ============================================================
// CICLO DE VIDA DE UNA PREGUNTA
// ============================================================

/**
 * Estados posibles de una fila de `question_bank`.
 *
 * Antes estos literales estaban esparcidos por cuatro ficheros y no casaban:
 * todo lo generado se guardaba como 'candidate' y los alumnos solo leian
 * 'active', asi que el banco nunca llegaba a servirse.
 */
export const QUESTION_STATUS = {
  /**
   * Generada en vivo durante un test. Se sirve a quien la pidio, pero no entra
   * en el banco reutilizable hasta que un administrador la revisa.
   */
  CANDIDATE: 'candidate',
  /** En el banco: reutilizable en los tests de cualquier alumno. */
  ACTIVE: 'active',
  /** Descartada en moderacion. No vuelve a servirse ni se resucita al resembrar. */
  DISABLED: 'disabled',
} as const;

export type QuestionStatus = (typeof QUESTION_STATUS)[keyof typeof QUESTION_STATUS];

export const QUESTION_STATUSES: QuestionStatus[] = [
  QUESTION_STATUS.CANDIDATE,
  QUESTION_STATUS.ACTIVE,
  QUESTION_STATUS.DISABLED,
];

export const QUESTION_STATUS_LABEL: Record<QuestionStatus, string> = {
  [QUESTION_STATUS.CANDIDATE]: 'Pendiente',
  [QUESTION_STATUS.ACTIVE]: 'En el banco',
  [QUESTION_STATUS.DISABLED]: 'Descartada',
};

export function isQuestionStatus(value: unknown): value is QuestionStatus {
  return typeof value === 'string' && (QUESTION_STATUSES as string[]).includes(value);
}

/** Estados que un alumno puede recibir en un test desde el banco. */
export const SERVABLE_STATUSES: QuestionStatus[] = [QUESTION_STATUS.ACTIVE];

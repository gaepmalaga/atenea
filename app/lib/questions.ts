/**
 * Mapeo entre el formato de la base de datos / la IA y el formato que consume
 * la UI de examenes. Extraido de ExamManager.tsx para poder testearlo.
 */

export type QuestionOption = { id: string; text: string };

export type Question = {
  /**
   * `null` cuando la pregunta se genero en vivo y no llego a guardarse (choque
   * de hash que tampoco se pudo recuperar). Sin id no se puede votar, reportar
   * ni referenciar desde `question_attempts`, asi que la UI tiene que
   * comprobarlo.
   */
  id: string | null;
  question: string;
  options: QuestionOption[];
  correctOptionId: string;
  explanation: string;
  userAnswer?: string | null;
  errorType?: string | null;
  subject_id?: number | null;
  /**
   * Titulo del tema del que salio la pregunta.
   *
   * Se etiqueta al cargarla porque `question_bank` guarda `subject_id` y
   * `question_attempts` guarda `topic`: sin arrastrarlo, al terminar el examen
   * no hay forma de saber a que tema pertenecia cada respuesta.
   */
  topic?: string | null;
  origin?: 'bank' | 'live_ai' | 'candidate';
  timeMs?: number;
  changes?: number;
};

export const OPTION_IDS = ['a', 'b', 'c'] as const;

/**
 * Baraja sin sesgo (Fisher-Yates).
 *
 * `sort(() => Math.random() - 0.5)` NO baraja bien: el comparador es
 * inconsistente y el resultado depende del algoritmo de ordenacion del motor,
 * asi que unas posiciones salen mucho mas que otras. En un banco de preguntas
 * eso significa que el alumno ve siempre las mismas.
 */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Convierte un indice numerico de opcion (0,1,2) en su id ('a','b','c'). */
export function indexToOptionId(index: number): string {
  return OPTION_IDS[index] ?? OPTION_IDS[OPTION_IDS.length - 1];
}

/**
 * Dificultad de una pregunta, tal y como la guarda `question_bank`.
 *
 * La columna es `difficulty_level integer default 2`. Existia desde siempre;
 * lo que faltaba era que alguien la escribiera y la leyera: el generador nunca
 * la mandaba y el filtro nunca se aplicaba, asi que el selector de la interfaz
 * no hacia absolutamente nada.
 */
export const DIFFICULTY = { easy: 1, medium: 2, hard: 3 } as const;

export type DifficultyName = keyof typeof DIFFICULTY;
export type DifficultyLevel = (typeof DIFFICULTY)[DifficultyName];

/** El valor por defecto de la columna. Lo que tienen las preguntas anteriores. */
export const DIFFICULTY_DEFAULT: DifficultyLevel = DIFFICULTY.medium;

export function difficultyToNumber(d: DifficultyName): DifficultyLevel {
  return DIFFICULTY[d] ?? DIFFICULTY_DEFAULT;
}

/** Un nivel valido, o el de por defecto. Protege de lo que llegue del cliente. */
export function toDifficultyLevel(valor: unknown): DifficultyLevel {
  const n = Number(valor);
  return ([1, 2, 3] as number[]).includes(n) ? (n as DifficultyLevel) : DIFFICULTY_DEFAULT;
}

/**
 * Lo que se le pide al modelo para cada nivel.
 *
 * Vive aqui, junto al numero, y no dentro del prompt: separarlos es como el
 * prompt acabo pidiendo siempre "Dificultad Media/Alta" mientras la interfaz
 * ofrecia tres opciones (regla 17).
 */
export const DIFFICULTY_BRIEF: Record<DifficultyLevel, string> = {
  1: 'Asequible: el dato principal del articulo, redactado sin rodeos. Quien se ha leido el tema una vez debe acertarla.',
  2: 'Media: detalles, plazos y excepciones. Exige haber estudiado el tema, no solo leido.',
  3: 'Alta: matices finos, supuestos limite y distinciones entre articulos parecidos. Las tres opciones deben ser defendibles a primera vista.',
};

/**
 * Fila de `question_bank` tal y como llega de Supabase.
 * Todo opcional a proposito: el mapeo tiene que sobrevivir a una fila incompleta.
 */
export type BankRow = {
  id: string;
  subject_id?: number | null;
  question_text?: string;
  options?: unknown;
  correct_index?: number;
  explanation?: string;
  origin?: Question['origin'];
};

/** Fila de `question_bank` -> pregunta de UI. */
export function mapBankRowToQuestion(row: BankRow): Question {
  const opts: QuestionOption[] = Array.isArray(row.options)
    ? row.options.map((text: unknown, idx: number) => ({
        id: indexToOptionId(idx),
        text: typeof text === 'string' ? text : JSON.stringify(text),
      }))
    : [];

  return {
    id: row.id,
    subject_id: row.subject_id ?? null,
    question: row.question_text ?? '',
    options: opts,
    correctOptionId: indexToOptionId(row.correct_index as number),
    explanation: row.explanation ?? '',
    userAnswer: null,
    errorType: null,
    origin: row.origin || 'bank',
  };
}

/** Pregunta recien generada, en el formato que devuelve `generateAndSaveCandidate`. */
export type CandidateRow = {
  id: string | null;
  subject_id?: number | null;
  question?: string;
  question_text?: string;
  options?: unknown;
  correct_index?: number;
  correctIndex?: number;
  correctOptionId?: string;
  explanation?: string;
};

/** Respuesta de la IA en vivo -> pregunta de UI. */
export function mapCandidateToQuestion(data: CandidateRow): Question {
  let formattedOptions: QuestionOption[];

  const raw = Array.isArray(data.options) ? data.options : [];
  if (raw.length > 0 && typeof raw[0] === 'object' && raw[0] !== null) {
    // Ya viene en el formato de la UI.
    formattedOptions = raw as QuestionOption[];
  } else {
    formattedOptions = raw.map((text, idx) => ({
      id: indexToOptionId(idx),
      text: typeof text === 'string' ? text : JSON.stringify(text),
    }));
  }

  return {
    id: data.id,
    subject_id: data.subject_id ?? null,
    question: data.question || data.question_text || '',
    options: formattedOptions,
    correctOptionId: data.correctOptionId || indexToOptionId((data.correct_index ?? data.correctIndex) as number),
    explanation: data.explanation ?? '',
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

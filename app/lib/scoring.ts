/**
 * La nota de un examen, con la penalizacion de la convocatoria.
 *
 * POR QUE EXISTE ESTE FICHERO
 * Hasta hoy el «Simulacro real» calculaba `aciertos / total` y ya esta. En la
 * oposicion a Policia Nacional los fallos RESTAN, asi que la nota que daba la
 * plataforma mentia, y mentia HACIA ARRIBA: un aspirante podia acertar 60 de
 * 100 y llegar al examen creyendo que iba aprobado.
 *
 * Y hay un efecto de segundo orden peor que el numero: como no penalizaba,
 * contestar a todo siempre salia a cuenta. En el examen real no. La plataforma
 * no solo daba mal la nota, es que enseñaba una estrategia equivocada.
 *
 * Vive en `app/lib/` y no dentro de un componente porque es aritmetica que se
 * le enseña al alumno (regla 8): numerador y denominador de la misma muestra, y
 * "sin datos" distinguido de "cero".
 */

/**
 * Las reglas de correccion de una convocatoria.
 *
 * Es un objeto y no tres constantes sueltas porque la formula cambia entre
 * convocatorias y entre escalas. Que se pueda pasar otra es la unica forma de
 * que esto no haya que reescribirlo el dia que cambie el numero.
 */
export type ScoringRules = {
  /** Alternativas por pregunta. Es la `n` de la formula: el castigo se divide entre `n - 1`. */
  options: number;
  /** Sobre cuanto se puntua. La convocatoria usa 10. */
  scale: number;
  /** Minimo para superar la prueba, en la misma escala. */
  passMark: number;
  /**
   * Segundos por pregunta.
   *
   * Se guarda POR PREGUNTA y no como duracion total para que un simulacro de
   * 20 preguntas dure lo que duraria en el examen real, y no los 50 minutos
   * enteros. Es lo unico que hace comparable un simulacro corto.
   */
  secondsPerQuestion: number;
};

/**
 * Escala Basica del Cuerpo Nacional de Policia.
 *
 * FUENTE: Resolucion de 7 de julio de 2026 de la Direccion General de la
 * Policia (BOE-A-2026-15055), primera prueba, de conocimientos. Cuestionario de
 * 100 preguntas con 3 alternativas y 50 minutos; se corrige con
 *
 *     [A - E/(n-1)] * 10/P
 *
 * donde A son los aciertos, E los errores, `n` las alternativas y P el total de
 * preguntas. Minimo para superarla: 3 puntos.
 *
 * Con n = 3 sale la regla que todo opositor conoce: CADA DOS FALLOS SE PIERDE
 * UN ACIERTO. Las respuestas en blanco no aparecen en la formula, asi que no
 * restan — y por eso dejar en blanco es una decision, no un descuido.
 *
 * NO ESTA SACADO DE MEMORIA: el numero sale del BOE de la convocatoria. Si
 * cambia, se cambia aqui y no hay que tocar nada mas.
 */
export const CNP_SCORING: ScoringRules = {
  options: 3,
  scale: 10,
  passMark: 3,
  // 100 preguntas en 50 minutos: 30 segundos por pregunta. Del mismo BOE.
  secondsPerQuestion: 30,
};

/** Una pregunta terminada, en lo que hace falta para puntuarla. */
export type ScorableQuestion = {
  userAnswer?: string | null;
  correctOptionId: string;
};

export type ExamScore = {
  total: number;
  correct: number;
  /** Contestadas MAL. No incluye las que se dejaron en blanco. */
  wrong: number;
  /** Sin contestar. Ni suman ni restan. */
  blank: number;
  /**
   * Aciertos netos: `A - E/(n-1)`. PUEDE SER NEGATIVO, y se deja negativo a
   * proposito: es el numero que enseña que contestar a ciegas cuesta dinero.
   */
  net: number;
  /** La nota, sobre `scale`. Recortada a [0, scale]: nadie saca un -1,2. */
  score: number;
  /** El tanto por ciento de aciertos, SIN penalizar. Es lo que daba la plataforma antes. */
  rawPercentage: number;
  passed: boolean;
};

/** Dos decimales. Lo que publica un tribunal, no un float con quince cifras. */
function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Puntua un examen con la formula de la convocatoria.
 *
 * `P` es el numero de preguntas DE ESTE test, no las 100 de la convocatoria: un
 * simulacro de 20 preguntas se puntua sobre sus 20, que es lo que lo hace
 * comparable con el examen real.
 *
 * Sin preguntas devuelve ceros, no NaN: "sin datos" y "cero" no son lo mismo
 * para el alumno, y quien pinte esto tiene que poder distinguirlos mirando
 * `total`.
 */
export function scoreExam(
  questions: ScorableQuestion[],
  rules: ScoringRules = CNP_SCORING
): ExamScore {
  const total = questions.length;

  let correct = 0;
  let wrong = 0;
  let blank = 0;

  for (const q of questions) {
    // Una respuesta vacia es un BLANCO, no un fallo. Antes se calculaba
    // `wrong = total - correct`, asi que las que el alumno dejaba a proposito
    // sin contestar contaban como errores y le restaban.
    if (!q.userAnswer) blank++;
    else if (q.userAnswer === q.correctOptionId) correct++;
    else wrong++;
  }

  if (total === 0) {
    return { total: 0, correct: 0, wrong: 0, blank: 0, net: 0, score: 0, rawPercentage: 0, passed: false };
  }

  // `n - 1`. Con una sola alternativa no habria examen, pero dividir entre cero
  // convertiria la nota en -Infinity y la pintaria tal cual.
  const divisor = Math.max(1, rules.options - 1);
  const net = correct - wrong / divisor;

  const bruta = (net * rules.scale) / total;
  const score = redondear(Math.min(rules.scale, Math.max(0, bruta)));

  return {
    total,
    correct,
    wrong,
    blank,
    net: redondear(net),
    score,
    rawPercentage: Math.round((correct / total) * 100),
    passed: score >= rules.passMark,
  };
}

/**
 * Cuantos aciertos vale un fallo. Para decirselo al alumno con palabras.
 *
 * Con 3 alternativas devuelve 0,5: «cada dos fallos pierdes un acierto».
 */
export function penaltyPerError(rules: ScoringRules = CNP_SCORING): number {
  return redondear(1 / Math.max(1, rules.options - 1));
}

// ============================================================
// EL RELOJ DEL SIMULACRO
// ============================================================
//
// El «Simulacro real» decia tener cronometro, pero contaba HACIA ARRIBA y no
// terminaba nunca. Un simulacro sin reloj que corra hacia cero no es un
// simulacro: la mitad de la dificultad del examen es que el tiempo se acaba, y
// un opositor que solo ha practicado sin limite no sabe a que ritmo va.
//
// La aritmetica vive aqui y no dentro del componente por la regla 21, y porque
// es de las que se le enseñan al alumno (regla 8).

/**
 * Cuanto dura un simulacro de `questionCount` preguntas.
 *
 * Proporcional a la convocatoria, no un numero fijo: 30 s por pregunta salen de
 * las 100 preguntas en 50 minutos del BOE.
 */
export function examDurationSeconds(
  questionCount: number,
  rules: ScoringRules = CNP_SCORING
): number {
  const n = Number.isFinite(questionCount) ? Math.max(0, Math.floor(questionCount)) : 0;
  return n * Math.max(1, rules.secondsPerQuestion);
}

/**
 * Como de apurado va el alumno.
 *
 * Los umbrales son PORCENTAJES y no minutos fijos porque los simulacros van de
 * 5 preguntas a 100: avisar «quedan 5 minutos» en un test que dura 2:30 no
 * significa nada.
 */
export type ClockUrgency = 'calm' | 'warning' | 'critical';

const WARNING_AT = 0.2;
const CRITICAL_AT = 0.05;

export type ExamClock = {
  /** Segundos que quedan. Nunca negativo. */
  remaining: number;
  /** El tiempo se agoto: hay que entregar. */
  expired: boolean;
  urgency: ClockUrgency;
  /** 0-100, lo consumido. Para pintar la barra. */
  percentUsed: number;
};

/**
 * Estado del reloj a partir de marcas de tiempo, NO de contar intervalos.
 *
 * Un `setInterval(1000)` se retrasa con la pestania en segundo plano y con el
 * ahorro de bateria (regla 14). En un simulacro de 50 minutos ese desfase le
 * regalaria minutos al alumno, y aqui el tiempo es justamente lo que se mide.
 * El intervalo solo decide cada cuanto se repinta.
 *
 * Sin limite (`durationSeconds <= 0`) devuelve un reloj que nunca expira: es lo
 * que usa el modo entrenamiento, donde correr no aporta nada.
 */
export function examClock(durationSeconds: number, elapsedSeconds: number): ExamClock {
  const total = Number.isFinite(durationSeconds) ? Math.floor(durationSeconds) : 0;
  const gastado = Number.isFinite(elapsedSeconds) ? Math.max(0, Math.floor(elapsedSeconds)) : 0;

  if (total <= 0) {
    return { remaining: 0, expired: false, urgency: 'calm', percentUsed: 0 };
  }

  const remaining = Math.max(0, total - gastado);
  const fraccion = remaining / total;

  return {
    remaining,
    expired: remaining === 0,
    // El orden importa: expirado ya es critico, y `<= CRITICAL_AT` lo cubre.
    urgency: fraccion <= CRITICAL_AT ? 'critical' : fraccion <= WARNING_AT ? 'warning' : 'calm',
    percentUsed: Math.min(100, Math.round((gastado / total) * 100)),
  };
}

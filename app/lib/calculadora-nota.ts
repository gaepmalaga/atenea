/**
 * LA CALCULADORA DE NOTA del alumno: aciertos y fallos → nota.
 *
 * Es una herramienta suelta, no guarda nada. Sirve para un examen en papel que
 * se hace en casa, para hacerse una idea antes de teclear todas las respuestas,
 * y para ver cuánto resta un fallo. NO sustituye a meter las respuestas de un
 * examen en clase: de una nota suelta no se puede saber qué preguntas se
 * fallan, y un número escrito a mano no lo puede comprobar nadie (regla 110).
 *
 * MÓDULO PURO (regla 21). La fórmula NO se reescribe aquí: se llama a
 * `scoreExam` (regla 22), con las alternativas que se pidan.
 */

import { CNP_SCORING, penaltyPerError, scoreExam, type ScoringRules } from './scoring';

export const MAX_PREGUNTAS_CALCULADORA = 500;
export const PREGUNTAS_OFICIAL = 100;

export type EntradaCalculadora = { preguntas: unknown; aciertos: unknown; fallos: unknown; alternativas: unknown };

export type ResultadoCalculadora =
  | { estado: 'vacio' }
  | { estado: 'error'; error: string }
  | {
      estado: 'ok';
      /** 0-10, con dos decimales, sin bajar de 0. */
      nota: number;
      /** Aciertos menos lo que restan los fallos; puede ser negativo. */
      neto: number;
      blancos: number;
      /** Aciertos que resta cada fallo (0,5 con 3 alternativas). */
      porFallo: number;
      /** Porcentaje de aciertos, sin penalizar. */
      sinPenalizar: number;
      /** `true` si la penalización la dejó en 0: sin esto el alumno vería 0 sin saber por qué. */
      seQuedaEnCero: boolean;
      /** Solo con las alternativas de la convocatoria; con otras no hay «aprobado». */
      aprobado: boolean | null;
      minimo: number;
    };

const vacio = (v: unknown) => v === null || v === undefined || String(v).trim() === '';
function entero(v: unknown): number | null {
  if (vacio(v)) return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isInteger(n) ? n : null;
}

export function calculaNota(e: EntradaCalculadora): ResultadoCalculadora {
  // Mientras falte algo por escribir no es un error: es que aún no ha terminado.
  if (vacio(e.preguntas) || vacio(e.aciertos) || vacio(e.fallos)) return { estado: 'vacio' };

  const preguntas = entero(e.preguntas);
  const aciertos = entero(e.aciertos);
  const fallos = entero(e.fallos);
  const alternativas = vacio(e.alternativas) ? CNP_SCORING.options : entero(e.alternativas);

  if (preguntas === null || preguntas < 1 || preguntas > MAX_PREGUNTAS_CALCULADORA) {
    return { estado: 'error', error: `Las preguntas van de 1 a ${MAX_PREGUNTAS_CALCULADORA}.` };
  }
  if (aciertos === null || aciertos < 0) return { estado: 'error', error: 'Los aciertos son un número entero, desde 0.' };
  if (fallos === null || fallos < 0) return { estado: 'error', error: 'Los fallos son un número entero, desde 0.' };
  if (alternativas === null || alternativas < 2 || alternativas > 6) return { estado: 'error', error: 'Las alternativas van de 2 a 6.' };
  if (aciertos + fallos > preguntas) {
    return { estado: 'error', error: `Aciertos y fallos suman ${aciertos + fallos}, más que las ${preguntas} preguntas del examen.` };
  }

  const reglas: ScoringRules = { ...CNP_SCORING, options: alternativas };
  const hechas = [
    ...Array.from({ length: aciertos }, () => ({ userAnswer: 'a', correctOptionId: 'a' })),
    ...Array.from({ length: fallos }, () => ({ userAnswer: 'b', correctOptionId: 'a' })),
    ...Array.from({ length: preguntas - aciertos - fallos }, () => ({ userAnswer: null, correctOptionId: 'a' })),
  ];
  const s = scoreExam(hechas, reglas);
  return {
    estado: 'ok',
    nota: s.score,
    neto: s.net,
    blancos: s.blank,
    porFallo: penaltyPerError(reglas),
    sinPenalizar: s.rawPercentage,
    seQuedaEnCero: s.net < 0,
    aprobado: alternativas === CNP_SCORING.options ? s.passed : null,
    minimo: CNP_SCORING.passMark,
  };
}

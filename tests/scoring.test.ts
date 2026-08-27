import { describe, it, expect } from 'vitest';
import { scoreExam, penaltyPerError, CNP_SCORING, type ScorableQuestion } from '../app/lib/scoring';

/**
 * LA NOTA DEL SIMULACRO MENTIA, Y MENTIA HACIA ARRIBA
 *
 * `scoreExam` calculaba `aciertos / total`. En la oposicion a Policia Nacional
 * los fallos restan: [A - E/(n-1)] * 10/P (BOE-A-2026-15055, primera prueba).
 * Un aspirante que acertaba 60 de 100 veia un 60 % y podia llegar al examen
 * creyendo que iba aprobado, cuando su nota real es un 4.
 *
 * Es el peor fallo posible en una plataforma de oposiciones porque no se nota
 * hasta que ya no tiene remedio.
 */

/** Atajos para escribir tests legibles: A acierto, F fallo, B blanco. */
const A: ScorableQuestion = { userAnswer: 'a', correctOptionId: 'a' };
const F: ScorableQuestion = { userAnswer: 'b', correctOptionId: 'a' };
const B: ScorableQuestion = { userAnswer: null, correctOptionId: 'a' };
const veces = (q: ScorableQuestion, n: number) => Array.from({ length: n }, () => q);

describe('scoreExam · la formula de la convocatoria', () => {
  it('cada dos fallos se pierde un acierto', () => {
    // n = 3, asi que E/(n-1) = E/2.
    const r = scoreExam([...veces(A, 10), ...veces(F, 4)]);
    expect(r.correct).toBe(10);
    expect(r.wrong).toBe(4);
    expect(r.net).toBe(8); // 10 - 4/2
  });

  it('el caso que hacia falta arreglar: 60 aciertos y 40 fallos NO son un 6', () => {
    const r = scoreExam([...veces(A, 60), ...veces(F, 40)]);
    // 60 - 40/2 = 40 netos sobre 100 -> 4 puntos, no 6.
    expect(r.net).toBe(40);
    expect(r.score).toBe(4);
    // Y el dato viejo sigue disponible, para poder enseñar la diferencia.
    expect(r.rawPercentage).toBe(60);
  });

  it('el examen entero acertado es la nota maxima', () => {
    expect(scoreExam(veces(A, 100)).score).toBe(10);
  });

  it('la nota se calcula sobre las preguntas DE ESTE test, no sobre 100', () => {
    // Un simulacro de 20 preguntas se puntua sobre sus 20: es lo que lo hace
    // comparable con el examen real.
    const r = scoreExam([...veces(A, 15), ...veces(F, 5)]);
    expect(r.net).toBe(12.5); // 15 - 5/2
    expect(r.score).toBe(6.25); // 12.5 * 10 / 20
  });
});

describe('scoreExam · el blanco no es un fallo', () => {
  it('las preguntas sin contestar no restan', () => {
    // Antes se calculaba `wrong = total - correct`, asi que un blanco contaba
    // como error. Con penalizacion eso le restaba nota al alumno por NO
    // arriesgar, que es justo lo contrario de lo que dice la convocatoria.
    const r = scoreExam([...veces(A, 10), ...veces(B, 10)]);
    expect(r.correct).toBe(10);
    expect(r.wrong).toBe(0);
    expect(r.blank).toBe(10);
    expect(r.net).toBe(10);
    expect(r.score).toBe(5);
  });

  it('dejar en blanco puntua MAS que fallar', () => {
    // Es la estrategia que la plataforma no enseñaba: sin penalizacion,
    // contestar a todo siempre salia a cuenta.
    const enBlanco = scoreExam([...veces(A, 10), ...veces(B, 10)]);
    const contestando = scoreExam([...veces(A, 10), ...veces(F, 10)]);
    expect(enBlanco.score).toBeGreaterThan(contestando.score);
  });

  it('aciertos, fallos y blancos suman el total', () => {
    const r = scoreExam([...veces(A, 3), ...veces(F, 4), ...veces(B, 5)]);
    expect(r.correct + r.wrong + r.blank).toBe(r.total);
  });
});

describe('scoreExam · los bordes', () => {
  it('sin preguntas devuelve ceros, no NaN', () => {
    const r = scoreExam([]);
    expect(r.total).toBe(0);
    expect(r.score).toBe(0);
    expect(r.rawPercentage).toBe(0);
    expect(r.passed).toBe(false);
  });

  it('los netos pueden ser negativos, y se dejan negativos', () => {
    // Es el numero que enseña que contestar a ciegas cuesta dinero. La NOTA se
    // recorta a 0 —nadie saca un -1,2— pero el neto se enseña tal cual.
    const r = scoreExam([...veces(A, 2), ...veces(F, 18)]);
    expect(r.net).toBe(-7); // 2 - 18/2
    expect(r.score).toBe(0);
  });

  it('con una sola alternativa no divide entre cero', () => {
    // No hay examen asi, pero -Infinity se pintaria tal cual en pantalla.
    const r = scoreExam([...veces(A, 5), ...veces(F, 5)], { options: 1, scale: 10, passMark: 3 });
    expect(Number.isFinite(r.net)).toBe(true);
    expect(Number.isFinite(r.score)).toBe(true);
  });

  it('la nota se redondea a dos decimales, como la publica un tribunal', () => {
    const r = scoreExam([...veces(A, 1), ...veces(F, 2)]);
    expect(r.score).toBe(0); // 1 - 1 = 0 netos
    const otro = scoreExam([...veces(A, 2), ...veces(F, 1)]);
    expect(otro.net).toBe(1.5);
    expect(otro.score).toBe(5); // 1.5 * 10 / 3
  });
});

describe('el aprobado sale de las reglas, no de un 50 % inventado', () => {
  it('el minimo de la convocatoria es 3, no 5', () => {
    expect(CNP_SCORING.passMark).toBe(3);
    // 40 aciertos y 20 fallos sobre 100: 30 netos -> 3 puntos justos.
    expect(scoreExam([...veces(A, 40), ...veces(F, 20), ...veces(B, 40)]).passed).toBe(true);
    expect(scoreExam([...veces(A, 39), ...veces(F, 20), ...veces(B, 41)]).passed).toBe(false);
  });

  it('otra convocatoria se pasa por parametro, no se reescribe la funcion', () => {
    // Con 4 alternativas cada tres fallos se pierde un acierto.
    const r = scoreExam([...veces(A, 10), ...veces(F, 3)], { options: 4, scale: 10, passMark: 5 });
    expect(r.net).toBe(9); // 10 - 3/3
  });
});

describe('penaltyPerError', () => {
  it('con tres alternativas, medio acierto por fallo', () => {
    expect(penaltyPerError()).toBe(0.5);
  });

  it('con cuatro, un tercio', () => {
    expect(penaltyPerError({ options: 4, scale: 10, passMark: 5 })).toBe(0.33);
  });
});

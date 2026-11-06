/**
 * LAS DUDOSAS: cuánto acierta el alumno en lo que contesta dudando.
 *
 * Lo pidió una academia (nov 2026): que el alumno marque las preguntas en las
 * que duda y que la plataforma calcule su tasa de acierto en ellas. No es un
 * dato de adorno. Con la fórmula del BOE (regla 22) cada fallo resta
 * `1/(n-1)` aciertos, así que contestar una pregunta compensa solo si se
 * acierta con probabilidad mayor que `1/n` — con tres opciones, más de 1 de
 * cada 3, que es exactamente lo que daría contestar al azar. La tasa de
 * acierto en las dudosas responde a la pregunta que se hace todo opositor en
 * el examen: «¿contesto las que dudo o las dejo en blanco?».
 *
 * EN QUÉ SE DIFERENCIA DE LO QUE SE RETIRÓ (regla 56). En septiembre se quitó
 * una marca de confianza de tres niveles que se pedía en CADA pregunta y
 * bloqueaba el avance. Esto es un solo toque, OPCIONAL, que no bloquea nada.
 * Y la marca cambia una decisión real (contestar o no las dudosas), que es la
 * condición de la regla 56 para preguntar.
 *
 * DÓNDE SE GUARDA. En `question_attempts.confidence`, que ya existía (P10b) y
 * no se escribía: sin SQL. Desde que existe la marca, CADA respuesta lleva
 * uno de estos valores, así que el denominador está limpio:
 *
 *     1     dudosa (la marcó)
 *     2     no la marcó como dudosa
 *     null  no se ofrecía la marca (histórico)
 *
 * Las filas de P10b (6-7 sep) traen también un 0 («a ciegas»): se lee como
 * dudosa, que es lo que era.
 *
 * Un BLANCO marcado como dudosa se guarda con 1 —«la dudé y no arriesgué» es
 * justo lo que interesa contar—; un blanco sin marcar se queda en `null`: no
 * hubo respuesta de la que decir si se dudó.
 *
 * Módulo PURO (regla 21).
 */

import { isBlankAnswer, BLANK_INDEX, DUDA, confianzaDeDuda } from './exam-results.ts';
import { CNP_SCORING, type ScoringRules } from './scoring.ts';

// La traducción marca → columna vive en el contrato cliente↔servidor (regla 6),
// que es quien la escribe; aquí se reexporta para quien solo lee.
export { DUDA, confianzaDeDuda };

/**
 * Por debajo de esto no se dice si compensa contestar las dudosas: con cuatro
 * dudosas, acertar dos es un 50 % y no significa nada. Se enseñan los números,
 * pero sin veredicto (regla 8: «poco dato» no es lo mismo que «no compensa»).
 */
export const MIN_DUDOSAS_PARA_VEREDICTO = 10;

/** `true` dudosa · `false` no dudosa · `null` no se sabe (no se ofrecía la marca). */
export function esDudosa(confidence: number | null | undefined): boolean | null {
  if (confidence === 0 || confidence === 1) return true;
  if (confidence === 2) return false;
  return null;
}

/** La probabilidad de acierto a partir de la cual contestar compensa: `1/n`. */
export function umbralDeAcierto(reglas: ScoringRules = CNP_SCORING): number {
  return 1 / reglas.options;
}

export type IntentoConDuda = {
  is_correct?: boolean | null;
  selected_index?: number | null;
  confidence?: number | null;
};

export type GrupoAcierto = {
  contestadas: number;
  aciertos: number;
  /** Sobre las contestadas; `null` si no hay ninguna (regla 8). */
  acierto: number | null;
};

export type ResumenDudosas = {
  /** `true` si ninguna respuesta trae la marca: aún no hay nada que contar. */
  sinDatos: boolean;
  /** Dudosas en total: contestadas + dejadas en blanco. */
  marcadas: number;
  contestadas: number;
  aciertos: number;
  fallos: number;
  /** Las que marcó como dudosas y decidió no contestar. */
  enBlanco: number;
  /** Acierto en las dudosas CONTESTADAS. `null` si no contestó ninguna. */
  acierto: number | null;
  /**
   * Aciertos netos que le han dado las dudosas: `A − F/(n−1)`. Negativo =
   * contestarlas le ha RESTADO; habría puntuado más dejándolas en blanco.
   */
  netoAciertos: number;
  /** El `1/n` de la convocatoria, para decirlo en pantalla. */
  umbral: number;
  /**
   * ¿Le compensa contestar las dudosas? `null` con menos de
   * `MIN_DUDOSAS_PARA_VEREDICTO` contestadas: pocas para concluir.
   */
  compensa: boolean | null;
  /** Lo mismo en las que contestó sin marcarlas, para comparar. */
  noDudosas: GrupoAcierto;
};

function porcentaje(aciertos: number, total: number): number | null {
  return total > 0 ? Math.round((aciertos / total) * 1000) / 10 : null;
}

function redondea(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Agrega la marca de duda de un conjunto de respuestas: un simulacro, una
 * sesión o todo el histórico de un alumno.
 */
export function resumeDudosas(
  intentos: IntentoConDuda[],
  opciones: { reglas?: ScoringRules; minParaVeredicto?: number } = {},
): ResumenDudosas {
  const reglas = opciones.reglas ?? CNP_SCORING;
  const minimo = opciones.minParaVeredicto ?? MIN_DUDOSAS_PARA_VEREDICTO;

  let conMarca = 0;
  let contestadas = 0;
  let aciertos = 0;
  let enBlanco = 0;
  let noContestadas = 0;
  let noAciertos = 0;

  for (const it of intentos ?? []) {
    const duda = esDudosa(it.confidence);
    if (duda === null) continue;
    conMarca++;

    const blanco = isBlankAnswer(it.selected_index);
    if (duda) {
      if (blanco) { enBlanco++; continue; }
      contestadas++;
      if (it.is_correct) aciertos++;
    } else {
      if (blanco) continue;
      noContestadas++;
      if (it.is_correct) noAciertos++;
    }
  }

  const fallos = contestadas - aciertos;
  const umbral = umbralDeAcierto(reglas);
  const tasa = contestadas > 0 ? aciertos / contestadas : null;

  return {
    sinDatos: conMarca === 0,
    marcadas: contestadas + enBlanco,
    contestadas,
    aciertos,
    fallos,
    enBlanco,
    acierto: porcentaje(aciertos, contestadas),
    netoAciertos: redondea(aciertos - fallos / (reglas.options - 1)),
    umbral,
    compensa: tasa !== null && contestadas >= minimo ? tasa > umbral : null,
    noDudosas: {
      contestadas: noContestadas,
      aciertos: noAciertos,
      acierto: porcentaje(noAciertos, noContestadas),
    },
  };
}

/**
 * «33 %» — el umbral dicho como lo dice un opositor. Con espacio DURO: con uno
 * normal, el «%» se quedaba solo en la línea de abajo en un móvil.
 */
export function umbralEnTexto(umbral: number): string {
  return `${Math.round(umbral * 100)}\u00a0%`;
}

/** «30,8 %», con coma y espacio duro. `—` si no hay dato (regla 8). */
export function porcentajeEnTexto(pct: number | null): string {
  return pct === null ? '—' : `${pct.toLocaleString('es-ES', { maximumFractionDigits: 1 })}\u00a0%`;
}

/** «+2» / «−0,5» / «0»: los aciertos netos con su signo y coma decimal. */
export function netoEnTexto(neto: number): string {
  const abs = Math.abs(neto).toLocaleString('es-ES', { maximumFractionDigits: 2 });
  return neto > 0 ? `+${abs}` : neto < 0 ? `\u2212${abs}` : '0';
}

/**
 * Una frase con el veredicto. `null` si no hay nada que decir todavía.
 *
 * `persona`: `'alumno'` le habla a él («aciertas»); `'profesor'` habla de él
 * («acierta»), para la ficha del panel. Es la misma cuenta: dos textos
 * escritos enteros, no uno retocado con `replace`.
 */
export function fraseDudosas(r: ResumenDudosas, persona: 'alumno' | 'profesor' = 'alumno'): string | null {
  if (r.sinDatos || r.marcadas === 0) return null;
  const de = Math.round(1 / r.umbral);
  const tu = persona === 'alumno';

  if (r.contestadas === 0) {
    return tu
      ? `Has dejado en blanco las ${r.marcadas} que dudaste: aún no sabemos si te compensaría contestarlas.`
      : `Ha dejado en blanco las ${r.marcadas} que dudó: aún no se sabe si le compensaría contestarlas.`;
  }
  if (r.compensa === null) {
    return tu
      ? `Llevas ${r.contestadas} dudosas contestadas. Con ${MIN_DUDOSAS_PARA_VEREDICTO} ya podremos decirte si te compensa contestarlas.`
      : `Lleva ${r.contestadas} dudosas contestadas. Con ${MIN_DUDOSAS_PARA_VEREDICTO} se podrá decir si le compensa contestarlas.`;
  }
  if (r.compensa) {
    return tu
      ? `Aciertas más de 1 de cada ${de} de las que dudas: te compensa contestarlas.`
      : `Acierta más de 1 de cada ${de} de las que duda: le compensa contestarlas.`;
  }
  return tu
    ? `Aciertas menos de 1 de cada ${de} de las que dudas: te saldría mejor dejarlas en blanco.`
    : `Acierta menos de 1 de cada ${de} de las que duda: le saldría mejor dejarlas en blanco.`;
}

/** Lo mínimo de una pregunta terminada para contar sus dudas en pantalla. */
export type PreguntaConDuda = {
  userAnswer?: string | null;
  correctOptionId: string;
  dudosa?: boolean;
};

/**
 * Las preguntas de un test recién terminado, como filas de intento. Es lo que
 * usa la pantalla de resultados, que tiene las preguntas y no las filas: así
 * cuenta exactamente lo que se acaba de guardar (`confianzaDeDuda`, la misma
 * traducción que `buildExamResults`).
 */
export function intentosDePreguntas(preguntas: PreguntaConDuda[]): IntentoConDuda[] {
  return (preguntas ?? []).map((q) => {
    const enBlanco = !q.userAnswer;
    return {
      is_correct: !enBlanco && q.userAnswer === q.correctOptionId,
      // Solo importa distinguir el blanco: el índice exacto no entra en la cuenta.
      selected_index: enBlanco ? BLANK_INDEX : 0,
      confidence: confianzaDeDuda(q.dudosa, enBlanco),
    };
  });
}

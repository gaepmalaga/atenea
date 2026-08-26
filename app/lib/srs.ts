/**
 * Logica de repeticion espaciada (Leitner) usada por las flashcards.
 * Modulo puro: se puede testear sin tocar la base de datos.
 */

export type SrsRating = 'fail' | 'hard' | 'easy';

export type SrsSchedule = {
  /** Caja de Leitner resultante (1..MAX_BOX). */
  box: number;
  /** Dias hasta el proximo repaso. */
  days: number;
};

/**
 * Intervalo de repaso de cada caja, en dias. El indice es `box - 1`.
 *
 * El intervalo depende SOLO de la caja. Antes se calculaba aparte para cada
 * valoracion, y por eso "Duda" y "Bien" acababan dando el mismo resultado.
 */
export const BOX_INTERVALS = [1, 3, 7, 15, 30] as const;

export const MAX_BOX = BOX_INTERVALS.length;

/** Dias de repaso de una caja, acotando por si llega un valor fuera de rango. */
export function intervalForBox(box: number): number {
  const safe = Math.min(Math.max(1, Math.round(box)), MAX_BOX);
  return BOX_INTERVALS[safe - 1];
}

/**
 * Calcula la siguiente caja y el intervalo de repaso.
 *
 * - `fail`  -> vuelta a la caja 1: la tarjeta no se sabe.
 * - `hard`  -> BAJA una caja. Es lo que arregla las tres rarezas que tenia la
 *              version anterior, en la que "Duda" no movia de caja:
 *              a) desde la caja 1, "Duda" daba los mismos 3 dias que "Bien",
 *                 asi que las dos valoraciones eran indistinguibles;
 *              b) contestar siempre "Duda" dejaba la tarjeta atascada de por
 *                 vida en la misma caja;
 *              c) desde la caja 5 acortaba a 3 dias pero mantenia la caja, asi
 *                 que el siguiente "Bien" saltaba de golpe a 30 dias.
 * - `easy`  -> sube una caja, hasta el techo.
 */
export function scheduleCard(currentBox: number | undefined, rating: SrsRating): SrsSchedule {
  const from = Math.min(Math.max(1, Math.round(currentBox || 1)), MAX_BOX);

  let box: number;
  if (rating === 'fail') box = 1;
  else if (rating === 'hard') box = Math.max(1, from - 1);
  else box = Math.min(MAX_BOX, from + 1);

  return { box, days: intervalForBox(box) };
}

/** Fecha del proximo repaso a partir de una fecha base. */
export function nextReviewDate(from: Date, days: number): Date {
  const next = new Date(from.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

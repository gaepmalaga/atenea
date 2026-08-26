/**
 * Logica de repeticion espaciada (Leitner) usada por las flashcards.
 * Extraida de app/actions/flashcards.ts para poder testearla sin tocar la BD.
 */

export type SrsRating = 'fail' | 'hard' | 'easy';

export type SrsSchedule = {
  /** Caja de Leitner resultante (1..5). */
  box: number;
  /** Dias hasta el proximo repaso. */
  days: number;
};

export const MAX_BOX = 5;

/**
 * Calcula la siguiente caja y el intervalo de repaso.
 *
 * Replica el comportamiento actual de `saveFlashcardProgress`. Ojo a dos
 * rarezas conocidas y pendientes de decision (ver PLAN, Fase 4):
 *  - 'hard' NO mueve de caja y siempre da 3 dias, igual que un 'easy' desde
 *    la caja 1, asi que "Duda" y "Bien" son indistinguibles al principio.
 *  - 'fail' devuelve siempre a la caja 1, sin penalizacion progresiva.
 */
export function scheduleCard(currentBox: number | undefined, rating: SrsRating): SrsSchedule {
  let box = currentBox || 1;
  let days = 0;

  if (rating === 'fail') {
    box = 1;
    days = 1;
  } else if (rating === 'hard') {
    days = 3;
  } else {
    box = Math.min(box + 1, MAX_BOX);
    days = box === 2 ? 3 : box === 3 ? 7 : box === 4 ? 15 : 30;
  }

  return { box, days };
}

/** Fecha del proximo repaso a partir de una fecha base. */
export function nextReviewDate(from: Date, days: number): Date {
  const next = new Date(from.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

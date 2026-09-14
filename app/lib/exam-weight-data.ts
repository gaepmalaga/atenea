/**
 * PESO REAL DE CADA TEMA — GENERADO, NO SE EDITA A MANO.
 *
 * Cuántas preguntas de los 5 exámenes oficiales reales (2021-2025, regla 72)
 * caen en cada tema del temario (1-45), contadas con `extraeTemasDeExamenReal`
 * (`app/lib/exam-weights.ts`) sobre el texto ya indexado de cada documento.
 * Es un dato histórico y no cambia salvo que se añada una convocatoria nueva.
 *
 * Regenerar: node --experimental-strip-types scripts/operacion/calcular-pesos-examenes.mjs
 * Generado: 2026-09-14. Total: 497 preguntas de 5 exámenes.
 */

/** topic_number (1-45) -> cuántas preguntas reales de 2021-2025 le tocaron. */
export const PESO_EXAMEN_REAL: Record<number, number> = {
  1: 20,
  2: 7,
  3: 32,
  4: 16,
  5: 10,
  6: 25,
  7: 11,
  8: 27,
  9: 13,
  10: 18,
  11: 6,
  12: 11,
  13: 13,
  14: 20,
  15: 9,
  16: 16,
  17: 16,
  18: 14,
  19: 10,
  20: 8,
  21: 18,
  22: 11,
  23: 10,
  24: 5,
  25: 7,
  26: 12,
  27: 8,
  28: 6,
  29: 9,
  30: 1,
  31: 4,
  32: 6,
  33: 4,
  34: 4,
  35: 11,
  36: 5,
  37: 5,
  38: 6,
  39: 7,
  40: 14,
  41: 16,
  42: 13,
  43: 6,
  44: 3,
  45: 4,
};

export const TOTAL_PREGUNTAS_REALES = 497;

/**
 * LOS TEMAS CUYO TEMARIO NO ES TEXTO DE UNA LEY (regla 145).
 *
 * El repaso contra el BOE (`verificacion.ts`) solo puede comparar una pregunta
 * con un artículo. Los temas de ciencias sociales y técnico-científicas (27 a 45,
 * menos el 42 y el 43, que llevan norma) y los apuntes propios de los temas 4 y
 * 24 no tienen artículo detrás: sus preguntas no llevan referencia legal y no
 * pueden compararse con ninguna ley. Se comprueban contra los APUNTES.
 *
 * MÓDULO PURO (regla 21).
 */

/** Temas jurídicos cuyo temario es un apunte propio y no el texto de la ley (`docs/TEMARIO.md`). */
export const TEMAS_DE_APUNTES = [4, 24] as const;
/** Temas del final que SÍ llevan una norma detrás (armas de fuego, vehículos…). */
export const TEMAS_TECNICOS_CON_NORMA = [42, 43] as const;

export function temaSinLegislacion(numero: number | null | undefined): boolean {
  if (numero === null || numero === undefined || !Number.isInteger(numero)) return false;
  if ((TEMAS_DE_APUNTES as readonly number[]).includes(numero)) return true;
  return numero >= 27 && numero <= 45 && !(TEMAS_TECNICOS_CON_NORMA as readonly number[]).includes(numero);
}

/**
 * EL «ACIERTO DE ESTA SESIÓN» del entrenamiento y cómo va la tendencia
 * (regla 126; el entrenamiento sigue SIN nota, regla 59).
 *
 * La nota con penalización solo vale en el simulacro: en el entrenamiento el
 * motor elige preguntas a tu medida, sin reloj, y esa nota dependería de lo
 * fácil que te lo puso. Lo que sí es honesto es el porcentaje de lo contestado
 * y compararlo con cómo venías respondiendo.
 *
 * MÓDULO PURO (regla 21).
 */

/** Cuánta historia hace falta para comparar: con menos, una racha mala parecería una tendencia. */
export const MIN_PARA_TENDENCIA = 30;
/** Menos de esto de diferencia (en puntos de porcentaje) se dice «igual»: es ruido. */
export const MARGEN_IGUAL = 3;
/** Los días de historia con los que se compara. */
export const DIAS_TENDENCIA = 30;
/** Lo que queda fuera de la historia: lo de la propia sesión, que ya está guardado. */
export const HORAS_DE_LA_SESION = 3;

export type Acierto = { acertadas: number; contestadas: number };

/** Porcentaje entero de lo contestado, o `null` si no contestó nada (regla 16: sin datos no es 0). */
export function porcentaje(a: Acierto): number | null {
  return a.contestadas > 0 ? Math.round((a.acertadas / a.contestadas) * 100) : null;
}

export type Tendencia = {
  /** El de esta sesión. */
  actual: number;
  /** El de los últimos días; `null` si no hay historia suficiente. */
  habitual: number | null;
  rumbo: 'sube' | 'baja' | 'igual' | null;
  /** Puntos de diferencia con lo habitual. */
  diferencia: number | null;
};

export function tendenciaDeSesion(sesion: Acierto, historia: Acierto | null): Tendencia | null {
  const actual = porcentaje(sesion);
  if (actual === null) return null;
  const habitual = historia && historia.contestadas >= MIN_PARA_TENDENCIA ? porcentaje(historia) : null;
  if (habitual === null) return { actual, habitual: null, rumbo: null, diferencia: null };
  const diferencia = actual - habitual;
  return {
    actual, habitual, diferencia,
    rumbo: Math.abs(diferencia) < MARGEN_IGUAL ? 'igual' : diferencia > 0 ? 'sube' : 'baja',
  };
}

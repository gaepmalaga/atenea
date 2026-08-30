/**
 * Agregacion de resultados de test. Modulo puro: sin BD y sin React, para poder
 * testear la aritmetica, que era justamente donde estaban los errores.
 */

import { isBlankAnswer } from './exam-results';

export type TestResultRow = {
  is_correct?: boolean | null;
  response_time_ms?: number | null;
  option_changes?: number | null;
  error_type?: string | null;
  created_at?: string | null;
  question_text?: string | null;
  topic?: string | null;
  /** Opcion marcada. `BLANK_INDEX` si la dejo en blanco a proposito. */
  selected_index?: number | null;
};

/**
 * Una fila del registro de actividad del panel de administracion.
 *
 * Es `TestResultRow` con lo que identifica la fila. El componente la tipaba
 * como `any[]` y pintaba `log.question_text`, que la tabla no guarda: siempre
 * salia "Pregunta sin texto" y nadie se entero, porque `any` no se queja.
 */
export type ActivityRow = TestResultRow & {
  id?: string | null;
  user_id?: string | null;
};

export const ERROR_TYPES = ['olvido', 'trampa', 'desconocimiento', 'fallo_procesamiento'] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];

export type StatsSummary = {
  /** Todas las filas: contestadas MAS las dejadas en blanco. */
  total: number;
  correct: number;
  /** Contestadas MAL. No incluye los blancos. */
  wrong: number;
  /** Dejadas en blanco a proposito. Ni suman ni restan. */
  blank: number;
  /** Las que el alumno llego a contestar. Es el denominador de `winRate`. */
  answered: number;
  /**
   * Porcentaje de acierto sobre las CONTESTADAS, no sobre el total.
   *
   * Antes dividia entre todas las filas, asi que dejar una en blanco bajaba el
   * porcentaje igual que fallarla. Con la penalizacion de la convocatoria eso
   * es al reves de lo que hay que enseñar: el blanco no resta, y una plataforma
   * que lo castiga empuja a contestar a ciegas.
   */
  winRate: number;
  /** Media de ms por respuesta, contando solo las que tienen tiempo medido. */
  avgTimeMs: number;
  /** Cuantas respuestas traen tiempo medido. 0 = no hay dato que mostrar. */
  timedCount: number;
  /**
   * 0-100. Media de cambios de opcion por pregunta, normalizada.
   *
   * El calculo anterior dividia los cambios de las 5 ultimas preguntas entre el
   * total de hasta 100: numerador y denominador venian de muestras distintas,
   * asi que el numero no significaba nada.
   */
  uncertaintyIndex: number;
  /** Cuantas respuestas traen el contador de cambios. */
  changesCount: number;
  /** Fallos por taxonomia, sobre el total de fallos etiquetados. */
  errorBreakdown: Record<ErrorType, number>;
  taggedErrors: number;
};

/**
 * Cambios de opcion a partir de los cuales se marca "dudo" en el historial.
 *
 * Desde la fase 2.3 `option_changes` cuenta cambios REALES de opcion (la primera
 * respuesta no cuenta). Con la semantica anterior, que contaba pulsaciones, el
 * umbral tenia que ser 2 para descartar la primera; ahora cualquier cambio ya
 * es una duda.
 */
export const HESITATION_THRESHOLD = 1;

/**
 * Cambios medios por pregunta que se consideran incertidumbre maxima (100%).
 *
 * Ajustado de 3 a 2 al cambiar la semantica: antes el minimo posible era 1
 * (la propia respuesta), ahora es 0. Cambiar dos veces de opcion en cada
 * pregunta ya es maxima inseguridad.
 */
const MAX_AVG_CHANGES = 2;

export function summarizeResults(rows: TestResultRow[]): StatsSummary {
  const total = rows.length;

  // Un blanco no es un fallo. La marca es `selected_index === BLANK_INDEX`; una
  // fila anterior a P3.4 trae null, que significa "no se sabe", y esas cuentan
  // como contestadas — que es lo que eran, porque hasta entonces no habia
  // manera de dejar una en blanco a proposito.
  const blank = rows.filter((r) => isBlankAnswer(r.selected_index)).length;
  const answered = total - blank;
  const correct = rows.filter((r) => r.is_correct).length;

  const timed = rows.filter((r) => typeof r.response_time_ms === 'number' && r.response_time_ms > 0);
  const withChanges = rows.filter((r) => typeof r.option_changes === 'number');

  const avgChanges = withChanges.length
    ? withChanges.reduce((acc, r) => acc + (r.option_changes ?? 0), 0) / withChanges.length
    : 0;

  const errorBreakdown = Object.fromEntries(ERROR_TYPES.map((t) => [t, 0])) as Record<ErrorType, number>;
  let taggedErrors = 0;
  for (const r of rows) {
    if (r.is_correct || isBlankAnswer(r.selected_index)) continue;
    const t = r.error_type as ErrorType | null | undefined;
    if (t && t in errorBreakdown) {
      errorBreakdown[t] += 1;
      taggedErrors += 1;
    }
  }

  return {
    total,
    correct,
    wrong: answered - correct,
    blank,
    answered,
    // Sin respuestas CONTESTADAS el porcentaje es 0, no NaN. Quien lo pinte
    // distingue "sin datos" de "cero" mirando `answered` (regla 8).
    winRate: answered === 0 ? 0 : Math.round((correct / answered) * 100),
    avgTimeMs: timed.length
      ? Math.round(timed.reduce((acc, r) => acc + (r.response_time_ms ?? 0), 0) / timed.length)
      : 0,
    timedCount: timed.length,
    uncertaintyIndex: Math.round(Math.min(100, (avgChanges / MAX_AVG_CHANGES) * 100)),
    changesCount: withChanges.length,
    errorBreakdown,
    taggedErrors,
  };
}

// ============================================================
// RANGOS
// ============================================================

export type Rank = {
  id: 'cadet' | 'officer' | 'subinspector' | 'inspector';
  label: string;
  /** Porcentaje de acierto minimo para alcanzarlo. */
  min: number;
};

export const RANKS: Rank[] = [
  { id: 'cadet', label: 'Cadete', min: 0 },
  { id: 'officer', label: 'Oficial', min: 40 },
  { id: 'subinspector', label: 'Subinspector', min: 70 },
  { id: 'inspector', label: 'Inspector Jefe', min: 90 },
];

export function rankFor(winRate: number): Rank {
  let current = RANKS[0];
  for (const r of RANKS) {
    if (winRate >= r.min) current = r;
  }
  return current;
}

export function nextRankAfter(rank: Rank): Rank | null {
  const idx = RANKS.findIndex((r) => r.id === rank.id);
  return RANKS[idx + 1] ?? null;
}

/**
 * Progreso 0-100 hacia el siguiente rango.
 *
 * El calculo anterior era `winRate / (min + 20)`, que no describia nada: en
 * rango Inspector (min 90) el denominador salia 110 y la barra nunca llegaba al
 * 100% ni estando al 100% de acierto.
 */
export function progressToNextRank(winRate: number): number {
  const current = rankFor(winRate);
  const next = nextRankAfter(current);
  if (!next) return 100; // rango maximo alcanzado
  const span = next.min - current.min;
  if (span <= 0) return 100;
  const done = ((winRate - current.min) / span) * 100;
  return Math.max(0, Math.min(100, Math.round(done)));
}

// ============================================================
// PERFIL FISICO
// ============================================================

// La forma del perfil y la lectura de las dominadas viven en `physical.ts`
// desde la fase 2.7: alli esta tambien la normalizacion que usa el servidor,
// y tener dos definiciones del mismo tipo fue justo lo que dejo al panel
// leyendo una ruta que no escribia nadie. Se reexportan para no romper a
// quien ya importaba desde aqui.
export {
  readMaxPullups,
  type PhysicalProfile,
  type BaselineMetrics,
} from './physical';

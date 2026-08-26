/**
 * Agregacion de resultados de test. Modulo puro: sin BD y sin React, para poder
 * testear la aritmetica, que era justamente donde estaban los errores.
 */

export type TestResultRow = {
  is_correct?: boolean | null;
  response_time_ms?: number | null;
  option_changes?: number | null;
  error_type?: string | null;
  created_at?: string | null;
  question_text?: string | null;
  topic?: string | null;
};

export const ERROR_TYPES = ['olvido', 'trampa', 'desconocimiento', 'fallo_procesamiento'] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];

export type StatsSummary = {
  total: number;
  correct: number;
  wrong: number;
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
  const correct = rows.filter((r) => r.is_correct).length;

  const timed = rows.filter((r) => typeof r.response_time_ms === 'number' && r.response_time_ms > 0);
  const withChanges = rows.filter((r) => typeof r.option_changes === 'number');

  const avgChanges = withChanges.length
    ? withChanges.reduce((acc, r) => acc + (r.option_changes ?? 0), 0) / withChanges.length
    : 0;

  const errorBreakdown = Object.fromEntries(ERROR_TYPES.map((t) => [t, 0])) as Record<ErrorType, number>;
  let taggedErrors = 0;
  for (const r of rows) {
    if (r.is_correct) continue;
    const t = r.error_type as ErrorType | null | undefined;
    if (t && t in errorBreakdown) {
      errorBreakdown[t] += 1;
      taggedErrors += 1;
    }
  }

  return {
    total,
    correct,
    wrong: total - correct,
    // Sin respuestas el porcentaje es 0, no NaN.
    winRate: total === 0 ? 0 : Math.round((correct / total) * 100),
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

export type PhysicalProfile = {
  baseline_metrics?: { pullups_score?: number | string | null; pullups?: number | string | null } | null;
  /** Ruta antigua, conservada por si hay filas historicas con ese formato. */
  baseline_test?: { pullups?: number | string | null } | null;
} | null | undefined;

/**
 * Maximo de dominadas del perfil fisico.
 *
 * `savePhysicalProfile` y `generateWeeklyPlan` escriben y leen
 * `baseline_metrics.pullups_score`, pero el panel leia
 * `baseline_test.pullups`, que no lo escribe nadie: el KPI marcaba siempre 0.
 * Se acepta la ruta antigua por si hubiera filas historicas con ese formato.
 * Unificar del todo es la fase 2.7.
 */
export function readMaxPullups(profile: PhysicalProfile): number | null {
  const candidates = [
    profile?.baseline_metrics?.pullups_score,
    profile?.baseline_metrics?.pullups,
    profile?.baseline_test?.pullups,
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

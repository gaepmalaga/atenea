/**
 * Plan semanal de entrenamiento: forma y normalizacion.
 *
 * El plan lo escribe Gemini y lo lee la UI, asi que es justo el tipo de payload
 * de la regla 6: sin un tipo compartido, un nombre de campo que no coincide no
 * lo detecta nadie. Y aqui pasaba: la UI pintaba `day.title` en tres sitios
 * pero el prompt nunca pedia `title`, asi que las tarjetas salian sin titulo y
 * el registro de la sesion guardaba `day_title: undefined`.
 */

export type Exercise = {
  name: string;
  sets?: string | number | null;
  reps?: string | null;
  target?: string | null;
  rest?: string | null;
  metric_type?: string | null;
};

export type TrainingDay = {
  day: string;
  type: string;
  title: string;
  exercises: Exercise[];
  /** Lo escribe `completeTrainingDay`, no la IA. */
  isCompleted?: boolean;
  log?: unknown;
  completed_at?: string | null;
};

export type WeeklyPlan = {
  week_focus: string;
  days: TrainingDay[];
};

/** Estructura que se le pide al modelo. Vive aqui para que no se separe del tipo. */
export const PLAN_SHAPE =
  '{ "week_focus": "...", "days": [{ "day": "Lunes", "type": "Fuerza", "title": "...", "exercises": [{ "name": "...", "sets": "4", "reps": "8-10", "target": "...", "rest": "90s", "metric_type": "weight" }] }] }';

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeExercise(raw: unknown): Exercise | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  const name = asString(e.name);
  if (!name) return null; // un ejercicio sin nombre no se puede pintar
  return {
    name,
    sets: typeof e.sets === 'number' ? e.sets : asString(e.sets) || null,
    reps: asString(e.reps) || null,
    target: asString(e.target) || null,
    rest: asString(e.rest) || null,
    metric_type: asString(e.metric_type) || null,
  };
}

/**
 * Deja el plan en una forma que la UI puede pintar sin comprobar nada.
 *
 * `exercises` SIEMPRE es un array: `day.exercises.length` estaba sin proteger
 * en el panel y `day.exercises.map` en la sesion, asi que un dia sin ejercicios
 * tumbaba la pantalla entera. Devuelve `null` si no hay ni un dia utilizable:
 * es mejor decir "la IA no devolvio un plan" que pintar una semana vacia.
 */
export function normalizePlan(raw: unknown): WeeklyPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (!Array.isArray(p.days)) return null;

  const days: TrainingDay[] = [];
  for (const entry of p.days) {
    if (!entry || typeof entry !== 'object') continue;
    const d = entry as Record<string, unknown>;
    const day = asString(d.day);
    if (!day) continue;
    const type = asString(d.type, 'Sesión');
    days.push({
      day,
      type,
      // Si el modelo no manda titulo, se compone uno en vez de dejar el hueco.
      title: asString(d.title, `${type} · ${day}`),
      exercises: Array.isArray(d.exercises)
        ? d.exercises.map(normalizeExercise).filter((e): e is Exercise => e !== null)
        : [],
      isCompleted: d.isCompleted === true,
      log: d.log ?? null,
      completed_at: asString(d.completed_at) || null,
    });
  }

  if (!days.length) return null;
  return { week_focus: asString(p.week_focus, 'Adaptación y base'), days };
}

/**
 * Progreso de la semana. Numerador y denominador de la misma muestra (regla 8),
 * y `total: 0` no es 0 %: es "sin plan".
 */
export function planProgress(plan: WeeklyPlan | null | undefined): {
  total: number;
  completed: number;
  percentage: number;
  isWeekComplete: boolean;
} {
  const total = plan?.days.length ?? 0;
  const completed = plan?.days.filter((d) => d.isCompleted).length ?? 0;
  return {
    total,
    completed,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    isWeekComplete: total > 0 && completed >= total,
  };
}

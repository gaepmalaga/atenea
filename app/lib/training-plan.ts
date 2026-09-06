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
  /**
   * QUIEN LO ESCRIBIO. `'ia'` por defecto —incluidas las filas de antes de que
   * este campo existiera, que se normalizan igual (regla 17: se normaliza
   * también al LEER)— y `'entrenador'` cuando lo escribe una persona desde el
   * panel.
   *
   * Existe porque una academia puede tener preparador físico de verdad en vez
   * de un plan generado, y entonces el modulo de IA sobra pero la PANTALLA DEL
   * ALUMNO no tiene por que cambiar nada: sigue siendo un `WeeklyPlan` con sus
   * dias y ejercicios. El entrenador es otro productor del mismo formato, no
   * un camino aparte.
   */
  source: 'ia' | 'entrenador';
};

// ============================================================
// SEMANAS (P9): el plan de grupo va semana a semana
// ============================================================

/**
 * El LUNES de la semana de `d`, como `YYYY-MM-DD`. Es la clave de cada semana en
 * `group_training_plans` (P9). Se calcula en horario local a propósito: «esta
 * semana» es la del profesor, no la de UTC.
 */
export function lunesDeSemana(d: Date = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay(); // 0 = domingo
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + diff);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/** Suma `semanas` (puede ser negativo) al lunes de referencia. `YYYY-MM-DD`. */
export function sumaSemanas(lunesISO: string, semanas: number): string {
  const [y, m, d] = lunesISO.split('-').map(Number);
  const x = new Date(y, m - 1, d);
  x.setDate(x.getDate() + semanas * 7);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/**
 * Las semanas que se ofrecen en el editor: la actual y unas cuantas por venir.
 * Preparar hacia atrás no tiene sentido (la semana ya pasó).
 */
export function semanasEditables(hoy: Date = new Date(), futuras = 4): { weekStart: string; offset: number }[] {
  const base = lunesDeSemana(hoy);
  const out: { weekStart: string; offset: number }[] = [];
  for (let i = 0; i <= futuras; i++) out.push({ weekStart: sumaSemanas(base, i), offset: i });
  return out;
}

/** `2026-09-08` -> «8 sep». Corto, para las pestañas de semana. */
export function etiquetaSemana(weekStartISO: string): string {
  const [y, m, d] = weekStartISO.split('-').map(Number);
  if (!y || !m || !d) return weekStartISO;
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d} ${MESES[m - 1] ?? m}`;
}

/**
 * De una lista de semanas guardadas, cuál es la que le toca al alumno HOY: la de
 * `week_start` más reciente que no pase del lunes de esta semana. Si todas son
 * futuras, ninguna (todavía no empieza). Devuelve el `weekStart` o `null`.
 */
export function semanaVigente(weekStarts: string[], hoy: Date = new Date()): string | null {
  const lunesHoy = lunesDeSemana(hoy);
  const pasadasOhoy = (weekStarts ?? []).filter((w) => w <= lunesHoy).sort();
  return pasadasOhoy.length ? pasadasOhoy[pasadasOhoy.length - 1] : null;
}

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
  const source = p.source === 'entrenador' ? 'entrenador' : 'ia';
  return { week_focus: asString(p.week_focus, 'Adaptación y base'), days, source };
}

/**
 * Construye el plan que escribe un ENTRENADOR REAL, con la misma validación
 * que uno generado (regla 27: lo que entra a mano se valida igual que lo que
 * escribe la IA — un preparador se equivoca con un campo vacío igual que
 * Gemini). Pasa por `normalizePlan` antes de guardarse; esta función solo le
 * da la forma de entrada.
 */
export function buildManualPlan(params: {
  weekFocus: string;
  days: Array<{ day: string; type: string; title: string; exercises: Exercise[] }>;
}): unknown {
  return {
    week_focus: params.weekFocus,
    source: 'entrenador',
    days: params.days.filter((d) => d.exercises.length > 0),
  };
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

// ============================================================
// REGISTRO DE LA SESION Y PROGRESION SEMANAL
// ============================================================

/**
 * Lo que el alumno anota al terminar un dia.
 *
 * Cruza la frontera cliente-servidor, asi que tiene tipo compartido (regla 6):
 * `ActiveSession` lo compone y `completeTrainingDay` lo guarda. Era
 * `Record<string, unknown>` en la accion, que es otra forma de decir `any`.
 */
export type TrainingDayLog = {
  day_title?: string | null;
  status?: 'completed' | 'skipped' | null;
  /** Molestia declarada por el alumno, si la hubo. */
  issue?: string | null;
  pain_location?: string | null;
  /** Esfuerzo percibido, 1-10. */
  rpe?: number | null;
  /** Lo que escribio en cada ejercicio: nombre del ejercicio -> texto libre. */
  feedback?: Record<string, string> | null;
  timestamp?: string | null;
};

export type WeekSummary = {
  total: number;
  completed: number;
  skipped: number;
  /** `null` si ningun dia trae RPE: "sin datos" no es "esfuerzo cero" (regla 8). */
  avgRpe: number | null;
  /** Molestias declaradas, sin repetir. */
  issues: string[];
  /** Lo que anoto en los ejercicios: para que el modelo sepa con que cargas trabajo. */
  notes: { exercise: string; note: string }[];
};

function readLog(day: TrainingDay): TrainingDayLog | null {
  const log = day.log;
  return log && typeof log === 'object' ? (log as TrainingDayLog) : null;
}

/** Resume la semana que acaba de terminar, para alimentar la siguiente. */
export function summarizeWeek(plan: WeeklyPlan | null | undefined): WeekSummary {
  const days = plan?.days ?? [];
  const rpes: number[] = [];
  const issues: string[] = [];
  const notes: { exercise: string; note: string }[] = [];
  let completed = 0;
  let skipped = 0;

  for (const day of days) {
    const log = readLog(day);
    if (day.isCompleted) completed++;
    if (log?.status === 'skipped') skipped++;

    if (typeof log?.rpe === 'number' && Number.isFinite(log.rpe)) rpes.push(log.rpe);

    const molestia = [log?.issue, log?.pain_location].filter(Boolean).join(': ');
    if (molestia && !issues.includes(molestia)) issues.push(molestia);

    // `Object.entries('texto')` enumera los CARACTERES de la cadena. Sin
    // comprobar que es un objeto, un feedback corrupto producia una anotacion
    // por letra y eso acababa dentro del prompt.
    const feedback = log?.feedback;
    if (feedback && typeof feedback === 'object' && !Array.isArray(feedback)) {
      for (const [exercise, note] of Object.entries(feedback)) {
        if (typeof note === 'string' && note.trim()) notes.push({ exercise, note: note.trim() });
      }
    }
  }

  return {
    total: days.length,
    completed,
    skipped,
    // Media solo de los dias que TRAEN dato. Meter los que no lo traen como 0
    // la hundiria y el plan siguiente saldria mas facil de lo que toca.
    avgRpe: rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null,
    issues,
    notes,
  };
}

/** Umbrales de RPE que deciden si la semana siguiente sube, mantiene o baja. */
export const RPE_EASY = 6;
export const RPE_HARD = 8.5;

export type Progression = 'subir' | 'mantener' | 'bajar' | 'repetir';

/**
 * Que hacer con la semana siguiente.
 *
 * El orden importa: una molestia manda sobre cualquier RPE, y no haber
 * terminado la semana manda sobre haberla encontrado facil. Sin esto, un alumno
 * que completo dos de cinco dias "porque le dolia el hombro" recibiria mas carga.
 */
export function decideProgression(summary: WeekSummary): Progression {
  if (summary.issues.length > 0) return 'bajar';
  if (summary.total > 0 && summary.completed < Math.ceil(summary.total / 2)) return 'repetir';
  if (summary.avgRpe === null) return 'mantener'; // sin RPE no hay con que decidir
  if (summary.avgRpe >= RPE_HARD) return 'bajar';
  if (summary.avgRpe < RPE_EASY) return 'subir';
  return 'mantener';
}

const PROGRESSION_BRIEF: Record<Progression, string> = {
  subir: 'La semana se le quedó corta: sube volumen o carga entre un 5 y un 10 %.',
  mantener: 'El esfuerzo fue el adecuado: mantén la estructura y progresa ligeramente.',
  bajar: 'Baja la carga y el volumen. Evita todo lo que cargue la zona molesta y sustitúyelo por trabajo alternativo.',
  repetir: 'No completó la semana: repite el mismo nivel con menos días y sesiones más cortas, para que pueda terminarla.',
};

/** Traduce el resumen a instrucciones para el modelo. */
export function progressionBrief(summary: WeekSummary): string {
  const decision = decideProgression(summary);
  const lineas = [
    `SEMANA ANTERIOR: ${summary.completed} de ${summary.total} días completados` +
      (summary.skipped ? `, ${summary.skipped} abandonados.` : '.'),
    summary.avgRpe === null
      ? 'ESFUERZO PERCIBIDO: sin registrar.'
      : `ESFUERZO PERCIBIDO MEDIO: ${summary.avgRpe}/10.`,
    `DECISIÓN: ${PROGRESSION_BRIEF[decision]}`,
  ];
  if (summary.issues.length) lineas.push(`MOLESTIAS DECLARADAS: ${summary.issues.join(' · ')}.`);
  if (summary.notes.length) {
    lineas.push(
      'ANOTACIONES DEL ALUMNO: ' +
        summary.notes.slice(0, 12).map((n) => `${n.exercise} → ${n.note}`).join(' · '),
    );
  }
  return lineas.join('\n');
}

// ============================================================
// REGISTRO CONSULTABLE (workout_logs) — §2.11
// ============================================================
//
// El log de cada sesión vive dentro del JSON del plan (`completeTrainingDay`),
// que sirve para alimentar la semana siguiente pero NO para mirar la progresión
// de un mes: cada plan es una semana y no hay forma de consultarlos juntos.
// `workout_logs` es una fila por sesión terminada, con fecha propia — la tabla
// ya existía en el esquema, sin usar. Escribir en ella NO puede tumbar la
// sesión: se hace best-effort, después de guardar el plan (como
// `flashcard_results`).

/** Fecha local `YYYY-MM-DD`. La del alumno, no la de UTC (igual que `lunesDeSemana`). */
export function fechaLocalISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const dia = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

/** RPE 1-10 entero, o `null`. Un campo vacío es `null`, nunca `0` (regla 16). */
export function normalizeRpe(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 1 && r <= 10 ? r : null;
}

/** Una fila lista para `workout_logs`. */
export type WorkoutLogRow = {
  user_id: string;
  plan_id: string;
  date: string;
  session_type: string;
  rpe: number | null;
  metrics: {
    dayIndex: number;
    status: 'completed' | 'skipped';
    issue: string | null;
    painLocation: string | null;
    feedback: Record<string, string>;
  };
  notes: string | null;
};

/** `TrainingDay` + lo que anotó el alumno -> fila de `workout_logs`. */
export function buildWorkoutLogRow(params: {
  userId: string;
  planId: string;
  dayIndex: number;
  day: Pick<TrainingDay, 'type' | 'title'>;
  log: TrainingDayLog | null | undefined;
  now?: Date;
}): WorkoutLogRow {
  const { userId, planId, dayIndex, day, log } = params;
  const status = log?.status === 'skipped' ? 'skipped' : 'completed';

  // `Object.entries` sobre algo que no es un objeto enumera caracteres — el
  // mismo fallo que ya cazó su test en `summarizeWeek`.
  const fb = log?.feedback;
  const feedback: Record<string, string> =
    fb && typeof fb === 'object' && !Array.isArray(fb)
      ? Object.fromEntries(
          Object.entries(fb).filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => [k, (v as string).trim()]),
        )
      : {};

  const molestia = [log?.issue, log?.pain_location].filter(Boolean).join(': ') || null;
  const anotaciones = Object.entries(feedback).map(([k, v]) => `${k}: ${v}`).join(' · ') || null;

  return {
    user_id: userId,
    plan_id: planId,
    date: fechaLocalISO(params.now),
    session_type: day.type || day.title || 'sesión',
    rpe: normalizeRpe(log?.rpe),
    metrics: {
      dayIndex,
      status,
      issue: log?.issue ?? null,
      painLocation: log?.pain_location ?? null,
      feedback,
    },
    notes: status === 'skipped' ? molestia : anotaciones,
  };
}

/** Una sesión del historial, tal y como la lee la pantalla. */
export type SesionHistorial = {
  date: string;
  session_type: string | null;
  rpe: number | null;
  status: 'completed' | 'skipped';
  issue: string | null;
};

export type SemanaHistorial = {
  /** Lunes de la semana, `YYYY-MM-DD`. */
  weekStart: string;
  etiqueta: string;
  sesiones: SesionHistorial[];
  completadas: number;
  saltadas: number;
  /** Media de RPE de las sesiones con dato. `null` = ninguna lo trae (regla 8). */
  avgRpe: number | null;
  molestias: string[];
};

/** Fila de `workout_logs` tal y como llega de Supabase. */
type WorkoutLogLeido = {
  date?: string | null;
  session_type?: string | null;
  rpe?: number | null;
  metrics?: unknown;
  notes?: string | null;
};

/**
 * Agrupa el historial de sesiones por semana (lunes), de la más reciente a la
 * más antigua. Es lo que hace consultable la progresión: RPE medio y sesiones
 * completadas semana a semana, en vez de mirar siete JSON de plan sueltos.
 */
export function agrupaHistorialPorSemana(logs: WorkoutLogLeido[]): SemanaHistorial[] {
  const porSemana = new Map<string, SesionHistorial[]>();

  for (const l of logs ?? []) {
    const fecha = typeof l.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(l.date) ? l.date : null;
    if (!fecha) continue;
    const lunes = lunesDeSemana(new Date(`${fecha}T12:00:00`));

    const m = (l.metrics && typeof l.metrics === 'object' ? l.metrics : {}) as Record<string, unknown>;
    const status = m.status === 'skipped' ? 'skipped' : 'completed';
    const issue = typeof m.issue === 'string' ? m.issue : null;

    if (!porSemana.has(lunes)) porSemana.set(lunes, []);
    porSemana.get(lunes)!.push({
      date: fecha,
      session_type: l.session_type ?? null,
      rpe: normalizeRpe(l.rpe),
      status,
      issue,
    });
  }

  return [...porSemana.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([weekStart, sesiones]) => {
      const rpes = sesiones.map((s) => s.rpe).filter((r): r is number => r !== null);
      return {
        weekStart,
        etiqueta: etiquetaSemana(weekStart),
        sesiones: sesiones.sort((a, b) => a.date.localeCompare(b.date)),
        completadas: sesiones.filter((s) => s.status === 'completed').length,
        saltadas: sesiones.filter((s) => s.status === 'skipped').length,
        avgRpe: rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null,
        molestias: [...new Set(sesiones.map((s) => s.issue).filter((i): i is string => !!i))],
      };
    });
}

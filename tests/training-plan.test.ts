import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizePlan,
  planProgress,
  summarizeWeek,
  decideProgression,
  progressionBrief,
  lunesDeSemana,
  sumaSemanas,
  semanasEditables,
  etiquetaSemana,
  semanaVigente,
  PLAN_SHAPE,
  RPE_EASY,
  RPE_HARD,
  type WeekSummary,
} from '../app/lib/training-plan';

const planIA = {
  week_focus: 'Adaptación anatómica',
  days: [
    {
      day: 'Lunes',
      type: 'Fuerza',
      title: 'Tren superior',
      exercises: [
        { name: 'Dominadas', sets: 4, reps: '8-10', target: 'Dorsal', rest: '90s', metric_type: 'reps' },
      ],
    },
    { day: 'Miércoles', type: 'Carrera', title: 'Series', exercises: [{ name: '400m x6' }] },
  ],
};

describe('normalizePlan', () => {
  it('acepta el plan tal y como lo pide el prompt', () => {
    const plan = normalizePlan(planIA);
    expect(plan?.days).toHaveLength(2);
    expect(plan?.days[0].exercises[0].name).toBe('Dominadas');
    expect(plan?.week_focus).toBe('Adaptación anatómica');
  });

  it('compone un titulo si el modelo no lo manda', () => {
    // El fallo: la UI pintaba `day.title` en tres sitios y el prompt nunca
    // pedia `title`, asi que las tarjetas salian sin encabezado y el registro
    // de la sesion guardaba `day_title: undefined`.
    const plan = normalizePlan({ days: [{ day: 'Lunes', type: 'Fuerza', exercises: [] }] });
    expect(plan?.days[0].title).toBe('Fuerza · Lunes');
  });

  it('el prompt pide el campo que la UI lee', () => {
    // Escribir en una clave y leer en otra es el fallo de la regla 3 otra vez.
    expect(PLAN_SHAPE).toContain('"title"');
    expect(PLAN_SHAPE).toContain('"week_focus"');
    expect(PLAN_SHAPE).toContain('"exercises"');
  });

  it('exercises SIEMPRE es un array', () => {
    // `day.exercises.length` en el panel y `day.exercises.map` en la sesion
    // estaban sin proteger: un dia sin ejercicios dejaba la pantalla en blanco.
    expect(normalizePlan({ days: [{ day: 'Lunes', type: 'Fuerza' }] })?.days[0].exercises).toEqual([]);
    expect(normalizePlan({ days: [{ day: 'Lunes', exercises: 'nada' }] })?.days[0].exercises).toEqual([]);
    expect(normalizePlan({ days: [{ day: 'Lunes', exercises: [null, 5, {}] }] })?.days[0].exercises).toEqual([]);
  });

  it('descarta un ejercicio sin nombre pero conserva los demas', () => {
    const plan = normalizePlan({
      days: [{ day: 'Lunes', exercises: [{ reps: '10' }, { name: 'Sentadilla' }] }],
    });
    expect(plan?.days[0].exercises.map((e) => e.name)).toEqual(['Sentadilla']);
  });

  it('descarta un dia sin nombre de dia', () => {
    const plan = normalizePlan({ days: [{ type: 'Fuerza' }, { day: 'Martes' }] });
    expect(plan?.days).toHaveLength(1);
    expect(plan?.days[0].day).toBe('Martes');
  });

  it('devuelve null cuando no hay plan que pintar', () => {
    // Mejor decir "la IA no devolvio un plan" que guardar una semana vacia.
    expect(normalizePlan(null)).toBeNull();
    expect(normalizePlan({})).toBeNull();
    expect(normalizePlan({ days: [] })).toBeNull();
    expect(normalizePlan({ days: 'Lunes, Martes' })).toBeNull();
    expect(normalizePlan('texto suelto')).toBeNull();
  });

  it('conserva el progreso ya guardado al releer el plan', () => {
    // `getActiveTrainingPlan` normaliza lo que lee de la BD: si `isCompleted`
    // se perdiera ahi, el alumno veria su semana reiniciada a cero.
    const plan = normalizePlan({
      days: [{ day: 'Lunes', exercises: [], isCompleted: true, completed_at: '2026-01-01' }],
    });
    expect(plan?.days[0].isCompleted).toBe(true);
    expect(plan?.days[0].completed_at).toBe('2026-01-01');
  });

  it('isCompleted solo es cierto si es exactamente true', () => {
    const plan = normalizePlan({ days: [{ day: 'Lunes', exercises: [], isCompleted: 'si' }] });
    expect(plan?.days[0].isCompleted).toBe(false);
  });
});

describe('planProgress', () => {
  it('cuenta los dias completados sobre el total del plan', () => {
    const plan = normalizePlan({
      days: [
        { day: 'Lunes', exercises: [], isCompleted: true },
        { day: 'Martes', exercises: [] },
        { day: 'Jueves', exercises: [], isCompleted: true },
        { day: 'Viernes', exercises: [] },
      ],
    });
    expect(planProgress(plan)).toEqual({
      total: 4, completed: 2, percentage: 50, isWeekComplete: false,
    });
  });

  it('la semana completa se marca solo al terminar todos los dias', () => {
    const plan = normalizePlan({ days: [{ day: 'Lunes', exercises: [], isCompleted: true }] });
    expect(planProgress(plan).isWeekComplete).toBe(true);
    expect(planProgress(plan).percentage).toBe(100);
  });

  it('sin plan no hay semana completa ni NaN', () => {
    // `completed / total` con total 0 pintaba "NaN%" en la barra de progreso.
    expect(planProgress(null)).toEqual({
      total: 0, completed: 0, percentage: 0, isWeekComplete: false,
    });
  });
});

// ============================================================
// PROGRESION SEMANAL
// ============================================================

const semana = (dias: unknown[]) => normalizePlan({ days: dias });

describe('summarizeWeek', () => {
  it('cuenta dias completados, abandonados y promedia el esfuerzo', () => {
    const plan = semana([
      { day: 'Lunes', exercises: [], isCompleted: true, log: { status: 'completed', rpe: 6 } },
      { day: 'Martes', exercises: [], isCompleted: true, log: { status: 'completed', rpe: 8 } },
      { day: 'Jueves', exercises: [], isCompleted: true, log: { status: 'skipped', rpe: 4 } },
    ]);
    const s = summarizeWeek(plan);
    expect(s.total).toBe(3);
    expect(s.completed).toBe(3);
    expect(s.skipped).toBe(1);
    expect(s.avgRpe).toBe(6);
  });

  it('la media solo cuenta los dias que traen RPE', () => {
    // Meter los dias sin dato como 0 hundiria la media, y el plan siguiente
    // saldria mas facil de lo que toca (regla 8: misma muestra arriba y abajo).
    const plan = semana([
      { day: 'Lunes', exercises: [], log: { rpe: 8 } },
      { day: 'Martes', exercises: [] },
      { day: 'Jueves', exercises: [], log: {} },
    ]);
    expect(summarizeWeek(plan).avgRpe).toBe(8);
  });

  it('sin ningun RPE la media es null, no cero', () => {
    expect(summarizeWeek(semana([{ day: 'Lunes', exercises: [] }])).avgRpe).toBeNull();
    expect(summarizeWeek(null).avgRpe).toBeNull();
  });

  it('recoge las molestias sin repetirlas', () => {
    const plan = semana([
      { day: 'Lunes', exercises: [], log: { issue: 'dolor', pain_location: 'hombro' } },
      { day: 'Martes', exercises: [], log: { issue: 'dolor', pain_location: 'hombro' } },
      { day: 'Jueves', exercises: [], log: { issue: 'dolor', pain_location: 'rodilla' } },
    ]);
    expect(summarizeWeek(plan).issues).toEqual(['dolor: hombro', 'dolor: rodilla']);
  });

  it('recoge lo que el alumno anoto en cada ejercicio', () => {
    const plan = semana([
      { day: 'Lunes', exercises: [], log: { feedback: { Dominadas: '6 reps', Sentadilla: '  ' } } },
    ]);
    expect(summarizeWeek(plan).notes).toEqual([{ exercise: 'Dominadas', note: '6 reps' }]);
  });

  it('un log corrupto no tumba el resumen', () => {
    const plan = semana([
      { day: 'Lunes', exercises: [], log: 'texto suelto' },
      { day: 'Martes', exercises: [], log: { rpe: 'siete', feedback: 'nada' } },
    ]);
    const s = summarizeWeek(plan);
    expect(s.avgRpe).toBeNull();
    expect(s.notes).toEqual([]);
  });
});

const resumen = (parcial: Partial<WeekSummary> = {}): WeekSummary => ({
  total: 5, completed: 5, skipped: 0, avgRpe: 7, issues: [], notes: [], ...parcial,
});

describe('decideProgression', () => {
  it('sube si la semana se le quedo corta', () => {
    expect(decideProgression(resumen({ avgRpe: RPE_EASY - 1 }))).toBe('subir');
  });

  it('mantiene con un esfuerzo intermedio', () => {
    expect(decideProgression(resumen({ avgRpe: 7 }))).toBe('mantener');
  });

  it('baja si el esfuerzo fue excesivo', () => {
    expect(decideProgression(resumen({ avgRpe: RPE_HARD }))).toBe('bajar');
  });

  it('una molestia manda sobre cualquier RPE', () => {
    // Sin esta precedencia, quien completo la semana "facil" pero con dolor de
    // hombro recibiria MAS carga sobre la zona que le duele.
    expect(decideProgression(resumen({ avgRpe: 2, issues: ['dolor: hombro'] }))).toBe('bajar');
  });

  it('no completar la semana manda sobre haberla encontrado facil', () => {
    expect(decideProgression(resumen({ total: 5, completed: 2, avgRpe: 3 }))).toBe('repetir');
  });

  it('sin RPE registrado no hay con que decidir: mantiene', () => {
    expect(decideProgression(resumen({ avgRpe: null }))).toBe('mantener');
  });

  it('una semana vacia no se marca como incompleta', () => {
    // `completed < ceil(0/2)` es `0 < 0`: falso. Sin el guarda de `total > 0`
    // un plan sin dias entraria en "repetir".
    expect(decideProgression(resumen({ total: 0, completed: 0, avgRpe: null }))).toBe('mantener');
  });
});

describe('progressionBrief', () => {
  it('le dice al modelo que paso y que hacer', () => {
    const texto = progressionBrief(resumen({ completed: 3, total: 5, avgRpe: 9, issues: ['dolor: hombro'] }));
    expect(texto).toContain('3 de 5');
    expect(texto).toContain('9/10');
    expect(texto).toContain('hombro');
    expect(texto).toContain('DECISIÓN');
  });

  it('dice "sin registrar" en vez de inventarse un cero', () => {
    expect(progressionBrief(resumen({ avgRpe: null }))).toContain('sin registrar');
  });
});

// ============================================================
// GUARDAS ESTATICAS
// ============================================================

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const training = stripComments(read('app/actions/training.ts'));
const dashboard = stripComments(read('app/components/student/modules/training/components/TrainingDashboard.tsx'));
const session = stripComments(read('app/components/student/modules/training/components/ActiveSession.tsx'));

describe('el plan se valida antes de guardarlo y al releerlo', () => {
  it('generateWeeklyPlan normaliza lo que devuelve el modelo', () => {
    expect(training).toContain('normalizePlan(parseAIJson');
  });

  it('generateNextWeek cierra la semana anterior filtrando por usuario', () => {
    // Sin el `.eq('user_id')`, un id de plan ajeno cerraria la semana de otro.
    const cuerpo = training.slice(
      training.indexOf('export async function generateNextWeek'),
      training.indexOf('export async function getPhysicalProfile'),
    );
    expect(cuerpo).toMatch(/status: 'completed'[\s\S]*?\.eq\('user_id', userId\)/);
    expect(cuerpo).toContain('progressionBrief');
  });

  it('getActiveTrainingPlan normaliza lo que lee de la BD', () => {
    const cuerpo = training.slice(training.indexOf('export async function getActiveTrainingPlan'));
    expect(cuerpo.slice(0, cuerpo.indexOf('export async function completeTrainingDay'))).toContain('normalizePlan');
  });
});

describe('semanas del plan de grupo (P9)', () => {
  it('lunesDeSemana devuelve el lunes en horario local, YYYY-MM-DD', () => {
    // 2026-09-09 es miércoles → lunes = 2026-09-07
    expect(lunesDeSemana(new Date(2026, 8, 9))).toBe('2026-09-07');
    // un domingo cuenta con la semana que acaba, no la que empieza
    expect(lunesDeSemana(new Date(2026, 8, 13))).toBe('2026-09-07');
    // el propio lunes
    expect(lunesDeSemana(new Date(2026, 8, 7))).toBe('2026-09-07');
  });

  it('sumaSemanas cruza meses', () => {
    expect(sumaSemanas('2026-09-28', 1)).toBe('2026-10-05');
    expect(sumaSemanas('2026-09-07', -1)).toBe('2026-08-31');
  });

  it('semanasEditables da la actual y N por venir, ninguna pasada', () => {
    const ss = semanasEditables(new Date(2026, 8, 9), 3);
    expect(ss.map((s) => s.weekStart)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
    expect(ss[0].offset).toBe(0);
  });

  it('etiquetaSemana es corta', () => {
    expect(etiquetaSemana('2026-09-07')).toBe('7 sep');
  });

  it('semanaVigente: la más reciente que no pasa del lunes de hoy', () => {
    const hoy = new Date(2026, 8, 16); // lunes de hoy: 2026-09-14
    expect(semanaVigente(['2026-09-07', '2026-09-14', '2026-09-21'], hoy)).toBe('2026-09-14');
    // si todas son futuras, todavía no hay plan vigente
    expect(semanaVigente(['2026-09-21', '2026-09-28'], hoy)).toBeNull();
    // solo pasadas: vale la última
    expect(semanaVigente(['2026-08-31', '2026-09-07'], hoy)).toBe('2026-09-07');
  });
});

describe('el panel de entrenamiento no lee campos sin garantizar', () => {
  it('el progreso sale de planProgress, no de aritmetica suelta en el render', () => {
    expect(dashboard).toContain('planProgress(plan)');
    expect(dashboard).not.toMatch(/completedDays\s*\/\s*totalDays/);
  });

  it('ni el panel ni la sesion usan `any` para el plan', () => {
    // Un `any` aqui es como llegaron a produccion los desajustes de nombres de
    // campo: ambos lados compilan y el fallo solo sale en pantalla.
    expect(dashboard).not.toMatch(/:\s*any\b/);
    expect(session).not.toMatch(/:\s*any\b/);
  });
});

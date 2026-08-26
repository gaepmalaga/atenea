import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizePlan, planProgress, PLAN_SHAPE } from '../app/lib/training-plan';

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

  it('getActiveTrainingPlan normaliza lo que lee de la BD', () => {
    const cuerpo = training.slice(training.indexOf('export async function getActiveTrainingPlan'));
    expect(cuerpo.slice(0, cuerpo.indexOf('export async function completeTrainingDay'))).toContain('normalizePlan');
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

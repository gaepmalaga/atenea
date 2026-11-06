import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  indiceDiaPlan, fechaDeDiaPlan, diasEntrenables, sePuedeRegistrar, normalizaRegistro,
  resumenSemanaGrupo, DIAS_PARA_REGISTRAR, MAX_COMENTARIO,
} from '../app/lib/registro-fisico';
import { normalizePlan, normalizaVideo, type WeeklyPlan } from '../app/lib/training-plan';

/**
 * EL REGISTRO DEL ENTRENAMIENTO DE GRUPO (regla 84): qué fecha es cada día del
 * plan, qué días se pueden apuntar, y lo que ve el preparador.
 */

// 2026-11-02 es lunes.
const LUNES = '2026-11-02';

const ej = (name: string) => ({ name, sets: '3', reps: '10', rest: '60 s' });
const PLAN: WeeklyPlan = normalizePlan({
  week_focus: 'Base',
  source: 'entrenador',
  days: [
    { day: 'Miércoles', title: 'Carrera', type: 'Entrenamiento', exercises: [ej('Series de 200 m')] },
    { day: 'lunes', title: 'Fuerza', type: 'Entrenamiento', exercises: [ej('Dominadas')] },
    { day: 'Viernes', title: 'Descanso completo', type: 'Descanso', exercises: [ej('Descanso')] },
    { day: 'Domingo', title: 'Domingo', type: 'Entrenamiento', exercises: [] },
  ],
}) as WeeklyPlan;

describe('qué fecha es cada día del plan', () => {
  it('lee los nombres con y sin tilde, abreviados y la X del miércoles', () => {
    expect(indiceDiaPlan('Lunes')).toBe(0);
    expect(indiceDiaPlan('miercoles')).toBe(2);
    expect(indiceDiaPlan('Mié')).toBe(2);
    expect(indiceDiaPlan('X')).toBe(2);
    expect(indiceDiaPlan('Sábado')).toBe(5);
    expect(indiceDiaPlan('domingo')).toBe(6);
    expect(indiceDiaPlan('')).toBeNull();
    expect(indiceDiaPlan('Día 1')).toBeNull();
  });

  it('la fecha es el lunes de la semana + el día', () => {
    expect(fechaDeDiaPlan(LUNES, { day: 'Miércoles' })).toBe('2026-11-04');
    expect(fechaDeDiaPlan(`${LUNES}T00:00:00Z`, { day: 'Domingo' })).toBe('2026-11-08');
    expect(fechaDeDiaPlan(LUNES, { day: 'Día libre' })).toBeNull();
  });

  it('solo se apuntan los días con entrenamiento, en orden de fecha', () => {
    const dias = diasEntrenables(PLAN, LUNES);
    // El viernes es un descanso aunque traiga un «ejercicio», y el domingo está vacío.
    expect(dias.map((d) => d.fecha)).toEqual(['2026-11-02', '2026-11-04']);
  });
});

describe('qué días se pueden apuntar', () => {
  const hoy = '2026-11-20';
  it('hoy sí; mañana no: no se marca lo que aún no se ha hecho', () => {
    expect(sePuedeRegistrar(hoy, hoy)).toBe(true);
    expect(sePuedeRegistrar('2026-11-21', hoy)).toBe(false);
  });

  it(`hasta ${DIAS_PARA_REGISTRAR} días atrás, contando hoy`, () => {
    expect(sePuedeRegistrar('2026-11-07', hoy)).toBe(true);
    expect(sePuedeRegistrar('2026-11-06', hoy)).toBe(false);
  });
});

describe('normalizaRegistro', () => {
  it('un esfuerzo vacío es null, nunca 0 (regla 16)', () => {
    expect(normalizaRegistro({ rpe: '' }).rpe).toBeNull();
    expect(normalizaRegistro({ rpe: null }).rpe).toBeNull();
    expect(normalizaRegistro({}).rpe).toBeNull();
  });

  it('solo de 1 a 10 y entero', () => {
    expect(normalizaRegistro({ rpe: 7 }).rpe).toBe(7);
    expect(normalizaRegistro({ rpe: '8' }).rpe).toBe(8);
    expect(normalizaRegistro({ rpe: 0 }).rpe).toBeNull();
    expect(normalizaRegistro({ rpe: 11 }).rpe).toBeNull();
    expect(normalizaRegistro({ rpe: 6.5 }).rpe).toBeNull();
  });

  it('el comentario se recorta y vacío es null', () => {
    expect(normalizaRegistro({ comment: '   ' }).comment).toBeNull();
    expect(normalizaRegistro({ comment: '  me ha costado ' }).comment).toBe('me ha costado');
    expect(normalizaRegistro({ comment: 'x'.repeat(900) }).comment).toHaveLength(MAX_COMENTARIO);
    expect(normalizaRegistro({ comment: 42 }).comment).toBeNull();
  });
});

describe('el enlace de vídeo de cada ejercicio', () => {
  it('solo https: se pinta como enlace en el móvil de cada alumno', () => {
    expect(normalizaVideo('https://youtu.be/abc')).toBe('https://youtu.be/abc');
    expect(normalizaVideo('  https://www.instagram.com/p/x/ ')).toBe('https://www.instagram.com/p/x/');
    expect(normalizaVideo('http://youtu.be/abc')).toBeNull();
    expect(normalizaVideo('javascript:alert(1)')).toBeNull();
    expect(normalizaVideo('youtube.com/abc')).toBeNull();
    expect(normalizaVideo('')).toBeNull();
  });

  it('se limpia también al RELEER el plan (regla 17)', () => {
    const plan = normalizePlan({ week_focus: 'x', days: [{ day: 'Lunes', exercises: [{ name: 'A', video: 'javascript:alert(1)' }, { name: 'B', video: 'https://youtu.be/b' }] }] });
    expect(plan?.days[0].exercises.map((e) => e.video)).toEqual([null, 'https://youtu.be/b']);
  });
});

describe('lo que ve el preparador', () => {
  const miembros = [
    { id: 'a', email: 'ana@x.es' },
    { id: 'b', email: 'bea@x.es' },
    { id: 'c', email: 'carlos@x.es' },
  ];

  it('cada día con cuántos lo han hecho, y quién no ha apuntado nada de lo que ya tocaba', () => {
    const r = resumenSemanaGrupo({
      plan: PLAN, weekStart: LUNES, miembros, hoy: '2026-11-03',
      registros: [{ userId: 'a', fecha: '2026-11-02', rpe: 6, comment: 'bien' }],
    });
    expect(r.dias).toEqual([
      { fecha: '2026-11-02', titulo: 'Fuerza', hechos: 1, vencido: true },
      { fecha: '2026-11-04', titulo: 'Carrera', hechos: 0, vencido: false },
    ]);
    expect(r.sinRegistrar).toEqual(['bea@x.es', 'carlos@x.es']);
    // Los que menos han hecho, arriba.
    expect(r.alumnos.map((a) => a.email)).toEqual(['bea@x.es', 'carlos@x.es', 'ana@x.es']);
    expect(r.alumnos[2].dias).toEqual({ '2026-11-02': { rpe: 6, comment: 'bien' }, '2026-11-04': null });
  });

  it('esfuerzo medio solo de quien lo ha puesto; sin nadie es null, no 0 (regla 8)', () => {
    const base = { plan: PLAN, weekStart: LUNES, miembros, hoy: '2026-11-08' };
    expect(resumenSemanaGrupo({ ...base, registros: [
      { userId: 'a', fecha: '2026-11-02', rpe: 6, comment: null },
      { userId: 'b', fecha: '2026-11-02', rpe: null, comment: null },
      { userId: 'c', fecha: '2026-11-04', rpe: 9, comment: null },
    ] }).rpeMedio).toBe(7.5);
    expect(resumenSemanaGrupo({ ...base, registros: [{ userId: 'a', fecha: '2026-11-02', rpe: null, comment: null }] }).rpeMedio).toBeNull();
  });

  it('no cuenta lo de quien ya no está en el grupo, ni lo apuntado en un día que el plan ya no tiene', () => {
    const r = resumenSemanaGrupo({
      plan: PLAN, weekStart: LUNES, miembros, hoy: '2026-11-08',
      registros: [
        { userId: 'fuera', fecha: '2026-11-02', rpe: 5, comment: 'ya no estoy' },
        { userId: 'a', fecha: '2026-11-03', rpe: 5, comment: 'el martes ya no está en el plan' },
      ],
    });
    expect(r.dias.every((d) => d.hechos === 0)).toBe(true);
    expect(r.comentarios).toEqual([]);
    expect(r.rpeMedio).toBeNull();
  });

  it('antes del primer día de entrenamiento, nadie está «sin registrar»', () => {
    const r = resumenSemanaGrupo({ plan: PLAN, weekStart: LUNES, miembros, registros: [], hoy: '2026-11-01' });
    expect(r.sinRegistrar).toEqual([]);
  });

  it('los comentarios, del más reciente al más antiguo', () => {
    const r = resumenSemanaGrupo({
      plan: PLAN, weekStart: LUNES, miembros, hoy: '2026-11-08',
      registros: [
        { userId: 'a', fecha: '2026-11-02', rpe: 6, comment: 'el lunes' },
        { userId: 'b', fecha: '2026-11-04', rpe: null, comment: 'el miércoles' },
      ],
    });
    expect(r.comentarios.map((c) => c.comment)).toEqual(['el miércoles', 'el lunes']);
  });
});

describe('guardas de las acciones', () => {
  const src = readFileSync(join(__dirname, '..', 'app', 'actions', 'registro-fisico.ts'), 'utf-8');

  it('el alumno solo toca SU registro: toda escritura lleva su id', () => {
    expect(src).toMatch(/\{ class_id: classId, user_id: auth\.user\.id/);
    expect(src).toMatch(/\.delete\(\)[\s\S]{0,80}\.eq\('user_id', auth\.user\.id\)/);
    expect(src).not.toMatch(/user_id: params/);
  });

  it('antes de escribir, comprueba la fecha, que es del grupo, que el grupo es de su academia y que el día existe en el plan', () => {
    const i = src.indexOf('export async function setMiRegistroFisico');
    const cuerpo = src.slice(i, src.indexOf('export async function getRegistroGrupo'));
    const escribe = cuerpo.indexOf("from('group_workout_logs')");
    expect(cuerpo.indexOf('sePuedeRegistrar')).toBeLessThan(escribe);
    expect(cuerpo).toContain(".eq('organization_id', organizationId)");
    expect(cuerpo.indexOf("from('class_members')")).toBeLessThan(escribe);
    expect(cuerpo.indexOf('diasEntrenables')).toBeLessThan(escribe);
  });

  it('la vista del preparador exige admin y se acota a su academia', () => {
    const cuerpo = src.slice(src.indexOf('export async function getRegistroGrupo'));
    expect(cuerpo).toContain('requireAdmin()');
    expect(cuerpo.indexOf(".eq('organization_id', organizationId)")).toBeLessThan(cuerpo.indexOf("from('group_workout_logs')"));
  });

  it('el calendario del alumno y el registro calculan la fecha con la MISMA función', () => {
    const cal = readFileSync(join(__dirname, '..', 'app', 'components', 'student', 'modules', 'training', 'components', 'CalendarioEntrenamiento.tsx'), 'utf-8');
    expect(cal).toMatch(/const indiceDia = indiceDiaPlan/);
    expect(cal).toContain('fechaDeDiaPlan(actual.weekStart, day)');
  });
});

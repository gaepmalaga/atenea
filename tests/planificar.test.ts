import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resumenSemanasAlumno, estadoSemana, agrupaAlumnos, copiasParaAlumnos, diasEntre,
  type GrupoPlan,
} from '../app/lib/planificar';
import type { Sesion } from '../app/lib/sesiones';

/**
 * «PLANIFICAR» POR ALUMNO (regla 97): la lista que dice de un vistazo a quién
 * le falta la semana, y copiar entrenos a varios alumnos, cada uno con SU copia.
 */

const LUNES = '2026-11-09';
const SIGUIENTE = '2026-11-16';

describe('el resumen de cada alumno: esta semana y la siguiente', () => {
  const sesiones = [
    { id: 'a', fecha: '2026-11-09', kind: 'fuerza' as const },
    { id: 'b', fecha: '2026-11-10', kind: 'carrera' as const },
    { id: 'c', fecha: '2026-11-12', kind: 'carrera' as const },
    { id: 'd', fecha: '2026-11-15', kind: 'descanso' as const },
    { id: 'e', fecha: '2026-11-17', kind: 'fuerza' as const },
  ];

  it('cuenta las sesiones (sin descansos), las que ya tocaban y cuántas apuntó', () => {
    const r = resumenSemanasAlumno({ sesiones, apuntadas: new Set(['a']), lunes: [LUNES, SIGUIENTE], hoy: '2026-11-10' });
    expect(r).toEqual([
      { lunes: LUNES, sesiones: 3, vencidas: 2, apuntadas: 1 },
      { lunes: SIGUIENTE, sesiones: 1, vencidas: 0, apuntadas: 0 },
    ]);
    expect(estadoSemana(r[0])).toBe('por_apuntar');
    expect(estadoSemana(r[1])).toBe('planificada');
  });

  it('una semana solo con descansos está sin planificar; todo apuntado, al día', () => {
    const r = resumenSemanasAlumno({ sesiones: [sesiones[3]], apuntadas: new Set(), lunes: [LUNES], hoy: '2026-11-20' });
    expect(estadoSemana(r[0])).toBe('sin_planificar');
    const al = resumenSemanasAlumno({ sesiones, apuntadas: new Set(['a', 'b', 'c']), lunes: [LUNES], hoy: '2026-11-20' });
    expect(estadoSemana(al[0])).toBe('al_dia');
  });
});

describe('la lista por grupos', () => {
  const grupos: GrupoPlan[] = [
    { id: 'g43', nombre: 'Promo 43 · Físicas', esMulti: false, conHorario: false },
    { id: 'gm', nombre: 'Promo 44 · Multi', esMulti: true, conHorario: false },
    { id: 'gk', nombre: 'Promo 44 · Kappa', esMulti: false, conHorario: true },
    { id: 'ga', nombre: 'Promo 44 · Alpha', esMulti: false, conHorario: true },
  ];
  const alumnos = [
    { id: '1', email: 'zoe@x.com', grupos: ['gk'] },
    { id: '2', email: 'ana@x.com', grupos: ['gk', 'g43'] },
    { id: '3', email: 'íñigo@x.com', grupos: ['ga'] },
    { id: '4', email: 'multi@x.com', grupos: ['gm'] },
  ];

  it('los grupos con horario primero (en su orden), luego Multi, luego los planes comunes; cada alumno una vez', () => {
    const s = agrupaAlumnos(alumnos, grupos);
    expect(s.map((x) => [x.grupo.id, x.alumnos.map((a) => a.id)])).toEqual([
      ['gk', ['2', '1']],
      ['ga', ['3']],
      ['gm', ['4']],
    ]);
  });

  it('el buscador no distingue acentos ni mayúsculas', () => {
    expect(agrupaAlumnos(alumnos, grupos, 'IÑIGO').flatMap((x) => x.alumnos.map((a) => a.id))).toEqual(['3']);
    expect(agrupaAlumnos(alumnos, grupos, 'inigo').flatMap((x) => x.alumnos.map((a) => a.id))).toEqual(['3']);
    expect(agrupaAlumnos(alumnos, grupos, 'nadie')).toEqual([]);
  });
});

describe('copiar a varios: cada uno recibe SU copia', () => {
  const s = (id: string, fecha: string, title: string): Sesion => ({
    id, fecha, title, kind: 'fuerza', description: 'Sentadilla 4×6', durationMin: 50, distanceKm: null, video: null,
    classId: null, userId: 'origen', position: 0, cargas: [{ ejercicio: 'Sentadilla', porcentaje: 75, series: 4, reps: 6 }],
  });
  const semana = [s('x', '2026-11-09', 'Fuerza A'), s('y', '2026-11-11', 'Fuerza B')];

  it('una fila por alumno y sesión, movida a la semana de destino', () => {
    const c = copiasParaAlumnos(semana, ['ana', 'luis'], diasEntre(LUNES, SIGUIENTE), 'origen');
    expect(c.map((x) => [x.alumnoId, x.fecha, x.title])).toEqual([
      ['ana', '2026-11-16', 'Fuerza A'], ['ana', '2026-11-18', 'Fuerza B'],
      ['luis', '2026-11-16', 'Fuerza A'], ['luis', '2026-11-18', 'Fuerza B'],
    ]);
  });

  it('no se comparte nada: cambiar la copia de uno no cambia la de otro (ni las cargas)', () => {
    const [ana, , luis] = copiasParaAlumnos(semana, ['ana', 'luis'], 7, 'origen');
    ana.title = 'Cambiada';
    ana.cargas[0].porcentaje = 90;
    expect(luis.title).toBe('Fuerza A');
    expect(luis.cargas[0].porcentaje).toBe(75);
    expect(semana[0].cargas[0].porcentaje).toBe(75);
    // Y no lleva el id de la sesión de origen: es una fila nueva.
    expect(Object.keys(ana)).not.toContain('id');
  });

  it('no duplica al propio alumno en sus mismos días, ni repite destinos', () => {
    expect(copiasParaAlumnos(semana, ['origen'], 0, 'origen')).toEqual([]);
    expect(copiasParaAlumnos(semana, ['origen'], 7, 'origen')).toHaveLength(2);
    expect(copiasParaAlumnos(semana, ['ana', 'ana'], 0, 'origen')).toHaveLength(2);
  });

  it('los días entre dos fechas, también a caballo de dos meses', () => {
    expect(diasEntre('2026-11-30', '2026-12-07')).toBe(7);
    expect(diasEntre('2026-11-16', '2026-11-09')).toBe(-7);
  });
});

describe('las acciones de «Planificar» (guardas estáticas)', () => {
  const src = readFileSync(join(__dirname, '..', 'app', 'actions', 'fisica.ts'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const cuerpo = (nombre: string) => {
    const i = src.indexOf(`export async function ${nombre}`);
    const j = src.indexOf('\nexport async function', i + 10);
    return src.slice(i, j === -1 ? undefined : j);
  };

  it('la lista va detrás de requireAdmin, acotada a la academia, y pagina (regla 74)', () => {
    const c = cuerpo('getAlumnosFisica');
    expect(c).toContain('requireAdmin()');
    expect(c).toMatch(/\.eq\('organization_id', org\)/);
    expect(c).toContain('paginaCompleta');
    expect(c).toMatch(/role !== 'admin' && p\.role !== 'superadmin'/);
  });

  it('copiar a varios comprueba que TODOS son de la academia y escribe una fila por alumno', () => {
    const c = cuerpo('copiarAAlumnos');
    expect(c).toContain('requireAdmin()');
    expect(c).toMatch(/from\('academy_members'\)[\s\S]*?\.eq\('academy_id', org\)[\s\S]*?\.in\('user_id', todos\)/);
    expect(c).toContain('(socios ?? []).length !== todos.length');
    expect(c).toContain('user_id: c.alumnoId');
    expect(c).toContain('class_id: null');
    expect(c).toContain('organization_id: org');
    // Solo copia ENTRENOS del alumno de origen, no clases de grupo.
    expect(c).toMatch(/\.eq\('user_id', origenId\)/);
  });
});

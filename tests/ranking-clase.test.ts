import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculaRanking, TOPE_RANKING, MIN_PARA_RANKING } from '../app/lib/ranking-clase';
import { tendenciaDeSesion, porcentaje, MIN_PARA_TENDENCIA, MARGEN_IGUAL } from '../app/lib/tendencia-entrenamiento';

const quita = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const lee = (rel: string) => quita(readFileSync(join(__dirname, '..', rel), 'utf-8').replace(/\r\n/g, '\n'));

const f = (id: string, nota: number, nombre: string | null = id) => ({ id, nombre, nota });

describe('calculaRanking', () => {
  it('ordena de mayor a menor nota y marca a quien mira', () => {
    const r = calculaRanking([f('a', 5), f('b', 8), f('c', 6.5)], 'c')!;
    expect(r.primeros.map((p) => p.nombre)).toEqual(['b', 'c', 'a']);
    expect(r.miPuesto).toBe(2);
    expect(r.primeros.find((p) => p.soyYo)!.nombre).toBe('c');
  });
  it('los empates comparten puesto y el siguiente salta (1, 2, 2, 4)', () => {
    const r = calculaRanking([f('a', 9), f('b', 7), f('c', 7), f('d', 3)], 'd')!;
    expect(r.primeros.map((p) => p.puesto)).toEqual([1, 2, 2, 4]);
  });
  it('enseña solo los primeros, pero a quien mira siempre le dice su puesto', () => {
    const filas = Array.from({ length: 25 }, (_, i) => f(`u${i}`, 10 - i * 0.3));
    const r = calculaRanking(filas, 'u20')!;
    expect(r.primeros).toHaveLength(TOPE_RANKING);
    expect(r.primeros.some((p) => p.soyYo)).toBe(false);
    expect(r.miPuesto).toBe(21);
    expect(r.total).toBe(25);
  });
  it('con menos de tres notas no hay ranking', () => {
    expect(MIN_PARA_RANKING).toBe(3);
    expect(calculaRanking([f('a', 5), f('b', 6)], 'a')).toBeNull();
  });
  it('si quien mira no está entre los que salen, no hay ranking', () => {
    expect(calculaRanking([f('a', 5), f('b', 6), f('c', 7)], 'zzz')).toBeNull();
  });
  it('sin nombre sale «Alumno», nunca el correo ni el id', () => {
    const r = calculaRanking([f('a', 5, null), f('b', 6, '  '), f('c', 7, 'Ana')], 'c')!;
    expect(r.primeros.map((p) => p.nombre)).toEqual(['Ana', 'Alumno', 'Alumno']);
  });
  it('una nota de 0 cuenta: es una nota, no un vacío (regla 16)', () => {
    const r = calculaRanking([f('a', 0), f('b', 6), f('c', 7)], 'a')!;
    expect(r.miPuesto).toBe(3);
  });
});

describe('las acciones del ranking', () => {
  const a = lee('app/actions/examenes-clase.ts');
  const cuerpo = (n: string) => { const i = a.indexOf(`export async function ${n}`); expect(i, n).toBeGreaterThan(-1); const s = a.indexOf('\nexport async function', i + 10); return a.slice(i, s === -1 ? undefined : s); };
  const get = cuerpo('getRankingExamenClase');
  it('piden módulo y usuario de la sesión y comprueban que el examen es de su turno', () => {
    expect(get).toContain("requireModule('presencial'");
    expect(get).toContain('esParticipante(');
    expect(get).toMatch(/\.eq\('organization_id', org\)/);
  });
  it('quien se ha salido no ve el ranking', () => {
    expect(get).toMatch(/yo\?\.ranking_oculto === true\) return \{ success: true as const, oculto: true/);
  });
  it('los ocultos se quitan antes de calcular', () => {
    expect(get).toContain('!ocultos.has(id)');
  });
  it('no devuelve ni correo ni id de otros', () => {
    const i = get.indexOf('const filas');
    expect(get.slice(i)).not.toMatch(/email/);
  });
  it('setMiRanking escribe sobre el usuario de la sesión, no sobre un parámetro', () => {
    const s = cuerpo('setMiRanking');
    expect(s).toContain('.eq(\'id\', auth.user.id)');
    expect(s).toMatch(/typeof visible !== 'boolean'/);
    expect(s).toContain("fallo('setMiRanking', error)");
  });
  it('hay guion SQL con el valor por defecto «sale»', () => {
    expect(readFileSync(join(__dirname, '..', 'docs/sql/ranking-clase.sql'), 'utf-8')).toMatch(/ranking_oculto boolean not null default false/);
  });
});

describe('tendenciaDeSesion', () => {
  it('porcentaje: sin respuestas es null, no 0', () => {
    expect(porcentaje({ acertadas: 0, contestadas: 0 })).toBeNull();
    expect(porcentaje({ acertadas: 0, contestadas: 5 })).toBe(0);
  });
  it('sube, baja o igual según el margen', () => {
    const h = { acertadas: 60, contestadas: 100 };
    expect(tendenciaDeSesion({ acertadas: 8, contestadas: 10 }, h)).toMatchObject({ actual: 80, habitual: 60, rumbo: 'sube', diferencia: 20 });
    expect(tendenciaDeSesion({ acertadas: 4, contestadas: 10 }, h)).toMatchObject({ rumbo: 'baja' });
    expect(tendenciaDeSesion({ acertadas: 6, contestadas: 10 }, h)).toMatchObject({ rumbo: 'igual' });
    expect(MARGEN_IGUAL).toBeGreaterThan(0);
  });
  it('con poca historia no hay tendencia, solo el porcentaje de hoy', () => {
    const t = tendenciaDeSesion({ acertadas: 8, contestadas: 10 }, { acertadas: 5, contestadas: MIN_PARA_TENDENCIA - 1 });
    expect(t).toEqual({ actual: 80, habitual: null, rumbo: null, diferencia: null });
    expect(tendenciaDeSesion({ acertadas: 8, contestadas: 10 }, null)!.rumbo).toBeNull();
  });
  it('sin nada contestado en la sesión no hay nada que decir', () => {
    expect(tendenciaDeSesion({ acertadas: 0, contestadas: 0 }, { acertadas: 50, contestadas: 100 })).toBeNull();
  });
});

describe('getAciertoHabitual', () => {
  const a = lee('app/actions/exams.ts');
  const i = a.indexOf('export async function getAciertoHabitual');
  const c = a.slice(i);
  it('solo entrenamiento (sin exam_id), solo del usuario, sin blancos y sin la propia sesión', () => {
    expect(c).toContain("requireModule('test'");
    expect(c).toContain(".is('exam_id', null)");
    expect(c).toContain(".neq('selected_index', -1)");
    expect(c).toContain(".eq('user_id', auth.user.id)");
    expect(c).toContain(".lt('created_at', hasta)");
  });
  it('el resultado del entrenamiento sigue sin nota: enseña %, no la nota con penalización', () => {
    const r = lee('app/components/student/modules/exams/ExamResults.tsx');
    const ent = r.slice(r.indexOf('function ResultadoEntrenamiento'), r.indexOf('function ResultadoSimulacro'));
    expect(ent).toContain('tendenciaDeSesion');
    expect(ent).not.toContain('scoreExam');
  });
});

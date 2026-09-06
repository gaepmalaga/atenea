import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSmartSession, type CandidataSesion } from '../app/lib/smart-session';
import type { QuestionState } from '../app/lib/question-scheduler';

/**
 * LA SESIÓN DE ENTRENAMIENTO ADAPTATIVO (P10).
 *
 * Vigila el método (`docs/METODO-APRENDIZAJE.md`): recaídas primero, tope de
 * material nuevo (~30 %) para no hundir el acierto por debajo del punto dulce,
 * redistribución cuando un cubo se queda corto, e intercalado de temas.
 */

const AYER = new Date(Date.now() - 2 * 86_400_000).toISOString();
const HACE_SEMANAS = new Date(Date.now() - 40 * 86_400_000).toISOString();

function estado(o: Partial<QuestionState> & { questionId: string }): QuestionState {
  return {
    box: 3,
    cajon: 'aprendiendo',
    streak: 1,
    lapses: 0,
    respuestas: 3,
    aciertos: 2,
    lastAnsweredAt: HACE_SEMANAS,
    dueAt: HACE_SEMANAS, // vencida hace mucho por defecto
    avgTimeMs: 12_000,
    avgChanges: 0,
    lastErrorType: null,
    soloBlancos: false,
    dominadaFragil: false,
    ...o,
  };
}

function banco(n: number, topic = 'T1', prefix = 'q'): CandidataSesion[] {
  return Array.from({ length: n }, (_, i) => ({ questionId: `${prefix}${i}`, topic }));
}

describe('casos borde', () => {
  it('banco vacío → sesión vacía, bancoCorto', () => {
    const r = buildSmartSession({ states: new Map(), disponibles: [], limit: 10 });
    expect(r.questionIds).toEqual([]);
    expect(r.bancoCorto).toBe(true);
  });

  it('limit 0 → nada', () => {
    const r = buildSmartSession({ states: new Map(), disponibles: banco(20), limit: 0 });
    expect(r.questionIds).toEqual([]);
    expect(r.bancoCorto).toBe(false);
  });

  it('banco más corto que el limit → se devuelve todo y bancoCorto', () => {
    const r = buildSmartSession({ states: new Map(), disponibles: banco(5), limit: 20 });
    expect(r.questionIds).toHaveLength(5);
    expect(r.bancoCorto).toBe(true);
  });
});

describe('arranque en frío: alumno sin historial', () => {
  it('todo son nuevas → sesión llena de nuevas (el tope se relaja si no hay otra cosa)', () => {
    const r = buildSmartSession({ states: new Map(), disponibles: banco(30), limit: 10 });
    expect(r.questionIds).toHaveLength(10);
    expect(r.resumen.nueva).toBe(10);
  });
});

describe('prioridad y cuotas', () => {
  it('las recaídas vencidas entran SIEMPRE y primero', () => {
    const states = new Map<string, QuestionState>();
    for (let i = 0; i < 3; i++) {
      states.set(`r${i}`, estado({ questionId: `r${i}`, box: 1, cajon: 'recaida', lapses: 1 }));
    }
    const disponibles: CandidataSesion[] = [
      ...banco(3, 'T1', 'r'),
      ...banco(20, 'T1', 'n'), // nuevas
    ];
    const r = buildSmartSession({ states, disponibles, limit: 10 });
    expect(r.resumen.recaida).toBe(3);
    // Las 3 recaídas están todas en la sesión
    for (let i = 0; i < 3; i++) expect(r.questionIds).toContain(`r${i}`);
  });

  it('el material nuevo se topa al ~30 % cuando hay repasos de sobra', () => {
    const states = new Map<string, QuestionState>();
    for (let i = 0; i < 100; i++) {
      states.set(`p${i}`, estado({ questionId: `p${i}`, box: 3, cajon: 'aprendiendo' }));
    }
    const disponibles = [...banco(100, 'T1', 'p'), ...banco(100, 'T1', 'n')];
    const r = buildSmartSession({ states, disponibles, limit: 20 });
    expect(r.resumen.nueva).toBeLessThanOrEqual(6); // 30 % de 20
    expect(r.questionIds).toHaveLength(20);
  });

  it('redistribuye el hueco cuando un cubo se queda corto', () => {
    const states = new Map<string, QuestionState>();
    states.set('r0', estado({ questionId: 'r0', box: 1, cajon: 'recaida' }));
    const disponibles = [{ questionId: 'r0', topic: 'T1' }, ...banco(30, 'T1', 'n')];
    const r = buildSmartSession({ states, disponibles, limit: 10 });
    expect(r.resumen.recaida).toBe(1);
    expect(r.resumen.nueva).toBe(9);
    expect(r.questionIds).toHaveLength(10);
  });

  it('las preguntas NO vencidas (dormidas) no entran', () => {
    const states = new Map<string, QuestionState>();
    const futuro = new Date(Date.now() + 10 * 86_400_000).toISOString();
    for (let i = 0; i < 20; i++) {
      states.set(`d${i}`, estado({ questionId: `d${i}`, box: 4, cajon: 'consolidando', dueAt: futuro, lastAnsweredAt: AYER }));
    }
    const r = buildSmartSession({ states, disponibles: banco(20, 'T1', 'd'), limit: 10 });
    // Solo podrían entrar como "refuerzo" las tiernas vistas hace <2 días; estas
    // son caja 4, así que ni eso.
    expect(r.questionIds).toHaveLength(0);
    expect(r.bancoCorto).toBe(true);
  });

  it('las atascadas se topan a 2 por sesión', () => {
    const states = new Map<string, QuestionState>();
    for (let i = 0; i < 10; i++) {
      states.set(`a${i}`, estado({ questionId: `a${i}`, box: 1, cajon: 'atascada', lapses: 6 }));
    }
    const r = buildSmartSession({ states, disponibles: [...banco(10, 'T1', 'a'), ...banco(20, 'T1', 'n')], limit: 12 });
    expect(r.resumen.atascada).toBeLessThanOrEqual(2);
    expect(r.atascadasTotales).toBe(10);
  });
});

describe('intercalado de temas (regla 15 + técnica 5)', () => {
  it('con dos temas, no hay 3 seguidas del mismo si se puede evitar', () => {
    const disponibles = [...banco(10, 'Constitución', 'c'), ...banco(10, 'Extranjería', 'e')];
    const r = buildSmartSession({ states: new Map(), disponibles, limit: 12 });
    const temaDe = (id: string) => (id.startsWith('c') ? 'C' : 'E');
    let maxSeguidas = 1;
    let seguidas = 1;
    for (let i = 1; i < r.questionIds.length; i++) {
      if (temaDe(r.questionIds[i]) === temaDe(r.questionIds[i - 1])) seguidas++;
      else seguidas = 1;
      maxSeguidas = Math.max(maxSeguidas, seguidas);
    }
    expect(maxSeguidas).toBeLessThanOrEqual(2);
  });
});

describe('un tema nuevo se sirve en bloque si hay temas conocidos en la sesión', () => {
  it('las preguntas del tema apenas tocado van al principio, agrupadas', () => {
    const states = new Map<string, QuestionState>();
    // «Conocido»: 5 preguntas con estado, todas de repaso vencido.
    for (let i = 0; i < 5; i++) states.set(`k${i}`, estado({ questionId: `k${i}`, box: 3, cajon: 'aprendiendo' }));
    const disponibles: CandidataSesion[] = [
      ...banco(5, 'Conocido', 'k'),
      ...banco(10, 'NuevoTema', 'n'), // 0 con estado -> tema nuevo
    ];
    const r = buildSmartSession({ states, disponibles, limit: 10 });
    const idx = r.questionIds.map((id) => (id.startsWith('n') ? 'N' : 'K'));
    // Todas las N (tema nuevo) antes que cualquier K
    const ultimaN = idx.lastIndexOf('N');
    const primeraK = idx.indexOf('K');
    expect(primeraK).toBeGreaterThan(ultimaN);
  });

  it('si TODA la sesión es de temas nuevos (arranque en frío), se intercala igual', () => {
    const disponibles = [...banco(10, 'A', 'a'), ...banco(10, 'B', 'b')];
    const r = buildSmartSession({ states: new Map(), disponibles, limit: 12 });
    const temaDe = (id: string) => id[0];
    let maxSeguidas = 1, seg = 1;
    for (let i = 1; i < r.questionIds.length; i++) {
      seg = temaDe(r.questionIds[i]) === temaDe(r.questionIds[i - 1]) ? seg + 1 : 1;
      maxSeguidas = Math.max(maxSeguidas, seg);
    }
    expect(maxSeguidas).toBeLessThanOrEqual(2);
  });
});

describe('calibración al 85 %', () => {
  it('sesión de puras recaídas → intenta acercarse metiendo repasos/consolidación', () => {
    const states = new Map<string, QuestionState>();
    for (let i = 0; i < 30; i++) states.set(`r${i}`, estado({ questionId: `r${i}`, box: 1, cajon: 'recaida' }));
    for (let i = 0; i < 30; i++) states.set(`c${i}`, estado({ questionId: `c${i}`, box: 4, cajon: 'consolidando' }));
    const disponibles = [...banco(30, 'T1', 'r'), ...banco(30, 'T1', 'c')];
    const r = buildSmartSession({ states, disponibles, limit: 20 });
    // No debería salir una sesión imposible (todo recaídas al 0,55)
    expect(r.aciertoEstimado).toBeGreaterThan(0.6);
  });
});

describe('guarda: smart-session es puro', () => {
  it('no importa React ni Supabase', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'lib', 'smart-session.ts'), 'utf-8');
    expect(src).not.toMatch(/from ['"]react['"]/);
    expect(src).not.toMatch(/supabase|createClient/i);
  });
});

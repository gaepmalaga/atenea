import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planExamen, MEZCLA_DIFICULTAD, type CandidataExamen } from '../app/lib/exam-blueprint';

/**
 * EL SIMULACRO ES REPRESENTATIVO, NO ALEATORIO.
 *
 * Lo que se vigila: reparte por temas, evita lo reciente, y dos simulacros del
 * mismo nivel tienen la misma mezcla de dificultad (si no, comparar dos notas
 * no significa nada).
 */

// Generador determinista para que los tests no dependan del azar.
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function banco(temas: number, porTema: number): CandidataExamen[] {
  const out: CandidataExamen[] = [];
  for (let t = 0; t < temas; t++) {
    for (let i = 0; i < porTema; i++) {
      out.push({
        questionId: `t${t}-q${i}`,
        topic: `Tema ${t}`,
        difficultyLevel: (i % 3) + 1,
        legalReference: `Art. ${10 + (i % 5)}`,
      });
    }
  }
  return out;
}

describe('reparto por temas', () => {
  it('cada tema recibe su cuota, no sale amontonado', () => {
    const plan = planExamen({ disponibles: banco(5, 20), limit: 50, dificultad: 'medium', random: prng(1) });
    expect(plan.questionIds).toHaveLength(50);
    const porTema = new Map<string, number>();
    for (const id of plan.questionIds) {
      const t = id.split('-')[0];
      porTema.set(t, (porTema.get(t) ?? 0) + 1);
    }
    // 50 / 5 = 10 por tema, exactos.
    for (const n of porTema.values()) expect(n).toBe(10);
  });

  it('el resto (limit no divisible) va a los temas con más banco', () => {
    // Tema 0 tiene 30, el resto 5. 22 preguntas, 5 temas → 4 por tema + 2 de resto.
    const b = [...banco(1, 30).map((q) => ({ ...q, topic: 'Grande' })), ...banco(4, 5)];
    const plan = planExamen({ disponibles: b, limit: 22, dificultad: 'medium', random: prng(2) });
    const grande = plan.questionIds.filter((id) => b.find((q) => q.questionId === id)?.topic === 'Grande').length;
    expect(grande).toBeGreaterThanOrEqual(5); // 4 de cuota + al menos 1 de resto
  });

  it('un solo tema → todas de ahí', () => {
    const plan = planExamen({ disponibles: banco(1, 40), limit: 20, dificultad: 'medium', random: prng(3) });
    expect(plan.questionIds).toHaveLength(20);
    expect(new Set(plan.questionIds.map((id) => id.split('-')[0])).size).toBe(1);
  });
});

describe('no repite lo reciente', () => {
  it('evita las contestadas hace poco si hay frescas de sobra', () => {
    const b = banco(4, 20);
    const recientes = new Set(b.slice(0, 20).map((q) => q.questionId)); // el Tema 0 entero
    const plan = planExamen({ disponibles: b, limit: 40, dificultad: 'medium', recientes, random: prng(4) });
    // Con 60 frescas para 40, ninguna reciente debería colarse.
    expect(plan.questionIds.some((id) => recientes.has(id))).toBe(false);
  });

  it('si NO llegan las frescas, tira de las recientes antes que quedarse corto', () => {
    const b = banco(2, 10); // 20 en total
    const recientes = new Set(b.slice(0, 15).map((q) => q.questionId));
    const plan = planExamen({ disponibles: b, limit: 20, dificultad: 'medium', recientes, random: prng(5) });
    expect(plan.questionIds).toHaveLength(20);
  });
});

describe('mezcla de dificultad', () => {
  it('es FIJA por nivel: dos «estándar» tienen el mismo reparto', () => {
    const b = banco(1, 90);
    const p1 = planExamen({ disponibles: b, limit: 30, dificultad: 'medium', random: prng(10) });
    const p2 = planExamen({ disponibles: b, limit: 30, dificultad: 'medium', random: prng(999) });
    const cuenta = (ids: string[]) => {
      const c = [0, 0, 0];
      for (const id of ids) {
        const q = b.find((x) => x.questionId === id)!;
        c[(q.difficultyLevel ?? 2) - 1]++;
      }
      return c;
    };
    // El reparto por nivel es el mismo aunque cambie la semilla (±1 por el redondeo).
    const [a1, m1, h1] = cuenta(p1.questionIds);
    const [a2, m2, h2] = cuenta(p2.questionIds);
    expect(Math.abs(a1 - a2)).toBeLessThanOrEqual(1);
    expect(Math.abs(m1 - m2)).toBeLessThanOrEqual(1);
    expect(Math.abs(h1 - h2)).toBeLessThanOrEqual(1);
    // Y sigue la proporción de MEZCLA_DIFICULTAD.medium ([0.30, 0.45, 0.25]).
    expect(a1).toBeGreaterThanOrEqual(Math.round(30 * MEZCLA_DIFICULTAD.medium[0]) - 2);
  });

  it('«extrema» carga las difíciles; «básica» las fáciles', () => {
    const b = banco(1, 90);
    const facil = (ids: string[]) => ids.filter((id) => b.find((x) => x.questionId === id)?.difficultyLevel === 1).length;
    const dificil = (ids: string[]) => ids.filter((id) => b.find((x) => x.questionId === id)?.difficultyLevel === 3).length;
    const pE = planExamen({ disponibles: b, limit: 30, dificultad: 'hard', random: prng(11) });
    const pB = planExamen({ disponibles: b, limit: 30, dificultad: 'easy', random: prng(11) });
    expect(dificil(pE.questionIds)).toBeGreaterThan(dificil(pB.questionIds));
    expect(facil(pB.questionIds)).toBeGreaterThan(facil(pE.questionIds));
  });
});

describe('cobertura por artículo', () => {
  it('reparte entre artículos distintos en vez de amontonarse en uno', () => {
    // Un tema con 5 artículos, 20 preguntas de cada uno. Pedimos 10.
    const b: CandidataExamen[] = [];
    for (let a = 0; a < 5; a++) for (let i = 0; i < 20; i++) {
      b.push({ questionId: `a${a}-q${i}`, topic: 'T', difficultyLevel: 2, legalReference: `Art. ${a}` });
    }
    const plan = planExamen({ disponibles: b, limit: 10, dificultad: 'medium', random: prng(20) });
    const arts = new Set(plan.questionIds.map((id) => id.split('-')[0]));
    // Con 5 artículos y 10 preguntas, deberían salir de al menos 4 artículos.
    expect(arts.size).toBeGreaterThanOrEqual(4);
  });
});

describe('casos límite', () => {
  it('banco vacío o limit 0', () => {
    expect(planExamen({ disponibles: [], limit: 10, dificultad: 'medium' }).questionIds).toEqual([]);
    expect(planExamen({ disponibles: banco(2, 5), limit: 0, dificultad: 'medium' }).questionIds).toEqual([]);
  });

  it('banco más pequeño que limit → devuelve lo que hay y avisa', () => {
    const plan = planExamen({ disponibles: banco(2, 5), limit: 50, dificultad: 'medium', random: prng(30) });
    expect(plan.questionIds).toHaveLength(10);
    expect(plan.corto).toBe(true);
  });

  it('no repite ninguna questionId', () => {
    const plan = planExamen({ disponibles: banco(5, 20), limit: 60, dificultad: 'medium', random: prng(40) });
    expect(new Set(plan.questionIds).size).toBe(plan.questionIds.length);
  });
});

describe('guarda: el blueprint es puro', () => {
  it('no importa React ni Supabase', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'lib', 'exam-blueprint.ts'), 'utf-8');
    expect(src).not.toMatch(/from ['"]react['"]/);
    expect(src).not.toMatch(/supabase|createClient/i);
  });
});

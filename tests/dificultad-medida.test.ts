import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MIN_RESPUESTAS, UMBRAL_FACIL, UMBRAL_DIFICIL, tasaDeAcierto, nivelMedido, observaciones, respuestasDeIntentos,
  respuestasDeExamenClase, decideCambios, type RespuestaMedible,
} from '../app/lib/dificultad-medida';
import { BLANCO } from '../app/lib/examen-clase';

const r = (userId: string, questionId: string, acierto: boolean, en = '2026-11-01T10:00:00Z'): RespuestaMedible => ({ userId, questionId, acierto, en });
const muchos = (q: string, aciertos: number, total: number, prefijo = 'u') =>
  Array.from({ length: total }, (_, i) => r(`${prefijo}${i}`, q, i < aciertos));

describe('nivelMedido', () => {
  it('con menos de 30 respuestas no se mide, aunque todas sean fallos', () => {
    expect(nivelMedido({ contestadas: MIN_RESPUESTAS - 1, aciertos: 0 })).toBeNull();
    expect(nivelMedido(undefined)).toBeNull();
  });

  it('el acierto decide el nivel: fácil, media o difícil', () => {
    expect(nivelMedido({ contestadas: 40, aciertos: 36 })).toBe(1); // 90 %
    expect(nivelMedido({ contestadas: 40, aciertos: 26 })).toBe(2); // 65 %
    expect(nivelMedido({ contestadas: 40, aciertos: 12 })).toBe(3); // 30 %
  });

  it('los umbrales son de «a partir de» y «por debajo de»: 75 % ya es fácil, 50 % ya no es difícil', () => {
    expect(nivelMedido({ contestadas: 40, aciertos: 40 * UMBRAL_FACIL })).toBe(1);
    expect(nivelMedido({ contestadas: 40, aciertos: 40 * UMBRAL_DIFICIL })).toBe(2);
    expect(nivelMedido({ contestadas: 40, aciertos: 40 * UMBRAL_DIFICIL - 1 })).toBe(3);
  });

  it('sin respuestas, la tasa es null y no 0 (regla 8)', () => {
    expect(tasaDeAcierto({ contestadas: 0, aciertos: 0 })).toBeNull();
    expect(tasaDeAcierto(undefined)).toBeNull();
  });
});

describe('observaciones: lo que cuenta y lo que no', () => {
  it('las cuentas de demostración no cuentan', () => {
    const demo = new Set(['u0', 'u1', 'u2']);
    const o = observaciones(muchos('q', 10, 10), demo);
    expect(o.get('q')).toEqual({ contestadas: 7, aciertos: 7 });
  });

  it('una sola respuesta por alumno y pregunta: la primera', () => {
    const o = observaciones([
      r('a', 'q', false, '2026-11-01T10:00:00Z'),
      r('a', 'q', true, '2026-11-02T10:00:00Z'),
      r('a', 'q', true, '2026-11-03T10:00:00Z'),
    ], new Set());
    expect(o.get('q')).toEqual({ contestadas: 1, aciertos: 0 });
  });

  it('la primera lo es por la fecha, no por el orden en que lleguen las filas', () => {
    const o = observaciones([r('a', 'q', true, '2026-11-03T10:00:00Z'), r('a', 'q', false, '2026-11-01T10:00:00Z')], new Set());
    expect(o.get('q')).toEqual({ contestadas: 1, aciertos: 0 });
  });

  it('cuenta cada pregunta por separado', () => {
    const o = observaciones([r('a', 'q1', true), r('a', 'q2', false), r('b', 'q1', false)], new Set());
    expect(o.get('q1')).toEqual({ contestadas: 2, aciertos: 1 });
    expect(o.get('q2')).toEqual({ contestadas: 1, aciertos: 0 });
  });
});

describe('respuestasDeIntentos', () => {
  const base = { user_id: 'a', question_id: 'q', created_at: '2026-11-01T10:00:00Z' };

  it('un blanco no es un fallo: no entra', () => {
    expect(respuestasDeIntentos([{ ...base, selected_index: BLANCO, is_correct: false }])).toEqual([]);
  });

  it('«no se sabe» (selected_index nulo) tampoco entra', () => {
    expect(respuestasDeIntentos([{ ...base, selected_index: null, is_correct: false }])).toEqual([]);
    expect(respuestasDeIntentos([{ ...base, selected_index: 1, is_correct: null }])).toEqual([]);
  });

  it('un intento sin pregunta del banco no entra', () => {
    expect(respuestasDeIntentos([{ ...base, question_id: null, selected_index: 1, is_correct: true }])).toEqual([]);
  });

  it('un fallo y un acierto de verdad sí', () => {
    const s = respuestasDeIntentos([{ ...base, selected_index: 2, is_correct: false }, { ...base, user_id: 'b', selected_index: 0, is_correct: true }]);
    expect(s.map((x) => x.acierto)).toEqual([false, true]);
  });

  it('el BLANCO de aquí es el de examen-clase (si uno cambia, el otro tiene que cambiar)', () => {
    expect(BLANCO).toBe(-1);
  });
});

describe('respuestasDeExamenClase', () => {
  const preguntas = [
    { id: 'q1', q: '', o: [], c: 0, t: '', e: null, r: null, d: 2 },
    { id: null, q: '', o: [], c: 1, t: '', e: null, r: null, d: 2 },
    { id: 'q3', q: '', o: [], c: 2, t: '', e: null, r: null, d: 2 },
    { id: 'q4', q: '', o: [], c: 1, t: '', e: null, r: null, d: 2 },
  ];

  it('mide contra la copia guardada, y se salta blancos y preguntas sin id', () => {
    const s = respuestasDeExamenClase('u', '2026-11-05T10:00:00Z', preguntas, [0, 1, 1, BLANCO]);
    expect(s).toEqual([
      { userId: 'u', questionId: 'q1', acierto: true, en: '2026-11-05T10:00:00Z' },
      { userId: 'u', questionId: 'q3', acierto: false, en: '2026-11-05T10:00:00Z' },
    ]);
  });

  it('respuestas que faltan o no son una opción, fuera', () => {
    expect(respuestasDeExamenClase('u', 'x', preguntas, [])).toEqual([]);
    expect(respuestasDeExamenClase('u', 'x', preguntas, [1.5, 0, 0, 0])).toHaveLength(2);
  });
});

describe('decideCambios', () => {
  const dificil = observaciones(muchos('q', 8, 40), new Set()); // 20 % → difícil

  it('la medida sustituye a la estimación y al 2 por defecto', () => {
    for (const source of ['estimada', null]) {
      const [p] = decideCambios([{ id: 'q', difficulty_level: 2, difficulty_source: source }], dificil);
      expect(p).toMatchObject({ nivel: 3, escribeNivel: true, conflicto: false });
    }
  });

  it('lo que puso un preparador NO se pisa: se enseña como conflicto', () => {
    const [p] = decideCambios([{ id: 'q', difficulty_level: 1, difficulty_source: 'preparador' }], dificil);
    expect(p).toMatchObject({ escribeNivel: false, conflicto: true });
  });

  it('si el preparador y la medida coinciden, no hay conflicto ni cambio', () => {
    const [p] = decideCambios([{ id: 'q', difficulty_level: 3, difficulty_source: 'preparador' }], dificil);
    expect(p).toMatchObject({ escribeNivel: false, conflicto: false });
  });

  it('una pregunta ya medida con el mismo nivel no se reescribe', () => {
    const [p] = decideCambios([{ id: 'q', difficulty_level: 3, difficulty_source: 'medida' }], dificil);
    expect(p.escribeNivel).toBe(false);
  });

  it('una medida anterior se corrige si los datos nuevos dicen otra cosa', () => {
    const [p] = decideCambios([{ id: 'q', difficulty_level: 1, difficulty_source: 'medida' }], dificil);
    expect(p.escribeNivel).toBe(true);
  });

  it('sin respuestas suficientes no hay propuesta', () => {
    const poco = observaciones(muchos('q', 1, MIN_RESPUESTAS - 1), new Set());
    expect(decideCambios([{ id: 'q', difficulty_level: 2, difficulty_source: null }], poco)).toEqual([]);
  });

  it('lleva la tasa para guardar global_success_rate aunque el nivel no cambie', () => {
    const [p] = decideCambios([{ id: 'q', difficulty_level: 1, difficulty_source: 'preparador' }], dificil);
    expect(p.tasa).toBeCloseTo(0.2);
    expect(p.contestadas).toBe(40);
  });
});

describe('el módulo se puede cargar desde un script de Node', () => {
  it('no importa nada sin extensión ni arrastra `examen-clase` como valor', () => {
    const src = readFileSync(join(__dirname, '..', 'app/lib/dificultad-medida.ts'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const m of src.matchAll(/^import (?:type )?[^'\n]*from '([^']+)'/gm)) expect(m[1], m[0]).toMatch(/\.ts$/);
    expect(src).not.toMatch(/^import \{[^}]*\} from '\.\/examen-clase/m);
    expect(src).not.toMatch(/^import (?!type)[^\n]*from '\.\/examen-clase/m);
  });
});

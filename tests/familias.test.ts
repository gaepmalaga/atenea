import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normaliza, terminos, cantidades, codigos, vectores, paresParecidos, agrupa, familiasDelBanco,
  UMBRAL_FAMILIA, MAX_FAMILIA, type PreguntaBanco,
} from '../app/lib/familias';
import { planExamenSinFamilias, type CandidataExamen } from '../app/lib/exam-blueprint';

/** Regla 119 · las familias de preguntas: la misma pregunta con otras palabras. */

const RAIZ = join(__dirname, '..');
const q = (id: string, enunciado: string, correcta: string, ...malas: string[]): PreguntaBanco =>
  ({ id, tema: 1, enunciado, opciones: [correcta, ...malas], correcta: 0 });

/** Tres redacciones del MISMO hecho (sacadas del banco real) y varias que no lo son. */
const BANCO: PreguntaBanco[] = [
  q('a1', 'Según el texto proporcionado, ¿cuál es la principal diferencia entre el tráfico ilícito de migrantes y la trata de seres humanos?',
    'En el tráfico ilícito de migrantes el bien jurídico afectado es el control de los flujos y la relación termina con la entrada; en la trata hay explotación de la persona.', 'Ninguna', 'Solo la nacionalidad'),
  q('a2', '¿Cuál es la distinción fundamental que establece el texto entre el tráfico ilícito de migrantes y la trata de seres humanos?',
    'En el tráfico ilícito, el bien jurídico afectado es el control de los flujos y la relación termina con la entrada del migrante, mientras que en la trata hay explotación.', 'Que uno es delito', 'Que es lo mismo'),
  q('a3', 'En el contexto de la labor policial, el texto establece una distinción entre tráfico ilícito de migrantes y trata de seres humanos. ¿Cuál es?',
    'El tráfico ilícito de migrantes tiene como bien jurídico el control de los flujos y la relación acaba con la entrada; la trata implica explotación de la persona.', 'Ninguna', 'El idioma'),
  q('b1', 'Según el Artículo 78 del Código Penal, ¿qué autoridad es competente para acordar la medida cuando la pena a cumplir resulte inferior a la mitad de la suma total?',
    'El juez de vigilancia penitenciaria.', 'El Fiscal', 'El Gobierno'),
  q('b2', 'Según el Artículo 78 del Código Penal, ¿qué condición se valora cuando la pena a cumplir resulte inferior a la mitad de la suma total?',
    'Un pronóstico individualizado y favorable de reinserción social.', 'El arrepentimiento', 'El pago de la multa'),
  q('c1', 'Según la Disposición final, ¿cuándo entrará en vigor la presente ley?', 'Al día siguiente de su publicación en el Boletín Oficial del Estado.', 'Nunca', 'Mañana'),
  q('c2', 'De acuerdo con la Disposición Final Séptima, ¿cuándo entrará en vigor la ley a la que se refiere el texto?', 'A los veinte días de su publicación en el Boletín Oficial del Estado.', 'Hoy', 'Nunca'),
  q('d1', 'Según el Artículo 265, la actualización que exige indicar en la denuncia cualquier fuente de conocimiento del denunciante, ¿desde cuándo es aplicable?', 'El 20 de marzo de 2024.', 'Ayer', 'Hoy'),
  q('d2', 'Según el Artículo 514, la actualización referente a la requisitoria y su unión a la causa, ¿desde cuándo es aplicable?', 'El 20 de marzo de 2024.', 'Ayer', 'Hoy'),
  q('e1', 'En el sistema de valoración de la inteligencia 4x4, ¿qué indica la calificación C2?', 'La fuente no es habitualmente fiable y la información es probablemente cierta.', 'Nada', 'Todo'),
  q('e2', 'En el sistema de valoración de la inteligencia 4x4, ¿qué indica la calificación C3?', 'La fuente no es habitualmente fiable y la información es posiblemente cierta.', 'Nada', 'Todo'),
  q('f1', '¿Cuál es el órgano que crea los órganos directivos de los Departamentos Ministeriales?', 'El Consejo de Ministros.', 'El Rey', 'Las Cortes'),
];

describe('el texto', () => {
  it('sin tildes, signos ni mayúsculas', () => {
    expect(normaliza('  ¿Según el ARTÍCULO 25, del Código Civil?  ')).toBe('segun el articulo 25 del codigo civil');
  });

  it('las fórmulas de enunciado no cuentan como palabras', () => {
    const t = terminos('Según el texto proporcionado, ¿cuál de las siguientes afirmaciones es correcta?');
    expect(t).toEqual([]);
  });

  it('un plural y un singular se juntan', () => {
    expect(terminos('órganos')).toEqual(terminos('órgano'));
  });

  it('las cantidades y los números se distinguen', () => {
    expect(cantidades('a los veinte días, el segundo lugar y 15 años')).toEqual(['15', 'segundo', 'veinte']);
    expect(cantidades('al día siguiente')).toEqual([]);
    expect(codigos('Artículo 265 y 2024 con C3 en 4x4')).toEqual(['2024', '265', '4x4', 'c3']);
  });
});

describe('qué es la misma pregunta', () => {
  const vs = vectores(BANCO);
  const pares = paresParecidos(BANCO, vs, UMBRAL_FAMILIA);
  const hay = (x: string, y: string) => pares.some((p) => (BANCO[p.a].id === x && BANCO[p.b].id === y) || (BANCO[p.a].id === y && BANCO[p.b].id === x));

  it('las tres redacciones del mismo hecho se juntan', () => {
    expect(hay('a1', 'a2')).toBe(true);
    expect(hay('a1', 'a3')).toBe(true);
  });

  it('el mismo artículo preguntando cosas distintas NO es la misma pregunta', () => {
    expect(hay('b1', 'b2')).toBe(false);
  });

  it('un plazo distinto es otro hecho (al día siguiente / a los veinte días)', () => {
    expect(hay('c1', 'c2')).toBe(false);
  });

  it('otro artículo con la misma respuesta es otra pregunta', () => {
    expect(hay('d1', 'd2')).toBe(false);
  });

  it('otro código (C2 frente a C3) es otra pregunta', () => {
    expect(hay('e1', 'e2')).toBe(false);
  });

  it('las familias salen de los pares', () => {
    const { familias } = familiasDelBanco(BANCO);
    expect(familias.map((f) => f.miembros.map((i) => BANCO[i].id).sort())).toEqual([['a1', 'a2', 'a3']]);
  });
});

describe('las familias no se encadenan', () => {
  it('A≈B, B≈C, C≈D no hacen una familia de cuatro si pasa del tope', () => {
    const pares = Array.from({ length: 9 }, (_, i) => ({ a: i, b: i + 1, similitud: 0.9 - i * 0.01 }));
    const f = agrupa(10, pares, 5);
    expect(Math.max(...f.map((x) => x.miembros.length))).toBeLessThanOrEqual(5);
  });

  it('el tope por defecto deja juntas las familias grandes reales', () => {
    expect(MAX_FAMILIA).toBeGreaterThanOrEqual(26);
  });

  it('sin pares no hay familias; una pregunta sola no es familia', () => {
    expect(agrupa(5, [])).toEqual([]);
    expect(familiasDelBanco([BANCO[11]]).familias).toEqual([]);
  });
});

describe('el examen no repite el mismo hecho', () => {
  const cand = (n: number, familia: (i: number) => string | null): CandidataExamen[] =>
    Array.from({ length: n }, (_, i) => ({ questionId: `q${i}`, topic: `t${i % 4}`, difficultyLevel: 2, legalReference: null, familia: familia(i) }));
  const repetidas = (ids: string[], c: CandidataExamen[]) => {
    const fam = new Map(c.map((x) => [x.questionId, x.familia]));
    const cuenta = new Map<string, number>();
    for (const id of ids) { const f = fam.get(id); if (f) cuenta.set(f, (cuenta.get(f) ?? 0) + 1); }
    return [...cuenta.values()].filter((n) => n > 1).length;
  };

  it('con bastantes hechos distintos, como mucho una por familia', () => {
    const c = cand(200, (i) => `f${i % 50}`); // 50 familias de 4
    for (let k = 0; k < 30; k++) {
      const p = planExamenSinFamilias({ disponibles: c, limit: 40, dificultad: 'medium' });
      expect(p.questionIds).toHaveLength(40);
      expect(repetidas(p.questionIds, c)).toBe(0);
      expect(p.conRepetidas).toBeUndefined();
    }
  });

  it('las que no tienen familia entran todas', () => {
    const c = cand(40, () => null);
    expect(planExamenSinFamilias({ disponibles: c, limit: 40, dificultad: 'medium' }).questionIds).toHaveLength(40);
  });

  it('si no hay bastantes hechos distintos, el examen sale COMPLETO y lo dice', () => {
    const c = cand(60, (i) => `f${i % 10}`); // solo 10 hechos
    const p = planExamenSinFamilias({ disponibles: c, limit: 30, dificultad: 'medium' });
    expect(p.questionIds).toHaveLength(30);
    expect(p.corto).toBe(false);
    expect(p.conRepetidas).toBe(true);
  });

  it('si ni así llega, es corto, y no inventa', () => {
    const c = cand(5, (i) => `f${i}`);
    const p = planExamenSinFamilias({ disponibles: c, limit: 20, dificultad: 'medium' });
    expect(p.corto).toBe(true);
    expect(p.questionIds).toHaveLength(5);
  });
});

describe('dónde se usa', () => {
  const lee = (r: string) => readFileSync(join(RAIZ, r), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const exams = lee('app/actions/exams.ts');

  it('el simulacro del alumno y el examen en papel usan el planificador con familias', () => {
    expect(exams.match(/planExamenSinFamilias\(\{/g)?.length).toBe(2);
    expect(exams).not.toMatch(/[^a-zA-Z]planExamen\(\{/);
    expect(exams).toContain('familia: f.family_id ?? null');
  });

  it('el guion no borra ni desactiva preguntas: solo añade la columna', () => {
    const sql = readFileSync(join(RAIZ, 'docs/sql/familias-preguntas.sql'), 'utf-8').replace(/--.*$/gm, '');
    expect(sql).toMatch(/add column if not exists family_id uuid/);
    expect(sql).not.toMatch(/delete|drop|update/i);
  });

  it('el script escribe solo `family_id`, nunca el estado de una pregunta', () => {
    const s = lee('scripts/operacion/agrupar-familias.mjs');
    expect(s).toContain("update({ family_id: fam })");
    expect(s).not.toMatch(/status:\s*'(disabled|discarded)'/);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resumeDudosas, esDudosa, confianzaDeDuda, umbralDeAcierto, fraseDudosas, intentosDePreguntas,
  umbralEnTexto, porcentajeEnTexto, netoEnTexto, DUDA, MIN_DUDOSAS_PARA_VEREDICTO,
} from '../app/lib/dudosas';
import { buildExamResults, toResultRow, BLANK_INDEX } from '../app/lib/exam-results';
import { inferFirmeza, FIRMEZA } from '../app/lib/answer-signals';
import { computeQuestionStates, MAX_BOX_TITUBEANTE } from '../app/lib/question-scheduler';

const contestada = (correcta: boolean, confidence: number | null) => ({
  is_correct: correcta, selected_index: 0, confidence,
});
const blanco = (confidence: number | null) => ({ is_correct: false, selected_index: BLANK_INDEX, confidence });

describe('qué se guarda en confidence', () => {
  it('marcada → dudosa, en blanco o no', () => {
    expect(confianzaDeDuda(true, false)).toBe(DUDA.DUDOSA);
    expect(confianzaDeDuda(true, true)).toBe(DUDA.DUDOSA);
  });

  it('sin marcar y contestada → no dudosa; sin marcar y en blanco → null', () => {
    expect(confianzaDeDuda(false, false)).toBe(DUDA.NO_DUDOSA);
    expect(confianzaDeDuda(undefined, false)).toBe(DUDA.NO_DUDOSA);
    // No hubo respuesta de la que decir si se dudó.
    expect(confianzaDeDuda(false, true)).toBeNull();
  });

  it('se lee: 0 y 1 son duda (0 es el «a ciegas» de P10b), 2 no, lo demás no se sabe', () => {
    expect(esDudosa(0)).toBe(true);
    expect(esDudosa(1)).toBe(true);
    expect(esDudosa(2)).toBe(false);
    expect(esDudosa(null)).toBeNull();
    expect(esDudosa(undefined)).toBeNull();
    expect(esDudosa(7)).toBeNull();
  });

  it('toResultRow conserva la marca de un blanco (antes la borraba)', () => {
    const fila = toResultRow({ questionId: 'q', topic: 't', isCorrect: false, selectedIndex: BLANK_INDEX, confidence: DUDA.DUDOSA });
    expect(fila.confidence).toBe(DUDA.DUDOSA);
  });

  it('buildExamResults traduce la marca de cada pregunta', () => {
    const opciones = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const filas = buildExamResults([
      { id: '1', userAnswer: 'a', correctOptionId: 'a', options: opciones, dudosa: true },
      { id: '2', userAnswer: 'b', correctOptionId: 'a', options: opciones },
      { id: '3', userAnswer: null, correctOptionId: 'a', options: opciones, dudosa: true },
      { id: '4', userAnswer: null, correctOptionId: 'a', options: opciones },
    ]);
    expect(filas.map((f) => f.confidence)).toEqual([DUDA.DUDOSA, DUDA.NO_DUDOSA, DUDA.DUDOSA, null]);
    // Y llega a la fila de la tabla.
    expect(toResultRow({ ...filas[2] }).confidence).toBe(DUDA.DUDOSA);
  });
});

describe('el umbral sale de la fórmula del BOE', () => {
  it('con 3 opciones, contestar compensa por encima de 1/3', () => {
    expect(umbralDeAcierto()).toBeCloseTo(1 / 3);
  });

  it('con 4 opciones sería 1/4', () => {
    expect(umbralDeAcierto({ options: 4, scale: 10, passMark: 5, secondsPerQuestion: 30 })).toBe(0.25);
  });
});

describe('resumeDudosas', () => {
  it('sin ninguna marca no hay datos (histórico), y no es lo mismo que cero', () => {
    const r = resumeDudosas([contestada(true, null), blanco(null)]);
    expect(r.sinDatos).toBe(true);
    expect(r.marcadas).toBe(0);
    expect(r.acierto).toBeNull();
    expect(r.compensa).toBeNull();
  });

  it('cuenta aciertos, fallos y blancos de las dudosas, y aparte las no dudosas', () => {
    const r = resumeDudosas([
      contestada(true, 1), contestada(true, 1), contestada(false, 1),
      blanco(1),
      contestada(true, 2), contestada(false, 2),
      blanco(null),
    ]);
    expect(r.sinDatos).toBe(false);
    expect(r.marcadas).toBe(4);
    expect(r.contestadas).toBe(3);
    expect(r.aciertos).toBe(2);
    expect(r.fallos).toBe(1);
    expect(r.enBlanco).toBe(1);
    expect(r.acierto).toBe(66.7);
    // 2 aciertos − 1 fallo / 2
    expect(r.netoAciertos).toBe(1.5);
    expect(r.noDudosas).toEqual({ contestadas: 2, aciertos: 1, acierto: 50 });
  });

  it('el neto puede ser negativo: contestarlas le ha restado', () => {
    const r = resumeDudosas([contestada(false, 1), contestada(false, 1), contestada(false, 1), contestada(true, 1)]);
    expect(r.netoAciertos).toBe(-0.5);
  });

  it('con pocas contestadas NO hay veredicto', () => {
    const pocas = Array.from({ length: MIN_DUDOSAS_PARA_VEREDICTO - 1 }, () => contestada(true, 1));
    expect(resumeDudosas(pocas).compensa).toBeNull();
  });

  it('con muestra suficiente: compensa por encima de 1/3, no compensa por debajo', () => {
    // 4 de 10 = 40 % > 33 %
    const bien = [...Array(4).fill(contestada(true, 1)), ...Array(6).fill(contestada(false, 1))];
    expect(resumeDudosas(bien).compensa).toBe(true);
    // 3 de 10 = 30 % < 33 %
    const mal = [...Array(3).fill(contestada(true, 1)), ...Array(7).fill(contestada(false, 1))];
    expect(resumeDudosas(mal).compensa).toBe(false);
  });

  it('las que dejó en blanco no cuentan para el veredicto', () => {
    const r = resumeDudosas(Array(20).fill(blanco(1)));
    expect(r.marcadas).toBe(20);
    expect(r.contestadas).toBe(0);
    expect(r.compensa).toBeNull();
  });
});

describe('las preguntas de un test recién terminado', () => {
  it('se cuentan igual que se guardan', () => {
    const r = resumeDudosas(intentosDePreguntas([
      { userAnswer: 'a', correctOptionId: 'a', dudosa: true },
      { userAnswer: 'b', correctOptionId: 'a', dudosa: true },
      { userAnswer: null, correctOptionId: 'a', dudosa: true },
      { userAnswer: 'a', correctOptionId: 'a' },
      { userAnswer: null, correctOptionId: 'a' },
    ]));
    expect(r.marcadas).toBe(3);
    expect(r.contestadas).toBe(2);
    expect(r.aciertos).toBe(1);
    expect(r.enBlanco).toBe(1);
    expect(r.noDudosas.contestadas).toBe(1);
  });
});

describe('la frase', () => {
  it('nada que decir sin marcas', () => {
    expect(fraseDudosas(resumeDudosas([contestada(true, 2)]))).toBeNull();
  });

  it('habla al alumno o del alumno, sin mezclar', () => {
    const r = resumeDudosas([...Array(4).fill(contestada(true, 1)), ...Array(6).fill(contestada(false, 1))]);
    expect(fraseDudosas(r)).toMatch(/^Aciertas más de 1 de cada 3 .* te compensa/);
    expect(fraseDudosas(r, 'profesor')).toMatch(/^Acierta más de 1 de cada 3 .* le compensa/);
    expect(fraseDudosas(r, 'profesor')).not.toMatch(/\bte\b/);
  });
});

describe('los números en pantalla', () => {
  it('coma decimal y espacio duro antes del %: en el móvil el «%» se quedaba solo en otra línea', () => {
    expect(umbralEnTexto(1 / 3)).toBe('33\u00a0%');
    expect(porcentajeEnTexto(30.8)).toBe('30,8\u00a0%');
    expect(porcentajeEnTexto(null)).toBe('—');
  });

  it('el neto lleva su signo', () => {
    expect(netoEnTexto(2)).toBe('+2');
    expect(netoEnTexto(-0.5)).toBe('\u22120,5');
    expect(netoEnTexto(0)).toBe('0');
  });
});

describe('el motor adaptativo escucha la marca', () => {
  it('una dudosa es titubeante aunque se contestara rápido y sin cambios', () => {
    expect(inferFirmeza({ response_time_ms: 3000, option_changes: 0, confidence: 1 })).toBe(FIRMEZA.TITUBEANTE);
    // Sin marca, la misma respuesta se deduce firme.
    expect(inferFirmeza({ response_time_ms: 3000, option_changes: 0, confidence: 2 })).toBe(FIRMEZA.FIRME);
  });

  it('acertar dudando no lleva una pregunta más allá de la caja 3', () => {
    const dia = (n: number) => new Date(Date.UTC(2026, 0, 1 + n * 40)).toISOString();
    const intentos = (confidence: number) => Array.from({ length: 6 }, (_, n) => ({
      question_id: 'q1', is_correct: true, selected_index: 0, response_time_ms: 3000, option_changes: 0,
      confidence, created_at: dia(n),
    }));
    expect(computeQuestionStates(intentos(1)).get('q1')!.box).toBe(MAX_BOX_TITUBEANTE);
    // Control: los mismos aciertos sin marcar sí llegan arriba del todo.
    expect(computeQuestionStates(intentos(2)).get('q1')!.box).toBeGreaterThan(MAX_BOX_TITUBEANTE);
  });
});

describe('guardas', () => {
  const raiz = join(__dirname, '..');
  const lee = (p: string) => readFileSync(join(raiz, p), 'utf-8');

  it('las lecturas que alimentan al planificador traen la marca y el camino de la respuesta', () => {
    // Sin `answer_path` en la consulta, `patronDeCambio` no recibía nunca nada
    // y «volver al primer instinto» no se detectaba en producción.
    for (const f of ['app/actions/exams.ts', 'app/actions/evolucion.ts', 'app/actions/perfil.ts']) {
      expect(lee(f)).toContain('first_touch_ms, answer_path, confidence, created_at');
    }
  });

  it('la pantalla del test manda la marca al guardar en entrenamiento', () => {
    expect(lee('app/components/student/modules/exams/ActiveTest.tsx')).toMatch(/confidence:\s*confianzaDeDuda\(currentQ\.dudosa, false\)/);
  });

  it('en entrenamiento la duda no se puede marcar después de ver la corrección', () => {
    expect(lee('app/components/student/modules/exams/ActiveTest.tsx')).toContain("if (mode === 'practice' && isAnswered) return;\n    aplicarRespuestas(");
  });
});

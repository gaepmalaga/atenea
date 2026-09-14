import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeQuestionStates,
  estaVencida,
  diasDeRetraso,
  resumeCajonesPorTema,
  factorPersonal,
  proyeccionRepaso,
  BOX_INTERVALS_DAYS,
  MAX_BOX,
  MAX_BOX_TITUBEANTE,
  LAPSES_ATASCADA,
  type IntentoPregunta,
  type QuestionState,
} from '../app/lib/question-scheduler';

/**
 * LOS CAJONES POR ALUMNO (P10).
 *
 * El estado se deriva al vuelo de `question_attempts`. Aquí se vigila que la
 * secuencia de respuestas mueve las cajas como manda el método
 * (`docs/METODO-APRENDIZAJE.md`): acierto sube, fallo a la caja 1, blanco no
 * penaliza (regla 24), y la fecha de repaso sale de la caja.
 */

const DAY = 86_400_000;
let reloj = Date.parse('2026-09-01T10:00:00Z');
function intento(o: Partial<IntentoPregunta>): IntentoPregunta {
  reloj += 1000;
  return {
    question_id: 'q1',
    is_correct: true,
    selected_index: 0,
    created_at: new Date(reloj).toISOString(),
    ...o,
  };
}
function enDias(base: string, d: number): IntentoPregunta['created_at'] {
  return new Date(Date.parse(base) + d * DAY).toISOString();
}

describe('las transiciones de caja', () => {
  it('una pregunta sin intentos no aparece en el mapa (= nueva)', () => {
    expect(computeQuestionStates([]).size).toBe(0);
  });

  it('el primer acierto va a la caja 2, no a la 1', () => {
    const s = computeQuestionStates([intento({ is_correct: true })]).get('q1')!;
    expect(s.box).toBe(2);
    expect(s.cajon).toBe('aprendiendo');
  });

  it('aciertos seguidos suben de una en una hasta la 5 (dominada)', () => {
    const s = computeQuestionStates(
      Array.from({ length: 6 }, () => intento({ is_correct: true })),
    ).get('q1')!;
    expect(s.box).toBe(MAX_BOX);
    expect(s.cajon).toBe('dominada');
    expect(s.streak).toBe(6);
  });

  it('un fallo manda a la caja 1 (recaída) y pone la racha a 0', () => {
    const s = computeQuestionStates([
      intento({ is_correct: true }),
      intento({ is_correct: true }),
      intento({ is_correct: false, error_type: 'olvido' }),
    ]).get('q1')!;
    expect(s.box).toBe(1);
    expect(s.cajon).toBe('recaida');
    expect(s.streak).toBe(0);
    expect(s.lastErrorType).toBe('olvido');
  });

  it('un fallo de LECTURA baja solo a la caja 2, no a la 1', () => {
    const s = computeQuestionStates([
      intento({ is_correct: true }),
      intento({ is_correct: true }),
      intento({ is_correct: true }), // caja 4
      intento({ is_correct: false, error_type: 'fallo_procesamiento' }),
    ]).get('q1')!;
    expect(s.box).toBe(2);
  });

  it('un blanco NO penaliza: la caja no se mueve (regla 24)', () => {
    const s = computeQuestionStates([
      intento({ is_correct: true }),
      intento({ is_correct: true }), // caja 3
      intento({ is_correct: false, selected_index: -1 }), // BLANCO
    ]).get('q1')!;
    expect(s.box).toBe(3);
    expect(s.respuestas).toBe(2);
  });

  it('solo blancos: cuenta como nueva pero marcada «la evitas»', () => {
    const s = computeQuestionStates([
      intento({ is_correct: false, selected_index: -1 }),
      intento({ is_correct: false, selected_index: -1 }),
    ]).get('q1')!;
    expect(s.box).toBe(0);
    expect(s.cajon).toBe('nueva');
    expect(s.soloBlancos).toBe(true);
  });

  it('atascada: 4 recaídas desde una caja aprendida', () => {
    const seq: IntentoPregunta[] = [];
    for (let i = 0; i < LAPSES_ATASCADA; i++) {
      seq.push(intento({ is_correct: true }));
      seq.push(intento({ is_correct: true })); // sube a >= 2
      seq.push(intento({ is_correct: false, error_type: 'desconocimiento' })); // recae -> lapse
    }
    const s = computeQuestionStates(seq).get('q1')!;
    expect(s.lapses).toBeGreaterThanOrEqual(LAPSES_ATASCADA);
    expect(s.cajon).toBe('atascada');
  });
});

describe('la fecha de repaso', () => {
  it('sale del último intento contestado + el intervalo de la caja', () => {
    const base = '2026-09-01T10:00:00Z';
    const s = computeQuestionStates([
      { question_id: 'q1', is_correct: true, selected_index: 0, created_at: base }, // caja 2
    ]).get('q1')!;
    const esperado = Date.parse(base) + BOX_INTERVALS_DAYS[2] * DAY;
    expect(Date.parse(s.dueAt!)).toBe(esperado);
  });

  it('estaVencida: nueva siempre, y contestada solo si pasó la fecha', () => {
    const base = '2026-09-01T10:00:00Z';
    const s = computeQuestionStates([
      { question_id: 'q1', is_correct: true, selected_index: 0, created_at: base }, // caja 2, +3 días
    ]).get('q1')!;
    expect(estaVencida(undefined)).toBe(true); // nueva
    expect(estaVencida(s, new Date(Date.parse(base) + 1 * DAY))).toBe(false);
    expect(estaVencida(s, new Date(Date.parse(base) + 4 * DAY))).toBe(true);
  });

  it('diasDeRetraso crece con el tiempo desde que venció', () => {
    const base = '2026-09-01T10:00:00Z';
    const s = computeQuestionStates([
      { question_id: 'q1', is_correct: false, error_type: 'olvido', selected_index: 1, created_at: base }, // caja 1, +1 día
    ]).get('q1')!;
    expect(diasDeRetraso(s, new Date(Date.parse(base) + 1 * DAY))).toBe(0);
    expect(diasDeRetraso(s, new Date(Date.parse(base) + 5 * DAY))).toBe(4);
  });

  it('factorPersonal solo recorta, nunca alarga, y tiene un tope', () => {
    expect(factorPersonal(0)).toBe(1);
    expect(factorPersonal(1)).toBeCloseTo(0.9);
    expect(factorPersonal(2)).toBeCloseTo(0.8);
    expect(factorPersonal(10)).toBeCloseTo(0.6); // tope del 40%
    expect(factorPersonal(-3)).toBe(1); // no aplica a negativos
  });

  it('una pregunta que ya ha recaído varias veces vuelve ANTES que el calendario fijo', () => {
    const base = '2026-09-01T10:00:00Z';
    // Simula una pregunta que ha recaído dos veces (lapses=2) y ahora está en
    // caja 3 tras un tercer acierto reciente.
    const seq: IntentoPregunta[] = [
      { question_id: 'q1', is_correct: true, selected_index: 0, created_at: enDias(base, 0) }, // box 2
      { question_id: 'q1', is_correct: true, selected_index: 0, created_at: enDias(base, 1) }, // box 3
      { question_id: 'q1', is_correct: false, error_type: 'desconocimiento', selected_index: 1, created_at: enDias(base, 2) }, // recae, lapses=1
      { question_id: 'q1', is_correct: true, selected_index: 0, created_at: enDias(base, 3) }, // box 2
      { question_id: 'q1', is_correct: true, selected_index: 0, created_at: enDias(base, 4) }, // box 3
      { question_id: 'q1', is_correct: false, error_type: 'desconocimiento', selected_index: 1, created_at: enDias(base, 5) }, // recae, lapses=2
      { question_id: 'q1', is_correct: true, selected_index: 0, created_at: enDias(base, 6) }, // box 2
      { question_id: 'q1', is_correct: true, selected_index: 0, created_at: enDias(base, 7) }, // box 3
    ];
    const s = computeQuestionStates(seq).get('q1')!;
    expect(s.box).toBe(3);
    expect(s.lapses).toBe(2);
    const ultimo = Date.parse(enDias(base, 7) as string);
    const esperadoFijo = ultimo + BOX_INTERVALS_DAYS[3] * DAY;
    const esperadoPersonal = new Date(ultimo + BOX_INTERVALS_DAYS[3] * factorPersonal(2) * DAY).getTime();
    expect(Date.parse(s.dueAt!)).toBeLessThan(esperadoFijo);
    expect(Date.parse(s.dueAt!)).toBe(esperadoPersonal);
  });
});

describe('fluidez (técnica 9)', () => {
  it('caja 5 con aciertos lentos → dominadaFragil', () => {
    const seq = Array.from({ length: 6 }, () =>
      intento({ is_correct: true, response_time_ms: 40_000 }),
    );
    const s = computeQuestionStates(seq).get('q1')!;
    expect(s.box).toBe(MAX_BOX);
    expect(s.dominadaFragil).toBe(true);
  });

  it('caja 5 rápida y sin dudas → NO frágil', () => {
    const seq = Array.from({ length: 6 }, () =>
      intento({ is_correct: true, response_time_ms: 8_000, option_changes: 0 }),
    );
    expect(computeQuestionStates(seq).get('q1')!.dominadaFragil).toBe(false);
  });
});

describe('resumeCajonesPorTema · la curva de aprendizaje', () => {
  it('reparte las preguntas del banco por cajón y calcula el progreso', () => {
    const states = computeQuestionStates([
      { question_id: 'a', is_correct: true, selected_index: 0, created_at: enDias('2026-09-01T10:00:00Z', 0) },
      { question_id: 'a', is_correct: true, selected_index: 0, created_at: enDias('2026-09-01T10:00:00Z', 1) },
      { question_id: 'a', is_correct: true, selected_index: 0, created_at: enDias('2026-09-01T10:00:00Z', 2) },
      { question_id: 'a', is_correct: true, selected_index: 0, created_at: enDias('2026-09-01T10:00:00Z', 3) },
      { question_id: 'a', is_correct: true, selected_index: 0, created_at: enDias('2026-09-01T10:00:00Z', 4) }, // caja 5
      { question_id: 'b', is_correct: false, error_type: 'olvido', selected_index: 1, created_at: enDias('2026-09-01T10:00:00Z', 0) }, // recaída
    ]);
    const banco = new Map<string, string>([
      ['a', 'Constitución'],
      ['b', 'Constitución'],
      ['c', 'Constitución'], // nunca vista
    ]);
    const [tema] = resumeCajonesPorTema(states, banco);
    expect(tema.topic).toBe('Constitución');
    expect(tema.total).toBe(3);
    expect(tema.dominadas).toBe(1);
    expect(tema.aprendiendo).toBe(1); // b, recaída
    expect(tema.nuevas).toBe(1); // c
    expect(tema.progreso).toBeGreaterThan(0);
    expect(tema.progreso).toBeLessThan(100);
  });
});

describe('el distractor fijo: cuando falla siempre la misma opción errónea', () => {
  const base = '2026-09-01T10:00:00Z';

  it('3 fallos en la misma opción → distractorFijo', () => {
    const s = computeQuestionStates([
      { question_id: 'q', is_correct: false, selected_index: 1, created_at: enDias(base, 0) },
      { question_id: 'q', is_correct: false, selected_index: 1, created_at: enDias(base, 3) },
      { question_id: 'q', is_correct: false, selected_index: 1, created_at: enDias(base, 6) },
    ]);
    expect(s.get('q')!.distractorFijo).toBe(1);
  });

  it('fallos repartidos por opciones distintas → null (es una laguna, no una creencia)', () => {
    const s = computeQuestionStates([
      { question_id: 'q', is_correct: false, selected_index: 1, created_at: enDias(base, 0) },
      { question_id: 'q', is_correct: false, selected_index: 2, created_at: enDias(base, 3) },
      { question_id: 'q', is_correct: false, selected_index: 1, created_at: enDias(base, 6) },
    ]);
    // 2 de 3 en la 1 → 66%, supera el 60% y el mínimo de 2: sí cuenta.
    expect(s.get('q')!.distractorFijo).toBe(1);

    const s2 = computeQuestionStates([
      { question_id: 'q', is_correct: false, selected_index: 1, created_at: enDias(base, 0) },
      { question_id: 'q', is_correct: false, selected_index: 2, created_at: enDias(base, 3) },
    ]);
    expect(s2.get('q')!.distractorFijo).toBeNull(); // 1 y 1: ninguna domina
  });

  it('un solo fallo no es una creencia fija', () => {
    const s = computeQuestionStates([
      { question_id: 'q', is_correct: false, selected_index: 1, created_at: enDias(base, 0) },
    ]);
    expect(s.get('q')!.distractorFijo).toBeNull();
  });
});

describe('la firmeza deducida usa el primer toque y el ritmo del alumno', () => {
  const base = '2026-09-01T10:00:00Z';
  it('un acierto lento para EL ALUMNO no llega a dominada', () => {
    // El alumno responde normalmente en ~4 s (primer toque). Esta la contesta
    // siempre en ~15 s: para él es titubeante, aunque en absoluto no sea lento.
    const rapidas = Array.from({ length: 8 }, (_, i) => ({
      question_id: `otra${i}`, is_correct: true, selected_index: 0,
      response_time_ms: 5000, first_touch_ms: 4000, option_changes: 0,
      created_at: enDias(base, i),
    }));
    const lentas = [10, 13, 16, 19].map((d) => ({
      question_id: 'q', is_correct: true, selected_index: 0,
      response_time_ms: 16000, first_touch_ms: 15000, option_changes: 0,
      created_at: enDias(base, d),
    }));
    const s = computeQuestionStates([...rapidas, ...lentas]);
    expect(s.get('q')!.box).toBe(MAX_BOX_TITUBEANTE);
    expect(s.get('q')!.cajon).toBe('aprendiendo');
  });
});

describe('proyeccionRepaso: la programación de un vistazo', () => {
  // Construidas con el constructor LOCAL (sin 'Z'), a propósito: el test tiene
  // que dar el mismo resultado sin importar en qué huso horario corra la CI.
  // `medianoche(0)` es la medianoche local del día de HOY; `medianoche(1)` la
  // de mañana, etc. — el mismo ancla que usa la función, para no depender de
  // adivinar equivalencias UTC.
  const HOY = new Date(2026, 8, 10, 9, 0, 0); // 10 sep, 09:00 hora local
  const medianoche = (i: number) => new Date(2026, 8, 10 + i, 0, 0, 0).getTime();

  function estado(o: Partial<QuestionState> & { questionId: string }): QuestionState {
    return {
      box: 3, cajon: 'aprendiendo', streak: 1, lapses: 0, respuestas: 3, aciertos: 2,
      lastAnsweredAt: null, dueAt: null, avgTimeMs: null, avgChanges: null,
      lastErrorType: null, soloBlancos: false, dominadaFragil: false, distractorFijo: null,
      ...o,
    };
  }

  it('sin estados, siete días en cero, con la fecha de hoy en el primero', () => {
    const dias = proyeccionRepaso(new Map(), 7, HOY);
    expect(dias).toHaveLength(7);
    expect(dias.every((d) => d.vencen === 0)).toBe(true);
    expect(dias[0].fecha).toBe('2026-09-10');
    expect(dias[6].fecha).toBe('2026-09-16');
  });

  it('una pregunta que vence hoy cuenta en el primer día', () => {
    const states = new Map([
      ['q1', estado({ questionId: 'q1', dueAt: new Date(medianoche(0) + 5 * 3_600_000).toISOString() })],
    ]);
    expect(proyeccionRepaso(states, 7, HOY)[0].vencen).toBe(1);
  });

  it('una pregunta atrasada (dueAt ya pasado) cuenta HOY, no se reparte', () => {
    const states = new Map([
      ['q1', estado({ questionId: 'q1', dueAt: new Date(medianoche(-5) + 5 * 3_600_000).toISOString() })], // 5 días atrasada
    ]);
    const dias = proyeccionRepaso(states, 7, HOY);
    expect(dias[0].vencen).toBe(1);
    expect(dias.slice(1).every((d) => d.vencen === 0)).toBe(true);
  });

  it('reparte por el día exacto que corresponde dentro de la ventana', () => {
    const states = new Map([
      ['manana', estado({ questionId: 'manana', dueAt: new Date(medianoche(1) + 12 * 3_600_000).toISOString() })],
      ['en3dias', estado({ questionId: 'en3dias', dueAt: new Date(medianoche(3) + 1 * 3_600_000).toISOString() })],
    ]);
    const dias = proyeccionRepaso(states, 7, HOY);
    expect(dias[1].vencen).toBe(1); // mañana
    expect(dias[3].vencen).toBe(1); // en 3 días
    expect(dias[0].vencen + dias[2].vencen + dias[4].vencen + dias[5].vencen + dias[6].vencen).toBe(0);
  });

  it('lo que vence más allá de la ventana no se cuenta', () => {
    const states = new Map([
      ['lejos', estado({ questionId: 'lejos', dueAt: new Date(medianoche(21) + 5 * 3_600_000).toISOString() })],
    ]);
    const dias = proyeccionRepaso(states, 7, HOY);
    expect(dias.reduce((a, d) => a + d.vencen, 0)).toBe(0);
  });

  it('las NUEVAS (box 0) no cuentan: no vencen un día concreto', () => {
    const states = new Map([
      ['nueva', estado({ questionId: 'nueva', box: 0, cajon: 'nueva', dueAt: null })],
    ]);
    const dias = proyeccionRepaso(states, 7, HOY);
    expect(dias.reduce((a, d) => a + d.vencen, 0)).toBe(0);
  });

  it('un tope de días distinto de 7 se respeta', () => {
    expect(proyeccionRepaso(new Map(), 3, HOY)).toHaveLength(3);
  });
});

describe('guarda: el scheduler es puro', () => {
  it('no importa React ni el cliente de Supabase', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'lib', 'question-scheduler.ts'), 'utf-8');
    expect(src).not.toMatch(/from ['"]react['"]/);
    expect(src).not.toMatch(/supabase|createClient/i);
  });
});

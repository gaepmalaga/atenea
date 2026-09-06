import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  groupFailedAttempts,
  failuresByTopic,
  mostUrgent,
  esAtascada,
  VECES_ATASCADA,
  type FailedAttemptRow,
} from '../app/lib/review';

/**
 * EL REPASO DE LO FALLADO.
 *
 * La plataforma sabia exactamente que habia fallado cada alumno —y por que,
 * porque el diagnostico del error es obligatorio— y no tenia ni una pantalla
 * para volver a ello. El dato se recogia y se moria en la tabla.
 */

const fallo = (over: Partial<FailedAttemptRow> = {}): FailedAttemptRow => ({
  question_id: 'q-1',
  topic: 'Constitucion',
  error_type: 'olvido',
  created_at: '2026-08-01T10:00:00Z',
  is_correct: false,
  selected_index: 0,
  question_text: '¿Cuantos titulos tiene la Constitucion?',
  options: ['Nueve', 'Diez', 'Once'],
  correct_index: 1,
  explanation: 'Un preambulo, un titulo preliminar y diez titulos.',
  ...over,
});

describe('groupFailedAttempts', () => {
  it('agrupa los intentos de la misma pregunta y los cuenta', () => {
    const items = groupFailedAttempts([fallo(), fallo(), fallo()]);
    expect(items).toHaveLength(1);
    expect(items[0].times).toBe(3);
  });

  it('un acierto no entra en el repaso', () => {
    expect(groupFailedAttempts([fallo({ is_correct: true })])).toHaveLength(0);
  });

  it('UN BLANCO NO ES UN FALLO: no se manda a repasar', () => {
    // Es la mitad del sentido de P3.4. Mandar a repasar lo que el alumno
    // decidio no contestar por estrategia castiga la decision correcta.
    expect(groupFailedAttempts([fallo({ selected_index: -1 })])).toHaveLength(0);
  });

  it('una fila anterior a P3.4 (sin selected_index) SI cuenta como fallo', () => {
    // null es "no se sabe", no "en blanco". Si se leyera como blanco, todo el
    // historico de fallos desapareceria del repaso de golpe.
    const items = groupFailedAttempts([fallo({ selected_index: null })]);
    expect(items).toHaveLength(1);
    expect(items[0].chosenIndexes).toEqual([]);
  });

  it('descarta las preguntas sin id', () => {
    // Generadas en vivo que no llegaron a guardarse: no hay nada que volver a
    // enseñar, y agruparlas por null las juntaria todas en una entrada absurda.
    const items = groupFailedAttempts([
      fallo({ question_id: null }),
      fallo({ question_id: undefined, topic: 'Otro' }),
    ]);
    expect(items).toHaveLength(0);
  });

  it('ordena por numero de fallos: lo que mas se repite va primero', () => {
    const items = groupFailedAttempts([
      fallo({ question_id: 'una-vez' }),
      fallo({ question_id: 'tres-veces' }),
      fallo({ question_id: 'tres-veces' }),
      fallo({ question_id: 'tres-veces' }),
      fallo({ question_id: 'dos-veces' }),
      fallo({ question_id: 'dos-veces' }),
    ]);
    expect(items.map((i) => i.questionId)).toEqual(['tres-veces', 'dos-veces', 'una-vez']);
  });

  it('conserva el diagnostico del intento MAS RECIENTE', () => {
    // Si fallo por "olvido" y luego por "laguna", lo que describe su estado de
    // hoy es lo segundo.
    const items = groupFailedAttempts([
      fallo({ error_type: 'desconocimiento', created_at: '2026-08-20T10:00:00Z' }),
      fallo({ error_type: 'olvido', created_at: '2026-08-01T10:00:00Z' }),
    ]);
    expect(items[0].lastErrorType).toBe('desconocimiento');
    expect(items[0].lastFailedAt).toBe('2026-08-20T10:00:00Z');
  });

  it('el orden de llegada de las filas no cambia el diagnostico elegido', () => {
    const nuevo = fallo({ error_type: 'trampa', created_at: '2026-08-20T10:00:00Z' });
    const viejo = fallo({ error_type: 'olvido', created_at: '2026-08-01T10:00:00Z' });
    expect(groupFailedAttempts([nuevo, viejo])[0].lastErrorType).toBe('trampa');
    expect(groupFailedAttempts([viejo, nuevo])[0].lastErrorType).toBe('trampa');
  });

  it('si el intento reciente no trae diagnostico, se queda con el que haya', () => {
    // Perder la unica etiqueta que existe seria peor que enseñar una antigua.
    const items = groupFailedAttempts([
      fallo({ error_type: null, created_at: '2026-08-20T10:00:00Z' }),
      fallo({ error_type: 'trampa', created_at: '2026-08-01T10:00:00Z' }),
    ]);
    expect(items[0].lastErrorType).toBe('trampa');
  });

  it('ignora un error_type que no sea de la taxonomia', () => {
    // La UI lo usa como clave de un mapa: un valor libre pintaria undefined.
    const items = groupFailedAttempts([fallo({ error_type: 'inventado' })]);
    expect(items[0].lastErrorType).toBeNull();
  });

  it('recoge las opciones marcadas SIN repetir', () => {
    // Caer dos veces en el mismo distractor no es lo mismo que dudar entre dos.
    const items = groupFailedAttempts([
      fallo({ selected_index: 2 }),
      fallo({ selected_index: 2 }),
      fallo({ selected_index: 0 }),
    ]);
    expect(items[0].chosenIndexes.sort()).toEqual([0, 2]);
  });

  it('un indice negativo distinto del centinela no se apunta como opcion', () => {
    const items = groupFailedAttempts([fallo({ selected_index: -7 })]);
    expect(items[0].chosenIndexes).toEqual([]);
  });

  it('sobrevive a una pregunta borrada del banco', () => {
    // El join devuelve null si la pregunta ya no existe. La UI lo dice; lo que
    // NO puede es reventar (regla 5).
    const items = groupFailedAttempts([
      fallo({ question_text: null, options: null, correct_index: null, explanation: null }),
    ]);
    expect(items[0].questionText).toBe('');
    expect(items[0].options).toEqual([]);
    expect(items[0].correctIndex).toBeNull();
  });

  it('unas opciones que no son un array no rompen nada', () => {
    for (const basura of ['texto', 42, {}, undefined]) {
      const items = groupFailedAttempts([fallo({ options: basura })]);
      expect(items[0].options).toEqual([]);
    }
  });

  it('sin filas devuelve una lista vacia, no null', () => {
    expect(groupFailedAttempts([])).toEqual([]);
  });
});

describe('failuresByTopic', () => {
  it('cuenta preguntas falladas por tema, de mayor a menor', () => {
    const items = groupFailedAttempts([
      fallo({ question_id: 'a', topic: 'Constitucion' }),
      fallo({ question_id: 'b', topic: 'Constitucion' }),
      fallo({ question_id: 'c', topic: 'Extranjeria' }),
    ]);
    expect(failuresByTopic(items)).toEqual([
      { topic: 'Constitucion', count: 2 },
      { topic: 'Extranjeria', count: 1 },
    ]);
  });

  it('cuenta PREGUNTAS, no intentos', () => {
    // Una pregunta fallada cinco veces sigue siendo una pregunta que repasar.
    const items = groupFailedAttempts([
      fallo({ question_id: 'a' }),
      fallo({ question_id: 'a' }),
      fallo({ question_id: 'a' }),
    ]);
    expect(failuresByTopic(items)).toEqual([{ topic: 'Constitucion', count: 1 }]);
  });

  it('un tema vacio se agrupa bajo una etiqueta legible', () => {
    // Un filtro en blanco no le dice nada al alumno.
    const items = groupFailedAttempts([fallo({ topic: null })]);
    expect(failuresByTopic(items)).toEqual([{ topic: 'Sin tema', count: 1 }]);
  });
});

describe('mostUrgent', () => {
  it('devuelve la mas fallada', () => {
    const items = groupFailedAttempts([
      fallo({ question_id: 'poco' }),
      fallo({ question_id: 'mucho' }),
      fallo({ question_id: 'mucho' }),
    ]);
    expect(mostUrgent(items)?.questionId).toBe('mucho');
  });

  it('sin fallos devuelve null, no un objeto a medias', () => {
    // "Sin datos" y "cero" no son lo mismo (regla 8), y aqui significan cosas
    // opuestas: no haber fallado nunca no es no haber hecho ningun test.
    expect(mostUrgent([])).toBeNull();
  });
});

describe('guardas del repaso', () => {
  const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  const accion = stripComments(read('app/actions/user.ts'));
  const ui = stripComments(read('app/components/student/modules/review/FailedQuestions.tsx'));
  const dashboard = stripComments(read('app/components/student/StudentDashboard.tsx'));

  it('una pregunta fallada 4+ veces es «atascada» (técnica 10)', () => {
    const filas = Array.from({ length: VECES_ATASCADA }, (_, i) =>
      fallo({ question_id: 'q-x', selected_index: i % 3, error_type: 'trampa', created_at: `2026-09-0${i + 1}T10:00:00Z` }),
    );
    const [q] = groupFailedAttempts(filas);
    expect(q.times).toBe(VECES_ATASCADA);
    expect(esAtascada(q)).toBe(true);
  });

  it('fallada 3 veces todavía NO es atascada', () => {
    const filas = Array.from({ length: 3 }, (_, i) =>
      fallo({ question_id: 'q-y', selected_index: i % 3, created_at: `2026-09-0${i + 1}T10:00:00Z` }),
    );
    expect(esAtascada(groupFailedAttempts(filas)[0])).toBe(false);
  });

  it('la accion no acepta un userId del cliente (regla 1)', () => {
    expect(accion).toMatch(/getFailedQuestions\(\)/);
    expect(accion).not.toMatch(/getFailedQuestions\(\s*userId/);
  });

  it('el enunciado viene por join, no desnormalizado (regla 5)', () => {
    // Una copia se queda obsoleta en cuanto un admin corrija la pregunta, y el
    // alumno repasaria la version mala.
    expect(accion).toContain('question:question_bank(');
  });

  it('un error de lectura NO se traga (regla 4)', () => {
    // Sin esto la pantalla diria "no has fallado nada", que es la mentira mas
    // tranquilizadora posible.
    expect(accion).toMatch(/console\.error\('getFailedQuestions:'/);
    expect(ui).toContain('setError(res.error)');
  });

  it('el modulo va envuelto en su Error Boundary (regla 5)', () => {
    expect(dashboard).toMatch(/moduleName="Repaso de fallos"/);
  });
});

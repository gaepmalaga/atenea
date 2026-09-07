import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  inferFirmeza,
  inferErrorType,
  errorTypeDe,
  mereceLaPenaPreguntar,
  perfilTiempos,
  FIRMEZA,
  MS_FIRME,
  MS_TITUBEA,
  MS_SIN_LEER,
} from '../app/lib/answer-signals';
import { computeQuestionStates, MAX_BOX_TITUBEANTE } from '../app/lib/question-scheduler';

/**
 * LO QUE SE DEDUCE SIN PREGUNTAR (7 sep 2026).
 *
 * La plataforma pedia al alumno DOS cosas mas por cada pregunta: la marca de
 * confianza y el diagnostico del fallo, este ultimo obligatorio para avanzar.
 * Ahora las dos salen del tiempo y de los cambios de opcion, que ya se median.
 *
 * La regla que vigilan estos tests: se deduce todo lo deducible, y solo se
 * pregunta lo que ademas cambia lo que el sistema va a hacer.
 */

describe('firmeza: como de resuelto contesto', () => {
  it('sin cambios y con tiempo holgado es FIRME', () => {
    expect(inferFirmeza({ response_time_ms: 6_000, option_changes: 0 })).toBe(FIRMEZA.FIRME);
    expect(inferFirmeza({ response_time_ms: MS_FIRME, option_changes: 0 })).toBe(FIRMEZA.FIRME);
  });

  it('dos cambios de opcion es TITUBEANTE por rapido que sea', () => {
    expect(inferFirmeza({ response_time_ms: 3_000, option_changes: 2 })).toBe(FIRMEZA.TITUBEANTE);
  });

  it('tardar una eternidad es TITUBEANTE aunque no cambiara de opcion', () => {
    expect(inferFirmeza({ response_time_ms: MS_TITUBEA + 1, option_changes: 0 })).toBe(FIRMEZA.TITUBEANTE);
  });

  it('un cambio suelto, o un tiempo intermedio, es NORMAL', () => {
    expect(inferFirmeza({ response_time_ms: 10_000, option_changes: 1 })).toBe(FIRMEZA.NORMAL);
    expect(inferFirmeza({ response_time_ms: 30_000, option_changes: 0 })).toBe(FIRMEZA.NORMAL);
  });

  it('SIN DATO no es titubeante: es normal (reglas 8 y 16)', () => {
    // Un `response_time_ms` a 0 o null significa "no se midio", no "tardo 0".
    // Tratarlo como firme premiaria al historico sin medir; como titubeante lo
    // castigaria. Se queda en el medio.
    expect(inferFirmeza({})).toBe(FIRMEZA.NORMAL);
    expect(inferFirmeza({ response_time_ms: 0, option_changes: 0 })).toBe(FIRMEZA.NORMAL);
    expect(inferFirmeza({ response_time_ms: null, option_changes: null })).toBe(FIRMEZA.NORMAL);
  });
});

describe('firmeza: el primer toque y el tiempo relativo', () => {
  it('el primer toque manda sobre el total', () => {
    // Tocó rápido (2 s) aunque el total fuera largo: lo tenía, lo demás es leer
    // la explicación mental. Sin cambios → firme.
    expect(inferFirmeza({ first_touch_ms: 2_000, response_time_ms: 40_000, option_changes: 0 })).toBe(FIRMEZA.FIRME);
    // Tardó una eternidad en el PRIMER toque: no lo tenía.
    expect(inferFirmeza({ first_touch_ms: 50_000, response_time_ms: 52_000, option_changes: 0 })).toBe(FIRMEZA.TITUBEANTE);
  });

  it('con perfil, se lee en RELATIVO a la mediana del alumno', () => {
    const base = perfilTiempos([
      { response_time_ms: 10_000, first_touch_ms: 6_000 },
      { response_time_ms: 10_000, first_touch_ms: 6_000 },
      { response_time_ms: 10_000, first_touch_ms: 6_000 },
    ]);
    expect(base.medianaFirstMs).toBe(6_000);
    // 3 s es la mitad de su mediana (6 s) → firme, aunque en absoluto no llegue a MS_FIRME.
    expect(inferFirmeza({ first_touch_ms: 3_000, option_changes: 0 }, base)).toBe(FIRMEZA.FIRME);
    // 15 s es 2,5× su mediana → titubeante, aunque en absoluto no pase de MS_TITUBEA.
    expect(inferFirmeza({ first_touch_ms: 15_000, option_changes: 0 }, base)).toBe(FIRMEZA.TITUBEANTE);
    // A su ritmo → normal.
    expect(inferFirmeza({ first_touch_ms: 6_000, option_changes: 0 }, base)).toBe(FIRMEZA.NORMAL);
  });

  it('perfilTiempos ignora los ceros y los que no traen dato', () => {
    const p = perfilTiempos([
      { response_time_ms: 8_000, first_touch_ms: 0 },
      { response_time_ms: 0, first_touch_ms: 4_000 },
      { response_time_ms: 12_000 },
      {},
    ]);
    expect(p.medianaMs).toBe(10_000);
    expect(p.medianaFirstMs).toBe(4_000);
    expect(perfilTiempos([]).medianaMs).toBeNull();
  });
});

describe('tipo de fallo deducido', () => {
  it('lo que ya tenia aprendido es un OLVIDO, mande lo que mande la senial', () => {
    // El historial manda: aunque ademas dudara o fuera rapido.
    expect(inferErrorType({ boxPrevio: 4, response_time_ms: 2_000, option_changes: 3 })).toBe('olvido');
    expect(inferErrorType({ boxPrevio: 3, response_time_ms: 60_000, option_changes: 0 })).toBe('olvido');
  });

  it('haber cambiado de opcion es TRAMPA, no fallo de lectura', () => {
    // Quien cambio de opcion SI leyo el enunciado.
    expect(inferErrorType({ boxPrevio: 0, response_time_ms: 2_000, option_changes: 1 })).toBe('trampa');
  });

  it('contestar sin tiempo de leer es FALLO DE LECTURA', () => {
    expect(inferErrorType({ boxPrevio: 0, response_time_ms: MS_SIN_LEER - 1, option_changes: 0 })).toBe('fallo_procesamiento');
  });

  it('lo demas es LAGUNA', () => {
    expect(inferErrorType({ boxPrevio: 0, response_time_ms: 30_000, option_changes: 0 })).toBe('desconocimiento');
    expect(inferErrorType({})).toBe('desconocimiento');
  });

  it('el diagnostico ESCRITO por el alumno manda sobre el deducido', () => {
    // El historico trae `error_type` a mano (era obligatorio) y no se pisa. Y
    // cuando el alumno corrige la deduccion, su correccion es la que vale.
    expect(errorTypeDe({ error_type: 'trampa', boxPrevio: 5, response_time_ms: 1_000 })).toBe('trampa');
    // Una cadena vacia NO es un diagnostico: se deduce.
    expect(errorTypeDe({ error_type: '  ', boxPrevio: 4 })).toBe('olvido');
    expect(errorTypeDe({ error_type: null, boxPrevio: 0, option_changes: 2 })).toBe('trampa');
  });
});

describe('cuando SI merece la pena preguntar', () => {
  it('solo si fallo algo que ya tenia o que se le atraganta', () => {
    expect(mereceLaPenaPreguntar('consolidando')).toBe(true);
    expect(mereceLaPenaPreguntar('dominada')).toBe(true);
    expect(mereceLaPenaPreguntar('atascada')).toBe(true);
  });

  it('fallar material nuevo o en aprendizaje NO pregunta nada', () => {
    // Es lo normal, y el motivo no cambia nada: vuelve pronto igual.
    expect(mereceLaPenaPreguntar('nueva')).toBe(false);
    expect(mereceLaPenaPreguntar('aprendiendo')).toBe(false);
    expect(mereceLaPenaPreguntar('recaida')).toBe(false);
    expect(mereceLaPenaPreguntar(null)).toBe(false);
    expect(mereceLaPenaPreguntar(undefined)).toBe(false);
  });
});

describe('el planificador usa las seniales', () => {
  const intento = (n: number, extra: Record<string, unknown>) => ({
    question_id: 'q1',
    created_at: new Date(2026, 0, n).toISOString(),
    selected_index: 1,
    ...extra,
  });

  it('un acierto TITUBEANTE no llega a dominada: se queda en aprendizaje', () => {
    // Acertar peleando no es dominar. Sin el tope, tres aciertos dudosos
    // mandaban la pregunta a la caja 5 y no volvia en 45 dias.
    const states = computeQuestionStates([
      intento(1, { is_correct: true, response_time_ms: 60_000, option_changes: 3 }),
      intento(2, { is_correct: true, response_time_ms: 60_000, option_changes: 3 }),
      intento(3, { is_correct: true, response_time_ms: 60_000, option_changes: 3 }),
      intento(4, { is_correct: true, response_time_ms: 60_000, option_changes: 3 }),
    ]);
    expect(states.get('q1')!.box).toBe(MAX_BOX_TITUBEANTE);
    expect(states.get('q1')!.cajon).toBe('aprendiendo');
  });

  it('los mismos aciertos, contestados con soltura, SI llegan a dominada', () => {
    const states = computeQuestionStates([
      intento(1, { is_correct: true, response_time_ms: 5_000, option_changes: 0 }),
      intento(2, { is_correct: true, response_time_ms: 5_000, option_changes: 0 }),
      intento(3, { is_correct: true, response_time_ms: 5_000, option_changes: 0 }),
      intento(4, { is_correct: true, response_time_ms: 5_000, option_changes: 0 }),
    ]);
    expect(states.get('q1')!.box).toBe(5);
    expect(states.get('q1')!.cajon).toBe('dominada');
  });

  it('un titubeante no DEGRADA lo que ya estaba mas arriba', () => {
    const states = computeQuestionStates([
      intento(1, { is_correct: true, response_time_ms: 5_000, option_changes: 0 }),
      intento(2, { is_correct: true, response_time_ms: 5_000, option_changes: 0 }),
      intento(3, { is_correct: true, response_time_ms: 5_000, option_changes: 0 }), // box 4
      intento(4, { is_correct: true, response_time_ms: 90_000, option_changes: 4 }), // titubeante
    ]);
    expect(states.get('q1')!.box).toBe(4);
  });

  it('un fallo rapido y sin dudas baja a la caja 2, no a la 1 (lo dedujo como lectura)', () => {
    const states = computeQuestionStates([
      intento(1, { is_correct: true, response_time_ms: 5_000, option_changes: 0 }), // box 2
      intento(2, { is_correct: false, response_time_ms: 3_000, option_changes: 0 }),
    ]);
    expect(states.get('q1')!.box).toBe(2);
    expect(states.get('q1')!.lastErrorType).toBe('fallo_procesamiento');
  });

  it('un fallo con dudas baja a la caja 1', () => {
    const states = computeQuestionStates([
      intento(1, { is_correct: true, response_time_ms: 5_000, option_changes: 0 }),
      intento(2, { is_correct: false, response_time_ms: 30_000, option_changes: 2 }),
    ]);
    expect(states.get('q1')!.box).toBe(1);
    expect(states.get('q1')!.lastErrorType).toBe('trampa');
  });
});

// ============================================================
// GUARDAS ESTATICAS
// ============================================================

const read = (rel: string) =>
  readFileSync(join(__dirname, '..', rel), 'utf-8').replace(/\r\n/g, '\n');
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('la pantalla del test no le pide nada mas al alumno', () => {
  const activeTest = stripComments(read('app/components/student/modules/exams/ActiveTest.tsx'));
  const config = stripComments(read('app/components/student/modules/exams/ExamConfig.tsx'));

  it('no queda la marca de confianza por pregunta', () => {
    // Eran DOS toques por respuesta. Se sustituyo por la firmeza deducida.
    expect(activeTest).not.toContain('confianzaPendiente');
    expect(activeTest).not.toContain('¿Qué tal lo veías?');
  });

  it('no queda el diagnostico OBLIGATORIO', () => {
    expect(activeTest).not.toContain('Diagnóstico del Error');
    expect(activeTest).not.toContain('Obligatorio');
  });

  it('la configuracion solo ofrece los dos modos, sin ajustes de fricción', () => {
    expect(config).not.toContain('marcarConfianza');
    expect(config).toContain("mode: 'practice'");
    expect(config).toContain("mode: 'exam'");
  });

  it('la dificultad solo se elige en el simulacro: en entrenamiento decide el sistema', () => {
    expect(config).toContain("{settings.mode === 'exam' && (");
  });
});

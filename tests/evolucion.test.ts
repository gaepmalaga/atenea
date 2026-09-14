import { describe, it, expect } from 'vitest';
import {
  resumeBanco,
  desgloseConContexto,
  fechaInicio,
  actividadDiaria,
  rangoCurva,
  MAX_DIAS_CURVA,
} from '../app/lib/evolucion';
import type { QuestionState, Cajon } from '../app/lib/question-scheduler';

/**
 * "MI EVOLUCIÓN" (regla 77) — la aritmética que consolida Inicio, Fallos,
 * Estadísticas y Mi Perfil en una sola historia. Se vigila que ningún cajón
 * se cuente dos veces y que "sin dato" nunca se confunda con "cero" (regla 8).
 */

function estado(o: Partial<QuestionState> & { questionId: string; cajon: Cajon }): QuestionState {
  return {
    box: 3, streak: 1, lapses: 0, respuestas: 3, aciertos: 2,
    lastAnsweredAt: null, dueAt: null, avgTimeMs: null, avgChanges: null,
    lastErrorType: null, soloBlancos: false, dominadaFragil: false, distractorFijo: null,
    ...o,
  };
}

describe('resumeBanco: el reparto agregado del banco entero', () => {
  it('sin ningún intento, todo está sin tocar', () => {
    const r = resumeBanco(new Map(), 100);
    expect(r).toEqual({ total: 100, dominadas: 0, enCamino: 0, vistasSinAsentar: 0, sinTocar: 100 });
  });

  it('reparte dominadas, en camino, y el resto vistas-sin-asentar', () => {
    const states = new Map([
      ['q1', estado({ questionId: 'q1', cajon: 'dominada' })],
      ['q2', estado({ questionId: 'q2', cajon: 'dominada' })],
      ['q3', estado({ questionId: 'q3', cajon: 'consolidando' })],
      ['q4', estado({ questionId: 'q4', cajon: 'aprendiendo' })],
      ['q5', estado({ questionId: 'q5', cajon: 'recaida' })],
      ['q6', estado({ questionId: 'q6', cajon: 'atascada' })],
    ]);
    const r = resumeBanco(states, 10);
    expect(r).toEqual({ total: 10, dominadas: 2, enCamino: 1, vistasSinAsentar: 3, sinTocar: 4 });
  });

  it('los cuatro cubos siempre suman el total (nunca se cuenta una pregunta dos veces)', () => {
    const states = new Map([
      ['q1', estado({ questionId: 'q1', cajon: 'dominada' })],
      ['q2', estado({ questionId: 'q2', cajon: 'consolidando' })],
      ['q3', estado({ questionId: 'q3', cajon: 'nueva', soloBlancos: true })], // solo la dejó en blanco
    ]);
    const r = resumeBanco(states, 5);
    expect(r.dominadas + r.enCamino + r.vistasSinAsentar + r.sinTocar).toBe(5);
  });

  it('un banco mal contado (menos total que preguntas vistas) no da sinTocar negativo', () => {
    const states = new Map([['q1', estado({ questionId: 'q1', cajon: 'dominada' })]]);
    expect(resumeBanco(states, 0).sinTocar).toBe(0);
  });
});

describe('desgloseConContexto: por qué, no solo cuántas', () => {
  const temas = new Map([
    ['q1', 'Extranjería I'], ['q2', 'Extranjería I'], ['q3', 'Derecho Penal'],
  ]);

  it('sin atascadas, temaQueMasResiste es null — no se inventa un tema', () => {
    const states = new Map([['q1', estado({ questionId: 'q1', cajon: 'dominada' })]]);
    expect(desgloseConContexto(states, temas).temaQueMasResiste).toBeNull();
  });

  it('identifica el tema con más atascadas entre varios', () => {
    const states = new Map([
      ['q1', estado({ questionId: 'q1', cajon: 'atascada' })],
      ['q2', estado({ questionId: 'q2', cajon: 'atascada' })],
      ['q3', estado({ questionId: 'q3', cajon: 'atascada' })],
    ]);
    const d = desgloseConContexto(states, temas);
    expect(d.seResisten).toBe(3);
    expect(d.temaQueMasResiste).toEqual({ topic: 'Extranjería I', veces: 2 });
  });

  it('"evitas" cuenta solo las preguntas dejadas SIEMPRE en blanco', () => {
    const states = new Map([
      ['q1', estado({ questionId: 'q1', cajon: 'nueva', soloBlancos: true })],
      ['q2', estado({ questionId: 'q2', cajon: 'dominada', soloBlancos: false })],
    ]);
    expect(desgloseConContexto(states, temas).evitas).toBe(1);
  });
});

describe('fechaInicio', () => {
  it('sin intentos, null — no es "el año 1970" (regla 8)', () => {
    expect(fechaInicio([])).toBeNull();
  });

  it('la más antigua, sin importar el orden de llegada', () => {
    const intentos = [
      { created_at: '2026-09-10T10:00:00Z' },
      { created_at: '2026-08-03T08:00:00Z' },
      { created_at: '2026-09-01T10:00:00Z' },
    ];
    expect(fechaInicio(intentos)).toBe('2026-08-03T08:00:00.000Z');
  });

  it('ignora fechas corruptas o ausentes', () => {
    const intentos = [{ created_at: null }, { created_at: 'no-es-una-fecha' }, { created_at: '2026-08-03T08:00:00Z' }];
    expect(fechaInicio(intentos)).toBe('2026-08-03T08:00:00.000Z');
  });
});

describe('actividadDiaria: la racha, agrupada por día LOCAL', () => {
  it('agrupa varios intentos del mismo día en una sola fila', () => {
    const intentos = [
      { created_at: new Date(2026, 8, 10, 9, 0).toISOString() },
      { created_at: new Date(2026, 8, 10, 20, 0).toISOString() },
      { created_at: new Date(2026, 8, 11, 9, 0).toISOString() },
    ];
    const r = actividadDiaria(intentos);
    expect(r).toEqual([
      { fecha: '2026-09-10', respuestas: 2 },
      { fecha: '2026-09-11', respuestas: 1 },
    ]);
  });

  it('sale ordenada por fecha ascendente, sin importar el orden de entrada', () => {
    const intentos = [
      { created_at: new Date(2026, 8, 15).toISOString() },
      { created_at: new Date(2026, 8, 1).toISOString() },
    ];
    expect(actividadDiaria(intentos).map((d) => d.fecha)).toEqual(['2026-09-01', '2026-09-15']);
  });
});

describe('rangoCurva: la ventana de la curva, recortada', () => {
  const HOY = new Date(2026, 8, 20, 12, 0);

  it('sin fecha de inicio, solo hoy', () => {
    expect(rangoCurva(null, HOY)).toEqual(['2026-09-20']);
  });

  it('desde el inicio hasta hoy cuando cabe dentro del tope', () => {
    const inicio = new Date(2026, 8, 15).toISOString();
    const r = rangoCurva(inicio, HOY);
    expect(r[0]).toBe('2026-09-15');
    expect(r[r.length - 1]).toBe('2026-09-20');
    expect(r).toHaveLength(6);
  });

  it('cuenta días de CALENDARIO, no milisegundos exactos (regla 54/74)', () => {
    // Empezó a las 22:00 de un día y consulta a las 09:00 cinco días después:
    // son 5 días de calendario, aunque no hayan pasado 5×24 horas exactas.
    // Contando milisegundos crudos, esto daba 4 y la curva empezaba UN DÍA
    // TARDE — se vio en pantalla contra la BD real (11 ago -> curva desde el
    // 12).
    const inicio = new Date(2026, 8, 15, 22, 0).toISOString();
    const hoy = new Date(2026, 8, 20, 9, 0);
    const r = rangoCurva(inicio, hoy);
    expect(r[0]).toBe('2026-09-15');
    expect(r).toHaveLength(6);
  });

  it('un historial más largo que MAX_DIAS_CURVA se recorta, pero siempre incluye HOY', () => {
    const inicio = new Date(2020, 0, 1).toISOString(); // años atrás
    const r = rangoCurva(inicio, HOY);
    expect(r).toHaveLength(MAX_DIAS_CURVA);
    expect(r[r.length - 1]).toBe('2026-09-20');
  });
});

import { describe, it, expect } from 'vitest';
import { entrenoDeHoy, MIN_FALLOS_TEMA } from '../app/lib/dia';
import type { QuestionState, Cajon } from '../app/lib/question-scheduler';

const AHORA = new Date('2026-11-07T10:00:00Z');
const AYER = '2026-11-06T10:00:00Z';
const MANANA = '2026-11-08T10:00:00Z';

const estado = (id: string, cajon: Cajon, dueAt: string | null, box = 2): QuestionState => ({
  questionId: id, box, cajon, streak: 0, lapses: 0, respuestas: 1, aciertos: 0,
  lastAnsweredAt: AYER, dueAt, avgTimeMs: null, avgChanges: null, lastErrorType: null,
  soloBlancos: false, dominadaFragil: false, distractorFijo: null,
});

const banco = (n: number, tema = 'T1') => new Map(Array.from({ length: n }, (_, i) => [`q${i}`, tema] as [string, string]));

describe('entrenoDeHoy', () => {
  it('sin banco no propone nada: 0, no 1', () => {
    expect(entrenoDeHoy(new Map(), new Map(), AHORA)).toEqual({ propuestas: 0, disponibles: 0, porRepasar: 0, temaConMasFallos: null });
  });

  it('propone lo que toca (nuevas + vencidas), con tope de 25', () => {
    expect(entrenoDeHoy(new Map(), banco(100), AHORA).propuestas).toBe(25);
    expect(entrenoDeHoy(new Map(), banco(10), AHORA).propuestas).toBe(10);
  });

  it('si no toca nada, un repaso corto de 8', () => {
    const states = new Map(Array.from({ length: 20 }, (_, i) => [`q${i}`, estado(`q${i}`, 'consolidando', MANANA, 3)] as [string, QuestionState]));
    expect(entrenoDeHoy(states, banco(20), AHORA).propuestas).toBe(8);
  });

  it('«por repasar» son las falladas con el repaso vencido, no cualquier fallo antiguo', () => {
    const states = new Map<string, QuestionState>([
      ['q0', estado('q0', 'recaida', AYER, 1)],      // fallada y vencida → cuenta
      ['q1', estado('q1', 'recaida', MANANA, 1)],    // fallada pero aún no toca → no
      ['q2', estado('q2', 'atascada', AYER, 1)],     // atascada y vencida → cuenta
      ['q3', estado('q3', 'aprendiendo', AYER, 2)],  // ya la acertó después → no
    ]);
    expect(entrenoDeHoy(states, banco(4), AHORA).porRepasar).toBe(2);
  });

  it('el tema con más fallos solo sale si llega al mínimo', () => {
    const pocos = new Map<string, QuestionState>([['q0', estado('q0', 'recaida', AYER, 1)], ['q1', estado('q1', 'recaida', AYER, 1)]]);
    expect(entrenoDeHoy(pocos, banco(5), AHORA).temaConMasFallos).toBeNull();

    const muchos = new Map<string, QuestionState>();
    for (let i = 0; i < MIN_FALLOS_TEMA; i++) muchos.set(`q${i}`, estado(`q${i}`, 'recaida', MANANA, 1));
    const r = entrenoDeHoy(muchos, banco(5, 'Derecho Constitucional'), AHORA);
    expect(r.temaConMasFallos).toEqual({ tema: 'Derecho Constitucional', fallos: MIN_FALLOS_TEMA });
  });

  it('en un empate de fallos gana el tema que va antes en el alfabeto', () => {
    const temas = new Map<string, string>();
    const states = new Map<string, QuestionState>();
    for (let i = 0; i < 3; i++) { temas.set(`a${i}`, 'Zeta'); states.set(`a${i}`, estado(`a${i}`, 'recaida', AYER, 1)); }
    for (let i = 0; i < 3; i++) { temas.set(`b${i}`, 'Alfa'); states.set(`b${i}`, estado(`b${i}`, 'recaida', AYER, 1)); }
    expect(entrenoDeHoy(states, temas, AHORA).temaConMasFallos?.tema).toBe('Alfa');
  });
});

import { claseDeHoy, fisicaDeHoy } from '../app/lib/dia';

describe('claseDeHoy', () => {
  const clase = (classId: string, nombre: string, sesiones: { fecha: string; hora: string | null; falta?: boolean }[]) =>
    ({ classId, nombre, sesiones: sesiones.map((s) => ({ ...s, falta: s.falta ?? false })) });

  it('devuelve la clase de hoy y no las de otros días', () => {
    const r = claseDeHoy([clase('g1', 'Teoría', [{ fecha: '2026-11-08', hora: '09:00' }, { fecha: '2026-11-09', hora: '17:00' }])], '2026-11-09');
    expect(r).toEqual({ classId: 'g1', nombre: 'Teoría', hora: '17:00', falta: false });
  });

  it('sin clase hoy es null, no un objeto vacío', () => {
    expect(claseDeHoy([clase('g1', 'Teoría', [{ fecha: '2026-11-10', hora: '09:00' }])], '2026-11-09')).toBeNull();
    expect(claseDeHoy([], '2026-11-09')).toBeNull();
  });

  it('con dos clases, la más temprana; sin hora, al final', () => {
    const r = claseDeHoy([
      clase('g1', 'Tarde', [{ fecha: '2026-11-09', hora: '17:00' }]),
      clase('g2', 'Sin hora', [{ fecha: '2026-11-09', hora: null }]),
      clase('g3', 'Mañana', [{ fecha: '2026-11-09', hora: '09:00' }]),
    ], '2026-11-09');
    expect(r?.nombre).toBe('Mañana');
  });

  it('conserva el aviso de falta', () => {
    expect(claseDeHoy([clase('g1', 'T', [{ fecha: '2026-11-09', hora: '09:00', falta: true }])], '2026-11-09')?.falta).toBe(true);
  });
});

describe('fisicaDeHoy', () => {
  const s = (id: string, fecha: string, kind: string, position = 0) => ({ id, fecha, kind, title: `T-${id}`, durationMin: 30, position });

  it('devuelve la sesión de hoy', () => {
    expect(fisicaDeHoy([s('a', '2026-11-09', 'carrera')], [], '2026-11-09')).toEqual({ id: 'a', titulo: 'T-a', tipo: 'carrera', minutos: 30, hecha: false });
  });

  it('un descanso no es una tarea', () => {
    expect(fisicaDeHoy([s('a', '2026-11-09', 'descanso')], [], '2026-11-09')).toBeNull();
  });

  it('sin sesiones, o de otro día, es null: la academia puede no llevar la física aquí', () => {
    expect(fisicaDeHoy([], [], '2026-11-09')).toBeNull();
    expect(fisicaDeHoy([s('a', '2026-11-10', 'fuerza')], [], '2026-11-09')).toBeNull();
  });

  it('marca hecha solo lo que el alumno apuntó como hecha', () => {
    const ses = [s('a', '2026-11-09', 'fuerza')];
    expect(fisicaDeHoy(ses, [{ sessionId: 'a', status: 'hecha' }], '2026-11-09')?.hecha).toBe(true);
    expect(fisicaDeHoy(ses, [{ sessionId: 'a', status: 'no_hecha' }], '2026-11-09')?.hecha).toBe(false);
  });

  it('con varias el mismo día, la primera por posición', () => {
    expect(fisicaDeHoy([s('b', '2026-11-09', 'fuerza', 2), s('a', '2026-11-09', 'carrera', 1)], [], '2026-11-09')?.id).toBe('a');
  });
});

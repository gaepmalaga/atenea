import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  candidateTurns,
  canEvaluate,
  trimContext,
  formatTranscript,
  normalizeReport,
  MAX_CONTEXT_TURNS,
  MAX_TURN_CHARS,
  MIN_TURNS_FOR_REPORT,
  type InterviewTurn,
} from '../app/lib/interview';

/**
 * El modulo de entrevista tenia todo el peso en presionar al aspirante y nada
 * en devolverle algo: ni transcripcion ni informe. La sesion terminaba y el
 * alumno se quedaba igual que empezo.
 */

const turn = (speaker: InterviewTurn['speaker'], text: string): InterviewTurn => ({ speaker, text });

const entrevista: InterviewTurn[] = [
  turn('inspector', '¿Por que quiere ser Policia Nacional?'),
  turn('candidato', 'Por vocacion de servicio publico.'),
  turn('inspector', 'Eso lo dice todo el mundo. Concrete.'),
  turn('candidato', 'Mi padre fue guardia civil y crecí viendo el oficio.'),
  turn('inspector', '¿Y si su padre le hubiera dicho que no?'),
  turn('candidato', 'Lo habria hecho igual.'),
];

describe('candidateTurns', () => {
  it('solo cuenta lo que dice el aspirante', () => {
    expect(candidateTurns(entrevista)).toHaveLength(3);
  });

  it('descarta los turnos vacios', () => {
    expect(candidateTurns([turn('candidato', '   '), turn('candidato', 'algo')])).toHaveLength(1);
  });
});

describe('canEvaluate', () => {
  it('exige un minimo de respuestas para que el informe diga algo', () => {
    // Un informe sobre una sola respuesta no evalua nada: seria inventarselo.
    expect(canEvaluate([])).toBe(false);
    expect(canEvaluate([turn('candidato', 'una')])).toBe(false);
    expect(canEvaluate(entrevista)).toBe(true);
  });

  it('las preguntas del inspector no cuentan para el minimo', () => {
    const soloInspector = Array.from({ length: 10 }, () => turn('inspector', 'pregunta'));
    expect(canEvaluate(soloInspector)).toBe(false);
    expect(MIN_TURNS_FOR_REPORT).toBeGreaterThan(0);
  });
});

describe('trimContext', () => {
  it('se queda con los ultimos turnos', () => {
    const larga = Array.from({ length: 30 }, (_, i) => turn('candidato', `turno ${i}`));
    const trimmed = trimContext(larga);
    expect(trimmed).toHaveLength(MAX_CONTEXT_TURNS);
    expect(trimmed[trimmed.length - 1].text).toBe('turno 29');
  });

  it('recorta cada turno', () => {
    expect(trimContext([turn('candidato', 'z'.repeat(5000))])[0].text).toHaveLength(MAX_TURN_CHARS);
  });
});

describe('formatTranscript', () => {
  it('etiqueta quien habla', () => {
    const t = formatTranscript(entrevista);
    expect(t).toContain('INSPECTOR:');
    expect(t).toContain('ASPIRANTE:');
  });

  it('conserva el orden de la conversacion', () => {
    const t = formatTranscript(entrevista);
    expect(t.indexOf('vocacion')).toBeLessThan(t.indexOf('guardia civil'));
  });

  it('sin turnos devuelve cadena vacia', () => {
    expect(formatTranscript([])).toBe('');
  });
});

const informe = {
  score: 72,
  veredicto: 'Discurso coherente pero con motivacion poco concreta.',
  fortalezas: ['Mantiene la calma bajo presion'],
  contradicciones: ['Dice que lo haria igual, pero justifica la vocacion por su padre'],
  recomendaciones: ['Preparar ejemplos concretos de servicio publico'],
};

describe('normalizeReport', () => {
  it('acepta un informe completo', () => {
    expect(normalizeReport(informe)).toEqual(informe);
  });

  it('acota la puntuacion a 0-100', () => {
    expect(normalizeReport({ ...informe, score: 250 })?.score).toBe(100);
    expect(normalizeReport({ ...informe, score: -30 })?.score).toBe(0);
    expect(normalizeReport({ ...informe, score: 'ocho' })?.score).toBe(0);
  });

  it('tolera listas ausentes', () => {
    const r = normalizeReport({ score: 50, veredicto: 'Correcto', fortalezas: null });
    expect(r?.fortalezas).toEqual([]);
    expect(r?.contradicciones).toEqual([]);
  });

  it('limpia las entradas vacias de las listas', () => {
    const r = normalizeReport({ ...informe, fortalezas: ['buena', '  ', '', 'otra'] });
    expect(r?.fortalezas).toEqual(['buena', 'otra']);
  });

  it('descarta un informe que no dice nada', () => {
    // Un informe sin veredicto, sin fortalezas y sin recomendaciones no es un
    // informe: es mejor decirselo al alumno que pintarle una pantalla vacia.
    expect(normalizeReport({ score: 60, fortalezas: [], contradicciones: [], recomendaciones: [] })).toBeNull();
    expect(normalizeReport(null)).toBeNull();
    expect(normalizeReport('texto')).toBeNull();
  });
});

describe('la sala usa el contrato', () => {
  const src = readFileSync(
    join(__dirname, '..', 'app/components/student/modules/interview/InterviewRoom.tsx'),
    'utf-8'
  );
  const server = readFileSync(join(__dirname, '..', 'app/actions/interview.ts'), 'utf-8');

  it('un navegador sin reconocimiento de voz tiene su propio estado', () => {
    // Antes era un `alert()` en mitad del flujo: la pantalla se quedaba
    // congelada en "TRIBUNAL HABLANDO" y no había forma de salir.
    // `useSyncExternalStore` en vez de un efecto: es una capacidad del
    // navegador, no estado de React.
    expect(src).toContain('useSyncExternalStore');
    expect(src).toContain('speechSupported');
    expect(src).not.toContain('alert("Navegador no compatible');
  });

  it('el envio de la respuesta se decide leyendo un ref, no reasignando onend', () => {
    // El manejador `onend` se reasignaba desde un efecto en cada cambio de
    // transcript, y el envío leía un `history` obsoleto del cierre.
    expect(src).toContain('transcriptRef.current');
    expect(src).not.toMatch(/recognitionRef\.current\.onend\s*=/);
  });

  it('el historial se lee de un espejo, no del estado recien puesto', () => {
    // El actualizador de `setState` no se ejecuta de forma sincrona: leer el
    // estado justo despues de llamarlo devuelve el valor anterior y se pierden
    // turnos de la conversacion.
    expect(src).toContain('historyRef.current');
    expect(src).toContain('processInterviewTurn(historyRef.current, text)');
    expect(src).toContain('evaluateInterview(historyRef.current)');
  });

  it('existe la accion que genera el informe', () => {
    expect(server).toContain('export async function evaluateInterview');
    expect(server).toContain('canEvaluate(history)');
    expect(server).toContain('normalizeReport(');
  });
});

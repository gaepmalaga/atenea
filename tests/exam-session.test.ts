import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import {
  leerExamenGuardado,
  serializarExamen,
  contestadasDe,
  EXAM_MAX_AGE_MS,
  EXAM_SNAPSHOT_VERSION,
  EXAM_STORAGE_KEY,
  type ExamSettings,
} from '../app/lib/exam-session';
import type { Question } from '../app/lib/questions';

/**
 * El seguro del examen en curso.
 *
 * `ExamManager` tenia el examen entero en `useState` y en simulacro no se
 * guarda nada hasta entregar: pulsar Atras en Android, recargar, o que el
 * movil descarte la pestaña por una llamada borraba cuarenta minutos sin
 * aviso. Estas pruebas cubren lo que decide si se puede reanudar.
 */

const AHORA = 1_700_000_000_000;

const pregunta = (id: string, userAnswer?: string): Question => ({
  id,
  question: `¿Pregunta ${id}?`,
  options: [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
    { id: 'c', text: 'C' },
  ],
  correctOptionId: 'a',
  explanation: '',
  userAnswer,
});

const settings: ExamSettings = {
  mode: 'exam',
  questionCount: 3,
  difficulty: 'medium',
  selectedTopics: ['El Derecho'],
};

const guardado = (opciones: { questions?: Question[]; startedAt?: number; savedAt?: number } = {}) =>
  serializarExamen(
    opciones.questions ?? [pregunta('1'), pregunta('2', 'a')],
    settings,
    opciones.startedAt ?? AHORA - 60_000,
    opciones.savedAt ?? AHORA,
  );

describe('reanudar un examen', () => {
  it('devuelve el examen con sus respuestas', () => {
    const snap = leerExamenGuardado(guardado(), AHORA);
    expect(snap).not.toBeNull();
    expect(snap!.questions).toHaveLength(2);
    expect(snap!.questions[1].userAnswer).toBe('a');
    expect(snap!.settings.mode).toBe('exam');
  });

  it('conserva CUANDO empezo, no cuando se reanuda', () => {
    // Sin esto el cronometro del simulacro arrancaria de cero al volver y el
    // alumno tendria los 50 minutos otra vez. El reloj sale de `startedAt`.
    const empezo = AHORA - 15 * 60_000;
    const snap = leerExamenGuardado(guardado({ startedAt: empezo }), AHORA);
    expect(snap!.startedAt).toBe(empezo);
  });

  it('cuenta las contestadas, que es lo que se le enseña al ofrecerlo', () => {
    const snap = leerExamenGuardado(guardado(), AHORA)!;
    expect(contestadasDe(snap)).toBe(1);
  });
});

describe('cuando NO se puede reanudar, no se reanuda a medias', () => {
  // Un fallo al restaurar no puede impedirle al alumno empezar un examen nuevo:
  // por eso todo esto devuelve `null` y nada lanza.

  it('sin nada guardado', () => {
    expect(leerExamenGuardado(null, AHORA)).toBeNull();
  });

  it('con el JSON roto', () => {
    expect(leerExamenGuardado('{no es json', AHORA)).toBeNull();
  });

  it('con un formato de otra version', () => {
    const viejo = JSON.stringify({ version: 1, questions: [pregunta('1')], settings, startedAt: AHORA, savedAt: AHORA });
    expect(leerExamenGuardado(viejo, AHORA)).toBeNull();
  });

  it('cuando ha caducado', () => {
    const caducado = guardado({ savedAt: AHORA - EXAM_MAX_AGE_MS - 1 });
    expect(leerExamenGuardado(caducado, AHORA)).toBeNull();
    // Justo dentro del plazo sí vale.
    expect(leerExamenGuardado(guardado({ savedAt: AHORA - EXAM_MAX_AGE_MS + 1000 }), AHORA)).not.toBeNull();
  });

  it('cuando el guardado dice ser del futuro', () => {
    // Fecha del móvil mal puesta. Si el reloj va hacia atrás, un guardado
    // reciente no debe darse por caducado; pero uno del futuro no es fiable.
    expect(leerExamenGuardado(guardado({ savedAt: AHORA + 10 * 60_000 }), AHORA)).toBeNull();
  });

  it('sin preguntas', () => {
    expect(leerExamenGuardado(guardado({ questions: [] }), AHORA)).toBeNull();
  });

  it('con una pregunta corrupta', () => {
    // Restaurar un examen con preguntas a medias es peor que no restaurarlo:
    // el alumno vería opciones vacías y no sabría si es un fallo suyo.
    const roto = JSON.stringify({
      version: EXAM_SNAPSHOT_VERSION,
      questions: [{ id: '1', question: '¿?' }],
      settings,
      startedAt: AHORA,
      savedAt: AHORA,
    });
    expect(leerExamenGuardado(roto, AHORA)).toBeNull();
  });
});

describe('guardas del examen en curso', () => {
  const RUTA = join(__dirname, '..', 'app', 'components', 'student', 'modules', 'exams');

  function fuente(fichero: string) {
    return readFileSync(join(RUTA, fichero), 'utf-8').replace(/\r\n/g, '\n');
  }

  it('`ExamManager` guarda y limpia usando la clave del modulo', () => {
    const src = fuente('ExamManager.tsx');
    expect(src).toMatch(/EXAM_STORAGE_KEY/);
    // Se limpia al terminar Y al abandonar: dejarlo puesto haria que la
    // proxima vez le ofreciera reanudar un examen ya entregado.
    expect(src).toMatch(/removeItem/);
    expect(EXAM_STORAGE_KEY).toBe('atenea:examen-en-curso');
  });

  it('el cronometro del simulacro sale de `startedAt`, no del montaje', () => {
    // Si `ActiveTest` volviera a `Date.now()` al montarse, reanudar regalaria
    // el tiempo consumido: el simulacro dejaria de medir lo que dice medir.
    const src = fuente('ActiveTest.tsx');
    expect(src).toMatch(/startedAt/);
    expect(src).not.toMatch(/useRef<number>\(Date\.now\(\)\);\s*\n\s*const \[ahora/);
  });
});

describe('nadie se lleva por delante un examen sin avisar', () => {
  const COMPONENTES = join(__dirname, '..', 'app', 'components');

  function recorre(dir: string): string[] {
    return readdirSync(dir).flatMap((e) => {
      const completo = join(dir, e);
      if (statSync(completo).isDirectory()) return recorre(completo);
      return completo.endsWith('.tsx') ? [completo] : [];
    });
  }

  it('el armazon avisa antes de que el navegador se cierre con un examen abierto', () => {
    const ficheros = recorre(COMPONENTES).map((r) => ({
      nombre: r.split(sep).join('/'),
      src: readFileSync(r, 'utf-8'),
    }));
    const armazon = ficheros.find((f) => f.nombre.endsWith('StudentDashboard.tsx'));
    expect(armazon).toBeDefined();
    expect(armazon!.src).toMatch(/beforeunload/);
  });
});

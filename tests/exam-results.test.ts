import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  toResultRow,
  buildExamResults,
  countChange,
  EMPTY_METRICS,
} from '../app/lib/exam-results';

/**
 * El contrato entre la UI y el servidor para los resultados de test.
 *
 * `ExamManager` construia el payload con `response_time_ms` / `option_changes`
 * y `saveExamResults` leia `r.time` / `r.changes`. El parametro era `any[]`, asi
 * que nadie se entero: las dos dimensiones de "Atenea Mind" se guardaron a 0 en
 * todos los examenes durante meses.
 */

const q = (over: Record<string, unknown> = {}) => ({
  id: 'q-1',
  subject_id: 2,
  userAnswer: 'a',
  correctOptionId: 'a',
  errorType: null,
  timeMs: 12_000,
  changes: 1,
  ...over,
});

describe('toResultRow', () => {
  it('traduce camelCase a las columnas de la tabla', () => {
    expect(
      toResultRow({
        questionId: 'q-1',
        subjectId: 3,
        isCorrect: true,
        responseTimeMs: 8_400,
        optionChanges: 2,
        errorType: 'trampa',
      })
    ).toEqual({
      question_id: 'q-1',
      subject_id: 3,
      is_correct: true,
      response_time_ms: 8_400,
      option_changes: 2,
      error_type: 'trampa',
    });
  });

  it('rellena las metricas ausentes con 0, no con undefined', () => {
    const row = toResultRow({ questionId: null, subjectId: null, isCorrect: false });
    expect(row.response_time_ms).toBe(0);
    expect(row.option_changes).toBe(0);
    expect(row.error_type).toBeNull();
  });

  it('nunca deja pasar NaN ni Infinity a la base de datos', () => {
    // `Date.now() - undefined` da NaN. Un NaN en una columna numerica es un
    // error de insercion que se descubriria en produccion.
    const row = toResultRow({
      questionId: 'q',
      subjectId: 1,
      isCorrect: true,
      responseTimeMs: NaN,
      optionChanges: Infinity,
    });
    expect(row.response_time_ms).toBe(0);
    expect(row.option_changes).toBe(0);
  });

  it('descarta tiempos negativos', () => {
    const row = toResultRow({ questionId: 'q', subjectId: 1, isCorrect: true, responseTimeMs: -500 });
    expect(row.response_time_ms).toBe(0);
  });

  it('EMPTY_METRICS produce una fila valida', () => {
    const row = toResultRow({ questionId: null, subjectId: null, isCorrect: false, ...EMPTY_METRICS });
    expect(row.response_time_ms).toBe(0);
    expect(row.option_changes).toBe(0);
  });
});

describe('buildExamResults', () => {
  it('conserva el tiempo y los cambios de cada pregunta', () => {
    // Este es EL test que faltaba: el payload salia con unos nombres y el
    // servidor leia otros, y ambos lados compilaban tan tranquilos.
    const [row] = buildExamResults([q({ timeMs: 9_000, changes: 3 })]);
    expect(row.responseTimeMs).toBe(9_000);
    expect(row.optionChanges).toBe(3);
  });

  it('deriva el acierto comparando la respuesta con la correcta', () => {
    expect(buildExamResults([q({ userAnswer: 'a', correctOptionId: 'a' })])[0].isCorrect).toBe(true);
    expect(buildExamResults([q({ userAnswer: 'b', correctOptionId: 'a' })])[0].isCorrect).toBe(false);
  });

  it('una pregunta sin contestar es un fallo, no un acierto', () => {
    expect(buildExamResults([q({ userAnswer: null })])[0].isCorrect).toBe(false);
    expect(buildExamResults([q({ userAnswer: undefined })])[0].isCorrect).toBe(false);
  });

  it('una pregunta sin id llega como null y no como undefined', () => {
    const [row] = buildExamResults([q({ id: null, subject_id: undefined })]);
    expect(row.questionId).toBeNull();
    expect(row.subjectId).toBeNull();
  });

  it('sin metricas medidas devuelve ceros', () => {
    const [row] = buildExamResults([q({ timeMs: undefined, changes: undefined })]);
    expect(row.responseTimeMs).toBe(0);
    expect(row.optionChanges).toBe(0);
  });

  it('el payload encaja en toResultRow sin adaptaciones', () => {
    // Si alguien cambia el nombre de un campo en un lado, esto deja de compilar
    // o deja de pasar.
    const rows = buildExamResults([q()]).map(toResultRow);
    expect(rows[0]).toMatchObject({ question_id: 'q-1', response_time_ms: 12_000, option_changes: 1 });
  });
});

describe('countChange', () => {
  it('la primera respuesta no es un cambio', () => {
    // Antes se sumaba en cada pulsacion: contestar una sola vez ya marcaba 1.
    expect(countChange(null, 'a')).toBe(false);
    expect(countChange(undefined, 'a')).toBe(false);
  });

  it('volver a pulsar la misma opcion tampoco', () => {
    expect(countChange('a', 'a')).toBe(false);
  });

  it('pasar a una opcion distinta si', () => {
    expect(countChange('a', 'b')).toBe(true);
  });
});

describe('el codigo usa el contrato', () => {
  const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  const exams = stripComments(read('app/actions/exams.ts'));
  const manager = stripComments(read('app/components/student/modules/exams/ExamManager.tsx'));
  const activeTest = stripComments(read('app/components/student/modules/exams/ActiveTest.tsx'));

  it('saveExamResults ya no recibe any[]', () => {
    expect(exams).toContain('saveExamResults(results: ExamResultPayload[])');
  });

  it('el servidor no vuelve a inventarse nombres de campo', () => {
    // Los `r.time` / `r.changes` que nunca existieron.
    expect(exams).not.toMatch(/r\.(time|changes)\b/);
  });

  it('el payload del examen se construye con el helper compartido', () => {
    expect(manager).toContain('buildExamResults(');
    expect(manager).not.toMatch(/as any\)\.timeMs/);
  });

  it('ActiveTest no lee el contador de cambios desde el estado', () => {
    // `setOptionChanges(prev => prev + 1)` seguido de leer `optionChanges` en la
    // misma funcion devolvia el valor anterior: siempre 0 en entrenamiento.
    expect(activeTest).not.toContain('setOptionChanges');
    expect(activeTest).toContain('optionChangesRef.current');
  });

  it('ActiveTest no muta el estado en su sitio', () => {
    // `const updated = [...arr]; updated[i].campo = x;` copia el array pero no
    // los objetos: mutaba las mismas preguntas que tiene el padre.
    expect(activeTest).not.toMatch(/updated\[currentIndex\]\.\w+\s*=/);
  });

  it('no quedan @ts-ignore en el camino de las metricas', () => {
    expect(activeTest).not.toContain('@ts-ignore');
  });
});

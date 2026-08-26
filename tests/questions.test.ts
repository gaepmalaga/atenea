import { describe, it, expect } from 'vitest';
import {
  indexToOptionId,
  difficultyToNumber,
  mapBankRowToQuestion,
  mapCandidateToQuestion,
  scoreExam,
} from '../app/lib/questions';

const bankRow = {
  id: 'q-1',
  subject_id: 2,
  question_text: 'Cuantos titulos tiene la Constitucion?',
  options: ['Diez', 'Once', 'Doce'],
  correct_index: 1,
  explanation: 'Un preliminar y diez numerados.',
  origin: 'bank',
};

describe('indexToOptionId', () => {
  it('mapea 0,1,2 a a,b,c', () => {
    expect([0, 1, 2].map(indexToOptionId)).toEqual(['a', 'b', 'c']);
  });

  it('BUG: cualquier indice fuera de rango se colapsa en la opcion c', () => {
    // Replica el ternario original `i===0?'a':i===1?'b':'c'`. Si la IA
    // devolviera correctIndex: 3 (o null), la respuesta buena pasaria a ser
    // "c" en silencio y la pregunta quedaria mal corregida para siempre.
    expect(indexToOptionId(7)).toBe('c');
    expect(indexToOptionId(-1)).toBe('c');
  });
});

describe('difficultyToNumber', () => {
  it('traduce las tres dificultades', () => {
    expect(difficultyToNumber('easy')).toBe(1);
    expect(difficultyToNumber('medium')).toBe(2);
    expect(difficultyToNumber('hard')).toBe(3);
  });
});

describe('mapBankRowToQuestion', () => {
  it('convierte una fila del banco en una pregunta de UI', () => {
    const q = mapBankRowToQuestion(bankRow);
    expect(q.id).toBe('q-1');
    expect(q.options).toEqual([
      { id: 'a', text: 'Diez' },
      { id: 'b', text: 'Once' },
      { id: 'c', text: 'Doce' },
    ]);
    expect(q.correctOptionId).toBe('b');
    expect(q.userAnswer).toBeNull();
  });

  it('no revienta si options no es un array', () => {
    expect(mapBankRowToQuestion({ ...bankRow, options: null }).options).toEqual([]);
  });

  it('BUG: una pregunta sin opciones llega a la UI y deja al alumno sin nada que pulsar', () => {
    // El mapeo degrada a [] en vez de descartar la pregunta, asi que la
    // pantalla de test se renderiza vacia y el examen se queda bloqueado.
    const q = mapBankRowToQuestion({ ...bankRow, options: undefined });
    expect(q.options).toHaveLength(0);
    expect(q.correctOptionId).toBe('b'); // apunta a una opcion inexistente
  });
});

describe('mapCandidateToQuestion', () => {
  it('acepta el formato de la IA en vivo (array de strings)', () => {
    const q = mapCandidateToQuestion({
      id: 'c-1',
      question: 'Pregunta generada',
      options: ['A', 'B', 'C'],
      correct_index: 2,
      explanation: 'Porque si',
    });
    expect(q.correctOptionId).toBe('c');
    expect(q.origin).toBe('candidate');
  });

  it('acepta el formato ya normalizado (array de objetos)', () => {
    const opts = [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
      { id: 'c', text: 'C' },
    ];
    const q = mapCandidateToQuestion({ id: 'c-2', question: 'X', options: opts, correctOptionId: 'a' });
    expect(q.options).toEqual(opts);
    expect(q.correctOptionId).toBe('a');
  });

  it('BUG: una pregunta duplicada llega con id null y rompe voto, reporte y estadisticas', () => {
    // Cuando el upsert por question_hash choca, la accion devuelve
    // `{ ...qData, id: null, status: 'unsaved' }`. Esa pregunta se muestra
    // igual, pero luego se guarda en test_results con question_id null y no
    // se puede votar ni reportar.
    const q = mapCandidateToQuestion({
      id: null,
      question: 'Duplicada',
      options: ['A', 'B', 'C'],
      correct_index: 0,
    });
    expect(q.id).toBeNull();
  });
});

describe('scoreExam', () => {
  it('cuenta aciertos y fallos', () => {
    const qs = [
      { userAnswer: 'a', correctOptionId: 'a' },
      { userAnswer: 'b', correctOptionId: 'a' },
      { userAnswer: 'c', correctOptionId: 'c' },
    ];
    expect(scoreExam(qs)).toEqual({ total: 3, correct: 2, wrong: 1, percentage: 67 });
  });

  it('una pregunta sin contestar cuenta como fallo', () => {
    expect(scoreExam([{ userAnswer: null, correctOptionId: 'a' }]).correct).toBe(0);
  });

  it('un examen vacio da 0% y no NaN', () => {
    // ExamResults.tsx calcula `correctCount / total` sin protegerse: con un
    // examen de cero preguntas pinta "NaN%".
    expect(scoreExam([]).percentage).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import {
  shuffle,
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
  origin: 'bank' as const,
};

describe('indexToOptionId', () => {
  it('mapea 0,1,2 a a,b,c', () => {
    expect([0, 1, 2].map(indexToOptionId)).toEqual(['a', 'b', 'c']);
  });

  it('un indice fuera de rango cae en la ultima opcion, pero ya no llega ninguno', () => {
    // Es una funcion total: tiene que devolver algo. Lo peligroso era que un
    // `correctIndex: 5` de la IA se colapsara aqui en "c" y el alumno estudiara
    // una respuesta equivocada. Desde la fase 3, `validateGeneratedQuestion`
    // descarta la pregunta antes de guardarla, asi que este camino solo cubre
    // filas antiguas del banco. Ver tests/ai-output.test.ts.
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

  it('una fila sin opciones degrada a lista vacia en vez de reventar', () => {
    // El mapeo es tolerante a proposito: una fila antigua del banco no debe
    // tumbar la pantalla. Las preguntas NUEVAS ya no pueden llegar asi, porque
    // `validateGeneratedQuestion` exige tres opciones distintas y no vacias.
    const q = mapBankRowToQuestion({ ...bankRow, options: undefined });
    expect(q.options).toHaveLength(0);
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

  it('una pregunta sin fila en la BD conserva el id a null', () => {
    // Desde la fase 2.1, un choque de hash recupera la fila existente y la
    // pregunta llega con su id real. `null` queda solo para el caso en que ni
    // eso funcione: el tipo `Question['id']` lo declara, y la UI oculta los
    // botones de votar y reportar cuando no hay id.
    const q = mapCandidateToQuestion({
      id: null,
      question: 'Sin guardar',
      options: ['A', 'B', 'C'],
      correct_index: 0,
    });
    expect(q.id).toBeNull();
    expect(q.options).toHaveLength(3);
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

describe('shuffle', () => {
  it('conserva todos los elementos', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffle(items).sort((a, b) => a - b)).toEqual(items);
  });

  it('no muta el array original', () => {
    const items = [1, 2, 3];
    shuffle(items);
    expect(items).toEqual([1, 2, 3]);
  });

  it('tolera listas vacias o de un elemento', () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(['solo'])).toEqual(['solo']);
  });

  it('reparte las posiciones sin sesgo', () => {
    // `sort(() => Math.random() - 0.5)` deja el primer elemento en su sitio
    // mucho mas de lo que deberia: el comparador es inconsistente y el
    // resultado depende del algoritmo de ordenacion del motor. En un banco de
    // preguntas eso significa que el alumno ve siempre las mismas.
    const items = [0, 1, 2, 3, 4];
    const vecesEnPrimeraPosicion = new Array(items.length).fill(0);

    for (let i = 0; i < 6000; i++) {
      vecesEnPrimeraPosicion[shuffle(items)[0]]++;
    }

    // Con reparto uniforme cada elemento sale ~1200 veces de 6000.
    for (const veces of vecesEnPrimeraPosicion) {
      expect(veces).toBeGreaterThan(900);
      expect(veces).toBeLessThan(1500);
    }
  });
});

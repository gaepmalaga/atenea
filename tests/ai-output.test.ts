import { describe, it, expect } from 'vitest';
import { parseAIJson,
  validateGeneratedQuestion,
  validateFlashcard,
  randomContextWindow,
  REQUIRED_OPTIONS, stripMarkdown } from '../app/lib/ai-output';

/**
 * Lo que llega del modelo no es de fiar hasta que se comprueba.
 *
 * Antes se hacia `JSON.parse(cleanAIResponse(text))` y se daba por buena
 * cualquier estructura que parseara. Una pregunta con `correctIndex: 5` se
 * guardaba igual y el alumno acababa estudiando una respuesta equivocada.
 */

describe('parseAIJson', () => {
  it('lee un JSON limpio', () => {
    expect(parseAIJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('quita las vallas de markdown', () => {
    expect(parseAIJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('encuentra el objeto entre texto de cortesia', () => {
    expect(parseAIJson('Claro, aqui tienes:\n{"a":1}\nEspero que sirva.')).toEqual({ a: 1 });
  });

  it('tolera comas colgantes', () => {
    expect(parseAIJson('{"options":["a","b",],"correctIndex":0,}')).toEqual({
      options: ['a', 'b'],
      correctIndex: 0,
    });
  });

  it('lee tambien un array en la raiz', () => {
    expect(parseAIJson('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('devuelve null si no hay JSON', () => {
    expect(parseAIJson('lo siento, no puedo ayudarte con eso')).toBeNull();
    expect(parseAIJson('')).toBeNull();
  });

  // --- LOS DOS CASOS QUE `cleanAIResponse` ROMPIA ---
  // Estaban marcados `BUG:` y describian el comportamiento roto. Al sustituir
  // aquel apanio de regex por un parser de verdad, pasan a afirmar lo correcto.

  it('no toca el contenido de las cadenas', () => {
    // `cleanAIResponse` quitaba comas colgantes con un regex ciego, asi que una
    // explicacion legal que contuviera ", }" quedaba alterada en silencio.
    const original = 'Ver art. 1, }final del texto';
    const parsed = parseAIJson<{ explanation: string }>(JSON.stringify({ explanation: original }));
    expect(parsed?.explanation).toBe(original);
  });

  it('respeta las llaves que aparecen DENTRO de una cadena', () => {
    // `lastIndexOf('}')` apuntaba al ultimo `}` del documento aunque estuviera
    // dentro de un texto: el recorte por indices no entiende de comillas.
    const parsed = parseAIJson<{ question: string }>(
      'ruido {"question":"El simbolo } se usa"} mas ruido }'
    );
    expect(parsed?.question).toBe('El simbolo } se usa');
  });

  it('no se confunde con una comilla escapada', () => {
    const parsed = parseAIJson<{ t: string }>('{"t":"dijo \\"alto\\" y }"} sobra');
    expect(parsed?.t).toBe('dijo "alto" y }');
  });
});

const question = (over: Record<string, unknown> = {}) => ({
  question: '¿Cuantos titulos tiene la Constitucion Espaniola?',
  options: ['Diez', 'Once', 'Doce'],
  correctIndex: 1,
  explanation: 'Un preliminar y diez numerados.',
  ...over,
});

describe('validateGeneratedQuestion', () => {
  it('acepta una pregunta bien formada y normaliza los espacios', () => {
    const res = validateGeneratedQuestion(question({ question: '  ¿Cuantos titulos tiene la Constitucion?  ' }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.question).toBe('¿Cuantos titulos tiene la Constitucion?');
  });

  it('acepta tambien los nombres de columna de la BD', () => {
    const res = validateGeneratedQuestion({
      question_text: '¿Cuantos titulos tiene la Constitucion?',
      options: ['Diez', 'Once', 'Doce'],
      correct_index: 2,
      explanation: 'x',
    });
    expect(res.ok).toBe(true);
  });

  // --- EL FALLO PELIGROSO ---

  it('rechaza un correctIndex fuera de rango', () => {
    // Este era el peligroso: el ternario `i===0?'a':i===1?'b':'c'` colapsaba
    // CUALQUIER indice invalido en 'c'. La pregunta se servia con la respuesta
    // buena mal marcada y el alumno estudiaba un dato falso.
    for (const idx of [3, 5, -1, 99]) {
      const res = validateGeneratedQuestion(question({ correctIndex: idx }));
      expect(res.ok, `correctIndex ${idx} deberia rechazarse`).toBe(false);
    }
  });

  it('rechaza un correctIndex que no es un entero', () => {
    for (const idx of [null, undefined, 'uno', 1.5, NaN]) {
      expect(validateGeneratedQuestion(question({ correctIndex: idx })).ok).toBe(false);
    }
  });

  it('exige exactamente tres opciones', () => {
    expect(validateGeneratedQuestion(question({ options: ['a', 'b'] })).ok).toBe(false);
    expect(validateGeneratedQuestion(question({ options: ['a', 'b', 'c', 'd'] })).ok).toBe(false);
    expect(REQUIRED_OPTIONS).toBe(3);
  });

  it('rechaza opciones vacias', () => {
    expect(validateGeneratedQuestion(question({ options: ['Diez', '  ', 'Doce'] })).ok).toBe(false);
  });

  it('rechaza opciones repetidas', () => {
    // Dos opciones identicas dejan la pregunta sin respuesta unica.
    expect(validateGeneratedQuestion(question({ options: ['Diez', 'Diez', 'Doce'] })).ok).toBe(false);
    expect(validateGeneratedQuestion(question({ options: ['Diez', 'DIEZ', 'Doce'] })).ok).toBe(false);
  });

  it('rechaza un enunciado vacio o demasiado corto', () => {
    expect(validateGeneratedQuestion(question({ question: '' })).ok).toBe(false);
    expect(validateGeneratedQuestion(question({ question: '¿Y?' })).ok).toBe(false);
  });

  it('rechaza cualquier cosa que no sea un objeto', () => {
    for (const v of [null, undefined, 'texto', 42, []]) {
      expect(validateGeneratedQuestion(v).ok).toBe(false);
    }
  });

  it('explica por que descarta', () => {
    const res = validateGeneratedQuestion(question({ correctIndex: 7 }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('correctIndex');
  });
});

describe('validateFlashcard', () => {
  it('acepta una tarjeta con las dos caras', () => {
    expect(validateFlashcard({ front: 'Plazo de detencion', back: '72 horas' }).ok).toBe(true);
  });

  it('rechaza una cara vacia', () => {
    expect(validateFlashcard({ front: '', back: '72 horas' }).ok).toBe(false);
    expect(validateFlashcard({ front: 'Plazo', back: '  ' }).ok).toBe(false);
  });

  it('rechaza una tarjeta que se responde a si misma', () => {
    expect(validateFlashcard({ front: '72 horas', back: '72 horas' }).ok).toBe(false);
  });
});

describe('randomContextWindow', () => {
  it('devuelve el texto entero si ya cabe', () => {
    expect(randomContextWindow('corto', 100)).toBe('corto');
  });

  it('devuelve una ventana del tamanio pedido', () => {
    expect(randomContextWindow('x'.repeat(5000), 2500)).toHaveLength(2500);
  });

  it('la ventana se desplaza: dos lecturas no son siempre la misma', () => {
    // El fallo original: `substring(0, 2500)` daba SIEMPRE el mismo fragmento,
    // asi que repasar un tema producia tarjetas practicamente identicas.
    // Contenido NO periodico: con un patron que se repite cada 10 caracteres,
    // dos ventanas en posiciones distintas darian la misma cadena y el test
    // pasaria o fallaria por el fixture, no por el codigo.
    const texto = Array.from({ length: 700 }, (_, i) => `frase numero ${i}. `).join('');
    const inicio = randomContextWindow(texto, 100, () => 0);
    const medio = randomContextWindow(texto, 100, () => 0.5);
    const fin = randomContextWindow(texto, 100, () => 0.99);
    expect(new Set([inicio, medio, fin]).size).toBe(3);
  });

  it('nunca se sale del texto', () => {
    const texto = 'y'.repeat(1000);
    for (const r of [0, 0.5, 0.999999]) {
      expect(randomContextWindow(texto, 300, () => r)).toHaveLength(300);
    }
  });

  it('tolera un texto vacio', () => {
    expect(randomContextWindow('', 100)).toBe('');
  });
});

/**
 * El modelo escribe Markdown y el enunciado se pinta en crudo.
 *
 * `¿cuál de las siguientes afirmaciones es la **correcta**?` — la IA lo escribe
 * para poner esa palabra en negrita, y el alumno veia los asteriscos. Afectaba
 * a 5 de las 67 preguntas del banco.
 *
 * Se limpia al GUARDAR, no al mostrar: el enunciado se pinta en cuatro sitios
 * distintos y un enunciado de test debe ser texto plano.
 */
describe('stripMarkdown', () => {
  it('quita las negritas dejando la palabra', () => {
    expect(stripMarkdown('¿cuál es la **correcta**?')).toBe('¿cuál es la correcta?');
    expect(stripMarkdown('el __plazo__ es de 72 horas')).toBe('el plazo es de 72 horas');
  });

  it('quita las cursivas', () => {
    expect(stripMarkdown('la *Dark Web* es distinta')).toBe('la Dark Web es distinta');
    expect(stripMarkdown('(el _matiz_ importa)')).toBe('(el matiz importa)');
  });

  it('quita las comillas de codigo', () => {
    expect(stripMarkdown('el campo `error_type` guarda la taxonomia')).toBe(
      'el campo error_type guarda la taxonomia'
    );
  });

  it('NO se lleva por delante un asterisco o un guion bajo sueltos', () => {
    // Un texto legal usa asteriscos como llamada a pie de pagina, y los nombres
    // de campo llevan guiones bajos. Barrerlos a ciegas corromperia el
    // enunciado, que es justo lo que hacia el `cleanAIResponse` que se retiro
    // en la fase 3.
    expect(stripMarkdown('ver la nota * al pie')).toBe('ver la nota * al pie');
    expect(stripMarkdown('la columna question_text guarda el enunciado')).toBe(
      'la columna question_text guarda el enunciado'
    );
  });

  it('un texto sin Markdown queda intacto', () => {
    const limpio = '¿De qué Ministerio depende el Centro Nacional de Inteligencia (CNI)?';
    expect(stripMarkdown(limpio)).toBe(limpio);
  });

  it('la validacion de una pregunta ya lo aplica', () => {
    const res = validateGeneratedQuestion({
      question: '¿Cuál de las siguientes afirmaciones es la **correcta**?',
      options: ['La **primera**', 'La segunda', 'La tercera'],
      correctIndex: 0,
      explanation: 'Porque el *artículo 11* lo dice.',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.question).toBe('¿Cuál de las siguientes afirmaciones es la correcta?');
    expect(res.value.options[0]).toBe('La primera');
    expect(res.value.explanation).toBe('Porque el artículo 11 lo dice.');
  });
});

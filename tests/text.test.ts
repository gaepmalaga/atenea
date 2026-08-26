import { describe, it, expect } from 'vitest';
import { cleanAIResponse, cleanLegalText, chunkLegalText } from '../app/lib/text';

describe('cleanAIResponse', () => {
  it('devuelve un objeto vacio ante entrada vacia', () => {
    expect(cleanAIResponse('')).toBe('{}');
  });

  it('quita las vallas markdown y el texto sobrante', () => {
    const raw = 'Claro, aqui tienes:\n```json\n{"a":1}\n```\nEspero que sirva.';
    expect(JSON.parse(cleanAIResponse(raw))).toEqual({ a: 1 });
  });

  it('tolera comas colgantes en objetos y arrays', () => {
    const raw = '{"options":["a","b",],"correctIndex":0,}';
    expect(JSON.parse(cleanAIResponse(raw))).toEqual({
      options: ['a', 'b'],
      correctIndex: 0,
    });
  });

  // --- CARACTERIZACION DE FALLOS CONOCIDOS ---

  it('BUG: corrompe el contenido si un string incluye una coma seguida de }', () => {
    // La limpieza de comas colgantes es un regex ciego: no distingue
    // estructura de contenido. Una explicacion legal que contenga ", }"
    // dentro de una cadena queda alterada silenciosamente.
    const original = 'Ver art. 1, }final del texto';
    const raw = JSON.stringify({ explanation: original });
    const cleaned = cleanAIResponse(raw);
    expect(JSON.parse(cleaned).explanation).not.toBe(original);
  });

  it('BUG: un JSON con llaves dentro de un string se recorta mal', () => {
    // lastIndexOf('}') apunta al ultimo `}` del documento aunque este dentro
    // de una cadena; el recorte por indices no entiende de comillas.
    const raw = 'ruido {"question":"El simbolo } se usa"} mas ruido }';
    expect(() => JSON.parse(cleanAIResponse(raw))).toThrow();
  });
});

describe('cleanLegalText', () => {
  it('elimina los marcadores de salto de pagina de pdf2json', () => {
    const raw = 'Articulo 1\n----------------Page (3) Break----------------\nArticulo 2';
    expect(cleanLegalText(raw)).toBe('Articulo 1\n\nArticulo 2');
  });

  it('colapsa mas de dos saltos de linea seguidos', () => {
    expect(cleanLegalText('a\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('BUG: borra lineas que son solo un numero, aunque sean contenido real', () => {
    // El regex que quita numeros de pagina tambien se come apartados
    // numerados que ocupan su propia linea.
    const raw = 'Son requisitos:\n\n2\n\nTener 18 anios';
    expect(cleanLegalText(raw)).not.toContain('2');
  });

  it('BUG: la limpieza de caracteres de control es un no-op', () => {
    // El original usaba `/[]/g` (clase de caracteres vacia), que en JS no casa
    // con nada. Los caracteres de control que cuela pdf2json sobreviven intactos
    // hasta el embedding y hasta el prompt que se manda al modelo.
    const raw = 'Articulo \u0001\u0002 1';
    expect(cleanLegalText(raw)).toBe('Articulo \u0001\u0002 1');
  });
});

describe('chunkLegalText', () => {
  it('devuelve un unico fragmento si el texto cabe entero', () => {
    expect(chunkLegalText('parrafo corto')).toEqual(['parrafo corto']);
  });

  it('trocea por parrafos cuando se supera el limite', () => {
    const p = 'x'.repeat(600);
    expect(chunkLegalText([p, p, p].join('\n\n')).length).toBeGreaterThan(1);
  });

  it('BUG CRITICO: genera un primer fragmento VACIO si el texto empieza por un parrafo largo', () => {
    // Con currentChunk = '' y un parrafo > maxChars, la condicion se cumple en
    // la primera iteracion y se hace push('') antes de acumular nada. Ese
    // fragmento vacio llega a `embedContent('')`, que falla, y el documento
    // queda indexado de forma incompleta sin aviso al admin.
    expect(chunkLegalText('y'.repeat(1500))[0]).toBe('');
  });

  it('BUG: nunca parte un parrafo, asi que un fragmento puede exceder el limite', () => {
    // Un articulo largo sin lineas en blanco produce un fragmento gigante que
    // puede superar el limite de tokens del modelo de embeddings.
    const chunks = chunkLegalText('z'.repeat(5000));
    expect(Math.max(...chunks.map((c) => c.length))).toBeGreaterThan(1000);
  });

  it('BUG: el solapamiento hace que los fragmentos crezcan por encima del maximo', () => {
    const p = 'w'.repeat(700);
    const chunks = chunkLegalText([p, p, p, p].join('\n\n'));
    // 200 chars de solape + 700 del parrafo nuevo = 901, y sigue creciendo
    // porque el solape se toma del fragmento ya solapado.
    expect(chunks.some((c) => c.length > 900)).toBe(true);
  });
});

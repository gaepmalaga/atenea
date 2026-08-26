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
  const MAX = 1000;

  it('devuelve un unico fragmento si el texto cabe entero', () => {
    expect(chunkLegalText('parrafo corto')).toEqual(['parrafo corto']);
  });

  it('trocea por parrafos cuando se supera el limite', () => {
    const p = 'x'.repeat(600);
    expect(chunkLegalText([p, p, p].join('\n\n')).length).toBeGreaterThan(1);
  });

  it('un texto vacio no produce fragmentos', () => {
    expect(chunkLegalText('')).toEqual([]);
    expect(chunkLegalText('   \n\n  ')).toEqual([]);
  });

  // --- LAS TRES GARANTIAS QUE EL ALGORITMO ANTERIOR NO CUMPLIA ---
  // Estos tests estaban marcados `BUG:` y describian el comportamiento roto.
  // Al corregirlo en la fase 2.6 fallaron, que es justo su razon de ser.

  it('nunca emite un fragmento vacio, ni empezando por un parrafo largo', () => {
    // Antes: con currentChunk = '' y un parrafo > maxChars, se hacia push('')
    // en la primera iteracion. Ese fragmento vacio llegaba a `embedContent('')`,
    // que falla, y el documento quedaba indexado a medias sin aviso al admin.
    for (const input of ['y'.repeat(1500), 'z'.repeat(5000), 'a'.repeat(999) + '\n\n' + 'b'.repeat(3000)]) {
      const chunks = chunkLegalText(input);
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.filter((c) => !c.trim())).toEqual([]);
    }
  });

  it('parte los parrafos largos: ningun fragmento supera el maximo', () => {
    // Antes un articulo largo sin lineas en blanco producia un fragmento unico
    // gigante que podia pasarse del limite de tokens del modelo.
    const casos = [
      'z'.repeat(5000),
      Array(4).fill('w'.repeat(700)).join('\n\n'),
      Array.from({ length: 40 }, (_, i) => `Articulo ${i + 1}. Plazo de setenta y dos horas.`).join('\n\n'),
    ];
    for (const input of casos) {
      const chunks = chunkLegalText(input);
      expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(MAX);
    }
  });

  it('el solape no se acumula: se toma del contenido del fragmento anterior', () => {
    // Antes el solape se tomaba del fragmento YA solapado, asi que los tamanios
    // crecian fragmento a fragmento.
    const p = 'w'.repeat(700);
    const chunks = chunkLegalText([p, p, p, p, p, p].join('\n\n'));
    const lengths = chunks.map((c) => c.length);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(MAX);
    // Todos los intermedios miden lo mismo: no hay crecimiento progresivo.
    const intermedios = lengths.slice(1, -1);
    expect(new Set(intermedios).size).toBe(1);
  });

  it('prefiere cortar por frases antes que por la mitad de una palabra', () => {
    const frase = 'La autoridad competente resolvera en el plazo indicado. ';
    const chunks = chunkLegalText(frase.repeat(60));
    // Si cortara a ciegas, casi ningun fragmento acabaria en punto.
    const acabanEnPunto = chunks.filter((c) => c.trimEnd().endsWith('.')).length;
    expect(acabanEnPunto).toBeGreaterThan(chunks.length / 2);
  });

  it('el texto original sobrevive entero al troceado', () => {
    // Garantia de fondo: trocear no puede perder contenido.
    const texto = Array.from({ length: 12 }, (_, i) => `Articulo ${i + 1}. Contenido del articulo numero ${i + 1}.`).join('\n\n');
    const unido = chunkLegalText(texto).join(' ').replace(/\s+/g, ' ');
    for (let i = 1; i <= 12; i++) {
      expect(unido).toContain(`Articulo ${i}.`);
    }
  });
});

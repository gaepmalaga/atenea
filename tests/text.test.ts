import { describe, it, expect } from 'vitest';
import { cleanLegalText, chunkLegalText, rejoinPdfLines, legalReferenceOf, chunkDocument, hasLegalStructure, countLegalHeadings, chunkLegalStructure } from '../app/lib/text';

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

/**
 * Reconstruccion de parrafos de un PDF.
 *
 * `pdf2json` devuelve el texto MAQUETADO: un renglon por linea, cortado al
 * ancho del papel. En el temario real de este proyecto eso eran lineas de 66-71
 * caracteres y el 39-40 % de ellas partidas a mitad de frase — la palabra
 * «Articulo» llegaba como «Articu» + «lo».
 *
 * Sin reconstruir, `chunkLegalText` no encuentra parrafos (30 saltos dobles en
 * 108.000 caracteres) y trocea a ciegas, y detectar la estructura legal es
 * imposible.
 */
describe('rejoinPdfLines', () => {
  it('une los renglones de una frase partida por el ancho de la pagina', () => {
    const pdf = 'Las Fuerzas y Cuerpos de Seguridad del Estado ejercen sus\nfunciones en todo el territorio nacional.';
    expect(rejoinPdfLines(pdf)).toBe(
      'Las Fuerzas y Cuerpos de Seguridad del Estado ejercen sus funciones en todo el territorio nacional.'
    );
  });

  it('reconstruye una palabra partida con guion, sin dejar el guion', () => {
    expect(rejoinPdfLines('la Admi-\nnistracion del Estado')).toBe('la Administracion del Estado');
  });

  it('no une cuando la frase anterior ya termino', () => {
    // Punto final y mayuscula: son dos frases distintas, no un renglon partido.
    const t = 'Primera frase completa.\nSegunda frase completa.';
    expect(rejoinPdfLines(t)).toBe(t);
  });

  it('un encabezado nunca se pega a la linea anterior', () => {
    // Sin esta guarda, «Articulo segundo.» se pegaba al final del articulo
    // anterior y el texto perdia su estructura.
    const t = 'texto que no cierra frase\nArtículo segundo.';
    expect(rejoinPdfLines(t)).toBe(t);
  });

  it('un apartado tampoco: «a)», «2.» y «III.» abren linea', () => {
    for (const apertura of ['a) primero', '2. segundo', 'III. tercero']) {
      const t = 'enumeracion que sigue\n' + apertura;
      expect(rejoinPdfLines(t), apertura).toBe(t);
    }
  });

  it('colapsa las rachas de espacios de un PDF justificado', () => {
    expect(rejoinPdfLines('Las  Fuerzas  y  Cuerpos.')).toBe('Las Fuerzas y Cuerpos.');
  });

  it('NO pierde contenido: solo cambian los espacios y los saltos', () => {
    // Es la garantia que hace seguro el cambio. Verificada ademas contra los
    // tres documentos del temario real.
    const pdf = [
      'TÍTULO I. De los Cuerpos y Fuerzas de Seguridad',
      'Las  Fuerzas  y  Cuerpos  de  Seguridad  del  Estado  ejercen  sus',
      'funciones en todo el territorio nacional y estan integradas por:',
      'a) El Cuerpo Nacional de Policia, que es un Instituto Armado de',
      'naturaleza civil.',
      'Artículo noveno.',
      'Texto del articulo con una palabra par-',
      'tida por el maquetador.',
    ].join('\n');

    const soloLetras = (t: string) => t.replace(/[\s-]+/g, '');
    expect(soloLetras(rejoinPdfLines(pdf))).toBe(soloLetras(pdf));
  });

  it('cleanLegalText lo aplica: el texto sale en parrafos, no en renglones', () => {
    const pdf = 'El Cuerpo Nacional de Policia es un instituto armado\nde naturaleza civil.';
    expect(cleanLegalText(pdf)).toBe('El Cuerpo Nacional de Policia es un instituto armado de naturaleza civil.');
  });

  it('LIMITACION conocida: no une si la continuacion empieza en mayuscula', () => {
    // Es deliberado. La mayuscula es la unica senial fiable de que empieza algo
    // nuevo, y unir por ella juntaria parrafos legitimos. El precio es que un
    // renglon partido justo antes de un nombre propio se queda partido.
    //
    // Medido sobre el temario real, el precio es pequenio: de 596 cortes a
    // mitad de frase quedan 8, y de 752 quedan 2.
    const pdf = 'es un Instituto\nArmado de naturaleza civil.';
    expect(rejoinPdfLines(pdf)).toBe(pdf);
  });

  it('un texto ya en parrafos no se toca', () => {
    const t = 'Parrafo uno completo.\n\nParrafo dos completo.';
    expect(cleanLegalText(t)).toBe(t);
  });
});

/**
 * Troceado por estructura legal.
 *
 * El troceado por longitud parte donde le toca, asi que un fragmento podia
 * empezar a mitad del articulo 11 y acabar a mitad del 12: la cita del chat
 * salia mutilada y una pregunta generada podia mezclar dos articulos.
 *
 * Medido sobre el temario real tras estos cambios: la Constitucion produce 184
 * referencias distintas (169 articulos + 15 disposiciones) y la LOFCS 50.
 */
describe('legalReferenceOf', () => {
  it('reconoce articulos numerados', () => {
    expect(legalReferenceOf('Artículo 1.')).toBe('Artículo 1');
    expect(legalReferenceOf('Artículo 169.')).toBe('Artículo 169');
    expect(legalReferenceOf('Artículo 11 bis.')).toBe('Artículo 11 bis');
  });

  it('reconoce articulos en letra, ordinales y cardinales', () => {
    // La LOFCS numera «primero»..«noveno» y luego «diez», «once». Sin los
    // cardinales solo se detectaban 9 de sus ~54 articulos.
    expect(legalReferenceOf('Artículo primero.')).toBe('Artículo primero');
    expect(legalReferenceOf('Artículo noveno.')).toBe('Artículo noveno');
    expect(legalReferenceOf('Artículo diez.')).toBe('Artículo diez');
    expect(legalReferenceOf('Artículo veintiocho.')).toBe('Artículo veintiocho');
  });

  it('reconoce las disposiciones', () => {
    expect(legalReferenceOf('Disposición adicional primera')).toBe('Disposición adicional primera');
    expect(legalReferenceOf('Disposición derogatoria')).toBe('Disposición derogatoria');
  });

  it('NO confunde una referencia en mitad de un parrafo con un encabezado', () => {
    // «artículo 126 de la Constitución, ya que...» aparece en el preambulo de
    // la LOFCS. Con el flag `i` se tomaba por un encabezado y partia el texto
    // por la mitad de una frase. La mayuscula inicial es lo unico que los
    // distingue.
    expect(legalReferenceOf('artículo 126 de la Constitución, ya que')).toBeNull();
    expect(legalReferenceOf('lo dispuesto en el artículo 5')).toBeNull();
  });

  it('descarta las lineas del INDICE', () => {
    // Llevan puntos de relleno hasta el numero de pagina. Sin este filtro, el
    // indice de la LOFCS metia 54 encabezados falsos antes del cuerpo.
    expect(legalReferenceOf('Artículo primero...............................5')).toBeNull();
  });
});

describe('chunkDocument', () => {
  const legal = [
    'Artículo 1.',
    'Los españoles son iguales ante la ley.',
    'Artículo 2.',
    'La Constitución se fundamenta en la indisoluble unidad.',
    'Artículo 3.',
    'El castellano es la lengua oficial del Estado.',
  ].join('\n');

  it('un articulo corto es UN fragmento, con su referencia', () => {
    const fragmentos = chunkDocument(legal);
    expect(fragmentos).toHaveLength(3);
    expect(fragmentos.map((f) => f.reference)).toEqual(['Artículo 1', 'Artículo 2', 'Artículo 3']);
  });

  it('cada fragmento contiene su articulo entero y nada del siguiente', () => {
    const [uno, dos] = chunkDocument(legal);
    expect(uno.text).toContain('iguales ante la ley');
    expect(uno.text).not.toContain('indisoluble');
    expect(dos.text).toContain('indisoluble');
  });

  it('un articulo que no cabe se parte, pero los trozos guardan la referencia', () => {
    // Se llama a `chunkLegalStructure` directamente: con UN solo encabezado,
    // `chunkDocument` decidiria —y con razon— que esto no es un texto legal.
    const largo = 'Artículo 1.\n' + 'Contenido muy extenso. '.repeat(120);
    const fragmentos = chunkLegalStructure(largo, 300);
    expect(fragmentos.length).toBeGreaterThan(1);
    for (const f of fragmentos) {
      expect(f.reference).toBe('Artículo 1');
      expect(f.text.length).toBeLessThanOrEqual(300);
    }
  });

  it('un texto SIN estructura se trocea por longitud, sin referencias', () => {
    // Unos apuntes no son un texto legal. La estrategia se decide sola, sin
    // preguntarle nada al administrador.
    const apuntes = 'Parrafo de apuntes.\n\nOtro parrafo distinto.\n\nY un tercero.';
    const fragmentos = chunkDocument(apuntes);
    expect(fragmentos.every((f) => f.reference === null)).toBe(true);
  });

  it('hacen falta al menos tres encabezados para tratarlo como legal', () => {
    const casi = 'Artículo 1.\nuno.\nArtículo 2.\ndos.';
    expect(hasLegalStructure(casi)).toBe(false);
    expect(hasLegalStructure(casi + '\nArtículo 3.\ntres.')).toBe(true);
  });

  it('el texto anterior al primer articulo sale sin referencia', () => {
    const conPreambulo = 'Texto introductorio del preambulo.\n' + legal;
    const [primero] = chunkDocument(conPreambulo);
    expect(primero.reference).toBeNull();
    expect(primero.text).toContain('introductorio');
  });

  it('ningun fragmento sale vacio', () => {
    for (const entrada of [legal, '', '   ', 'Artículo 1.\n\n\nArtículo 2.\n\n\nArtículo 3.']) {
      for (const f of chunkDocument(entrada)) {
        expect(f.text.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

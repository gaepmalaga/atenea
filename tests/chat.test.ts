import { describe, it, expect } from 'vitest';
import {
  isFollowUp,
  lastUserTurn,
  buildRetrievalQuery,
  citaDe,
  trimHistory,
  formatHistory,
  MAX_HISTORY_TURNS,
  MAX_TURN_CHARS,
  type ChatTurn,
  palabrasANumero,
  numeroDeArticulo,
  articuloPedido,
  esPreguntaDeEstructura,
  resumeIndice,
  formatIndice,
  buildChatPrompt,
  resumeEstructura,
  pidePartesInternas,
} from '../app/lib/chat';

/**
 * La parte delicada de dar memoria a un chat con recuperacion no es meter el
 * historial en el prompt: es QUE SE BUSCA en el temario. `askAtenea(query)`
 * embebia solo la frase actual, asi que una repregunta como "¿y que plazo
 * aplica en ese caso?" no recuperaba absolutamente nada.
 */

const turn = (role: ChatTurn['role'], content: string): ChatTurn => ({ role, content });

const conversacion: ChatTurn[] = [
  turn('user', '¿Cuales son los requisitos para acceder a la escala basica del CNP?'),
  turn('ai', 'Ser espaniol, tener 18 anios y no superar la edad maxima... [1]'),
];

describe('isFollowUp', () => {
  it('una pregunta larga y completa se sostiene sola', () => {
    expect(isFollowUp('¿Cuantos titulos tiene la Constitucion Espaniola de 1978?')).toBe(false);
  });

  it('una pregunta muy corta casi nunca se sostiene sola', () => {
    expect(isFollowUp('¿y el plazo?')).toBe(true);
    expect(isFollowUp('amplia')).toBe(true);
  });

  it('detecta los conectores tipicos de repregunta', () => {
    expect(isFollowUp('¿Y si el detenido es menor de edad, que ocurre entonces?')).toBe(true);
    expect(isFollowUp('En ese caso, cuanto tiempo puede prolongarse la detencion?')).toBe(true);
    expect(isFollowUp('Pero eso no contradice lo que has dicho sobre el plazo maximo?')).toBe(true);
  });

  it('tolera signos de apertura y mayusculas', () => {
    expect(isFollowUp('¿¿ Y ESO por que motivo se aplica de esa manera concreta ??')).toBe(true);
  });

  it('una consulta vacia no es una repregunta', () => {
    expect(isFollowUp('   ')).toBe(false);
  });
});

describe('lastUserTurn', () => {
  it('encuentra la ultima pregunta del alumno, no la respuesta de la IA', () => {
    expect(lastUserTurn(conversacion)).toContain('escala basica');
  });

  it('devuelve null si el alumno no ha hablado', () => {
    expect(lastUserTurn([turn('ai', 'Hola')])).toBeNull();
    expect(lastUserTurn([])).toBeNull();
  });

  it('ignora los turnos vacios', () => {
    expect(lastUserTurn([turn('user', 'real'), turn('user', '   ')])).toBe('real');
  });
});

describe('buildRetrievalQuery', () => {
  it('una pregunta completa se busca tal cual', () => {
    // Incluir la anterior solo anadiria ruido si el alumno cambia de tema.
    const q = '¿Que dice el articulo 17 de la Constitucion sobre la detencion?';
    expect(buildRetrievalQuery(conversacion, q)).toBe(q);
  });

  it('una repregunta arrastra la pregunta anterior', () => {
    // ESTE es el caso que no funcionaba: sin la anterior, el embedding de
    // "¿y la edad maxima?" no recupera nada del temario.
    const resultado = buildRetrievalQuery(conversacion, '¿y la edad maxima?');
    expect(resultado).toContain('escala basica');
    expect(resultado).toContain('edad maxima');
  });

  it('sin conversacion previa se busca solo la pregunta', () => {
    expect(buildRetrievalQuery([], '¿y el plazo?')).toBe('¿y el plazo?');
  });

  it('recorta consultas desmedidas', () => {
    expect(buildRetrievalQuery([], 'x'.repeat(5000)).length).toBeLessThanOrEqual(1000);
  });

  it('una consulta vacia devuelve vacio', () => {
    expect(buildRetrievalQuery(conversacion, '   ')).toBe('');
  });

  it('el contexto arrastrado tambien esta acotado', () => {
    const largo = [turn('user', 'a'.repeat(5000))];
    expect(buildRetrievalQuery(largo, '¿y eso?').length).toBeLessThanOrEqual(MAX_TURN_CHARS + 1000);
  });
});

describe('trimHistory', () => {
  it('se queda con los ultimos turnos', () => {
    const largo = Array.from({ length: 20 }, (_, i) => turn('user', `pregunta ${i}`));
    const trimmed = trimHistory(largo);
    expect(trimmed).toHaveLength(MAX_HISTORY_TURNS);
    expect(trimmed[trimmed.length - 1].content).toBe('pregunta 19');
  });

  it('recorta cada turno para que una respuesta larga no se coma el contexto', () => {
    const [t] = trimHistory([turn('ai', 'z'.repeat(5000))]);
    expect(t.content).toHaveLength(MAX_TURN_CHARS);
  });

  it('descarta los turnos vacios', () => {
    expect(trimHistory([turn('user', '  '), turn('user', 'real')])).toHaveLength(1);
  });
});

describe('formatHistory', () => {
  it('etiqueta quien dice cada cosa', () => {
    const texto = formatHistory(conversacion);
    expect(texto).toContain('ASPIRANTE:');
    expect(texto).toContain('ATENEA:');
  });

  it('sin conversacion devuelve cadena vacia', () => {
    // El prompt omite el bloque entero cuando no hay historial, en vez de
    // mandar una seccion vacia que confunda al modelo.
    expect(formatHistory([])).toBe('');
    expect(formatHistory([turn('user', '   ')])).toBe('');
  });
});

describe('el codigo usa el contrato', () => {
  it('askAtenea acepta historial y lo usa para buscar', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '..', 'app/actions/chat.ts'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    expect(src).toContain('history: ChatTurn[] = []');
    // Lo que se embebe es la consulta RECONSTRUIDA, no la frase suelta.
    expect(src).toContain('embedContent(retrievalQuery)');
    expect(src).toContain('buildRetrievalQuery(history, safeQuery)');
    expect(src).toContain('formatHistory(history)');
  });
});

/**
 * LA REFERENCIA LEGAL ES LO QUE SE CITA
 *
 * El chat citaba el NOMBRE DEL FICHERO: «TEMA 9 - La Ley Organica 2-1986 - de 13
 * de marzo - de Fuerzas y Cuerpos de Seguridad». A un opositor eso no le dice
 * que releer; «Artículo treinta y siete» si. El dato estaba guardado desde P1b
 * —118 de los 177 fragmentos de la LOFCS lo traen— pero no llegaba a la
 * pantalla.
 *
 * Se lee siempre por aqui porque el valor puede venir de tres formas: con
 * articulo, `null` (unos apuntes no tienen articulos) o `undefined` mientras
 * `match_document_chunks` no devuelva la columna.
 */
describe('citaDe', () => {
  const fichero = 'TEMA 9 - La Ley Organica 2-1986 - de 13 de marzo';

  it('antepone el articulo cuando lo hay', () => {
    expect(citaDe({ filename: fichero, reference: 'Artículo treinta y siete' }))
      .toBe(`Artículo treinta y siete · ${fichero}`);
  });

  it('sin referencia se queda el nombre del fichero', () => {
    // Unos apuntes no salen de ningun articulo: `null`.
    expect(citaDe({ filename: fichero, reference: null })).toBe(fichero);
    // Y mientras la funcion SQL no devuelva la columna: `undefined`.
    expect(citaDe({ filename: fichero })).toBe(fichero);
  });

  it('una referencia en blanco no deja un separador colgando', () => {
    // Sin el `trim`, esto pintaba « · TEMA 9…» delante del alumno.
    expect(citaDe({ filename: fichero, reference: '   ' })).toBe(fichero);
  });
});


// ============================================================
// LO QUE LA BUSQUEDA SEMANTICA NO PUEDE RESPONDER
// ============================================================

/**
 * De donde sale esto: un alumno pregunto «¿cuantos articulos tiene la
 * Constitucion?» y el chat contesto «no consta en el temario oficial
 * aportado». Y era verdad — ningun fragmento lo dice, porque el texto de una
 * norma no se cuenta a si mismo— pero el dato SI estaba en la plataforma:
 * desde P1b cada fragmento sabe de que articulo viene. Lo que faltaba era
 * llevarle ese recuento al modelo.
 */

describe('leer el numero de un articulo', () => {
  it('entiende las cifras', () => {
    expect(numeroDeArticulo('Artículo 27')).toBe(27);
    expect(numeroDeArticulo('Artículo 169')).toBe(169);
    expect(numeroDeArticulo('Artículo 1')).toBe(1);
  });

  it('entiende la letra, que es como numera media parte del temario', () => {
    // No es teoria: la Constitucion usa cifras y la LOFCS usa letra, mezclando
    // ordinales para los nueve primeros y cardinales a partir de ahi.
    expect(numeroDeArticulo('Artículo primero')).toBe(1);
    expect(numeroDeArticulo('Artículo noveno')).toBe(9);
    expect(numeroDeArticulo('Artículo diez')).toBe(10);
    expect(numeroDeArticulo('Artículo veintiuno')).toBe(21);
    expect(numeroDeArticulo('Artículo treinta y siete')).toBe(37);
    expect(numeroDeArticulo('Artículo cuarenta y uno')).toBe(41);
    expect(numeroDeArticulo('Artículo cincuenta y cuatro')).toBe(54);
  });

  it('lo que no es un articulo devuelve null, y eso es informacion', () => {
    // Las disposiciones se cuentan aparte: son 15 en la Constitucion y 18 en
    // la LOFCS, y meterlas en el recuento de articulos daria un numero falso.
    expect(numeroDeArticulo('Disposición adicional primera')).toBeNull();
    expect(numeroDeArticulo('Disposición derogatoria')).toBeNull();
    expect(numeroDeArticulo('TÍTULO II')).toBeNull();
    expect(numeroDeArticulo(null)).toBeNull();
    expect(numeroDeArticulo('')).toBeNull();
  });

  it('no se inventa un numero con palabras que no lo son', () => {
    expect(palabrasANumero('preliminar')).toBeNull();
    expect(palabrasANumero('de la educacion')).toBeNull();
    expect(palabrasANumero('')).toBeNull();
  });

  it('compone centenas', () => {
    expect(palabrasANumero('ciento cuarenta y dos')).toBe(142);
    expect(palabrasANumero('cien')).toBe(100);
  });
});

describe('el articulo que nombra la pregunta', () => {
  it('lo pilla en cifra, con y sin abreviatura', () => {
    expect(articuloPedido('¿qué dice el artículo 27?')).toBe(27);
    expect(articuloPedido('art. 168')).toBe(168);
    expect(articuloPedido('explícame el articulo 14')).toBe(14);
  });

  it('el apartado no cambia el fragmento que hay que traer', () => {
    expect(articuloPedido('artículo 168.3')).toBe(168);
  });

  it('lo pilla escrito con letra', () => {
    expect(articuloPedido('¿qué dice el artículo cuarenta y uno?')).toBe(41);
  });

  it('null cuando no se nombra ninguno', () => {
    expect(articuloPedido('¿cuántos artículos tiene la Constitución?')).toBeNull();
    expect(articuloPedido('¿cuáles son los principios básicos de actuación?')).toBeNull();
    expect(articuloPedido('')).toBeNull();
  });
});

describe('preguntas sobre la estructura del documento', () => {
  it('reconoce las de recuento', () => {
    expect(esPreguntaDeEstructura('¿cuántos artículos tiene la Constitución?')).toBe(true);
    expect(esPreguntaDeEstructura('cuantos articulos tiene la constitucion')).toBe(true);
    expect(esPreguntaDeEstructura('¿de cuántos títulos consta la Constitución?')).toBe(true);
    expect(esPreguntaDeEstructura('¿cuántas disposiciones adicionales hay?')).toBe(true);
  });

  it('NO se dispara con preguntas de contenido', () => {
    // Un falso positivo solo anade una fuente al prompt, pero "cuantos dias de
    // plazo" es una pregunta del temario y tiene que ir por la via normal.
    expect(esPreguntaDeEstructura('¿cuántos días de plazo hay para recurrir?')).toBe(false);
    expect(esPreguntaDeEstructura('¿qué dice el artículo 27?')).toBe(false);
    expect(esPreguntaDeEstructura('¿cuántos miembros tiene el Congreso?')).toBe(false);
    expect(esPreguntaDeEstructura('')).toBe(false);
  });
});

describe('el resumen del indice', () => {
  it('cuenta articulos distintos y separa las disposiciones', () => {
    const r = resumeIndice([
      'Artículo 1', 'Artículo 1', 'Artículo 2', 'Artículo 3',
      'Disposición adicional primera', null, '',
    ]);
    expect(r.articulos).toBe(3);
    expect(r.primero).toBe(1);
    expect(r.ultimo).toBe(3);
    expect(r.huecos).toEqual([]);
    expect(r.otras).toEqual(['Disposición adicional primera']);
  });

  it('DELATA los huecos, que es lo que convierte el recuento en un minimo', () => {
    // Si el troceado se dejo articulos por el camino, el numero no es el de la
    // norma: es el de lo indexado. Decirlo como si fuera lo mismo seria el
    // fallo de P1f otra vez, un dato falso dicho con seguridad.
    const r = resumeIndice(['Artículo 1', 'Artículo 2', 'Artículo 5']);
    expect(r.articulos).toBe(3);
    expect(r.huecos).toEqual([3, 4]);
  });

  it('un documento sin articulos no da un rango inventado', () => {
    const r = resumeIndice([null, null]);
    expect(r.articulos).toBe(0);
    expect(r.primero).toBeNull();
    expect(r.ultimo).toBeNull();
  });
});

describe('el indice que ve el modelo', () => {
  const doc = (extra: Partial<Parameters<typeof formatIndice>[0][number]>) => ({
    tema: 'La Constitución Española',
    filename: 'BOE-A-1978',
    articulos: 169,
    primero: 1,
    ultimo: 169,
    huecos: [],
    otras: [],
    ...extra,
  });

  it('dice que es un recuento, no el texto de la norma', () => {
    // Es la diferencia entre responder «tiene 169» y responder «me lo invento»:
    // el modelo tiene que poder decir de donde sale el numero.
    const texto = formatIndice([doc({})]);
    expect(texto).toMatch(/RECUENTO DE LO INDEXADO/);
    expect(texto).toContain('169 articulos indexados, del 1 al 169');
  });

  it('avisa de que el numero es un MINIMO cuando faltan articulos', () => {
    const texto = formatIndice([doc({ articulos: 167, huecos: [12, 13] })]);
    expect(texto).toMatch(/MINIMO/);
    expect(texto).toContain('12, 13');
  });

  it('un documento de apuntes se describe como lo que es', () => {
    const texto = formatIndice([
      doc({ tema: 'Inteligencia', filename: 'tema 40', articulos: 0, primero: null, ultimo: null }),
    ]);
    expect(texto).toMatch(/sin articulos numerados/);
    expect(texto).not.toMatch(/del null/);
  });

  it('sin documentos no devuelve una fuente vacia', () => {
    expect(formatIndice([])).toBe('');
  });
});


// ============================================================
// EL PROMPT
// ============================================================

/**
 * De donde sale esto: la respuesta a «¿cuantos articulos tiene la Constitucion?»
 * no solo fallaba en el dato. Decia "no consta en el temario oficial aportado"
 * y a continuacion pegaba SEIS CITAS para respaldar que no sabia nada, y
 * despues cuatro "trampas de examen" sobre la reforma constitucional, que nadie
 * habia preguntado. Todo eso lo obligaba el prompt.
 *
 * Estos tests no comprueban que el modelo responda bien —para eso esta
 * `npm run chat:probar`, que le pregunta de verdad— sino que las tres normas
 * que causaron aquello no vuelvan a colarse.
 */

describe('el prompt del chat', () => {
  const prompt = buildChatPrompt({
    contexto: '[FUENTE 1]: Artículo 91 · BOE\nCONTENIDO: El Rey sancionará…',
    conversacion: '',
    pregunta: '¿qué plazo tiene el Rey?',
  });

  it('lleva el contexto y la pregunta', () => {
    expect(prompt).toContain('Artículo 91');
    expect(prompt).toContain('¿qué plazo tiene el Rey?');
  });

  it('sin conversación previa no monta ese bloque', () => {
    // Una seccion vacia en el prompt es contexto que el modelo tiene que leer
    // para descubrir que no dice nada.
    expect(prompt).not.toContain('CONVERSACIÓN PREVIA');
  });

  it('con conversación previa, la marca como NO fuente', () => {
    const conHistorial = buildChatPrompt({
      contexto: 'x',
      conversacion: 'ASPIRANTE: hola',
      pregunta: '¿y eso?',
    });
    expect(conHistorial).toContain('CONVERSACIÓN PREVIA');
    expect(conHistorial).toMatch(/NO es fuente/);
  });

  it('NO obliga a citar siempre', () => {
    // Era lo que producia "[1][2][3][4][5][6]" detras de un "no consta".
    expect(prompt).not.toMatch(/CITAS OBLIGATORIAS/i);
    expect(prompt).toMatch(/citas detrás de un "no consta"/i);
  });

  it('el cierre de examen es CONDICIONAL, no obligatorio', () => {
    // Era lo que soltaba cuatro trampas sobre algo que nadie habia preguntado.
    expect(prompt).not.toMatch(/CIERRE OBLIGATORIO/i);
    expect(prompt).toMatch(/CIERRE OPCIONAL/i);
    expect(prompt).toMatch(/solo si/i);
  });

  it('no impone tono militar ni estructura fija', () => {
    // "ASPIRANTE, PROCEDO A ANALIZAR SU CONSULTA" salia de aqui.
    expect(prompt).not.toMatch(/TONO:\s*Militar/i);
    expect(prompt).toMatch(/sin fórmulas de tratamiento/i);
    expect(prompt).toMatch(/LA LONGITUD LA MARCA LA PREGUNTA/);
  });

  it('manda responder en la primera línea', () => {
    expect(prompt).toMatch(/RESPONDE EN LA PRIMERA LÍNEA/);
  });

  it('el corchete de la cita lleva solo el número', () => {
    // Sin esto el modelo metia "[el artículo 5 de la Ley Orgánica 2/1986]" en
    // cada viñeta, que es peor que el [2] pelado.
    expect(prompt).toMatch(/SOLO el número/);
  });
});


// ============================================================
// LA ESTRUCTURA DEL DOCUMENTO
// ============================================================

/**
 * Segunda pregunta del alumno: «¿cuantos titulos tiene la Constitucion?». El
 * recuento de articulos no la contesta y ningun articulo lo dice, asi que el
 * chat respondia "no consta" sobre un documento que tiene los once delante.
 *
 * Los encabezados si estan en el texto guardado. Contarlos es leer, no adivinar
 * — pero tiene dos trampas, y las dos salieron de mirar el BOE de verdad.
 */

const BOE_DE_MUESTRA = [
  "ÍNDICE",
  "TÍTULO PRELIMINAR",
  "TÍTULO I. De los derechos y deberes fundamentales",
  "CAPÍTULO PRIMERO. De los españoles y los extranjeros",
  "CAPÍTULO SEGUNDO. Derechos y libertades",
  "Sección 1.ª De los derechos fundamentales",
  "Sección 2.ª De los derechos y deberes",
  "TÍTULO II. De la Corona",
  "",
  "TÍTULO PRELIMINAR",
  "Artículo 1. España se constituye en un Estado social…",
  "TÍTULO I",
  "CAPÍTULO PRIMERO",
  "Artículo 11. La nacionalidad española se adquiere…",
  "CAPÍTULO SEGUNDO",
  "Sección 1.ª",
  "Artículo 15. Todos tienen derecho a la vida…",
  "Sección 2.ª",
  "Artículo 30. Los españoles tienen el derecho…",
  "TÍTULO II",
  "Artículo 56. El Rey es el Jefe del Estado…",
].join('\n');

describe('contar las partes de un documento', () => {
  const e = resumeEstructura(BOE_DE_MUESTRA);

  it('cuenta los titulos una sola vez aunque el PDF traiga indice', () => {
    // El BOE consolidado repite todos los encabezados en su indice inicial.
    // Contar apariciones daria el doble.
    expect(e.titulos).toEqual(['TÍTULO PRELIMINAR', 'TÍTULO I', 'TÍTULO II']);
  });

  it('cuenta los capitulos como pares titulo->capitulo', () => {
    // Sus NOMBRES se repiten entre titulos: en la Constitucion hay un
    // "CAPÍTULO PRIMERO" en el Titulo I, otro en el III y otro en el VIII.
    // Contar nombres distintos daria 5 donde hay 11.
    expect(e.capitulos).toBe(2);
    expect(e.capitulosPorTitulo).toEqual([{ titulo: 'TÍTULO I', capitulos: 2 }]);
  });

  it('cuenta las secciones del titulo al que cuelgan', () => {
    expect(e.secciones).toBe(2);
  });

  it('unos apuntes sin esa estructura dan cero, no un numero raro', () => {
    const vacia = resumeEstructura('Apuntes del tema 40. La Deep Web y el ciclo de inteligencia.');
    expect(vacia.titulos).toEqual([]);
    expect(vacia.capitulos).toBe(0);
    expect(vacia.capitulosPorTitulo).toEqual([]);
  });

  it('aguanta un texto vacio', () => {
    expect(resumeEstructura('').titulos).toEqual([]);
  });
});

describe('cuando hace falta leer el texto completo', () => {
  it('solo si la pregunta va de titulos, capitulos o secciones', () => {
    // No es un capricho: los articulos se cuentan con las referencias, que son
    // cadenas de dos palabras, y los titulos exigen traerse ~120 KB por
    // documento. Solo se paga cuando sirve.
    expect(pidePartesInternas('¿cuántos títulos tiene la Constitución?')).toBe(true);
    expect(pidePartesInternas('cuantos capitulos tiene el titulo I')).toBe(true);
    expect(pidePartesInternas('¿cuántas secciones hay?')).toBe(true);

    expect(pidePartesInternas('¿cuántos artículos tiene la Constitución?')).toBe(false);
    expect(pidePartesInternas('¿qué dice el artículo 27?')).toBe(false);
  });
});

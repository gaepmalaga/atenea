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

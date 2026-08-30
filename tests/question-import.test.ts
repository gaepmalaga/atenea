import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseCsv,
  detectaSeparador,
  parseCorrecta,
  parseDificultad,
  parseQuestionsCsv,
  quitaRepetidas,
  CSV_PLANTILLA,
  MAX_IMPORT,
} from '../app/lib/question-import';
import { DIFFICULTY } from '../app/lib/questions';
import { questionHash } from '../app/lib/question-hash';

/**
 * P2 · escribir preguntas a mano.
 *
 * Lo que se vigila aqui no es el formato del CSV por si mismo: es que ninguna
 * fila desaparezca en silencio y que una respuesta correcta no se lea nunca
 * "a medias". Un importador que se come tres filas sin decirlo deja al
 * administrador creyendo que su banco esta completo, y una columna "correcta"
 * mal interpretada mete en el banco una pregunta cuya respuesta buena no lo es.
 */

const CABECERA = 'enunciado;A;B;C;correcta;explicacion;dificultad';

describe('separador', () => {
  it('reconoce el punto y coma que pone Excel en espaniol', () => {
    expect(detectaSeparador(CABECERA)).toBe(';');
  });

  it('reconoce la coma', () => {
    expect(detectaSeparador('enunciado,A,B,C,correcta')).toBe(',');
  });

  it('reconoce el tabulador', () => {
    expect(detectaSeparador('enunciado\tA\tB\tC\tcorrecta')).toBe('\t');
  });

  it('con una sola columna no se inventa nada raro', () => {
    expect(detectaSeparador('enunciado')).toBe(';');
  });
});

describe('lectura del CSV', () => {
  it('respeta las comillas y los saltos de linea DENTRO de una celda', () => {
    // Una explicacion de dos parrafos es de lo mas normal en un banco de
    // preguntas. Partir por \n a ciegas convertiria una fila buena en dos rotas.
    const texto = 'a;b\n"linea uno\nlinea dos";segundo';
    const filas = parseCsv(texto, ';');
    expect(filas).toHaveLength(2);
    expect(filas[1][0]).toBe('linea uno\nlinea dos');
    expect(filas[1][1]).toBe('segundo');
  });

  it('dos comillas seguidas son una comilla literal', () => {
    const filas = parseCsv('a\n"dijo ""alto"" y claro"', ';');
    expect(filas[1][0]).toBe('dijo "alto" y claro');
  });

  it('un separador dentro de comillas no parte la celda', () => {
    const filas = parseCsv('a;b\n"uno; dos";tres', ';');
    expect(filas[1]).toEqual(['uno; dos', 'tres']);
  });
});

describe('la columna "correcta"', () => {
  it('acepta la letra, en mayuscula o minuscula', () => {
    expect(parseCorrecta('A')).toBe(0);
    expect(parseCorrecta('b')).toBe(1);
    expect(parseCorrecta(' C ')).toBe(2);
  });

  it('los digitos se cuentan desde 1, como cuenta quien escribe la hoja', () => {
    expect(parseCorrecta('1')).toBe(0);
    expect(parseCorrecta('3')).toBe(2);
  });

  it('el 0 se RECHAZA en vez de adivinarlo', () => {
    // Es tentador leerlo como la A (seria el indice interno), pero entonces el
    // mismo fichero significaria cosas distintas segun quien lo escribiera.
    // Ante la duda, la fila se rechaza y se dice por que.
    expect(parseCorrecta('0')).toBeNull();
  });

  it('lo que no es una opcion valida se rechaza', () => {
    expect(parseCorrecta('D')).toBeNull();
    expect(parseCorrecta('4')).toBeNull();
    expect(parseCorrecta('')).toBeNull();
    expect(parseCorrecta('la primera')).toBeNull();
  });
});

describe('la columna "dificultad"', () => {
  it('entiende numeros y palabras, con y sin acento', () => {
    expect(parseDificultad('1')).toBe(DIFFICULTY.easy);
    expect(parseDificultad('facil')).toBe(DIFFICULTY.easy);
    expect(parseDificultad('Fácil')).toBe(DIFFICULTY.easy);
    expect(parseDificultad('media')).toBe(DIFFICULTY.medium);
    expect(parseDificultad('Difícil')).toBe(DIFFICULTY.hard);
    expect(parseDificultad('alta')).toBe(DIFFICULTY.hard);
  });

  it('lo que no se entiende cae en el valor por defecto de la columna', () => {
    expect(parseDificultad(undefined)).toBe(DIFFICULTY.medium);
    expect(parseDificultad('')).toBe(DIFFICULTY.medium);
    expect(parseDificultad('imposible')).toBe(DIFFICULTY.medium);
  });
});

describe('importar un fichero entero', () => {
  it('la plantilla que se ofrece descargar se importa sin un solo rechazo', () => {
    // Si la plantilla no pasa por su propio importador, nada mas va a pasar.
    const res = parseQuestionsCsv(CSV_PLANTILLA);
    expect(res.rechazadas).toEqual([]);
    expect(res.preguntas).toHaveLength(1);
    expect(res.preguntas[0].correctIndex).toBe(0);
    expect(res.preguntas[0].difficulty).toBe(DIFFICULTY.medium);
  });

  it('acepta los nombres de columna con acento, en mayusculas y con sinonimos', () => {
    const texto = [
      'Pregunta;Opción A;Opción B;Opción C;Respuesta correcta;Justificación',
      '¿Cuantos titulos tiene la Constitucion?;Diez;Once;Doce;B;Preliminar mas diez.',
    ].join('\n');
    const res = parseQuestionsCsv(texto);
    expect(res.rechazadas).toEqual([]);
    expect(res.preguntas[0].correctIndex).toBe(1);
    expect(res.preguntas[0].explanation).toBe('Preliminar mas diez.');
  });

  it('el BOM de Excel no impide reconocer la cabecera', () => {
    const res = parseQuestionsCsv('﻿' + CSV_PLANTILLA);
    expect(res.rechazadas).toEqual([]);
    expect(res.preguntas).toHaveLength(1);
  });

  it('si falta una columna obligatoria lo dice NOMBRANDOLA', () => {
    const res = parseQuestionsCsv('enunciado;A;B;explicacion\nuna cosa;x;y;z');
    expect(res.preguntas).toEqual([]);
    expect(res.rechazadas).toHaveLength(1);
    expect(res.rechazadas[0].motivo).toContain('C');
    expect(res.rechazadas[0].motivo).toContain('correcta');
  });

  it('una fila mala no se lleva por delante a las buenas, y se dice cual es', () => {
    const texto = [
      CABECERA,
      '¿Cuantos Diputados como minimo tiene el Congreso?;300;350;400;A;Articulo 68.1.;1',
      '¿Cuantos senadores por provincia se eligen?;Cuatro;Cuatro;Dos;A;Repetidas a proposito.;2',
      '¿En que anio se aprobo la Constitucion espaniola?;1975;1978;1981;B;Referendum del 6 de diciembre.;2',
    ].join('\n');

    const res = parseQuestionsCsv(texto);
    expect(res.preguntas).toHaveLength(2);
    expect(res.rechazadas).toHaveLength(1);
    // La linea es la que se ve en Excel: cabecera incluida y empezando en 1.
    expect(res.rechazadas[0].fila).toBe(3);
    expect(res.rechazadas[0].motivo).toMatch(/repetidas/i);
  });

  it('las lineas en blanco del final no cuentan como error', () => {
    const res = parseQuestionsCsv(CSV_PLANTILLA + '\n\n\n');
    expect(res.rechazadas).toEqual([]);
    expect(res.preguntas).toHaveLength(1);
  });

  it('un fichero vacio se explica, no revienta', () => {
    expect(parseQuestionsCsv('').rechazadas[0].motivo).toMatch(/vacio/i);
    expect(parseQuestionsCsv('   ').rechazadas[0].motivo).toMatch(/vacio/i);
  });

  it('un enunciado vacio se rechaza con su linea', () => {
    const texto = [CABECERA, ';300;350;400;A;sin enunciado;2'].join('\n');
    const res = parseQuestionsCsv(texto);
    expect(res.preguntas).toEqual([]);
    expect(res.rechazadas[0].fila).toBe(2);
  });

  it('el Markdown que traiga el fichero se limpia al importar', () => {
    const texto = [
      CABECERA,
      '¿Cual es la **capital** de Espania?;Madrid;Barcelona;Sevilla;A;La *capital* es Madrid.;2',
    ].join('\n');
    const res = parseQuestionsCsv(texto);
    expect(res.preguntas[0].question).toBe('¿Cual es la capital de Espania?');
    expect(res.preguntas[0].explanation).toBe('La capital es Madrid.');
  });

  it('no se importan mas de MAX_IMPORT, y se avisa de que se corto', () => {
    const filas = Array.from(
      { length: MAX_IMPORT + 5 },
      (_, i) => `¿Pregunta numero ${i} del banco de prueba?;uno ${i};dos ${i};tres ${i};A;porque si;2`
    );
    const res = parseQuestionsCsv([CABECERA, ...filas].join('\n'));
    expect(res.preguntas).toHaveLength(MAX_IMPORT);
    expect(res.rechazadas).toHaveLength(1);
    expect(res.rechazadas[0].motivo).toContain(String(MAX_IMPORT));
  });
});

describe('repetidas dentro del propio fichero', () => {
  it('se quitan antes de llegar a la base de datos', () => {
    const texto = [
      CABECERA,
      '¿En que anio se aprobo la Constitucion espaniola?;1975;1978;1981;B;Referendum.;2',
      '¿En que anio se aprobo la Constitucion espaniola?;1975;1978;1981;B;Referendum.;2',
    ].join('\n');

    const { preguntas } = parseQuestionsCsv(texto);
    expect(preguntas).toHaveLength(2);

    // Sin esto chocarian contra la restriccion unica de `question_hash` y el
    // aviso saldria como un error de base de datos, no como "fila repetida".
    const { unicas, repetidas } = quitaRepetidas(preguntas);
    expect(unicas).toHaveLength(1);
    expect(repetidas).toBe(1);
  });
});

describe('la huella de una pregunta', () => {
  it('es la misma para el mismo contenido y cambia con el tema', () => {
    const a = questionHash(3, 'Un enunciado cualquiera', 1);
    const b = questionHash(3, '  Un enunciado cualquiera  ', 1);
    const c = questionHash(4, 'Un enunciado cualquiera', 1);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('cambia si cambia la respuesta correcta', () => {
    expect(questionHash(3, 'Un enunciado cualquiera', 1)).not.toBe(questionHash(3, 'Un enunciado cualquiera', 2));
  });
});

// ============================================================
// GUARDAS ESTATICAS
// ============================================================

const ACTIONS = join(__dirname, '..', 'app', 'actions');
const leer = (f: string) => readFileSync(join(ACTIONS, f), 'utf-8').replace(/\r\n/g, '\n');

/** Quita comentarios: uno que CITE el patron peligroso no puede contar como codigo. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('guardas del alta manual', () => {
  it('la formula del hash esta en un solo sitio', () => {
    // Los tres caminos que escriben en el banco tienen que calcularla igual.
    // Si uno se la calcula por su cuenta, la misma pregunta entra dos veces.
    const culpables: string[] = [];
    for (const f of ['exams.ts', 'moderation.ts', 'admin.ts']) {
      if (/createHash\(/.test(stripComments(leer(f)))) culpables.push(f);
    }
    expect(culpables).toEqual([]);
  });

  // Que ningun upsert sobre `question_hash` pise la fila existente lo vigila
  // `question-lifecycle.test.ts`, que ya cubria los otros dos caminos de
  // escritura y ahora cubre tambien estos dos.

  it('lo escrito a mano se marca como manual', () => {
    // Es lo unico que permite saber despues que rinde mejor, si lo escrito a
    // mano o lo generado.
    const src = stripComments(leer('moderation.ts'));
    expect(src).toContain('QUESTION_ORIGIN.MANUAL');
  });

  it('lo que llega del cliente se vuelve a validar en el servidor', () => {
    // El CSV se lee en el navegador, pero una Server Action es un endpoint
    // publico: la validacion del navegador no cuenta.
    const src = stripComments(leer('moderation.ts'));
    const bloque = src.slice(src.indexOf('function aFilaNueva'));
    expect(bloque).toMatch(/validateGeneratedQuestion\(/);
  });
});

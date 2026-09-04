import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  QUESTION_STATUS,
  QUESTION_STATUSES,
  QUESTION_STATUS_LABEL,
  isQuestionStatus,
  SERVABLE_STATUSES,
} from '../app/lib/questions';

/**
 * El ciclo de vida de una pregunta era el fallo de producto mas caro del
 * proyecto: se escribia 'candidate' en dos sitios y se leia 'active' en otros
 * dos, asi que el banco nunca se servia y cada test se generaba en vivo con IA.
 *
 * Estos tests fijan el modelo y vigilan los sitios donde se rompio.
 */

const root = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf-8');
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const exams = stripComments(read('app/actions/exams.ts'));
const admin = stripComments(read('app/actions/admin.ts'));
const moderation = stripComments(read('app/actions/moderation.ts'));

describe('modelo de estados', () => {
  it('tiene exactamente tres estados', () => {
    expect(QUESTION_STATUSES).toEqual(['candidate', 'active', 'disabled']);
  });

  it('todos los estados tienen etiqueta para la UI', () => {
    for (const st of QUESTION_STATUSES) {
      expect(QUESTION_STATUS_LABEL[st]).toBeTruthy();
    }
  });

  it('solo se sirven a los alumnos las preguntas activas', () => {
    expect(SERVABLE_STATUSES).toEqual([QUESTION_STATUS.ACTIVE]);
  });

  it('isQuestionStatus rechaza cualquier otra cosa', () => {
    expect(isQuestionStatus('active')).toBe(true);
    expect(isQuestionStatus('all')).toBe(false);
    expect(isQuestionStatus('unsaved')).toBe(false);
    expect(isQuestionStatus(undefined)).toBe(false);
  });
});

describe('los literales de estado no se repiten a mano', () => {
  // El fallo original nacio de escribir 'candidate' y 'active' sueltos en
  // cuatro ficheros. Con una constante compartida, cambiar el modelo es un
  // solo sitio y el compilador vigila el resto.
  const sinLiterales = (src: string) => !/status['"]?\s*[:,]\s*['"](candidate|active|disabled)['"]/.test(src)
    && !/\.eq\(\s*['"]status['"]\s*,\s*['"](candidate|active|disabled)['"]/.test(src);

  it('exams.ts usa la constante', () => expect(sinLiterales(exams)).toBe(true));
  it('admin.ts usa la constante', () => expect(sinLiterales(admin)).toBe(true));
  it('moderation.ts usa la constante', () => expect(sinLiterales(moderation)).toBe(true));
});

describe('resembrar no puede corromper el banco', () => {
  // Con un upsert normal sobre `question_hash`, la fila existente se REESCRIBE.
  // Volver a generar una pregunta ya aprobada la devolvia a 'candidate' (salia
  // del banco de los alumnos) y una descartada resucitaba en moderacion.
  it('todo upsert sobre question_hash ignora los duplicados', () => {
    // Los tres caminos de escritura: generacion en vivo y siembra (exams.ts) y
    // alta a mano e importacion (moderation.ts). Antes solo se miraba el
    // primer fichero, asi que un camino nuevo podia nacer pisando filas.
    const upserts = [exams, moderation].flatMap(
      (src) => src.match(/onConflict:\s*'question_hash'[^}]*\}/g) ?? []
    );
    expect(upserts.length).toBeGreaterThanOrEqual(4);
    for (const u of upserts) {
      expect(u).toContain('ignoreDuplicates: true');
    }
  });

  it('la aprobacion en lote solo toca las pendientes', () => {
    // approveQuestions filtra por estado candidate: un id de una pregunta ya
    // descartada no debe poder resucitarla pasandolo en el array.
    const fn = moderation.slice(moderation.indexOf('export async function approveQuestions'));
    expect(fn).toMatch(/\.eq\(\s*['"]status['"]\s*,\s*QUESTION_STATUS\.CANDIDATE/);
  });
});

describe('visibilidad para el administrador', () => {
  it('el banco maestro no filtra un estado en duro', () => {
    // Filtrar 'active' en duro era lo que hacia que un admin sembrara cientos
    // de preguntas y viera la lista vacia.
    const fn = admin.slice(admin.indexOf('export async function getAdminQuestionBank'));
    expect(fn).toContain("status = 'all'");
    expect(fn).toContain('isQuestionStatus(status)');
  });

  it('el alumno solo recibe preguntas activas', () => {
    const fn = exams.slice(exams.indexOf('export async function getQuestionsFromBank'));
    expect(fn).toContain('QUESTION_STATUS.ACTIVE');
  });
});

describe('destino del seed', () => {
  it('publicar directamente es la opcion por defecto, pero es una opcion', () => {
    // Antes era una constante oculta en el servidor, puesta al reves de lo que
    // decia su propio comentario ("asumimos activas" sobre status:'candidate').
    const fn = exams.slice(exams.indexOf('export async function seedQuestionBank'));
    expect(fn).toContain('autoApprove = true');
    expect(fn).toMatch(/autoApprove\s*\?\s*QUESTION_STATUS\.ACTIVE\s*:\s*QUESTION_STATUS\.CANDIDATE/);
  });

  it('el resultado distingue insertadas, duplicadas y fallidas', () => {
    // Antes solo se informaba de `inserted`: un lote que fallaba entero se veia
    // igual que uno enteramente duplicado.
    const fn = exams.slice(exams.indexOf('export async function seedQuestionBank'));
    expect(fn).toContain('inserted, duplicated, failed');
  });
});

/**
 * La dificultad tiene que llegar hasta la base de datos (fase 2.5).
 *
 * El fallo original no fue que faltara la columna —existia, con `default 2`—
 * sino que nadie la escribia ni la leia. El selector de la interfaz ofrecia
 * tres opciones y las tres daban el mismo examen.
 */
describe('la dificultad no se queda por el camino', () => {
  const exams = readFileSync(join(__dirname, '..', 'app', 'actions', 'exams.ts'), 'utf-8')
    .replace(/\r\n/g, '\n');
  const src = stripComments(exams);

  it('ya no queda el PENDIENTE que decia que la columna no existia', () => {
    // Decia: "`question_bank` no tiene todavia columna de dificultad". Era falso.
    expect(exams).not.toContain('PENDIENTE (ver PLAN, Fase 4)');
    expect(exams).not.toContain('no tiene todavía columna de dificultad');
  });

  it('las dos escrituras del banco guardan difficulty_level', () => {
    // Una por el generador en vivo y otra por el seed masivo. Si solo una lo
    // guardara, medio banco quedaria con el valor por defecto.
    const escrituras = [...src.matchAll(/question_hash:\s*qHash,/g)];
    expect(escrituras.length, 'se esperaban dos escrituras sobre question_bank').toBe(2);

    for (const m of escrituras) {
      const bloque = src.slice(m.index!, m.index! + 200);
      expect(bloque, 'falta difficulty_level en una de las escrituras').toContain('difficulty_level');
    }
  });

  it('el prompt recibe la descripcion del nivel, no un texto fijo', () => {
    expect(src).toContain('DIFFICULTY_BRIEF[nivel]');
    expect(src).not.toContain('Dificultad Media/Alta');
  });

  it('lo que llega del cliente se normaliza antes de tocar la BD', () => {
    // Una Server Action es un endpoint publico: sin esto se podria guardar un
    // difficulty_level de 99, que ninguna consulta encontraria despues.
    expect(src).toContain('toDifficultyLevel');
  });

  it('el filtro de dificultad es preferente, no excluyente', () => {
    // Con filtro estricto, "facil" y "dificil" devolverian CERO preguntas: hoy
    // todo el banco esta en el nivel 2. El examen se generaria entero con IA.
    const fn = src.slice(src.indexOf('export async function getQuestionsFromBank'));
    const cuerpo = fn.slice(0, fn.indexOf('\n}\n') + 3);

    expect(cuerpo).toContain("eq('difficulty_level'");
    // La segunda consulta, la de relleno, NO filtra por dificultad.
    const consultas = [...cuerpo.matchAll(/consulta\(\)/g)];
    expect(consultas.length, 'se esperaban dos consultas: preferente y relleno').toBeGreaterThanOrEqual(2);
    expect(cuerpo, 'el relleno debe deduplicar contra las ya elegidas').toContain('yaEstan');
  });
});

describe('vaciar el banco no está a un dedo de crear una pregunta', () => {
  const src = readFileSync(
    join(__dirname, '..', 'app/components/Admin/components/AdminBank.tsx'),
    'utf-8',
  );

  it('vive en su propia zona de peligro, al final', () => {
    // Estaba pegado a "Nueva", del mismo tamaño y con la misma forma: en un
    // movil, doce pixeles separaban el boton de CREAR una pregunta del que
    // DESCARTA TODAS. Es la regla 26 —una accion irreversible no comparte
    // sitio, color ni tamaño con la que se repite— aplicada a la accion mas
    // destructiva de la plataforma.
    expect(src).toContain('Zona de peligro');

    // Y va DESPUÉS del boton de crear, no al lado. Si alguien lo devuelve
    // arriba, este orden se invierte.
    const crear = src.indexOf('setComponiendo(true)');
    const vaciar = src.lastIndexOf('onClick={handleDiscardAll}');
    expect(crear, 'no se encuentra el botón de crear').toBeGreaterThan(-1);
    expect(vaciar, 'no se encuentra el botón de vaciar').toBeGreaterThan(crear);
  });

  it('sigue pidiendo escribir BORRAR', () => {
    // Un `confirm()` se acepta sin leerlo. Escribir la palabra no.
    expect(src).toContain("escrito !== 'BORRAR'");
  });
});

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
    const upserts = exams.match(/onConflict:\s*'question_hash'[^}]*\}/g) ?? [];
    expect(upserts.length).toBeGreaterThan(0);
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

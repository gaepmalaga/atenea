import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseQuestionsCsv, limpiaReferencia, MAX_REFERENCIA, CSV_PLANTILLA } from '../app/lib/question-import';

/**
 * Regla 146: una pregunta escrita a mano puede llevar su referencia legal.
 * Sin ella, el vigilante de la ley y el repaso contra el BOE no la ven.
 */

const quita = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const lee = (...r: string[]) => quita(readFileSync(join(__dirname, '..', ...r), 'utf-8').replace(/\r\n/g, '\n'));

describe('limpiaReferencia', () => {
  it('colapsa espacios y deja null lo vacío', () => {
    expect(limpiaReferencia('  Art.   68.1  CE ')).toBe('Art. 68.1 CE');
    expect(limpiaReferencia('   ')).toBeNull();
    expect(limpiaReferencia(undefined)).toBeNull();
  });
  it('no recorta una demasiado larga: la rechaza', () => {
    expect(limpiaReferencia('a'.repeat(MAX_REFERENCIA))).toHaveLength(MAX_REFERENCIA);
    expect(limpiaReferencia('a'.repeat(MAX_REFERENCIA + 1))).toBeUndefined();
    expect(limpiaReferencia(42)).toBeUndefined();
  });
});

describe('columna «referencia» del CSV', () => {
  const CAB = 'enunciado;A;B;C;correcta;explicacion;referencia';
  const fila = (ref: string) => `${CAB}\n"¿Cuántos diputados como mínimo?";300;350;400;A;"Artículo 68.1: entre 300 y 400.";${ref}`;

  it('la lee y la limpia', () => {
    const r = parseQuestionsCsv(fila('"  Art. 68.1   CE "'));
    expect(r.rechazadas).toEqual([]);
    expect(r.preguntas[0].legalReference).toBe('Art. 68.1 CE');
  });
  it('sin la columna, o con la celda vacía, no hay referencia (y no es un error)', () => {
    expect(parseQuestionsCsv(fila('')).preguntas[0].legalReference).toBeUndefined();
    const sin = parseQuestionsCsv('enunciado;A;B;C;correcta;explicacion\n"¿Cuántos diputados como mínimo?";300;350;400;A;"Artículo 68.1: entre 300 y 400."');
    expect(sin.preguntas).toHaveLength(1);
    expect(sin.preguntas[0].legalReference).toBeUndefined();
  });
  it('admite el nombre «referencia legal»', () => {
    const r = parseQuestionsCsv(fila('Art. 1 CE').replace('referencia', 'Referencia legal'));
    expect(r.preguntas[0].legalReference).toBe('Art. 1 CE');
  });
  it('rechaza la fila con una referencia que no cabe, con su línea', () => {
    const r = parseQuestionsCsv(fila('x'.repeat(MAX_REFERENCIA + 1)));
    expect(r.preguntas).toEqual([]);
    expect(r.rechazadas[0]).toMatchObject({ fila: 2 });
    expect(r.rechazadas[0].motivo).toMatch(/referencia legal/);
  });
  it('la plantilla trae la columna y su ejemplo se lee con referencia', () => {
    expect(CSV_PLANTILLA.split('\n')[0]).toMatch(/;referencia$/);
    expect(parseQuestionsCsv(CSV_PLANTILLA).preguntas[0].legalReference).toBe('Art. 68.1 CE');
  });
});

describe('el servidor y el formulario la llevan hasta la base de datos', () => {
  const acc = lee('app/actions/moderation.ts');
  const form = lee('app/components/Admin/components/QuestionComposer.tsx');
  it('aFilaNueva guarda legal_reference ya limpia y rechaza la que no cabe', () => {
    expect(acc).toMatch(/limpiaReferencia\(d\.legalReference\)/);
    expect(acc).toMatch(/legal_reference: referencia,/);
    expect(acc).toMatch(/referencia === undefined\) return \{ ok: false/);
  });
  it('el formulario la envía y avisa de la numeración', () => {
    expect(form).toMatch(/legalReference,\s*\}\)/);
    expect(form).toMatch(/numeraOpciones\(explanation\)/);
    expect(form).toMatch(/leidas\.some\(\(p\) => numeraOpciones\(p\.explanation\)\)/);
  });
});

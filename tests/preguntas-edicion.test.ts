import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  etiquetasQueFaltan, estaCompleta, textoFaltan, instantanea, camposCambiados, hayCambios, leeInstantanea,
} from '../app/lib/preguntas-edicion';

/**
 * Regla 135 · editar una pregunta desde el examen en papel sobrescribe el
 * banco, con historial; una pregunta nueva del examen entra PENDIENTE y sin
 * etiquetas, y no se publica hasta tener explicación y dificultad.
 */

const EXPL = 'La respuesta correcta es X, según el art. 14.5 CC.';

describe('qué le falta a una pregunta para publicarse', () => {
  it('sin explicación y sin dificultad faltan las dos', () => {
    expect(etiquetasQueFaltan({ explanation: null, difficulty_level: null })).toEqual(['explicación', 'dificultad']);
  });
  it('una explicación corta no cuenta', () => {
    expect(etiquetasQueFaltan({ explanation: 'corta', difficulty_level: 2 })).toEqual(['explicación']);
    expect(etiquetasQueFaltan({ explanation: '   ' + 'x'.repeat(5), difficulty_level: 2 })).toEqual(['explicación']);
  });
  it('la dificultad solo es 1, 2 o 3: null no es 2 y 0 ni 4 valen', () => {
    for (const n of [null, undefined, 0, 4, NaN]) expect(etiquetasQueFaltan({ explanation: EXPL, difficulty_level: n as never })).toEqual(['dificultad']);
    for (const n of [1, 2, 3]) expect(estaCompleta({ explanation: EXPL, difficulty_level: n })).toBe(true);
  });
  it('lo dice en castellano', () => {
    expect(textoFaltan(['explicación'])).toBe('Falta la explicación');
    expect(textoFaltan(['explicación', 'dificultad'])).toBe('Faltan la explicación y la dificultad');
    expect(textoFaltan([])).toBe('');
  });
});

describe('las fotos del historial', () => {
  const a = instantanea({ question_text: 'Enunciado de prueba largo', options: ['a', 'b', 'c'], correct_index: 1, explanation: EXPL, difficulty_level: 2 });
  it('sin cambios no hay nada que anotar', () => {
    expect(hayCambios(a, { ...a })).toBe(false);
    expect(camposCambiados(a, { ...a })).toEqual([]);
  });
  it('dice qué cambió, por su nombre', () => {
    expect(camposCambiados(a, { ...a, options: ['a', 'b', 'x'], correct_index: 0 })).toEqual(['las opciones', 'la respuesta correcta']);
    expect(camposCambiados(a, { ...a, explanation: null })).toEqual(['la explicación']);
  });
  it('una foto leída de la base de datos se vuelve a comprobar', () => {
    expect(leeInstantanea(a)).toEqual(a);
    expect(leeInstantanea(null)).toBeNull();
    expect(leeInstantanea({ ...a, options: ['a', 'b'] })).toBeNull();
    expect(leeInstantanea({ ...a, correct_index: 3 })).toBeNull();
    expect(leeInstantanea({ ...a, question_text: 5 })).toBeNull();
  });
});

const lee = (r: string) => readFileSync(join(__dirname, '..', r), 'utf-8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('la pregunta nueva del examen en papel', () => {
  const src = sinComentarios(lee('app/actions/moderation.ts'));
  const cuerpo = src.slice(src.indexOf('export async function crearPreguntaDeExamen'));

  it('entra al banco de SU academia, pendiente y sin explicación ni dificultad', () => {
    expect(cuerpo).toMatch(/requireAdmin\(\)/);
    expect(cuerpo).toMatch(/status: QUESTION_STATUS\.CANDIDATE/);
    expect(cuerpo).toMatch(/explanation: null/);
    expect(cuerpo).toMatch(/difficulty_level: null/);
    expect(cuerpo).toMatch(/organization_id: org/);
    expect(cuerpo).toMatch(/const org = auth\.user\.organizationId/);
  });
  it('no pisa una fila existente (regla 3) y pasa por la validación del modelo (regla 10)', () => {
    expect(cuerpo).toMatch(/onConflict: 'question_hash', ignoreDuplicates: true/);
    expect(cuerpo).toMatch(/validateGeneratedQuestion\(/);
  });
  it('la explicación de relleno no se guarda: se escribe null', () => {
    const upsert = cuerpo.slice(cuerpo.indexOf('.upsert({'), cuerpo.indexOf("{ onConflict: 'question_hash'"));
    expect(upsert).toMatch(/explanation: null/);
    expect(upsert).not.toMatch(/RELLENO/);
  });
});

describe('guardar el examen admite las pendientes de la academia, y solo esas', () => {
  const src = sinComentarios(lee('app/actions/examenes-clase.ts'));
  it('activas, o pendientes de SU academia', () => {
    expect(src).toMatch(/status\.eq\.\$\{QUESTION_STATUS\.ACTIVE\},and\(status\.eq\.\$\{QUESTION_STATUS\.CANDIDATE\},organization_id\.eq\.\$\{org\}\)/);
    expect(src).toMatch(/\.or\(filtroBancoPorAcademia\(org\)\)/);
  });
});

describe('el examen en papel se revisa antes de descargar', () => {
  const preparar = lee('app/components/Admin/components/examenes/Preparar.tsx');
  it('Revisar va entre Preparar y los PDF, y los PDF salen de las preguntas ya corregidas', () => {
    expect(preparar.indexOf('<RevisarPreguntas')).toBeGreaterThan(-1);
    expect(preparar.indexOf('<RevisarPreguntas')).toBeLessThan(preparar.indexOf('3 · Guardar y descargar'));
    expect(preparar).toMatch(/preguntas: preguntas\.map\(\(q\) => \(\{ enunciado: q\.enunciado, opciones: q\.opciones, correcta: q\.correcta \}\)\)/);
  });
  it('el panel de Banco oficial no publica una incompleta', () => {
    const banco = lee('app/components/Admin/components/AdminBank.tsx');
    // Completas y sin aviso de la ley abierto (regla 137).
    expect(banco).toMatch(/const listasParaPublicar = visibleCandidates\.filter\(\(q\) => estaCompleta\(q\) && !conAvisoLey\(q\)\)/);
    expect(banco).toMatch(/approveQuestions\(ids\)/);
  });
});

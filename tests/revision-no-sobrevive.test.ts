import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * UNA PREGUNTA REVISADA QUE CAMBIA DE TEXTO DEJA DE ESTAR REVISADA (regla 142).
 *
 * El disparador vive en la base de datos (`docs/sql/revision-no-sobrevive-al-cambio.sql`),
 * donde estos tests no llegan: lo que se vigila aquí es que (1) el guion cubre
 * TODAS las columnas de contenido que la aplicación escribe y (2) las rutas de
 * la aplicación que dan por buena una pregunta lo hacen en la MISMA escritura
 * que el texto, porque si no, el disparador las dejaría sin revisar.
 */
const raiz = join(__dirname, '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf-8');
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const sinComentariosSql = (src: string) => src.replace(/--.*$/gm, '');

const guion = sinComentariosSql(leer('docs/sql/revision-no-sobrevive-al-cambio.sql'));
const moderacion = sinComentarios(leer('app/actions/moderation.ts'));

/** Las columnas que un tutor lee al revisar. */
const CONTENIDO = ['question_text', 'options', 'correct_index', 'explanation', 'legal_reference'];

/** Todos los cuerpos `.update({ … })` del código (la llave de apertura a su cierre). */
function updates(src: string): string[] {
  const salida: string[] = [];
  for (let i = src.indexOf('.update({'); i !== -1; i = src.indexOf('.update({', i + 1)) {
    let nivel = 0;
    for (let k = i + '.update('.length; k < src.length; k++) {
      if (src[k] === '{') nivel++;
      if (src[k] === '}' && --nivel === 0) { salida.push(src.slice(i, k + 1)); break; }
    }
  }
  return salida;
}
const conContenido = (cuerpos: string[]) => cuerpos.filter((c) => CONTENIDO.some((col) => new RegExp(`\\b${col}\\b`).test(c)));

describe('el disparador de la base de datos', () => {
  it('es un BEFORE UPDATE por fila sobre question_bank', () => {
    expect(guion).toMatch(/create trigger question_bank_revision_no_sobrevive\s+before update on public\.question_bank\s+for each row/i);
    expect(guion).not.toMatch(/before insert|after update/i);
  });

  it('mira TODAS las columnas de contenido, y solo esas', () => {
    for (const c of CONTENIDO) expect(guion, c).toMatch(new RegExp(`new\\.${c}\\s+is distinct from old\\.${c}`));
    for (const c of ['status', 'difficulty_level', 'difficulty_source', 'family_id', 'subject_id', 'global_success_rate']) {
      expect(guion, `${c} no es contenido que el tutor lee`).not.toMatch(new RegExp(`new\\.${c}\\s+is distinct`));
    }
  });

  it('no actúa si la misma escritura cambia reviewed_at, y borra los tres campos de la marca', () => {
    expect(guion).toMatch(/new\.reviewed_at is not distinct from old\.reviewed_at/);
    for (const c of ['reviewed_at', 'reviewed_by', 'reviewed_by_email']) expect(guion).toContain(`new.${c} := null`);
  });
});

describe('las rutas de la aplicación y el disparador', () => {
  const contenido = conContenido(updates(moderacion));

  it('solo hay dos escrituras que cambian el contenido de una pregunta existente: editar y aprobar un cambio', () => {
    expect(contenido).toHaveLength(2);
  });

  it('editar sella la revisión en la MISMA escritura que el texto', () => {
    const editar = contenido.find((c) => c.includes('revisadaPor'));
    expect(editar, 'editar tiene que sellar').toBeDefined();
    for (const col of ['question_text', 'options', 'correct_index', 'explanation']) expect(editar).toContain(col);
  });

  it('aprobar un cambio propuesto NO sella (regla 138): el disparador la deja sin revisar y el tutor la da por buena otra vez', () => {
    const aprobar = contenido.find((c) => !c.includes('revisadaPor'));
    expect(aprobar, 'aprobar no sella').toBeDefined();
    expect(aprobar).toContain('legal_reference');
  });

  it('las demás rutas (scripts) no escriben contenido de filas existentes', () => {
    for (const f of ['agrupar-familias', 'clasificar-dificultad', 'medir-dificultad']) {
      expect(conContenido(updates(sinComentarios(leer(`scripts/operacion/${f}.mjs`)))), f).toEqual([]);
    }
  });
});

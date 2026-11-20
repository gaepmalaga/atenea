import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MIN_EXPLANATION_CHARS } from '../app/lib/ai-output';

/**
 * PUBLICAR SIN LEER UNA A UNA (regla 139). Publicar no es revisar: el script
 * nunca marca «revisada por un tutor», y solo publica lo que cumple todo.
 */
const raiz = join(__dirname, '..');
const script = readFileSync(join(raiz, 'scripts/operacion/publicar-limpias.mjs'), 'utf8').replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, '$1');

describe('publicar las limpias', () => {
  it('nunca escribe «revisada por»: lo publicado sin leer lleva su propia marca', () => {
    expect(script).not.toMatch(/reviewed_by|reviewed_at:/);
    expect(script).toMatch(/publicada_sin_leer_el: ahora/);
  });

  it('sin --hazlo no escribe, y al escribir repite las guardas en el UPDATE', () => {
    expect(script).toMatch(/if \(!HAZLO\)[^\n]*process\.exit\(0\)/);
    expect(script).toMatch(/\.eq\('fuente', 'ia'\)\.is\('reviewed_at', null\)\.is\('publicada_sin_leer_el', null\)/);
  });

  it('deja fuera lo que tiene aviso, no tiene referencia o lleva un defecto conocido', () => {
    expect(script).toMatch(/conAviso\.has\(q\.id\)/);
    expect(script).toMatch(/legal_reference/);
    expect(script).toMatch(/NUMERA_OPCIONES\.test/);
    expect(script).toMatch(/TEXTO_PROPORCIONADO\.test/);
  });

  it('su idea de «completa» es la de la aplicación', () => {
    expect(script).toContain(`const MIN_EXPLICACION = ${MIN_EXPLANATION_CHARS};`);
  });
});

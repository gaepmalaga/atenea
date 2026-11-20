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

  it('--con-otro-tema solo perdona el aviso de «otro tema»: cualquier otro aviso sigue dejándola fuera', () => {
    expect(script).toMatch(/CON_OTRO_TEMA = process\.argv\.includes\('--con-otro-tema'\)/);
    expect(script).toMatch(/filter\(\(r\) => !\(CON_OTRO_TEMA && esAvisoOtroTema\(r\.message\)\)\)/);
    // Sin la opción, el comportamiento de siempre: cualquier aviso abierto la deja fuera.
    expect(script).toMatch(/conAviso\.has\(q\.id\)/);
  });
});

import { temaSinLegislacion } from '../app/lib/temas-sin-ley';

describe('los temas sin legislación', () => {
  it('ciencias sociales, técnico-científicas y los apuntes de los temas 4 y 24; no los que llevan norma', () => {
    for (const t of [4, 24, 27, 29, 35, 36, 41, 44, 45]) expect(temaSinLegislacion(t), `tema ${t}`).toBe(true);
    for (const t of [1, 3, 5, 20, 23, 26, 42, 43, 46, 50]) expect(temaSinLegislacion(t), `tema ${t}`).toBe(false);
    expect(temaSinLegislacion(null)).toBe(false);
    expect(temaSinLegislacion(undefined)).toBe(false);
  });

  it('--sin-ley solo perdona la falta de referencia en esos temas; lo demás sigue excluyendo', () => {
    const codigo = readFileSync(join(raiz, 'scripts/operacion/publicar-limpias.mjs'), 'utf8').replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, '$1');
    expect(codigo).toMatch(/SIN_LEY = process\.argv\.includes\('--sin-ley'\)/);
    expect(codigo).toMatch(/!\(SIN_LEY && temaSinLegislacion\(q\.subjects\?\.topic_number\)\)/);
    expect(codigo).toMatch(/conAviso\.has\(q\.id\)/);
    expect(codigo).toMatch(/NUMERA_OPCIONES\.test/);
  });
});

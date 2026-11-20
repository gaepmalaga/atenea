import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ACEPTAR EN BLOQUE LOS CAMBIOS MECÁNICOS (regla 138): lo decide un tutor, pero
 * el botón no puede colar nada que no sea mecánico ni saltarse las
 * comprobaciones de aprobar uno a uno.
 */
const raiz = join(__dirname, '..');
const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, '$1');
const moderacion = sinComentarios(readFileSync(join(raiz, 'app/actions/moderation.ts'), 'utf8'));
const inicio = moderacion.indexOf('export async function aprobarCambiosMecanicos');
const cuerpo = moderacion.slice(inicio, moderacion.indexOf('export async function rechazarPropuesta'));

describe('aceptar en bloque los cambios mecánicos', () => {
  it('lo hace un tutor (requireAdmin) y solo con los cambios de origen Claude', () => {
    expect(cuerpo).toMatch(/requireAdmin\(\)/);
    expect(cuerpo).toMatch(/\.eq\('source', 'claude'\)/);
    expect(cuerpo).toMatch(/\.eq\('status', 'pending'\)/);
  });

  it('solo tocan el enunciado, la referencia o la explicación: nunca las opciones, la respuesta ni la dificultad', () => {
    expect(moderacion).toMatch(/CAMPOS_MECANICOS = \['question_text', 'legal_reference', 'explanation'\] as const/);
    expect(cuerpo).toMatch(/Object\.keys\(despues\)\.every\(/);
    expect(moderacion).not.toMatch(/CAMPOS_MECANICOS = \[[^\]]*(options|correct_index|difficulty_level)/);
  });

  it('cada uno pasa por la aprobación de siempre y nunca da la pregunta por revisada', () => {
    expect(cuerpo).toMatch(/await aprobarPropuesta\(/);
    expect(cuerpo).not.toMatch(/revisadaPor\(|reviewed_at|reviewed_by/);
  });

  it('va de 50 en 50 por id, acotado a la academia', () => {
    expect(cuerpo).toMatch(/TANDA = 50/);
    expect(cuerpo).toMatch(/\.order\('id', \{ ascending: true \}\)/);
    expect(cuerpo).toMatch(/alcanceLecturaOrg\(auth\.user\)/);
  });
});

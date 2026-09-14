import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regla 75 · un admin normal solo toca SU banco privado, nunca el global ni
 * el de otra academia.
 *
 * Encontrado el 14 sep 2026, a preguntas del dueño sobre por qué un admin de
 * academia veía «Temario & IA»: `disableQuestion`, `updateQuestion`,
 * `approveQuestion(s)`, `discardAllQuestions` y `resolveReport` exigían
 * `requireAdmin()` a secas, sin mirar `organization_id`. Un admin de
 * CUALQUIER academia podía editar, desactivar o descartar CUALQUIER
 * pregunta del sistema —la de otra academia, o el banco global entero con
 * «Descartar todo»— por su id, sin que nada lo impidiera. «Banco Oficial»
 * ya filtraba bien la LECTURA (`filtroBancoPorAcademia`, P11c); la
 * ESCRITURA se quedó sin el mismo filtro.
 *
 * Este test lee el código fuente: no necesita Supabase.
 */

const src = readFileSync(join(__dirname, '..', 'app', 'actions', 'moderation.ts'), 'utf-8');

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const sinComentarios = stripComments(src);

/** El cuerpo aproximado de una función exportada, desde su firma hasta la siguiente. */
function cuerpoDe(nombre: string): string {
  const desde = sinComentarios.indexOf(`export async function ${nombre}`);
  expect(desde, `no se encuentra ${nombre}`).toBeGreaterThan(-1);
  const siguiente = sinComentarios.indexOf('export async function', desde + 1);
  return sinComentarios.slice(desde, siguiente === -1 ? undefined : siguiente);
}

describe('las candidatas solo las modera el superadmin', () => {
  it('getModerationQueue solo pide candidatas si el rol es superadmin', () => {
    const cuerpo = cuerpoDe('getModerationQueue');
    expect(cuerpo).toMatch(/auth\.user\.role === 'superadmin'/);
    // La cola de candidatas no puede salir de una consulta incondicional:
    // debe depender de esa comprobación de rol, no solo citarla en un
    // comentario que ya se ha quitado.
    expect(cuerpo.indexOf("auth.user.role === 'superadmin'")).toBeLessThan(
      cuerpo.indexOf("QUESTION_STATUS.CANDIDATE")
    );
  });

  it('approveQuestion y approveQuestions exigen requireSuperadmin', () => {
    expect(cuerpoDe('approveQuestion')).toMatch(/requireSuperadmin\(\)/);
    expect(cuerpoDe('approveQuestions')).toMatch(/requireSuperadmin\(\)/);
  });
});

describe('editar o desactivar una pregunta respeta la academia', () => {
  it('disableQuestion filtra por organization_id salvo para el superadmin', () => {
    const cuerpo = cuerpoDe('disableQuestion');
    expect(cuerpo).toMatch(/requireAdmin\(\)/);
    expect(cuerpo).toMatch(/role !== 'superadmin'/);
    expect(cuerpo).toMatch(/\.eq\('organization_id', auth\.user\.organizationId\)/);
  });

  it('updateQuestion filtra por organization_id salvo para el superadmin', () => {
    const cuerpo = cuerpoDe('updateQuestion');
    expect(cuerpo).toMatch(/requireAdmin\(\)/);
    expect(cuerpo).toMatch(/role !== 'superadmin'/);
    expect(cuerpo).toMatch(/\.eq\('organization_id', auth\.user\.organizationId\)/);
  });

  it('discardAllQuestions nunca descarta de golpe TODAS las academias', () => {
    const cuerpo = cuerpoDe('discardAllQuestions');
    // Superadmin -> solo el banco global; admin normal -> solo el suyo.
    expect(cuerpo).toMatch(/\.is\('organization_id', null\)/);
    expect(cuerpo).toMatch(/\.eq\('organization_id', auth\.user\.organizationId\)/);
  });

  it('resolveReport comprueba la academia de la pregunta reportada antes de resolver', () => {
    const cuerpo = cuerpoDe('resolveReport');
    expect(cuerpo).toMatch(/requireAdmin\(\)/);
    expect(cuerpo).toMatch(/question_bank!inner\(organization_id\)/);
    expect(cuerpo).toMatch(/role !== 'superadmin'/);
  });
});

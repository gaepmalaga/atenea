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

describe('las candidatas', () => {
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

  // Regla 135: las candidatas ya no son solo globales (las hay en el banco
  // privado de la academia), así que aprobar es del admin, acotado a lo que
  // puede tocar y solo si la pregunta está completa.
  it('approveQuestions es del admin, acotado por filtroEscrituraBanco y solo publica las completas', () => {
    const cuerpo = cuerpoDe('approveQuestions');
    expect(cuerpo).toMatch(/requireAdmin\(\)/);
    expect(cuerpo).not.toMatch(/requireSuperadmin\(\)/);
    expect(cuerpo).toMatch(/const alcance = filtroEscrituraBanco\(auth\.user\)/);
    expect(cuerpo).toMatch(/if \(alcance\) lectura = lectura\.or\(alcance\)/);
    expect(cuerpo).toMatch(/if \(alcance\) query = query\.or\(alcance\)/);
    // Completas y sin aviso de la ley abierto (regla 137).
    expect(cuerpo).toMatch(/filter\(\(f\) => estaCompleta\(f\) && !conAviso\.has\(f\.id\)\)/);
    // Lo que se actualiza es lo ya filtrado como completo, no los ids de entrada.
    expect(cuerpo).toMatch(/\.in\('id', listas\.slice\(i, i \+ 100\)\)/);
  });

  it('approveQuestion pasa por approveQuestions y dice qué falta', () => {
    const cuerpo = cuerpoDe('approveQuestion');
    expect(cuerpo).toMatch(/approveQuestions\(\[questionId\]\)/);
    expect(cuerpo).toMatch(/motivoSinEtiquetas/);
  });
});

describe('editar o desactivar una pregunta respeta la academia', () => {
  // Regla 123: el alcance sale de `filtroEscrituraBanco` (su banco y, con
  // UNA_SOLA_ACADEMIA, el global), y va DENTRO de la consulta.
  for (const accion of ['disableQuestion', 'reactivateQuestion']) {
    it(`${accion} acota la consulta con filtroEscrituraBanco, y el superadmin no se filtra`, () => {
      const cuerpo = cuerpoDe(accion);
      expect(cuerpo).toMatch(/requireAdmin\(\)/);
      expect(cuerpo).toMatch(/const alcance = filtroEscrituraBanco\(auth\.user\)/);
      expect(cuerpo).toMatch(/if \(alcance\) query = query\.or\(alcance\)/);
    });
  }

  // `updateQuestion` delega en `editaPregunta` (regla 135): el alcance se
  // aplica en la LECTURA previa y en la escritura, y el historial se anota
  // ANTES de tocar la fila.
  it('updateQuestion es del admin y editaPregunta acota lectura y escritura, y anota el historial antes', () => {
    expect(cuerpoDe('updateQuestion')).toMatch(/requireAdmin\(\)/);
    const src = sinComentarios.slice(sinComentarios.indexOf('async function editaPregunta'));
    const cuerpo = src.slice(0, src.indexOf('\nexport type CambioDePregunta'));
    expect(cuerpo).toMatch(/const alcance = filtroEscrituraBanco\(user\)/);
    expect(cuerpo).toMatch(/if \(alcance\) lectura = lectura\.or\(alcance\)/);
    expect(cuerpo).toMatch(/if \(alcance\) query = query\.or\(alcance\)/);
    expect(cuerpo.indexOf("from('question_edit_history').insert")).toBeGreaterThan(-1);
    expect(cuerpo.indexOf("from('question_edit_history').insert")).toBeLessThan(cuerpo.indexOf("from('question_bank').update"));
    // Si no se puede anotar, no se edita.
    expect(cuerpo).toMatch(/if \(errHist\) return \{ success: false/);
  });

  it('reactivar solo devuelve al banco una pregunta DESCARTADA, no convierte en activa una candidata', () => {
    const cuerpo = cuerpoDe('reactivateQuestion');
    expect(cuerpo).toMatch(/\.eq\('status', QUESTION_STATUS\.DISABLED\)/);
    expect(cuerpo).toMatch(/update\(\{ status: QUESTION_STATUS\.ACTIVE \}\)/);
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
    expect(cuerpo).toMatch(/!puedeEditarBanco\(auth\.user, \{ organization_id: orgDeLaPregunta \}\)/);
  });

  it('resolveReport rechaza un reporte que no existe: no lo trata como una pregunta global', () => {
    expect(cuerpoDe('resolveReport')).toMatch(/if \(!rep\) return \{ success: false/);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { temaSugerido, esAvisoOtroTema, avisoDeAmbito, type TemaOficial } from '../app/lib/ambito-tema';
import { ACCION_LABEL } from '../app/lib/audit-labels';
import { ACCIONES_DE_REVISION } from '../app/lib/revision';

/**
 * «CAMBIAR DE TEMA» (regla 144): el repaso «¿es de su tema?» solo AVISA; mover una
 * pregunta lo decide un tutor, y no la da por revisada.
 */
const raiz = join(__dirname, '..');
const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, '$1');
const moderacion = sinComentarios(readFileSync(join(raiz, 'app/actions/moderation.ts'), 'utf8'));
const cuerpo = moderacion.slice(moderacion.indexOf('export async function cambiarTemaPregunta'), moderacion.indexOf('const RELLENO_EXPLICACION'));
const tema: TemaOficial = { numero: 3, titulo: 'Constitución II', enunciado: '', normas: [] };

describe('lo que sugiere la IA al decir «otro tema»', () => {
  it('se lee el tema sugerido del aviso que escribe el propio repaso', () => {
    const aviso = avisoDeAmbito({ tema, veredicto: { veredicto: 'otro_tema', temaProbable: 2, motivo: 'Habla del Título VII.' }, titulos: new Map([[2, 'Constitución I']]) });
    expect(temaSugerido(aviso)).toBe(2);
    expect(esAvisoOtroTema(aviso)).toBe(true);
  });

  it('«fuera del temario» no sugiere ningún tema y mover la pregunta no lo resuelve', () => {
    const aviso = avisoDeAmbito({ tema, veredicto: { veredicto: 'fuera_del_temario', temaProbable: 0, motivo: 'Es un trámite de Hacienda.' }, titulos: new Map() });
    expect(temaSugerido(aviso)).toBeNull();
    expect(esAvisoOtroTema(aviso)).toBe(false);
    expect(temaSugerido(null)).toBeNull();
  });
});

describe('cambiar una pregunta de tema (acción)', () => {
  it('lo hace un tutor, acotado a su academia, y valida el tema', () => {
    expect(cuerpo).toMatch(/requireAdmin\(\)/);
    expect(cuerpo).toMatch(/filtroEscrituraBanco\(auth\.user\)/);
    expect(cuerpo).toMatch(/from\('subjects'\)/);
  });

  it('solo cambia el tema: no la da por revisada ni toca el hash', () => {
    expect(cuerpo).toMatch(/update\(\{ subject_id: subjectId \}\)/);
    expect(cuerpo).not.toMatch(/revisadaPor\(|reviewed_at|reviewed_by|question_hash/);
  });

  it('cierra solo los avisos de «otro tema» de esa pregunta', () => {
    expect(cuerpo).toMatch(/esAvisoOtroTema\(/);
    expect(cuerpo).toMatch(/\.eq\('report_type', TIPO_REPORTE_REVISION_IA\)\.eq\('status', 'open'\)/);
  });

  it('queda en «Logs» y en «Novedades»', () => {
    expect(cuerpo).toMatch(/action: 'change_question_topic'/);
    expect(ACCION_LABEL.change_question_topic).toBeTruthy();
    expect(ACCIONES_DE_REVISION.change_question_topic({})).toMatch(/tema/);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { leeVeredictoAmbito, promptDeAmbito, avisoDeAmbito, costeAmbito, TIPO_REPORTE_AMBITO, type TemaOficial } from '../app/lib/ambito-tema';
import { TIPO_REPORTE_REVISION_IA } from '../app/lib/verificacion';

/**
 * «¿ES DE SU TEMA?» (regla 138). La IA solo avisa: ni mueve ni cambia una
 * pregunta, y lo que devuelve no vale hasta comprobarlo (regla 10).
 */
const raiz = join(__dirname, '..');
const validos = new Set([1, 23, 26]);
const tema: TemaOficial = { numero: 23, titulo: 'Igualdad', enunciado: 'La LO 3/2007 y la LO 1/2004.', normas: ['LO 3/2007', 'LO 1/2004'] };

describe('¿es de su tema? (la IA solo avisa)', () => {
  it('lo que devuelve la IA no vale hasta comprobarlo', () => {
    expect(leeVeredictoAmbito('{"veredicto":"del_tema","tema_probable":0,"motivo":""}', validos)).toEqual({ veredicto: 'del_tema', temaProbable: 0, motivo: '' });
    expect(leeVeredictoAmbito({ veredicto: 'otro_tema', tema_probable: 26, motivo: 'Habla de protección de datos.' }, validos)).toMatchObject({ veredicto: 'otro_tema', temaProbable: 26 });
    expect(leeVeredictoAmbito({ veredicto: 'fuera_del_temario', tema_probable: 9, motivo: 'Es un trámite de Hacienda.' }, validos)).toMatchObject({ temaProbable: 0 });
    expect(leeVeredictoAmbito('no es json', validos)).toBeNull();
    expect(leeVeredictoAmbito({ veredicto: 'quizás', tema_probable: 0, motivo: 'x'.repeat(20) }, validos)).toBeNull();
    // «otro tema» a un tema que no existe no dice a dónde va.
    expect(leeVeredictoAmbito({ veredicto: 'otro_tema', tema_probable: 99, motivo: 'x'.repeat(20) }, validos)).toBeNull();
    // Una duda sin motivo no le sirve al tutor.
    expect(leeVeredictoAmbito({ veredicto: 'fuera_del_temario', tema_probable: 0, motivo: 'no' }, validos)).toBeNull();
  });

  it('se le enseña el programa del tema, los 45 títulos y la pregunta', () => {
    const p = promptDeAmbito({ tema, todos: [tema, { ...tema, numero: 26, titulo: 'Datos' }], pregunta: '¿Qué plazo…?', opciones: ['A', 'B', 'C'], correcta: 1, explicacion: null });
    expect(p).toContain('PROGRAMA OFICIAL DEL TEMA: La LO 3/2007');
    expect(p).toContain('26. Datos');
    expect(p).toContain('1) B');
    expect(p).toContain('(sin explicación)');
  });

  it('el aviso dice a dónde iría y que decide el tutor', () => {
    const titulos = new Map([[26, 'Protección de datos']]);
    expect(avisoDeAmbito({ tema, veredicto: { veredicto: 'otro_tema', temaProbable: 26, motivo: 'Habla de datos.' }, titulos })).toMatch(/tema 26 \(Protección de datos\).*la IA también se equivoca/i);
    expect(avisoDeAmbito({ tema, veredicto: { veredicto: 'fuera_del_temario', temaProbable: 0, motivo: 'Hacienda.' }, titulos })).toMatch(/de ningún tema del programa/);
  });

  it('es el mismo tipo de aviso que el repaso contra la ley: una sola bandeja', () => {
    expect(TIPO_REPORTE_AMBITO).toBe(TIPO_REPORTE_REVISION_IA);
    expect(costeAmbito(6326)).toBeGreaterThan(1);
    expect(costeAmbito(6326)).toBeLessThan(10);
  });

  it('el script solo avisa: no mueve ni edita preguntas, y sin --hazlo no escribe', () => {
    const s = readFileSync(join(raiz, 'scripts/operacion/ambito-preguntas.mjs'), 'utf8').replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, '$1');
    expect(s).not.toMatch(/from\('question_bank'\)\s*\.(update|upsert|insert|delete)/);
    expect(s).toMatch(/if \(v\.veredicto !== 'del_tema'\) porEscribir\.push\(/);
    expect(s).toMatch(/if \(!HAZLO \|\|/);
    expect(s).toMatch(/leeVeredictoAmbito\(/);
  });
});

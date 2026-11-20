import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { leeVeredictosApuntes, promptDeApuntes, avisoDeApuntes, costeApuntes, FIRMA_APUNTES, MAX_TEXTO_APUNTES } from '../app/lib/verificacion-apuntes';
import { PATRON_OTRO_TEMA, PATRON_FUERA_DEL_TEMARIO } from '../app/lib/ambito-tema';

/**
 * LA COMPROBACIÓN CONTRA LOS APUNTES (regla 145): solo avisa, y lo que devuelve
 * el modelo no vale hasta comprobarlo (regla 10).
 */
const raiz = join(__dirname, '..');
const script = readFileSync(join(raiz, 'scripts/operacion/verificar-apuntes.mjs'), 'utf8').replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, '$1');
const q = { question_text: '¿Qué capa del modelo OSI enruta?', options: ['Enlace', 'Red', 'Transporte'], correct_index: 1, explanation: 'La capa de red.' };

describe('lo que devuelve la IA para un lote', () => {
  it('un veredicto por pregunta, comprobado', () => {
    const m = leeVeredictosApuntes('[{"n":0,"veredicto":"correcta","correcta":1,"motivo":""},{"n":1,"veredicto":"incorrecta","correcta":2,"motivo":"Los apuntes dicen tres capas."}]', 3);
    expect(m.get(0)).toMatchObject({ veredicto: 'correcta' });
    expect(m.get(1)).toMatchObject({ veredicto: 'incorrecta', correcta: 2 });
    expect(m.has(2)).toBe(false);
  });

  it('lo que no se puede leer se descarta, nunca se da por correcto', () => {
    expect(leeVeredictosApuntes('no es json', 2).size).toBe(0);
    expect(leeVeredictosApuntes({ n: 0 }, 2).size).toBe(0);
    const raro = leeVeredictosApuntes([
      { n: 5, veredicto: 'correcta', correcta: 0, motivo: '' },          // fuera de rango
      { n: 0, veredicto: 'quizás', correcta: 0, motivo: 'x'.repeat(20) }, // veredicto inventado
      { n: 1, veredicto: 'incorrecta', correcta: 3, motivo: 'x'.repeat(20) }, // opción que no existe
      { n: 0, veredicto: 'dudosa', correcta: -1, motivo: 'no' },          // duda sin motivo
    ], 2);
    expect(raro.size).toBe(0);
  });

  it('no repite un número', () => {
    const m = leeVeredictosApuntes([{ n: 0, veredicto: 'correcta', correcta: 1, motivo: '' }, { n: 0, veredicto: 'incorrecta', correcta: 2, motivo: 'x'.repeat(20) }], 2);
    expect(m.get(0)?.veredicto).toBe('correcta');
  });
});

describe('lo que se le enseña y lo que se le dice al tutor', () => {
  it('el apunte entero y cada pregunta numerada con su marcada', () => {
    const p = promptDeApuntes({ tema: 39, titulo: 'Redes', texto: 'La capa de red enruta.', preguntas: [q, q] });
    expect(p).toContain('APUNTES DEL TEMA 39 (Redes)');
    expect(p).toContain('PREGUNTA 1: ¿Qué capa');
    expect(p).toContain('MARCADA COMO CORRECTA: 1');
    expect(promptDeApuntes({ tema: 27, titulo: 'DDHH', texto: 'x'.repeat(MAX_TEXTO_APUNTES + 10), preguntas: [q] })).toContain('[… recortado]');
  });

  it('el aviso lleva la firma de este repaso y no se confunde con los del tema ni con los de la ley', () => {
    const a = avisoDeApuntes({ tema: 39, veredicto: { n: 0, veredicto: 'incorrecta', correcta: 2, motivo: 'Los apuntes dicen otra cosa.' }, marcada: 1 });
    expect(a).toContain(FIRMA_APUNTES);
    expect(a).toMatch(/correcta sería la C, no la B/);
    expect(a).toMatch(/la IA también se equivoca/i);
    expect(PATRON_OTRO_TEMA.test(a)).toBe(false);
    expect(PATRON_FUERA_DEL_TEMARIO.test(a)).toBe(false);
    expect(avisoDeApuntes({ tema: 39, veredicto: { n: 0, veredicto: 'dudosa', correcta: -1, motivo: 'No lo cubren.' }, marcada: 1 })).toMatch(/no bastan para confirmar/);
  });

  it('852 preguntas cuestan céntimos', () => {
    expect(costeApuntes(852)).toBeLessThan(1);
  });
});

describe('el script solo avisa', () => {
  it('no cambia preguntas, solo escribe avisos; sin --hazlo no escribe', () => {
    expect(script).not.toMatch(/from\('question_bank'\)\s*\.(update|upsert|insert|delete)/);
    expect(script).toMatch(/from\('question_reports'\)\.insert\(/);
    expect(script).toMatch(/if \(!HAZLO\)[^\n]*process\.exit\(0\)/);
    expect(script).toMatch(/if \(!HAZLO \|\|/);
  });

  it('por defecto solo avisa de las que CONTRADICEN los apuntes; las que no cubren, solo con --con-dudosas', () => {
    expect(script).toMatch(/v\.veredicto === 'incorrecta' \|\| \(CON_DUDOSAS && v\.veredicto === 'dudosa'\)/);
  });

  it('solo temas sin legislación, y no repite las ya repasadas', () => {
    expect(script).toMatch(/temaSinLegislacion\(q\.subjects\?\.topic_number\)/);
    expect(script).toMatch(/yaRepasadas\.has\(q\.id\)/);
  });
});

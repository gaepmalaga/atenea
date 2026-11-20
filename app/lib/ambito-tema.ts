/**
 * ¿LA PREGUNTA ES DE SU TEMA? (regla 138, tercera comprobación; las otras dos
 * son la ley vigente, `normativa.ts`, y el repaso contra el BOE,
 * `verificacion.ts`.)
 *
 * El banco tiene preguntas que no son del temario: el Modelo 347 de Hacienda
 * colgaba del tema de violencia de género. Otra IA las compara con el
 * PROGRAMA OFICIAL del tema (el «enunciado» de la convocatoria, que está en
 * `temario/temario.json`) y señala las que no encajan. No cambia ni mueve
 * ninguna pregunta: deja un aviso «La IA duda» y decide el tutor.
 *
 * Lo que devuelve el modelo no vale hasta que se comprueba (regla 10).
 */
import { SchemaType, type Schema } from '@google/generative-ai';

/** Los avisos de este repaso son «La IA duda» (el mismo tipo que el repaso contra la ley): el tutor tiene una sola bandeja. */
export const TIPO_REPORTE_AMBITO = 'revision_ia';

export type TemaOficial = { numero: number; titulo: string; enunciado: string; normas: string[] };

export const INSTRUCCION_AMBITO = `Eres el revisor de un banco de preguntas tipo test para la oposición a Policía Nacional (Escala Básica, España).
Te doy el PROGRAMA OFICIAL de un tema (su enunciado en la convocatoria y las normas que lo componen), la lista de los 45 temas y una pregunta archivada en ese tema.
Decide si la pregunta pertenece al programa de ESE tema:
- "del_tema": lo que pregunta cabe en el enunciado del tema o en alguna de sus normas, aunque sea un detalle muy concreto o difícil. Que sea difícil o minuciosa NO es motivo para dudar.
- "otro_tema": lo que pregunta es materia del temario, pero de otro tema distinto. Indica en "tema_probable" el número de ese otro tema.
- "fuera_del_temario": lo que pregunta no está en ningún tema del programa (por ejemplo, trámites de Hacienda, normas que ninguno de los 45 temas incluye). En "tema_probable" pon 0.
Ante la duda razonable entre "del_tema" y lo demás, di "del_tema": solo señala lo que un tutor querría ver.
El motivo, en castellano, en una frase corta y concreta; si es "otro_tema", di cuál. Lo leerá un tutor que no ve lo que te he dado: no digas «el texto proporcionado».`;

export const AMBITO_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    veredicto: { type: SchemaType.STRING, format: 'enum', enum: ['del_tema', 'otro_tema', 'fuera_del_temario'] },
    tema_probable: { type: SchemaType.INTEGER },
    motivo: { type: SchemaType.STRING },
  },
  required: ['veredicto', 'tema_probable', 'motivo'],
};

export type VeredictoAmbito = { veredicto: 'del_tema' | 'otro_tema' | 'fuera_del_temario'; temaProbable: number; motivo: string };

/** Lo que el modelo devuelve, comprobado. `null` si no se puede fiar de ello. */
export function leeVeredictoAmbito(crudo: unknown, temasValidos: ReadonlySet<number>): VeredictoAmbito | null {
  let v: unknown = crudo;
  if (typeof crudo === 'string') {
    try { v = JSON.parse(crudo); } catch { return null; }
  }
  if (!v || typeof v !== 'object') return null;
  const d = v as Record<string, unknown>;
  if (!['del_tema', 'otro_tema', 'fuera_del_temario'].includes(d.veredicto as string)) return null;
  const veredicto = d.veredicto as VeredictoAmbito['veredicto'];
  const tema = Number(d.tema_probable);
  if (!Number.isInteger(tema)) return null;
  // «otro_tema» sin un tema que exista no dice a dónde va: no vale.
  if (veredicto === 'otro_tema' && !temasValidos.has(tema)) return null;
  const motivo = typeof d.motivo === 'string' ? d.motivo.replace(/\s+/g, ' ').trim().slice(0, 400) : '';
  if (veredicto !== 'del_tema' && motivo.length < 10) return null;
  return { veredicto, temaProbable: veredicto === 'otro_tema' ? tema : 0, motivo };
}

export function promptDeAmbito(p: {
  tema: TemaOficial; todos: readonly TemaOficial[];
  pregunta: string; opciones: string[]; correcta: number; explicacion: string | null;
}): string {
  return [
    `TEMA EN EL QUE ESTÁ ARCHIVADA: ${p.tema.numero}. ${p.tema.titulo}`,
    `PROGRAMA OFICIAL DEL TEMA: ${p.tema.enunciado}`,
    p.tema.normas.length ? `NORMAS DEL TEMA: ${p.tema.normas.join('; ')}` : '',
    '',
    'LOS 45 TEMAS:',
    ...p.todos.map((t) => `${t.numero}. ${t.titulo}`),
    '',
    `PREGUNTA: ${p.pregunta}`,
    ...p.opciones.map((o, i) => `${i}) ${o}`),
    `CORRECTA: ${p.correcta}`,
    `EXPLICACIÓN: ${p.explicacion ?? '(sin explicación)'}`,
  ].filter((l, i) => !(i === 2 && l === '')).join('\n');
}

/** El aviso para el tutor: solo se deja para «otro_tema» y «fuera_del_temario». */
export function avisoDeAmbito(p: { tema: TemaOficial; veredicto: VeredictoAmbito; titulos: ReadonlyMap<number, string> }): string {
  const donde = p.veredicto.veredicto === 'otro_tema'
    ? `La IA cree que esta pregunta no es del tema ${p.tema.numero} sino del tema ${p.veredicto.temaProbable} (${p.titulos.get(p.veredicto.temaProbable) ?? 'otro'}).`
    : `La IA cree que esta pregunta no es de ningún tema del programa oficial (está archivada en el tema ${p.tema.numero}).`;
  return `${donde} ${p.veredicto.motivo} Compruébalo: la IA también se equivoca. Si no es del temario, descártala; si es de otro tema, corrígele el tema.`;
}

/** Lo que costaría repasar `n` preguntas, por arriba: ~1.500 fichas de entrada (programa + 45 títulos + pregunta) y ~80 de salida cada una. */
export function costeAmbito(n: number, precio = { entradaPorMillon: 0.30, salidaPorMillon: 2.50 }): number {
  return (n * 1500 / 1e6) * precio.entradaPorMillon + (n * 80 / 1e6) * precio.salidaPorMillon;
}

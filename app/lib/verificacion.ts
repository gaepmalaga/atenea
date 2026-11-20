/**
 * EL REPASO DE LAS PREGUNTAS CONTRA LA LEY (regla 138, fase 2).
 *
 * Las 4.617 preguntas que escribió la IA se activaron sin que nadie las
 * leyera. Antes de que los tutores las revisen una a una, otra IA las compara
 * con el texto VIGENTE del artículo del BOE del que salen y señala las que no
 * cuadran, para que se empiece por ellas. No cambia ninguna pregunta: deja un
 * aviso («La IA duda») que el tutor lee y resuelve.
 *
 * Lo que devuelve el modelo no vale hasta que se comprueba (regla 10).
 */
import { SchemaType, type Schema } from '@google/generative-ai';

export const TIPO_REPORTE_REVISION_IA = 'revision_ia';

export const INSTRUCCION_VERIFICAR = `Eres el revisor de un banco de preguntas tipo test para la oposición a Policía Nacional (Escala Básica, España).
Te doy el texto VIGENTE de un precepto, tal como lo publica hoy el BOE, y una pregunta con tres opciones, la que está marcada como correcta y su explicación.
Decide SOLO con ese texto, no con lo que recuerdes de otras versiones de la ley:
- "correcta": la marcada es correcta según el texto y las otras dos no lo son.
- "incorrecta": la marcada no es correcta según el texto, u otra opción también lo es, o la explicación afirma algo que el texto contradice.
- "dudosa": el texto no basta para decidir (la pregunta trata de otra cosa, le falta contexto o es ambigua).
Si es "incorrecta", indica qué opción es la correcta según el texto (0, 1 o 2), o -1 si ninguna.
El motivo, en castellano, en una o dos frases cortas y concretas, citando el apartado si lo hay. No repitas la pregunta. Lo leerá un tutor que no ve lo que te he dado: llama al texto «el artículo», nunca «el texto proporcionado».`;

export const VERIFICACION_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    veredicto: { type: SchemaType.STRING, format: 'enum', enum: ['correcta', 'incorrecta', 'dudosa'] },
    correcta: { type: SchemaType.INTEGER },
    motivo: { type: SchemaType.STRING },
  },
  required: ['veredicto', 'correcta', 'motivo'],
};

export type Veredicto = { veredicto: 'correcta' | 'incorrecta' | 'dudosa'; correcta: number; motivo: string };

/** Lo que el modelo devuelve, comprobado. `null` si no se puede fiar de ello. */
export function leeVeredicto(crudo: unknown): Veredicto | null {
  let v: unknown = crudo;
  if (typeof crudo === 'string') {
    try { v = JSON.parse(crudo); } catch { return null; }
  }
  if (!v || typeof v !== 'object') return null;
  const d = v as Record<string, unknown>;
  if (!['correcta', 'incorrecta', 'dudosa'].includes(d.veredicto as string)) return null;
  const correcta = Number(d.correcta);
  if (!Number.isInteger(correcta) || correcta < -1 || correcta > 2) return null;
  const motivo = typeof d.motivo === 'string' ? d.motivo.replace(/\s+/g, ' ').trim().slice(0, 500) : '';
  if (d.veredicto !== 'correcta' && motivo.length < 10) return null;
  return { veredicto: d.veredicto as Veredicto['veredicto'], correcta, motivo };
}

/**
 * Hasta dónde se le enseña el artículo. Con 7.000 caracteres, los artículos
 * largos (la estructura del Ministerio en el RD 207/2024) llegaban cortados y
 * la IA decía «no puedo confirmarlo» por no ver el apartado. 24.000 caben
 * casi todos, y cuestan céntimos más.
 */
export const MAX_TEXTO_ARTICULO = 24000;

export function promptDeVerificacion(p: {
  norma: string; precepto: string; texto: string;
  pregunta: string; opciones: string[]; correcta: number; explicacion: string | null;
}): string {
  const texto = p.texto.length > MAX_TEXTO_ARTICULO ? `${p.texto.slice(0, MAX_TEXTO_ARTICULO)}\n[… recortado]` : p.texto;
  return [
    `TEXTO VIGENTE (${p.norma}, ${p.precepto}):`,
    texto,
    '',
    `PREGUNTA: ${p.pregunta}`,
    ...p.opciones.map((o, i) => `${i}) ${o}`),
    `MARCADA COMO CORRECTA: ${p.correcta}`,
    `EXPLICACIÓN: ${p.explicacion ?? '(sin explicación)'}`,
  ].join('\n');
}

/** El aviso para el tutor. Solo se deja para «incorrecta» y «dudosa». */
export function avisoDeVerificacion(p: { norma: string; precepto: string; veredicto: Veredicto; marcada: number; url: string | null }): string {
  const letra = (i: number) => 'ABC'[i] ?? '?';
  const que = p.veredicto.veredicto === 'incorrecta'
    ? `La IA cree que la pregunta está MAL según el texto vigente (${p.norma}, ${p.precepto})${p.veredicto.correcta >= 0 && p.veredicto.correcta !== p.marcada ? `: la correcta sería la ${letra(p.veredicto.correcta)}, no la ${letra(p.marcada)}` : ''}.`
    : `La IA no puede confirmar la pregunta con el texto vigente (${p.norma}, ${p.precepto}).`;
  return `${que} ${p.veredicto.motivo} Compruébalo: la IA también se equivoca.${p.url ? ` ${p.url}` : ''}`;
}

/** Lo que costaría repasar `n` preguntas, por arriba: ~2.200 fichas de entrada y ~120 de salida cada una (las de artículos muy largos, más). */
export function costeVerificacion(n: number, precio = { entradaPorMillon: 0.30, salidaPorMillon: 2.50 }): number {
  return (n * 2200 / 1e6) * precio.entradaPorMillon + (n * 120 / 1e6) * precio.salidaPorMillon;
}

/**
 * LA COMPROBACIÓN CONTRA LOS APUNTES (regla 145).
 *
 * El repaso contra el BOE (`verificacion.ts`) compara una pregunta con el
 * artículo del que sale. Los temas de ciencias sociales, técnico-científicas y
 * los apuntes propios de los temas 4 y 24 no tienen artículo: su pregunta no lleva
 * referencia legal. Se comparan con el APUNTE entero del tema (`documents.full_text`),
 * que es corto (5.000 a 11.000 caracteres), de varias en varias.
 *
 * Ojo con lo que NO prueba: los apuntes de esos temas se redactaron desde fuentes
 * citadas y también los hizo una IA. Esto detecta preguntas que CONTRADICEN los
 * apuntes o que no se apoyan en ellos; no garantiza que los apuntes sean verdad.
 * No cambia ninguna pregunta: deja un aviso «La IA duda» que decide un tutor.
 *
 * Lo que devuelve el modelo no vale hasta que se comprueba (regla 10).
 * MÓDULO PURO (regla 21).
 */
import { SchemaType, type Schema } from '@google/generative-ai';

/** La marca del aviso de ESTE repaso: sirve para no repetirlo y para reconocerlo. */
export const FIRMA_APUNTES = 'los apuntes del tema';

export const INSTRUCCION_APUNTES = `Eres el revisor de un banco de preguntas tipo test para la oposición a Policía Nacional (Escala Básica, España).
Te doy los APUNTES de un tema, tal como están en la plataforma, y varias preguntas numeradas, cada una con tres opciones (0, 1, 2), la marcada como correcta y su explicación.
Decide SOLO con el texto de los apuntes. Para cada pregunta:
- "correcta": los apuntes respaldan la opción marcada y no respaldan ninguna de las otras.
- "incorrecta": los apuntes CONTRADICEN la opción marcada, u otra opción también es correcta según los apuntes, o la explicación afirma algo que los apuntes contradicen. Indica en "correcta" cuál sería la correcta según los apuntes (0, 1 o 2), o -1 si ninguna.
- "dudosa": los apuntes no cubren lo que se pregunta o no bastan para decidir.
El motivo, en castellano, en una o dos frases cortas y concretas. Lo leerá un tutor que no ve lo que te he dado: llama al texto «los apuntes», nunca «el texto proporcionado». Si es "correcta", el motivo puede ir vacío.
Devuelve un elemento por cada pregunta, con su número "n".`;

export const APUNTES_SCHEMA: Schema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      n: { type: SchemaType.INTEGER },
      veredicto: { type: SchemaType.STRING, format: 'enum', enum: ['correcta', 'incorrecta', 'dudosa'] },
      correcta: { type: SchemaType.INTEGER },
      motivo: { type: SchemaType.STRING },
    },
    required: ['n', 'veredicto', 'correcta', 'motivo'],
  },
};

export type VeredictoApuntes = { n: number; veredicto: 'correcta' | 'incorrecta' | 'dudosa'; correcta: number; motivo: string };

/** Hasta dónde se le enseñan los apuntes: el tema 27 (tres tratados) es el único largo. */
export const MAX_TEXTO_APUNTES = 200_000;
/** Cuántas preguntas por consulta. */
export const PREGUNTAS_POR_LOTE = 10;

export type PreguntaDeLote = { question_text: string; options: string[]; correct_index: number; explanation: string | null };

export function promptDeApuntes(p: { tema: number; titulo: string; texto: string; preguntas: PreguntaDeLote[] }): string {
  const texto = p.texto.length > MAX_TEXTO_APUNTES ? `${p.texto.slice(0, MAX_TEXTO_APUNTES)}\n[… recortado]` : p.texto;
  const preguntas = p.preguntas.map((q, i) => [
    `PREGUNTA ${i}: ${q.question_text}`,
    ...q.options.map((o, j) => `  ${j}) ${o}`),
    `  MARCADA COMO CORRECTA: ${q.correct_index}`,
    `  EXPLICACIÓN: ${q.explanation ?? '(sin explicación)'}`,
  ].join('\n'));
  return [`APUNTES DEL TEMA ${p.tema} (${p.titulo}):`, texto, '', ...preguntas].join('\n');
}

/**
 * La respuesta del modelo para un lote de `total` preguntas, comprobada. Devuelve un
 * veredicto por número válido y sin repetir; lo que no se puede leer se descarta (la
 * pregunta queda sin repasar y se volverá a intentar), nunca se da por «correcta».
 */
export function leeVeredictosApuntes(crudo: unknown, total: number): Map<number, VeredictoApuntes> {
  let v: unknown = crudo;
  if (typeof crudo === 'string') {
    try { v = JSON.parse(crudo); } catch { return new Map(); }
  }
  const out = new Map<number, VeredictoApuntes>();
  if (!Array.isArray(v)) return out;
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const d = x as Record<string, unknown>;
    const n = Number(d.n);
    if (!Number.isInteger(n) || n < 0 || n >= total || out.has(n)) continue;
    if (!['correcta', 'incorrecta', 'dudosa'].includes(d.veredicto as string)) continue;
    const correcta = Number(d.correcta);
    if (!Number.isInteger(correcta) || correcta < -1 || correcta > 2) continue;
    const motivo = typeof d.motivo === 'string' ? d.motivo.replace(/\s+/g, ' ').trim().slice(0, 500) : '';
    if (d.veredicto !== 'correcta' && motivo.length < 10) continue;
    out.set(n, { n, veredicto: d.veredicto as VeredictoApuntes['veredicto'], correcta, motivo });
  }
  return out;
}

/** El aviso para el tutor: solo para «incorrecta» y «dudosa». */
export function avisoDeApuntes(p: { tema: number; veredicto: VeredictoApuntes; marcada: number }): string {
  const letra = (i: number) => 'ABC'[i] ?? '?';
  const que = p.veredicto.veredicto === 'incorrecta'
    ? `La IA cree que la pregunta CONTRADICE ${FIRMA_APUNTES} ${p.tema}${p.veredicto.correcta >= 0 && p.veredicto.correcta !== p.marcada ? `: la correcta sería la ${letra(p.veredicto.correcta)}, no la ${letra(p.marcada)}` : ''}.`
    : `${FIRMA_APUNTES[0].toUpperCase()}${FIRMA_APUNTES.slice(1)} ${p.tema} no bastan para confirmar la pregunta: no cubren lo que pregunta o es ambigua.`;
  return `${que} ${p.veredicto.motivo} Compruébalo: la IA también se equivoca.`;
}

/** Lo que costaría repasar `n` preguntas, por arriba: el apunte (~3.000 fichas) por cada 10 preguntas, más ~700 de preguntas y ~900 de salida. */
export function costeApuntes(n: number, precio = { entradaPorMillon: 0.30, salidaPorMillon: 2.50 }): number {
  const lotes = Math.ceil(n / PREGUNTAS_POR_LOTE);
  return ((lotes * 3000 + n * 70) / 1e6) * precio.entradaPorMillon + ((n * 90) / 1e6) * precio.salidaPorMillon;
}

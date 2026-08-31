/**
 * Ver QUE RESPONDE el chat de verdad, sin levantar la aplicacion.
 *
 * POR QUE EXISTE
 * Un alumno pregunto "¿cuantos articulos tiene la Constitucion?" y la respuesta
 * fue "no consta en el temario oficial aportado [1][2][3][4][5][6]" seguida de
 * cuatro trampas de examen sobre la reforma constitucional. Los tests pasaban
 * todos: lo que estaba mal era el PROMPT, y un prompt no se revisa leyendolo,
 * se revisa viendo lo que sale.
 *
 * Reproduce el mismo camino que `askAtenea` —el mismo embedding, la misma
 * busqueda, el mismo indice y EL MISMO prompt, importado de `app/lib/chat.ts`
 * para que no puedan divergir— y ensena la respuesta.
 *
 * CUESTA DINERO: dos llamadas a Gemini por pregunta (el embedding y la
 * respuesta). Por eso es un guion aparte y no un test.
 *
 *   npm run chat:probar
 *   npm run chat:probar -- "¿que dice el articulo 27?"
 */

import { readFileSync } from 'node:fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  buildChatPrompt,
  buildRetrievalQuery,
  citaDe,
  articuloPedido,
  esPreguntaDeEstructura,
  numeroDeArticulo,
  resumeIndice,
  formatIndice,
  FUENTE_INDICE,
} from '../app/lib/chat.ts';

// --- Entorno ----------------------------------------------------------------
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()])
);

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const cabeceras = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const chatModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
const embeddingModel = genAI.getGenerativeModel({ model: 'models/gemini-embedding-001' });

const get = async (ruta) => (await fetch(`${URL_BASE}/rest/v1/${ruta}`, { headers: cabeceras })).json();

const MAX_REFERENCIAS = 5000;

// --- Las tres vias de recuperacion, como en la accion -----------------------

async function porSemantica(consulta) {
  const emb = await embeddingModel.embedContent(consulta);
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/match_document_chunks`, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify({
      query_embedding: emb.embedding.values,
      match_threshold: 0.45,
      match_count: 8,
    }),
  });
  const datos = await r.json();
  return Array.isArray(datos) ? datos : [];
}

async function porReferencia(numero) {
  const refs = await get(`document_chunks?select=id,reference&reference=not.is.null&limit=${MAX_REFERENCIAS}`);
  const ids = refs.filter((f) => numeroDeArticulo(f.reference) === numero).map((f) => f.id).slice(0, 3);
  if (!ids.length) return [];

  const filas = await get(
    `document_chunks?select=content_chunk,reference,documents!inner(filename)&id=in.(${ids.join(',')})`
  );
  return filas.map((f) => ({
    filename: f.documents?.filename ?? '',
    content_chunk: f.content_chunk,
    reference: f.reference,
    similarity: 1,
  }));
}

async function elIndice() {
  const [docs, refs] = await Promise.all([
    get('documents?select=id,filename,subject:subjects(title)'),
    get(`document_chunks?select=document_id,reference&limit=${MAX_REFERENCIAS}`),
  ]);

  const porDoc = new Map();
  for (const r of refs) {
    const l = porDoc.get(r.document_id) ?? [];
    l.push(r.reference);
    porDoc.set(r.document_id, l);
  }

  const texto = formatIndice(
    docs.map((d) => {
      const subject = Array.isArray(d.subject) ? d.subject[0] : d.subject;
      return {
        tema: subject?.title ?? null,
        filename: d.filename ?? '',
        ...resumeIndice(porDoc.get(d.id) ?? []),
      };
    })
  );

  return texto ? { filename: FUENTE_INDICE, content_chunk: texto, reference: null, similarity: 1 } : null;
}

// --- Una pregunta -----------------------------------------------------------

async function pregunta(texto) {
  console.log('\n' + '='.repeat(78));
  console.log('PREGUNTA: ' + texto);
  console.log('='.repeat(78));

  const numero = articuloPedido(texto);
  const [semanticos, indice, exactos] = await Promise.all([
    porSemantica(buildRetrievalQuery([], texto)),
    esPreguntaDeEstructura(texto) ? elIndice() : Promise.resolve(null),
    numero ? porReferencia(numero) : Promise.resolve([]),
  ]);

  const fuentes = [...(indice ? [indice] : []), ...exactos, ...semanticos].slice(0, 6);

  console.log(
    'vías: ' +
      [
        indice ? 'ÍNDICE' : null,
        numero ? `artículo ${numero} (${exactos.length} frag.)` : null,
        `semántica (${semanticos.length})`,
      ]
        .filter(Boolean)
        .join(' · ')
  );
  console.log('fuentes: ' + fuentes.map((f) => citaDe(f)).join(' | ').slice(0, 200));
  console.log('-'.repeat(78));

  const contexto = fuentes
    .map((c, i) => `[FUENTE ${i + 1}]: ${citaDe(c)}\nCONTENIDO: ${c.content_chunk}`)
    .join('\n\n---\n\n');

  const res = await chatModel.generateContent(
    buildChatPrompt({ contexto, conversacion: '', pregunta: texto })
  );

  const respuesta = res.response.text().trim();
  console.log(respuesta);
  console.log(`\n[${respuesta.length} caracteres]`);
}

// --- Main -------------------------------------------------------------------

const PREGUNTAS_POR_DEFECTO = [
  '¿cuántos artículos tiene la Constitución?',
  '¿qué dice el artículo 27?',
  '¿cuáles son los principios básicos de actuación de las Fuerzas y Cuerpos de Seguridad?',
  '¿cuál es la capital de Francia?',
];

const preguntas = process.argv.slice(2).length ? process.argv.slice(2) : PREGUNTAS_POR_DEFECTO;

for (const p of preguntas) {
  await pregunta(p);
}

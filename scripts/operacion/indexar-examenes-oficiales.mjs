/**
 * INDEXAR LOS EXÁMENES OFICIALES ANTERIORES COMO TEMAS EXTRA.
 *
 * Cinco convocatorias reales de la Escala Básica (2021-2025), descargadas de
 * `blucop.es/examenes` (gratis, sin registro, versión "resuelta y
 * desarrollada" con explicación y referencia legal de cada pregunta —
 * exámenes oficiales del Estado, de dominio público administrativo, no el
 * material de pago de una academia privada).
 *
 * Cada convocatoria entra como un TEMA más, en un bloque nuevo
 * "EXÁMENES OFICIALES ANTERIORES" (topic_number 46-50, para no chocar con los
 * 45 del temario real). Reanudable: si el documento ya existe para ese tema,
 * se salta.
 *
 * NO DUPLICA LA LÓGICA DE LA APLICACIÓN: `chunkDocument`/`cleanLegalText` de
 * `app/lib/text.ts`, igual que `uploadTopicPDF` y `sembrar.mjs`.
 *
 * USO
 *   node --experimental-strip-types scripts/operacion/indexar-examenes-oficiales.mjs
 *   node --experimental-strip-types scripts/operacion/indexar-examenes-oficiales.mjs --ensayo
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import PDFParser from 'pdf2json';
import { config } from 'dotenv';

import { normalizeSupabaseUrl } from '../../app/lib/supabase-url.ts';
import { cleanLegalText, chunkDocument } from '../../app/lib/text.ts';

config({ path: '.env.local' });

const URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI = process.env.GEMINI_API_KEY;
const ENSAYO = process.argv.includes('--ensayo');

if (!URL || !KEY || !GEMINI) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o GEMINI_API_KEY en .env.local');
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });
const genAI = new GoogleGenerativeAI(GEMINI);
const embeddingModel = genAI.getGenerativeModel({ model: 'models/gemini-embedding-001' });

const DIR = join(process.cwd(), 'temario', 'examenes-oficiales');
const AÑOS = [2021, 2022, 2023, 2024, 2025];
const BLOQUE_NOMBRE = 'EXÁMENES OFICIALES ANTERIORES';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function conReintentos(fn, etiqueta, intentos = 5) {
  let ultimo;
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn();
    } catch (e) {
      ultimo = e;
      const esTasa = /429|quota|rate|RESOURCE_EXHAUSTED/i.test(String(e?.message ?? e));
      if (!esTasa || i === intentos - 1) throw e;
      const pausa = 2000 * 2 ** i;
      console.log(`      · límite de tasa en ${etiqueta}; espero ${pausa / 1000}s`);
      await espera(pausa);
    }
  }
  throw ultimo;
}

function textoDelPdf(ruta) {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, 1);
    parser.on('pdfParser_dataError', (err) => reject(err?.parserError ?? err));
    parser.on('pdfParser_dataReady', () => resolve(parser.getRawTextContent()));
    parser.parseBuffer(readFileSync(ruta));
  });
}

async function aseguraBloque() {
  const { data: existente } = await db.from('blocks').select('id, name').eq('name', BLOQUE_NOMBRE).maybeSingle();
  if (existente) return existente.id;
  if (ENSAYO) return -1;

  const { data: maxRow } = await db.from('blocks').select('id').order('id', { ascending: false }).limit(1).maybeSingle();
  const nuevoId = (maxRow?.id ?? 0) + 1;
  const { data, error } = await db.from('blocks').insert({ id: nuevoId, name: BLOQUE_NOMBRE }).select().single();
  if (error) throw new Error(`creando el bloque: ${error.message}`);
  console.log(`  + bloque creado: "${BLOQUE_NOMBRE}" (id ${data.id})`);
  return data.id;
}

async function aseguraTema(blockId, año, topicNumber) {
  const title = `Examen oficial ${año} — Escala Básica (convocatoria real)`;
  const { data: existente } = await db.from('subjects').select('id, topic_number').eq('topic_number', topicNumber).maybeSingle();
  if (existente) return existente.id;
  if (ENSAYO) return -(1000 + topicNumber);

  const { data: maxRow } = await db.from('subjects').select('id').order('id', { ascending: false }).limit(1).maybeSingle();
  const nuevoId = (maxRow?.id ?? 0) + 1;
  const { data, error } = await db
    .from('subjects')
    .insert({ id: nuevoId, block_id: blockId, topic_number: topicNumber, title })
    .select()
    .single();
  if (error) throw new Error(`creando el tema ${año}: ${error.message}`);
  console.log(`  + tema creado: "${title}" (id ${data.id}, num ${topicNumber})`);
  return data.id;
}

async function indexarUno(subjectId, ruta, filename) {
  const bruto = await textoDelPdf(ruta);
  const limpio = cleanLegalText(bruto);
  if (limpio.length < 100) throw new Error('PDF vacío o ilegible');

  const fragmentos = chunkDocument(limpio);
  if (fragmentos.length === 0) throw new Error('no ha producido ningún fragmento indexable');

  if (ENSAYO) {
    const conRef = fragmentos.filter((f) => f.reference !== null).length;
    return { indexed: fragmentos.length, total: fragmentos.length, conRef, ensayo: true };
  }

  const { data: doc, error: docError } = await db
    .from('documents')
    .insert({
      subject_id: subjectId,
      filename,
      full_text: limpio,
      uploaded_at: new Date().toISOString(),
      index_status: 'pendiente',
      chunk_count: 0,
    })
    .select()
    .single();
  if (docError) throw new Error(docError.message);

  let indexed = 0;
  const fallos = [];
  const LOTE = 5;

  for (let i = 0; i < fragmentos.length; i += LOTE) {
    const lote = fragmentos.slice(i, i + LOTE);
    const calculados = await Promise.all(
      lote.map(async (fragmento, j) => {
        const pos = i + j + 1;
        try {
          const emb = await conReintentos(() => embeddingModel.embedContent(fragmento.text), `${filename} #${pos}`);
          const vector = emb.embedding?.values;
          if (!vector || vector.length === 0) throw new Error('vector vacío');
          return { document_id: doc.id, content_chunk: fragmento.text, reference: fragmento.reference, embedding: vector };
        } catch (e) {
          fallos.push(`#${pos}: ${e?.message ?? e}`);
          return null;
        }
      }),
    );

    const listos = calculados.filter(Boolean);
    if (listos.length === 0) continue;
    const { error } = await db.from('document_chunks').insert(listos);
    if (error) fallos.push(`lote ${i / LOTE + 1}: ${error.message}`);
    else indexed += listos.length;

    process.stdout.write(`\r      ${indexed}/${fragmentos.length} fragmentos`);
    await espera(200);
  }
  process.stdout.write('\r');

  if (indexed === 0) {
    await db.from('documents').delete().eq('id', doc.id);
    throw new Error(`ningún fragmento indexado. Primer error: ${fallos[0] ?? 'desconocido'}`);
  }

  const estado = indexed === fragmentos.length ? 'indexado' : 'parcial';
  await db.from('documents').update({ index_status: estado, chunk_count: indexed, indexed_at: new Date().toISOString() }).eq('id', doc.id);

  return { indexed, total: fragmentos.length, conRef: fragmentos.filter((f) => f.reference !== null).length, fallos };
}

async function main() {
  console.log(ENSAYO ? '(ensayo: no se escribe nada)\n' : '');
  const blockId = await aseguraBloque();

  for (let i = 0; i < AÑOS.length; i++) {
    const año = AÑOS[i];
    const topicNumber = 46 + i;
    const ruta = join(DIR, `examen-${año}-resuelto.pdf`);
    const filename = `examen-oficial-${año}-resuelto`;

    const subjectId = await aseguraTema(blockId, año, topicNumber);

    const { data: yaEsta } = ENSAYO
      ? { data: null }
      : await db.from('documents').select('id, chunk_count').eq('subject_id', subjectId).eq('filename', filename).maybeSingle();
    if (yaEsta) {
      console.log(`  ·  ${año}  ya indexado (${yaEsta.chunk_count} fragmentos)`);
      continue;
    }

    process.stdout.write(`  →  examen ${año}…`);
    try {
      const r = await indexarUno(subjectId, ruta, filename);
      const marca = r.indexed === r.total ? '✓' : '~';
      console.log(`\r  ${marca}  examen ${año}  ${r.indexed}/${r.total} fragmentos, ${r.conRef} con referencia${r.ensayo ? '  (ensayo)' : ''}`);
    } catch (e) {
      console.log(`\r  ✗  examen ${año}: ${e.message}`);
    }
  }

  console.log('\nListo.');
}

main().catch((e) => {
  console.error('Error fatal:', e);
  process.exit(1);
});

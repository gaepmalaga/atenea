/**
 * ¿Está cada pregunta del banco en el tema que le corresponde?
 *
 * POR QUE
 * Un simulacro de «La Constitución Española (I)» sirvió cinco preguntas sobre
 * OSINT y la Dark Web. No fue un fallo del código —el examen sirvió exactamente
 * lo que dice `question_bank.subject_id`— sino del BANCO: hay preguntas
 * archivadas en el tema que no les toca.
 *
 * Y no es cosmético. La fila de `question_attempts` guarda el tema ELEGIDO, no
 * el de la pregunta, así que un alumno que estudia Constitución acumula
 * estadísticas de Constitución respondiendo sobre la Deep Web.
 *
 * COMO LO DECIDE
 * No por palabras clave, que se equivocan. Se embebe el enunciado y se busca en
 * `document_chunks` con la misma función que usa el chat: si el temario que más
 * se le parece es el de otro tema, la pregunta está mal archivada. Es la misma
 * infraestructura de P1, usada para auditarse a sí misma.
 *
 * USO
 *   node scripts/revisar-tema-de-las-preguntas.mjs            (solo informa)
 *   node scripts/revisar-tema-de-las-preguntas.mjs --aplicar  (mueve las que falla)
 *
 * Por defecto NO escribe nada: mover la pregunta de un opositor de tema es una
 * decisión del dueño del banco, no del script.
 */
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const APLICAR = process.argv.includes('--aplicar');

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
// El mismo modelo con el que se indexó el temario: comparar vectores de
// modelos distintos no significa nada.
const embeddingModel = genAI.getGenerativeModel({ model: 'models/gemini-embedding-001' });

/** Cuánto tiene que ganar el otro tema para llamarlo error y no ruido. */
const MARGEN = 0.05;

const { data: subjects } = await supabase.from('subjects').select('id, title');
const tituloDe = Object.fromEntries(subjects.map((s) => [s.id, s.title]));

// La funcion de busqueda devuelve el NOMBRE del documento, no su id, asi que
// el mapa va por nombre. Cambiar la firma de la RPC solo para esto seria pagar
// una migracion por un guion de un solo uso.
const { data: docs } = await supabase.from('documents').select('id, subject_id, filename');
const temaDelDoc = Object.fromEntries(docs.map((d) => [d.filename, d.subject_id]));

const { data: preguntas } = await supabase
  .from('question_bank')
  .select('id, subject_id, status, document_id, question_text')
  .order('subject_id');

console.log(`Banco: ${preguntas.length} preguntas.\n`);

const mal = [];
const sinTemario = [];

/**
 * El embedding, con reintentos.
 *
 * La API devuelve 503 de vez en cuando y sin esto el guion se cae a mitad del
 * banco, dejando el informe incompleto justo cuando mas se necesita entero.
 */
async function embeber(texto, intentos = 4) {
  for (let i = 1; i <= intentos; i++) {
    try {
      return await embeddingModel.embedContent(texto);
    } catch (e) {
      if (i === intentos) throw e;
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
}

for (const q of preguntas) {
  const emb = await embeber(q.question_text);
  const { data: trozos, error } = await supabase.rpc('match_document_chunks', {
    query_embedding: emb.embedding.values,
    match_threshold: 0.3,
    match_count: 5,
  });

  if (error) { console.error('RPC:', error.message); process.exit(1); }
  if (!trozos?.length) { sinTemario.push(q); continue; }

  // Se suma la similitud por tema en vez de mirar solo el mejor fragmento: un
  // acierto suelto puede ser casualidad, cinco no.
  const porTema = {};
  for (const t of trozos) {
    const tema = temaDelDoc[t.filename];
    if (tema == null) continue;
    porTema[tema] = (porTema[tema] ?? 0) + (t.similarity ?? 0);
  }

  const ranking = Object.entries(porTema).sort((a, b) => b[1] - a[1]);
  if (!ranking.length) { sinTemario.push(q); continue; }

  const [mejorTema, mejorPuntos] = ranking[0];
  const suyos = porTema[q.subject_id] ?? 0;

  if (Number(mejorTema) !== q.subject_id && mejorPuntos - suyos > MARGEN) {
    mal.push({ ...q, deberiaSer: Number(mejorTema), suyos, mejorPuntos });
  }
}

console.log(`MAL ARCHIVADAS: ${mal.length}\n`);
for (const q of mal) {
  console.log(`  ${q.question_text.slice(0, 74)}`);
  console.log(`     está en:  ${q.subject_id} · ${tituloDe[q.subject_id]}`);
  console.log(`     encaja en: ${q.deberiaSer} · ${tituloDe[q.deberiaSer]}`);
  console.log(`     (${q.mejorPuntos.toFixed(2)} frente a ${q.suyos.toFixed(2)}) · ${q.status} · document_id: ${q.document_id ?? 'null'}\n`);
}

if (sinTemario.length) {
  console.log(`Sin temario con el que compararlas: ${sinTemario.length}. No se tocan.\n`);
}

if (!mal.length) {
  console.log('Nada que mover.');
} else if (!APLICAR) {
  console.log('Vista previa. Para moverlas: node scripts/revisar-tema-de-las-preguntas.mjs --aplicar');
} else {
  let movidas = 0;
  for (const q of mal) {
    const { error } = await supabase
      .from('question_bank')
      .update({ subject_id: q.deberiaSer })
      .eq('id', q.id);
    if (error) console.error(`  ✗ ${q.id}: ${error.message}`);
    else movidas++;
  }
  console.log(`Movidas ${movidas} de ${mal.length}.`);
}

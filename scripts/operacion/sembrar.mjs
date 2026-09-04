/**
 * SUBIR EL TEMARIO ENTERO Y LLENAR EL BANCO DE PREGUNTAS.
 *
 * Hace, sin interfaz, lo mismo que haría un administrador en el panel: subir
 * los 51 PDF de `temario/pdf/` (trocearlos, sacar la referencia de artículo,
 * calcular sus embeddings) y luego generar preguntas de cada tema.
 *
 * A mano son 51 subidas y 45 siembras, cada una esperando a la anterior.
 *
 * LO QUE CUESTA, MEDIDO
 * Los 51 PDF dan **4.970 fragmentos** (4.540 con referencia de artículo), o sea
 * 4.970 embeddings. Con 20 preguntas por tema son 900 llamadas más a
 * `gemini-2.5-flash`. En dinero es poco —del orden de un par de euros— pero en
 * TIEMPO no: entre los límites de tasa y las pausas, cuenta con una hora larga.
 * Déjalo corriendo; si se corta, se relanza y sigue por donde iba.
 *
 * NO DUPLICA LA LÓGICA DE LA APLICACIÓN
 * El troceado (`chunkDocument`), la limpieza (`cleanLegalText`), la huella
 * (`questionHash`), la validación (`validateGeneratedQuestion`), el prompt y el
 * esquema del modelo se importan de `app/lib/`. Es la regla del repo: dos
 * copias de un troceado son dos troceados, y el día que se afine uno el otro
 * sigue indexando como antes.
 *
 * ES REANUDABLE
 * Un tema ya indexado se salta, y las preguntas van con `ignoreDuplicates`. Si
 * se corta a la mitad —y con 2.900 embeddings se corta— se vuelve a lanzar y
 * sigue por donde iba, sin repetir el gasto.
 *
 * USO
 *   npm run sembrar -- --comprobar-pdfs     lee los PDF y los trocea, SIN red
 *   npm run sembrar -- --ensayo             lo que haría, sin escribir nada
 *   npm run sembrar -- --solo-indexar       solo los documentos
 *   npm run sembrar -- --solo-preguntas     solo las preguntas
 *   npm run sembrar -- --preguntas=20       cuántas por tema (por defecto 20)
 *   npm run sembrar -- --tema=4             un tema suelto
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import PDFParser from 'pdf2json';
import { config } from 'dotenv';
import { normalizeSupabaseUrl } from '../../app/lib/supabase-url.ts';

import { cleanLegalText, chunkDocument } from '../../app/lib/text.ts';
import { questionHash } from '../../app/lib/question-hash.ts';
import { parseAIJson, validateGeneratedQuestion, randomContextWindow } from '../../app/lib/ai-output.ts';
import { QUESTION_STATUS, QUESTION_ORIGIN, DIFFICULTY_DEFAULT } from '../../app/lib/questions.ts';
import { buildQuestionPrompt, QUESTION_SCHEMA } from '../../app/lib/question-prompt.ts';

config({ path: '.env.local' });

// Se normaliza: el panel de Supabase enseña la URL del endpoint REST
// (`…/rest/v1/`) y es la que se copia; el cliente quiere la base.
const URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI = process.env.GEMINI_API_KEY;

// `--comprobar-pdfs` no habla con nadie: lee los PDF y los trocea con la misma
// función que usa la aplicación, para ver qué va a entrar ANTES de pagar un
// solo embedding. Por eso las credenciales se exigen más abajo y no aquí.
const SOLO_PDFS = process.argv.includes('--comprobar-pdfs');

if (!SOLO_PDFS && (!URL || !KEY || !GEMINI)) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o GEMINI_API_KEY en .env.local');
  process.exit(1);
}

const db = SOLO_PDFS ? null : createClient(URL, KEY, { auth: { persistSession: false } });
const genAI = SOLO_PDFS ? null : new GoogleGenerativeAI(GEMINI);
const embeddingModel = genAI?.getGenerativeModel({ model: 'models/gemini-embedding-001' });
const questionModel = genAI?.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: { responseMimeType: 'application/json', responseSchema: QUESTION_SCHEMA },
});

// --- Argumentos ---
const args = process.argv.slice(2);
const tiene = (f) => args.includes(f);
const valor = (f, pordefecto) => {
  const a = args.find((x) => x.startsWith(`--${f}=`));
  return a ? a.split('=')[1] : pordefecto;
};
const ENSAYO = tiene('--ensayo');
const SOLO_INDEXAR = tiene('--solo-indexar');
const SOLO_PREGUNTAS = tiene('--solo-preguntas');
const POR_TEMA = Math.max(1, Math.min(200, parseInt(valor('preguntas', '20'), 10) || 20));
const TEMA_UNICO = valor('tema', null) ? parseInt(valor('tema'), 10) : null;

const PDFS = join(process.cwd(), 'temario', 'pdf');

/** Los límites de tasa de Gemini no se piden por favor: se esperan. */
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Reintenta lo que falla por límite de tasa, esperando cada vez más.
 *
 * 2.900 embeddings seguidos chocan con el límite por minuto del plan gratuito.
 * Sin esto, el guion se cae a la mitad y hay que relanzarlo a mano.
 */
async function conReintentos(fn, etiqueta, intentos = 5) {
  let ultimo;
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn();
    } catch (e) {
      ultimo = e;
      const msg = String(e?.message ?? e);
      const esTasa = /429|quota|rate|RESOURCE_EXHAUSTED/i.test(msg);
      if (!esTasa || i === intentos - 1) throw e;
      const pausa = 2000 * 2 ** i;
      console.log(`      · límite de tasa en ${etiqueta}; espero ${pausa / 1000}s`);
      await espera(pausa);
    }
  }
  throw ultimo;
}

/** El texto de un PDF, igual que lo saca `uploadTopicPDF`. */
function textoDelPdf(ruta) {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, 1);
    parser.on('pdfParser_dataError', (err) => reject(err?.parserError ?? err));
    parser.on('pdfParser_dataReady', () => resolve(parser.getRawTextContent()));
    parser.parseBuffer(readFileSync(ruta));
  });
}

/** `tema-08-2.pdf` -> { numero: 8, fichero: 'tema-08-2' }. */
function temaDelFichero(nombre) {
  const m = nombre.match(/^tema-(\d{2})(?:-(\d+))?\.pdf$/);
  if (!m) return null;
  return { numero: parseInt(m[1], 10), fichero: nombre.replace(/\.pdf$/, '') };
}

// =====================================================================
// FASE A · INDEXAR LOS DOCUMENTOS
// =====================================================================

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
          const emb = await conReintentos(
            () => embeddingModel.embedContent(fragmento.text),
            `${filename} #${pos}`,
          );
          const vector = emb.embedding?.values;
          if (!vector || vector.length === 0) throw new Error('vector vacío');
          return {
            document_id: doc.id,
            content_chunk: fragmento.text,
            reference: fragmento.reference,
            embedding: vector,
          };
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

  // Ni un documento huérfano: si no ha entrado NADA, la fila se borra. Un
  // documento sin fragmentos es un tema mudo para el chat, y en el panel se ve
  // igual que uno sano. Es lo que le pasó al tema 9 durante meses.
  if (indexed === 0) {
    await db.from('documents').delete().eq('id', doc.id);
    throw new Error(`ningún fragmento indexado. Primer error: ${fallos[0] ?? 'desconocido'}`);
  }

  const estado = indexed === fragmentos.length ? 'indexado' : 'parcial';
  await db
    .from('documents')
    .update({ index_status: estado, chunk_count: indexed, indexed_at: new Date().toISOString() })
    .eq('id', doc.id);

  return {
    indexed,
    total: fragmentos.length,
    conRef: fragmentos.filter((f) => f.reference !== null).length,
    fallos,
  };
}

async function faseIndexar(temas) {
  console.log('\n══ FASE A · INDEXAR EL TEMARIO ══\n');

  const ficheros = readdirSync(PDFS).filter((f) => f.endsWith('.pdf')).sort();
  const resumen = { ok: 0, saltados: 0, fallidos: 0, fragmentos: 0, conRef: 0 };

  for (const nombre of ficheros) {
    const info = temaDelFichero(nombre);
    if (!info) { console.log(`  ?  ${nombre}: no sigue el patrón tema-NN[-N].pdf`); continue; }
    if (TEMA_UNICO && info.numero !== TEMA_UNICO) continue;

    const tema = temas.get(info.numero);
    if (!tema) {
      console.log(`  ✗  ${nombre}: el tema ${info.numero} no existe en \`subjects\``);
      resumen.fallidos++;
      continue;
    }

    // Reanudable: si ya está subido, no se vuelve a pagar el indexado.
    const { data: yaEsta } = await db
      .from('documents')
      .select('id, chunk_count')
      .eq('subject_id', tema.id)
      .eq('filename', info.fichero)
      .maybeSingle();
    if (yaEsta) {
      console.log(`  ·  ${nombre}  ya indexado (${yaEsta.chunk_count} fragmentos)`);
      resumen.saltados++;
      continue;
    }

    process.stdout.write(`  →  ${nombre}  tema ${info.numero}…`);
    try {
      const r = await indexarUno(tema.id, join(PDFS, nombre), info.fichero);
      const marca = r.indexed === r.total ? '✓' : '~';
      console.log(`\r  ${marca}  ${nombre}  ${r.indexed}/${r.total} fragmentos, ${r.conRef} con artículo${r.ensayo ? '  (ensayo)' : ''}`);
      resumen.ok++;
      resumen.fragmentos += r.indexed;
      resumen.conRef += r.conRef;
      if (r.fallos?.length) console.log(`      ${r.fallos.length} fragmentos fallaron: ${r.fallos[0]}`);
    } catch (e) {
      console.log(`\r  ✗  ${nombre}: ${e?.message ?? e}`);
      resumen.fallidos++;
    }
  }

  console.log(`\n  ${resumen.ok} indexados · ${resumen.saltados} ya estaban · ${resumen.fallidos} fallidos`);
  console.log(`  ${resumen.fragmentos} fragmentos, ${resumen.conRef} con referencia de artículo`);
  return resumen;
}

// =====================================================================
// FASE B · GENERAR LAS PREGUNTAS
// =====================================================================

/**
 * El trozo de temario del que sale una pregunta.
 *
 * Mismo criterio que `elegirContexto` en `actions/exams.ts`: se prefiere un
 * FRAGMENTO, que es un artículo con su referencia, y solo si no hay se cae a
 * una ventana del documento entero. Unos apuntes no tienen artículos, y sin ese
 * respaldo veinte temas no podrían generar ni una pregunta.
 */
const cacheFullText = new Map();

async function elegirContexto(subjectId) {
  const { count } = await db
    .from('document_chunks')
    .select('id, documents!inner(subject_id)', { count: 'exact', head: true })
    .eq('documents.subject_id', subjectId)
    .not('reference', 'is', null);

  if (count && count > 0) {
    const salto = Math.floor(Math.random() * count);
    const { data } = await db
      .from('document_chunks')
      // `documents!inner(...)` en el SELECT no es decorativo: sin declarar el
      // join, el `.eq('documents.subject_id', …)` de abajo no filtra nada y
      // PostgREST devuelve error. Se puede escribir la consulta entera bien y
      // que falle por esto.
      .select('content_chunk, reference, document_id, documents!inner(subject_id)')
      .eq('documents.subject_id', subjectId)
      .not('reference', 'is', null)
      .range(salto, salto);
    const fila = data?.[0];
    if (fila?.content_chunk && fila.content_chunk.length >= 50) {
      return { texto: fila.content_chunk, document_id: fila.document_id, legal_reference: fila.reference };
    }
  }

  // El respaldo: una ventana del documento entero, para los temas de apuntes,
  // que no tienen artículos. Se guarda en memoria porque si no se releerían
  // los mismos ~50 KB una vez por pregunta, veinte veces por tema.
  let docs = cacheFullText.get(subjectId);
  if (!docs) {
    const { data } = await db.from('documents').select('id, full_text').eq('subject_id', subjectId);
    docs = data ?? [];
    cacheFullText.set(subjectId, docs);
  }
  if (!docs.length) return null;
  const elegido = docs[Math.floor(Math.random() * docs.length)];
  const texto = elegido.full_text || '';
  if (texto.length < 50) return null;
  // Sin fragmento no hay artículo que guardar, y adivinarlo sería peor que no
  // tenerlo: ya costó una tanda entera de referencias falsas.
  return { texto: randomContextWindow(texto, 12000), document_id: elegido.id, legal_reference: null };
}

async function unaPregunta(subjectId) {
  const contexto = await elegirContexto(subjectId);
  if (!contexto) return { ok: false, motivo: 'tema sin texto indexado' };

  const res = await conReintentos(
    () => questionModel.generateContent(buildQuestionPrompt(contexto, DIFFICULTY_DEFAULT)),
    `pregunta del tema ${subjectId}`,
  );
  const parsed = parseAIJson(res.response.text());
  if (!parsed) return { ok: false, motivo: 'la IA no devolvió un JSON legible' };

  // Se valida ANTES de guardar. Un `correctIndex` fuera de rango se colapsaba
  // en "c" en silencio y el alumno estudiaba un dato falso (regla 10).
  const check = validateGeneratedQuestion(parsed);
  if (!check.ok) return { ok: false, motivo: check.reason };

  return { ok: true, data: { ...check.value, ...contexto } };
}

async function faseGenerar(temas) {
  console.log(`\n══ FASE B · GENERAR ${POR_TEMA} PREGUNTAS POR TEMA ══\n`);

  const resumen = { insertadas: 0, duplicadas: 0, fallidas: 0, temasSinTexto: 0 };

  for (const [numero, tema] of [...temas].sort((a, b) => a[0] - b[0])) {
    if (TEMA_UNICO && numero !== TEMA_UNICO) continue;

    const { count: docs } = await db
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('subject_id', tema.id);
    if (!docs) {
      console.log(`  ·  Tema ${String(numero).padStart(2)}  sin documentos: no se puede generar`);
      resumen.temasSinTexto++;
      continue;
    }

    // Ya sembrado: no se vuelve a pagar.
    const { count: yaHay } = await db
      .from('question_bank')
      .select('id', { count: 'exact', head: true })
      .eq('subject_id', tema.id);
    if ((yaHay ?? 0) >= POR_TEMA) {
      console.log(`  ·  Tema ${String(numero).padStart(2)}  ya tiene ${yaHay} preguntas`);
      continue;
    }
    const faltan = POR_TEMA - (yaHay ?? 0);

    if (ENSAYO) {
      console.log(`  →  Tema ${String(numero).padStart(2)}  generaría ${faltan}  ${tema.title.slice(0, 44)}`);
      continue;
    }

    let ins = 0, dup = 0, fall = 0;
    for (let i = 0; i < faltan; i++) {
      process.stdout.write(`\r  →  Tema ${String(numero).padStart(2)}  ${i + 1}/${faltan}`);
      let r;
      try {
        r = await unaPregunta(tema.id);
      } catch (e) {
        fall++;
        continue;
      }
      if (!r.ok) { fall++; continue; }

      const d = r.data;
      const hash = questionHash(tema.id, d.question, d.correctIndex);
      // `ignoreDuplicates`: volver a lanzar el guion no debe tocar las filas que
      // ya existen. Con un upsert normal, una pregunta descartada en moderación
      // resucitaba y una editada a mano perdía las correcciones (regla 3).
      const { data: fila, error } = await db
        .from('question_bank')
        .upsert(
          {
            subject_id: tema.id,
            document_id: d.document_id,
            question_text: d.question,
            options: d.options,
            correct_index: d.correctIndex,
            explanation: d.explanation,
            question_hash: hash,
            difficulty_level: DIFFICULTY_DEFAULT,
            legal_reference: d.legal_reference,
            status: QUESTION_STATUS.ACTIVE,
            origin: QUESTION_ORIGIN.BANK_SEED,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'question_hash', ignoreDuplicates: true },
        )
        .select()
        .maybeSingle();

      if (error) fall++;
      else if (fila) ins++;
      else dup++;

      await espera(400);
    }

    console.log(`\r  ✓  Tema ${String(numero).padStart(2)}  ${ins} nuevas, ${dup} repetidas, ${fall} fallidas   ${tema.title.slice(0, 40)}`);
    resumen.insertadas += ins;
    resumen.duplicadas += dup;
    resumen.fallidas += fall;
  }

  console.log(`\n  ${resumen.insertadas} preguntas nuevas · ${resumen.duplicadas} repetidas · ${resumen.fallidas} fallidas`);
  if (resumen.temasSinTexto) console.log(`  ${resumen.temasSinTexto} temas sin documento: indexa primero`);
  return resumen;
}

// =====================================================================
// COMPROBAR LOS PDF SIN TOCAR NADA
// =====================================================================

/**
 * Lee los 51 PDF y los trocea con `chunkDocument`, la misma función que usa la
 * aplicación al subir uno por el panel. No llama a Supabase ni a Gemini.
 *
 * Sirve para ver, antes de gastar nada, si algún documento va a entrar vacío o
 * sin referencias de artículo. Es exactamente el fallo que dejó el tema 9 con
 * 108.233 caracteres y CERO fragmentos durante meses sin que nadie lo supiera.
 */
async function comprobarPdfs() {
  const ficheros = readdirSync(PDFS).filter((f) => f.endsWith('.pdf')).sort();
  console.log(`\nComprobando ${ficheros.length} PDF sin tocar la base de datos ni la IA.\n`);

  let totalFrag = 0, totalRef = 0, mudos = 0, sinArticulos = 0;
  for (const nombre of ficheros) {
    const info = temaDelFichero(nombre);
    if (!info) { console.log(`  ?  ${nombre}: no sigue el patrón tema-NN[-N].pdf`); continue; }
    if (TEMA_UNICO && info.numero !== TEMA_UNICO) continue;
    try {
      const limpio = cleanLegalText(await textoDelPdf(join(PDFS, nombre)));
      const frag = chunkDocument(limpio);
      const conRef = frag.filter((f) => f.reference !== null).length;
      totalFrag += frag.length;
      totalRef += conRef;
      if (frag.length === 0) { mudos++; console.log(`  ✗  ${nombre}  ${limpio.length} caracteres y CERO fragmentos: entraría mudo`); continue; }
      if (conRef === 0) sinArticulos++;
      console.log(`  ${conRef === 0 ? '~' : '✓'}  ${nombre}  ${String(frag.length).padStart(4)} fragmentos, ${String(conRef).padStart(4)} con artículo`);
    } catch (e) {
      mudos++;
      console.log(`  ✗  ${nombre}: ${e?.message ?? e}`);
    }
  }

  console.log(`\n  ${totalFrag} fragmentos en total, ${totalRef} con referencia de artículo`);
  console.log(`  ${sinArticulos} documentos sin ni un artículo (apuntes: es lo esperado)`);
  console.log(mudos === 0 ? '  Ninguno entraría vacío.\n' : `  ⚠  ${mudos} entrarían vacíos o no se pueden leer.\n`);
}

// =====================================================================

async function main() {
  if (SOLO_PDFS) { await comprobarPdfs(); return; }

  console.log(`\nProyecto: ${URL}`);
  if (ENSAYO) console.log('Ensayo: no se escribe nada ni se llama a la IA para guardar.');

  const { data: filas, error } = await db.from('subjects').select('id, topic_number, title');
  if (error) { console.error(`No se pudo leer \`subjects\`: ${error.message}`); process.exit(1); }
  if (!filas?.length) {
    console.error('`subjects` está vacía. Los temas tienen que existir antes de indexar nada.');
    process.exit(1);
  }
  const temas = new Map(filas.map((f) => [f.topic_number, f]));
  console.log(`Temas dados de alta: ${temas.size}`);

  if (!SOLO_PREGUNTAS) await faseIndexar(temas);
  if (!SOLO_INDEXAR) await faseGenerar(temas);

  // El recuento final se lee de la base de datos, no de los contadores del
  // guion: lo que importa es lo que hay, no lo que creemos haber escrito.
  const { count: docs } = await db.from('documents').select('id', { count: 'exact', head: true });
  const { count: chunks } = await db.from('document_chunks').select('id', { count: 'exact', head: true });
  const { count: preguntas } = await db
    .from('question_bank')
    .select('id', { count: 'exact', head: true })
    .eq('status', QUESTION_STATUS.ACTIVE);

  console.log('\n══ ESTADO FINAL, LEÍDO DE LA BASE DE DATOS ══');
  console.log(`  documentos indexados : ${docs ?? 0}`);
  console.log(`  fragmentos           : ${chunks ?? 0}`);
  console.log(`  preguntas activas    : ${preguntas ?? 0}`);

  // Cuántos temas se quedan sin banco: es el dato que dice si un alumno puede
  // estudiar de verdad o solo mirar el menú.
  const { data: conBanco } = await db.from('question_bank').select('subject_id').eq('status', QUESTION_STATUS.ACTIVE);
  const cubiertos = new Set((conBanco ?? []).map((q) => q.subject_id)).size;
  console.log(`  temas con preguntas  : ${cubiertos} de ${temas.size}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });

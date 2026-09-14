/**
 * SEMBRAR EL BANCO SEGÚN EL PESO REAL DEL EXAMEN, NO A CIFRA PLANA.
 *
 * `npm run sembrar` reparte el banco igual en los 45 temas (~40 cada uno),
 * sin mirar si ese tema cae 32 veces en el examen real o 1. Este guion hace
 * lo que se decidió con el dueño: más donde de verdad pesa, nada de más donde
 * es "paja" — y dentro de los temas importantes, más profundo en los que
 * tienen más artículos que examinar, no una cifra de tema igual para todos.
 *
 * TRES FRANJAS, por `PESO_EXAMEN_REAL` (regla 73, de los 5 exámenes oficiales
 * 2021-2025):
 *
 *   · PESO ≤ 7   ("paja")       → NO SE TOCA. Lo que ya hay es de sobra.
 *   · PESO 8-14  ("normal")     → objetivo plano: 55 preguntas.
 *   · PESO ≥ 16  ("importante") → objetivo POR ARTÍCULO: cada artículo
 *     indexado del tema pide 3-5 preguntas con ángulos distintos (definición,
 *     excepción, plazo/sanción, sujeto), según cuánto pesa el tema. Sin
 *     artículos (apuntes: UE, Ciberdelincuencia), objetivo plano de 80.
 *
 * POR QUÉ POR ARTÍCULO Y NO POR TEMA
 * Medido contra la BD real: Derecho Procesal Penal (peso 18) tiene 149
 * artículos indexados; Funcionarios Públicos (peso 25) solo 20. Una cifra
 * plana de "100 por tema importante" deja al primero con menos de 1 pregunta
 * por artículo, y al segundo sobrado (5-6). El suelo por artículo corrige
 * los dos a la vez.
 *
 * COBERTURA, NO AZAR PURO
 * `elegirContexto` (en `exams.ts` y en `sembrar.mjs`) elige el artículo AL
 * AZAR: con 149 artículos y unos cientos de tiradas, unos salen muchas veces
 * y otros ninguna. Este guion, SOLO en la franja "importante", elige el
 * artículo MENOS cubierto hasta ahora (cuenta las preguntas activas que ya
 * tiene cada `legal_reference` y tira del que menos tiene) — así el suelo por
 * artículo se cumple de verdad, no por suerte.
 *
 * LOS TEMAS 46-50 (LOS EXÁMENES OFICIALES) NUNCA SON FUENTE
 * Ni de peso plano ni de nada: `PESO_EXAMEN_REAL` solo tiene claves 1-45, y
 * este guion no toca subject_id fuera de ese rango. Es la misma regla que ya
 * aplica el servidor (`esFuenteDeGeneracionValida`, `exams.ts`).
 *
 * ES REANUDABLE: si se corta, se relanza y sigue por donde iba — cada tema
 * vuelve a comprobar cuántas preguntas tiene ya antes de generar ninguna.
 *
 * USO
 *   npm run sembrar:peso -- --ensayo          qué haría, sin gastar nada
 *   npm run sembrar:peso -- --tema=21         un tema suelto
 *   npm run sembrar:peso -- --concurrencia=3  por defecto 3
 */
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from 'dotenv';
import { normalizeSupabaseUrl } from '../../app/lib/supabase-url.ts';

import { questionHash } from '../../app/lib/question-hash.ts';
import { parseAIJson, validateGeneratedQuestion, randomContextWindow } from '../../app/lib/ai-output.ts';
import { QUESTION_STATUS, QUESTION_ORIGIN, DIFFICULTY_DEFAULT } from '../../app/lib/questions.ts';
import { buildQuestionPrompt, QUESTION_SCHEMA } from '../../app/lib/question-prompt.ts';
import { PESO_EXAMEN_REAL } from '../../app/lib/exam-weight-data.ts';

config({ path: '.env.local' });

const URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI = process.env.GEMINI_API_KEY;

if (!URL || !KEY || !GEMINI) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o GEMINI_API_KEY en .env.local');
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });
const genAI = new GoogleGenerativeAI(GEMINI);
const questionModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: { responseMimeType: 'application/json', responseSchema: QUESTION_SCHEMA },
});

const args = process.argv.slice(2);
const tiene = (f) => args.includes(f);
const valor = (f, pordefecto) => {
  const a = args.find((x) => x.startsWith(`--${f}=`));
  return a ? a.split('=')[1] : pordefecto;
};
const ENSAYO = tiene('--ensayo');
const TEMA_UNICO = valor('tema', null) ? parseInt(valor('tema'), 10) : null;
const CONCURRENCIA = Math.max(1, Math.min(5, parseInt(valor('concurrencia', '3'), 10) || 3));

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Reintenta lo que falla por límite de tasa, esperando cada vez más. */
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

// =====================================================================
// LAS TRES FRANJAS
// =====================================================================

/** Ángulos por artículo según cuánto pesa el tema en el examen real. */
function anguloPorPeso(peso) {
  if (peso >= 25) return 5;
  if (peso >= 20) return 4;
  return 3; // 16-19
}

/** `null` = franja "paja": no se toca. */
function franjaDelTema(peso) {
  if (peso == null || peso <= 7) return null;
  if (peso <= 14) return 'normal';
  return 'importante';
}

/** Artículos distintos indexados del tema, con sus fragmentos (puede haber más de uno por artículo). */
async function articulosDelTema(subjectId) {
  const { data } = await db
    .from('document_chunks')
    .select('content_chunk, reference, document_id, documents!inner(subject_id)')
    .eq('documents.subject_id', subjectId)
    .not('reference', 'is', null);
  const porReferencia = new Map();
  for (const fila of data ?? []) {
    if (!fila.content_chunk || fila.content_chunk.length < 50) continue;
    const lista = porReferencia.get(fila.reference) ?? [];
    lista.push({ texto: fila.content_chunk, document_id: fila.document_id });
    porReferencia.set(fila.reference, lista);
  }
  return porReferencia;
}

/** Cuántas preguntas activas y globales tiene ya cada artículo del tema. */
async function coberturaActual(subjectId) {
  const { data } = await db
    .from('question_bank')
    .select('legal_reference')
    .eq('subject_id', subjectId)
    .eq('status', QUESTION_STATUS.ACTIVE)
    .is('organization_id', null)
    .not('legal_reference', 'is', null);
  const mapa = new Map();
  for (const fila of data ?? []) {
    mapa.set(fila.legal_reference, (mapa.get(fila.legal_reference) ?? 0) + 1);
  }
  return mapa;
}

/**
 * Calcula el objetivo del tema. En la franja "importante", si el tema no
 * tiene artículos (apuntes: UE, Ciberdelincuencia) cae a un objetivo plano.
 */
async function objetivoDelTema(subjectId, peso) {
  const franja = franjaDelTema(peso);
  if (!franja) return { franja: null, objetivo: null, porReferencia: null };
  if (franja === 'normal') return { franja, objetivo: 55, porReferencia: null };

  const porReferencia = await articulosDelTema(subjectId);
  if (porReferencia.size === 0) return { franja, objetivo: 80, porReferencia: null };

  const objetivo = porReferencia.size * anguloPorPeso(peso);
  return { franja, objetivo, porReferencia };
}

// =====================================================================
// GENERAR UNA PREGUNTA
// =====================================================================

/**
 * Elige el artículo MENOS cubierto todavía (no al azar). Con empate, al azar
 * entre los empatados. Cae a `null` si el tema no tiene artículos (se usa el
 * respaldo de ventana sobre el documento entero, igual que `elegirContexto`).
 */
function elegirArticuloMenosCubierto(porReferencia, cobertura) {
  let min = Infinity;
  let candidatos = [];
  for (const ref of porReferencia.keys()) {
    const n = cobertura.get(ref) ?? 0;
    if (n < min) { min = n; candidatos = [ref]; }
    else if (n === min) candidatos.push(ref);
  }
  if (candidatos.length === 0) return null;
  const ref = candidatos[Math.floor(Math.random() * candidatos.length)];
  const fragmentos = porReferencia.get(ref);
  const fragmento = fragmentos[Math.floor(Math.random() * fragmentos.length)];
  return { texto: fragmento.texto, document_id: fragmento.document_id, legal_reference: ref };
}

const cacheFullText = new Map();

/** Respaldo para temas sin artículos: ventana del documento entero (igual que `sembrar.mjs`). */
async function contextoDeApuntes(subjectId) {
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
  return { texto: randomContextWindow(texto, 12000), document_id: elegido.id, legal_reference: null };
}

async function unaPregunta(subjectId, porReferencia, cobertura) {
  const contexto = porReferencia
    ? elegirArticuloMenosCubierto(porReferencia, cobertura)
    : await contextoDeApuntes(subjectId);
  if (!contexto) return { ok: false, motivo: 'tema sin texto indexado' };

  const res = await conReintentos(
    () => questionModel.generateContent(buildQuestionPrompt(contexto, DIFFICULTY_DEFAULT)),
    `pregunta del tema ${subjectId}`,
  );
  const parsed = parseAIJson(res.response.text());
  if (!parsed) return { ok: false, motivo: 'la IA no devolvió un JSON legible' };

  const check = validateGeneratedQuestion(parsed);
  if (!check.ok) return { ok: false, motivo: check.reason };

  return { ok: true, data: { ...check.value, ...contexto } };
}

async function runWithConcurrency(n, concurrency, worker) {
  let siguiente = 0;
  async function runner() {
    while (siguiente < n) {
      const idx = siguiente++;
      await worker(idx);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runner));
}

// =====================================================================
// UN TEMA ENTERO
// =====================================================================

async function sembrarTema(tema, peso) {
  const { franja, objetivo, porReferencia } = await objetivoDelTema(tema.id, peso);

  if (!franja) {
    console.log(`  ·  Tema ${String(tema.topic_number).padStart(2)}  peso ${String(peso ?? 0).padStart(2)}  "paja" — no se toca   ${tema.title.slice(0, 40)}`);
    return { insertadas: 0, duplicadas: 0, fallidas: 0 };
  }

  const { count: yaHay } = await db
    .from('question_bank')
    .select('id', { count: 'exact', head: true })
    .eq('subject_id', tema.id)
    .eq('status', QUESTION_STATUS.ACTIVE)
    .is('organization_id', null);

  const faltan = Math.max(0, objetivo - (yaHay ?? 0));
  const etiqueta = franja === 'importante' ? 'importante' : 'normal';

  if (faltan === 0) {
    console.log(`  ·  Tema ${String(tema.topic_number).padStart(2)}  ${etiqueta.padEnd(10)}  ya tiene ${yaHay}/${objetivo}   ${tema.title.slice(0, 40)}`);
    return { insertadas: 0, duplicadas: 0, fallidas: 0 };
  }

  if (ENSAYO) {
    console.log(`  →  Tema ${String(tema.topic_number).padStart(2)}  ${etiqueta.padEnd(10)}  generaría ${faltan} (objetivo ${objetivo}, hay ${yaHay ?? 0})   ${tema.title.slice(0, 40)}`);
    return { insertadas: 0, duplicadas: 0, fallidas: 0 };
  }

  // La cobertura por artículo se carga UNA vez y se actualiza en memoria: sin
  // esto habría que releerla en cada pregunta, y con concurrencia >1 el dato
  // ya estaría desactualizado antes de usarlo.
  const cobertura = porReferencia ? await coberturaActual(tema.id) : null;

  let ins = 0, dup = 0, fall = 0, hechas = 0;
  await runWithConcurrency(faltan, CONCURRENCIA, async () => {
    let r;
    try {
      r = await unaPregunta(tema.id, porReferencia, cobertura);
    } catch (e) {
      fall++;
      hechas++;
      return;
    }
    hechas++;
    process.stdout.write(`\r  →  Tema ${String(tema.topic_number).padStart(2)}  ${etiqueta.padEnd(10)}  ${hechas}/${faltan}`);
    if (!r.ok) { fall++; return; }

    const d = r.data;
    if (porReferencia && d.legal_reference) {
      cobertura.set(d.legal_reference, (cobertura.get(d.legal_reference) ?? 0) + 1);
    }

    const hash = questionHash(tema.id, d.question, d.correctIndex);
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

    await espera(300);
  });

  console.log(`\r  ✓  Tema ${String(tema.topic_number).padStart(2)}  ${etiqueta.padEnd(10)}  ${ins} nuevas, ${dup} repetidas, ${fall} fallidas   (objetivo ${objetivo})   ${tema.title.slice(0, 36)}`);
  return { insertadas: ins, duplicadas: dup, fallidas: fall };
}

// =====================================================================

async function main() {
  console.log(`\nProyecto: ${URL}`);
  if (ENSAYO) console.log('Ensayo: no se escribe nada ni se llama a la IA.');
  console.log(`Concurrencia: ${CONCURRENCIA}\n`);

  const { data: filas, error } = await db
    .from('subjects')
    .select('id, topic_number, title')
    .lte('topic_number', 45) // los exámenes oficiales (46-50) nunca son fuente
    .order('topic_number');
  if (error) { console.error(`No se pudo leer \`subjects\`: ${error.message}`); process.exit(1); }

  // Importantes primero: si se corta a la mitad, lo más valioso ya está.
  const ordenados = [...filas].sort(
    (a, b) => (PESO_EXAMEN_REAL[b.topic_number] ?? 0) - (PESO_EXAMEN_REAL[a.topic_number] ?? 0),
  );

  const resumen = { insertadas: 0, duplicadas: 0, fallidas: 0 };
  for (const tema of ordenados) {
    if (TEMA_UNICO && tema.topic_number !== TEMA_UNICO) continue;
    const peso = PESO_EXAMEN_REAL[tema.topic_number] ?? 0;
    const r = await sembrarTema(tema, peso);
    resumen.insertadas += r.insertadas;
    resumen.duplicadas += r.duplicadas;
    resumen.fallidas += r.fallidas;
  }

  console.log(`\n  ${resumen.insertadas} preguntas nuevas · ${resumen.duplicadas} repetidas · ${resumen.fallidas} fallidas`);

  const { count: total } = await db
    .from('question_bank')
    .select('id', { count: 'exact', head: true })
    .eq('status', QUESTION_STATUS.ACTIVE)
    .is('organization_id', null);
  console.log(`  banco global activo: ${total ?? 0} preguntas\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });

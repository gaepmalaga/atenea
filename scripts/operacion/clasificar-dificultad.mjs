/**
 * CLASIFICAR LA DIFICULTAD DE LAS PREGUNTAS CON GEMINI (docs/DIFICULTAD.md).
 *
 * Gemini solo funciona en producción: se lanza desde el flujo «Operación» de
 * GitHub Actions, que tiene la clave. Aquí no hay claves.
 *
 * TRES MODOS, de menos a más
 *   --muestra   Clasifica las 150 de `docs/dificultad/muestra-claude.json`, las
 *               compara con la clasificación a mano y dice si el acuerdo
 *               alcanza el criterio (`CRITERIO_ACUERDO`, fijado antes de mirar).
 *               NO escribe nada en la base de datos.
 *   --todas     SIN `--hazlo`: cuenta las preguntas, estima el coste y no llama
 *               a Gemini ni escribe nada.
 *   --todas --hazlo
 *               Clasifica todas las activas y guarda `difficulty_level` y
 *               `difficulty_source = 'estimada'`. Se niega si no ha pasado la
 *               muestra (`--muestra-ok`) o si la columna `difficulty_source`
 *               no existe. NUNCA pisa una dificultad puesta por el preparador
 *               ni una medida (`difficulty_source` distinto de null/estimada).
 *
 * Con `--sin-llamar` el modo muestra solo enseña qué haría y cuánto costaría.
 */
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { normalizeSupabaseUrl } from '../../app/lib/supabase-url.ts';
import { calculaGasto } from '../../app/lib/ai-usage.ts';
import {
  RUBRICA, DIFICULTAD_SCHEMA, promptDeTanda, leeNiveles, acuerdo, reparto, sirveParaClasificar, costeEstimado, CRITERIO_ACUERDO,
} from '../../app/lib/dificultad.ts';

config({ path: '.env.local' });

const args = process.argv.slice(2);
const tiene = (f) => args.includes(f);
const valor = (f, por) => { const a = args.find((x) => x.startsWith(`--${f}=`)); return a ? a.split('=')[1] : por; };

const MUESTRA = tiene('--muestra');
const TODAS = tiene('--todas');
const HAZLO = tiene('--hazlo');
const SIN_LLAMAR = tiene('--sin-llamar');
const MUESTRA_OK = tiene('--muestra-ok');
const TANDA = Math.max(1, Math.min(20, parseInt(valor('tanda', '10'), 10) || 10));
const CONCURRENCIA = Math.max(1, Math.min(5, parseInt(valor('concurrencia', '3'), 10) || 3));
const MODELO = 'gemini-3.5-flash-lite';

if (MUESTRA === TODAS) {
  console.error('Elige UN modo: --muestra o --todas.');
  process.exit(1);
}

const URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI = process.env.GEMINI_API_KEY;
const llamaAGemini = !SIN_LLAMAR && !(TODAS && !HAZLO);
if (!URL || !KEY || (llamaAGemini && !GEMINI)) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY' + (llamaAGemini ? ' o GEMINI_API_KEY' : '') + '.');
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });
const modelo = llamaAGemini
  ? new GoogleGenerativeAI(GEMINI).getGenerativeModel({
      model: MODELO,
      systemInstruction: RUBRICA,
      // Sin `temperature`: Gemini 3 ya no la admite (`ai-usage.test.ts`).
      generationConfig: { responseMimeType: 'application/json', responseSchema: DIFICULTAD_SCHEMA },
    })
  : null;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function conReintentos(fn, intentos = 5) {
  let ultimo;
  for (let i = 0; i < intentos; i++) {
    try { return await fn(); } catch (e) {
      ultimo = e;
      if (!/429|quota|rate|RESOURCE_EXHAUSTED|503|overloaded/i.test(String(e?.message ?? e)) || i === intentos - 1) throw e;
      await espera(2000 * 2 ** i);
    }
  }
  throw ultimo;
}

// ---- Leer del banco -------------------------------------------------------

async function leeBanco(ids) {
  const filas = [];
  if (ids) {
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await db.from('question_bank')
        .select('id, subject_id, question_text, options, correct_index, difficulty_level').in('id', ids.slice(i, i + 100));
      if (error) { console.error('No se pudo leer el banco:', error.message); process.exit(1); }
      filas.push(...(data ?? []));
    }
  } else {
    // PostgREST corta a 1.000 sin avisar (regla 74).
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await db.from('question_bank')
        .select('id, subject_id, question_text, options, correct_index, difficulty_level')
        .eq('status', 'active').order('id').range(desde, desde + 999);
      if (error) { console.error('No se pudo leer el banco:', error.message); process.exit(1); }
      filas.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
  }
  const { data: temas } = await db.from('subjects').select('id, title, topic_number');
  const titulo = new Map((temas ?? []).map((t) => [t.id, t.topic_number ? `T${t.topic_number} · ${t.title}` : t.title]));
  return filas
    .filter((f) => Array.isArray(f.options) && f.options.length >= 2 && typeof f.correct_index === 'number')
    .map((f) => ({ ...f, tema: titulo.get(f.subject_id) ?? 'Sin tema' }));
}

// ---- Clasificar -----------------------------------------------------------

const gastado = { entrada: 0, salida: 0 };

/** Clasifica una lista de preguntas del banco. Devuelve id → nivel (o null). */
async function clasifica(preguntas) {
  const resultado = new Map();
  const tandas = [];
  for (let i = 0; i < preguntas.length; i += TANDA) tandas.push(preguntas.slice(i, i + TANDA));
  let hechas = 0;

  async function una(lista) {
    const pedidas = lista.map((p, i) => ({
      n: i + 1, tema: p.tema, pregunta: p.question_text, opciones: p.options.map(String), correcta: p.correct_index,
    }));
    try {
      const r = await conReintentos(() => modelo.generateContent(promptDeTanda(pedidas)));
      gastado.entrada += r.response.usageMetadata?.promptTokenCount ?? 0;
      gastado.salida += r.response.usageMetadata?.candidatesTokenCount ?? 0;
      let raw = null;
      try { raw = JSON.parse(r.response.text()); } catch { /* queda null: ninguna clasificada */ }
      const { niveles } = leeNiveles(raw, pedidas.map((x) => x.n));
      lista.forEach((p, i) => resultado.set(p.id, niveles.get(i + 1) ?? null));
    } catch (e) {
      console.log(`      · una tanda falló (${String(e?.message ?? e).slice(0, 80)}): sus preguntas quedan sin nivel`);
      lista.forEach((p) => resultado.set(p.id, null));
    }
    hechas += lista.length;
    if (hechas % 100 < TANDA) console.log(`   ${hechas}/${preguntas.length}`);
  }

  let cursor = 0;
  await Promise.all(Array.from({ length: CONCURRENCIA }, async () => {
    while (cursor < tandas.length) await una(tandas[cursor++]);
  }));
  return resultado;
}

const dolares = (n) => `$${n.toFixed(4)}`;
const tabla = (m) => ['        el modelo →   1     2     3', ...m.map((f, i) => `   referencia ${i + 1}  ${f.map((x) => String(x).padStart(5)).join(' ')}`)].join('\n');

// ---- La muestra ----------------------------------------------------------

if (MUESTRA) {
  const ruta = 'docs/dificultad/muestra-claude.json';
  const referencia = new Map(JSON.parse(readFileSync(ruta, 'utf-8')).map((x) => [x.id, x.nivel]));
  const preguntas = await leeBanco([...referencia.keys()]);
  console.log(`Muestra: ${referencia.size} preguntas en el fichero, ${preguntas.length} encontradas en el banco.`);
  const est = costeEstimado(preguntas.length, TANDA);
  console.log(`Coste estimado: ${est.llamadas} llamadas · ${dolares(est.coste)}`);
  if (SIN_LLAMAR) { console.log('\n--sin-llamar: no se llama a Gemini.'); process.exit(0); }

  const modeloNiveles = await clasifica(preguntas);
  const sinNivel = [...modeloNiveles.values()].filter((n) => n === null).length;
  const a = acuerdo(referencia, modeloNiveles);
  const v = sirveParaClasificar(a);
  const real = calculaGasto({ promptTokenCount: gastado.entrada, candidatesTokenCount: gastado.salida });

  console.log(`\n=== ACUERDO CON LA CLASIFICACIÓN A MANO ===`);
  console.log(`Comparadas: ${a.comparadas} (sin nivel del modelo: ${sinNivel})`);
  console.log(`Coinciden: ${a.coinciden} (${a.porcentajeExacto} %) · a un nivel: ${a.diferenUno} · a dos niveles: ${a.diferenDos}`);
  console.log(`Sesgo: ${a.sesgo} niveles (positivo = el modelo es más duro)`);
  console.log(`Reparto a mano: ${JSON.stringify(reparto(referencia.values()))} · el modelo: ${JSON.stringify(reparto(modeloNiveles.values()))}`);
  console.log(tabla(a.matriz));
  console.log(`\nCriterio (fijado antes de mirar): exacto ≥ ${CRITERIO_ACUERDO.exactoMinimo} %, dos niveles ≤ ${CRITERIO_ACUERDO.dosNivelesMaximo} %, |sesgo| ≤ ${CRITERIO_ACUERDO.sesgoMaximo}`);
  console.log(v.ok ? 'RESULTADO: SIRVE para clasificar el banco.' : `RESULTADO: NO SIRVE todavía:\n  - ${v.motivos.join('\n  - ')}`);
  console.log(`Gasto real: ${dolares(real.coste)}`);

  // Las que difieren a dos niveles, para afinar la rúbrica mirándolas.
  const graves = preguntas.filter((p) => { const r = referencia.get(p.id), m = modeloNiveles.get(p.id); return r && m && Math.abs(r - m) === 2; });
  if (graves.length) {
    console.log(`\n--- Diferencias de dos niveles (${graves.length}) ---`);
    for (const p of graves.slice(0, 15)) {
      console.log(`  [mano ${referencia.get(p.id)} · modelo ${modeloNiveles.get(p.id)}] ${p.tema}\n    ${String(p.question_text).slice(0, 160)}`);
    }
  }

  const salida = preguntas.map((p) => ({ id: p.id, tema: p.tema, mano: referencia.get(p.id) ?? null, gemini: modeloNiveles.get(p.id) ?? null }));
  if (existsSync('docs/dificultad')) {
    writeFileSync('docs/dificultad/muestra-gemini.json', JSON.stringify(salida, null, 1) + '\n');
    console.log('\nGuardado en docs/dificultad/muestra-gemini.json');
  }
  console.log('\n=== JSON (por si el fichero no se puede guardar, como en Actions) ===');
  console.log(JSON.stringify(salida.map((x) => [x.id, x.mano, x.gemini])));
  process.exit(0);
}

// ---- Todas ---------------------------------------------------------------

// ¿Existe la columna `difficulty_source`? Sin ella no se escribe nada.
const sonda = await db.from('question_bank').select('difficulty_source').limit(1);
const hayOrigen = !sonda.error;

const banco = await leeBanco(null);
const est = costeEstimado(banco.length, TANDA);
console.log(`Preguntas activas: ${banco.length} · reparto actual: ${JSON.stringify(reparto(banco.map((b) => b.difficulty_level)))}`);
console.log(`Coste estimado: ${est.llamadas} llamadas · ${dolares(est.coste)} (a propósito por arriba)`);
console.log(`Columna difficulty_source: ${hayOrigen ? 'existe' : 'NO EXISTE (docs/sql/dificultad-origen.sql)'}`);

if (!HAZLO) { console.log('\nEnsayo: no se llama a Gemini ni se escribe nada. Añade --hazlo --muestra-ok para clasificar.'); process.exit(0); }
if (!MUESTRA_OK) { console.error('\nNo. Antes pasa la muestra (--muestra) y, si sirve, repite con --muestra-ok.'); process.exit(1); }
if (!hayOrigen) { console.error('\nNo. Falta la columna difficulty_source: sin ella no se puede distinguir lo estimado de lo que puso el preparador.'); process.exit(1); }

// Solo lo que nadie ha tocado: sin origen o ya estimada. Lo del preparador y lo medido, no.
const { data: origenes, error: errOrigen } = await db.from('question_bank').select('id, difficulty_source').eq('status', 'active').not('difficulty_source', 'is', null).neq('difficulty_source', 'estimada');
if (errOrigen) { console.error('No se pudo leer el origen:', errOrigen.message); process.exit(1); }
const protegidas = new Set((origenes ?? []).map((o) => o.id));
const aClasificar = banco.filter((b) => !protegidas.has(b.id));
console.log(`Protegidas (puestas por el preparador o medidas): ${protegidas.size} · a clasificar: ${aClasificar.length}`);

const niveles = await clasifica(aClasificar);
let escritas = 0, fallidas = 0;
for (const [id, nivel] of niveles) {
  if (nivel === null) continue;
  const { error } = await db.from('question_bank').update({ difficulty_level: nivel, difficulty_source: 'estimada' }).eq('id', id);
  if (error) fallidas++; else escritas++;
}
const sin = [...niveles.values()].filter((n) => n === null).length;
const real = calculaGasto({ promptTokenCount: gastado.entrada, candidatesTokenCount: gastado.salida });
console.log(`\nEscritas: ${escritas} · sin nivel del modelo (se dejan como estaban): ${sin} · fallos al escribir: ${fallidas}`);
console.log(`Reparto nuevo: ${JSON.stringify(reparto(niveles.values()))} · gasto real ${dolares(real.coste)}`);

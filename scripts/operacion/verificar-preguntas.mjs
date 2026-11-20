/**
 * EL REPASO DE LAS PREGUNTAS CONTRA LA LEY (regla 138, fase 2; la lógica en
 * `app/lib/verificacion.ts`).
 *
 * Para cada pregunta activa que nadie ha revisado y de la que se sabe con
 * seguridad de qué artículo sale, una IA la compara con el texto VIGENTE del
 * BOE. Las que no cuadran («incorrecta» o «dudosa») reciben un aviso «La IA
 * duda» en «Revisión», para que los tutores empiecen por ellas. No cambia
 * ninguna pregunta.
 *
 *   npm run verificar                       ENSAYO: cuántas se pueden repasar y cuánto costaría. Gratis.
 *   npm run verificar -- --muestra=30       repasa 30 y enseña lo que dice, sin escribir. Unos céntimos.
 *   npm run verificar -- --hazlo            repasa todas y deja los avisos. Unos euros.
 *   npm run verificar -- --hazlo --limite=500
 *
 * Una pregunta que ya tuvo un aviso de la IA (abierto o archivado) no se
 * vuelve a repasar. Necesita la clave de servicio, la de Gemini y el BOE: va
 * por «Operación».
 */
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from 'dotenv';
import { appendFile } from 'node:fs/promises';
import { normalizeSupabaseUrl } from '../../app/lib/supabase-url.ts';
import { calculaGasto } from '../../app/lib/ai-usage.ts';
import { urlBoe, preceptoLegible } from '../../app/lib/normativa.ts';
import {
  INSTRUCCION_VERIFICAR, VERIFICACION_SCHEMA, TIPO_REPORTE_REVISION_IA, leeVeredicto, promptDeVerificacion, avisoDeVerificacion, costeVerificacion,
} from '../../app/lib/verificacion.ts';
import { preparaCitas } from './citas-banco.mjs';

config({ path: '.env.local' });

const args = process.argv.slice(2);
const valor = (f) => args.find((x) => x.startsWith(`--${f}=`))?.split('=')[1];
const HAZLO = args.includes('--hazlo');
const MUESTRA = Number(valor('muestra') ?? 0);
const LIMITE = Number(valor('limite') ?? 0);
const CONCURRENCIA = 3;
const MODELO = 'gemini-3.5-flash-lite';
const llama = HAZLO || MUESTRA > 0;

const URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI = process.env.GEMINI_API_KEY;
if (!URL || !KEY || (llama && !GEMINI)) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY' + (llama ? ' o GEMINI_API_KEY' : '') + '.'); process.exit(1); }
const db = createClient(URL, KEY, { auth: { persistSession: false } });

async function todas(pedir, etiqueta) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await pedir(desde, desde + 999);
    if (error) { console.error(`No se pudo leer ${etiqueta}:`, error.message); process.exit(1); }
    filas.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return filas;
}

// 1. Las activas sin revisar que no han tenido ya un aviso de la IA.
const preguntas = await todas(
  (d, h) => db.from('question_bank')
    .select('id, organization_id, subject_id, document_id, question_text, options, correct_index, explanation, legal_reference')
    .eq('status', 'active').is('reviewed_at', null).order('id').range(d, h),
  'question_bank',
);
const yaAvisadas = new Set((await todas(
  (d, h) => db.from('question_reports').select('id, question_id').eq('report_type', TIPO_REPORTE_REVISION_IA).order('id').range(d, h),
  'question_reports',
)).map((r) => r.question_id));

// 2. De qué artículo sale cada una, con su texto vigente.
const ctx = await preparaCitas(db, preguntas);
const repasables = [];
let sinCita = 0;
for (const q of preguntas) {
  if (yaAvisadas.has(q.id)) continue;
  const cita = ctx.citaDe(q);
  const art = cita ? ctx.textoDe(cita.boe, cita.precepto) : null;
  if (!cita || !art || art.texto.length < 40) { sinCita++; continue; }
  repasables.push({ q, cita, art });
}
console.log(`Activas sin revisar: ${preguntas.length} · ya con aviso de la IA: ${yaAvisadas.size} · se pueden repasar contra el BOE: ${repasables.length} · sin artículo seguro: ${sinCita}`);
console.log(`Coste estimado de repasarlas todas: ${costeVerificacion(repasables.length).toFixed(2)} $ (por arriba)`);

if (!llama) { console.log('\nENSAYO: no se ha llamado a la IA ni se ha escrito nada. --muestra=30 para probar, --hazlo para todas.'); process.exit(0); }

// 3. La IA, pregunta a pregunta.
const modelo = new GoogleGenerativeAI(GEMINI).getGenerativeModel({
  model: MODELO,
  systemInstruction: INSTRUCCION_VERIFICAR,
  generationConfig: { responseMimeType: 'application/json', responseSchema: VERIFICACION_SCHEMA },
});
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function conReintentos(fn, intentos = 5) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (!/429|quota|rate|RESOURCE_EXHAUSTED|503|overloaded/i.test(String(e?.message ?? e)) || i >= intentos - 1) throw e;
      await espera(2000 * 2 ** i);
    }
  }
}

// La muestra, repartida por el banco (no las 30 primeras de un mismo tema).
let lote = repasables;
if (MUESTRA > 0) { const paso = Math.max(1, Math.floor(repasables.length / MUESTRA)); lote = repasables.filter((_, i) => i % paso === 0).slice(0, MUESTRA); }
if (LIMITE > 0) lote = lote.slice(0, LIMITE);

// Con --hazlo, los avisos se guardan según se van teniendo: si el repaso se
// corta a mitad, lo hecho queda (y al relanzarlo no se repasan otra vez).
const aviso = (r) => ({
  question_id: r.q.id, report_type: TIPO_REPORTE_REVISION_IA, status: 'open', user_id: null,
  message: avisoDeVerificacion({ norma: r.cita.norma, precepto: preceptoLegible(r.cita.precepto), veredicto: r.v, marcada: r.q.correct_index, url: urlBoe(r.cita.boe, r.art.id) }),
});
let porEscribir = [];
let escritos = 0;
async function guarda(todo = false) {
  if (!HAZLO || (!todo && porEscribir.length < 50) || porEscribir.length === 0) return;
  const tanda = porEscribir;
  porEscribir = [];
  const { error } = await db.from('question_reports').insert(tanda);
  if (error) { console.error('No se pudieron guardar los avisos:', error.message); process.exit(1); }
  escritos += tanda.length;
}

const gastado = { entrada: 0, salida: 0 };
const resultados = [];
let fallos = 0;
for (let i = 0; i < lote.length; i += CONCURRENCIA) {
  await Promise.all(lote.slice(i, i + CONCURRENCIA).map(async ({ q, cita, art }) => {
    const prompt = promptDeVerificacion({
      norma: cita.norma, precepto: preceptoLegible(cita.precepto), texto: art.texto,
      pregunta: q.question_text, opciones: q.options, correcta: q.correct_index, explicacion: q.explanation,
    });
    try {
      const r = await conReintentos(() => modelo.generateContent(prompt));
      gastado.entrada += r.response.usageMetadata?.promptTokenCount ?? 0;
      gastado.salida += r.response.usageMetadata?.candidatesTokenCount ?? 0;
      const v = leeVeredicto(r.response.text());
      if (!v) { fallos++; return; }
      const r2 = { q, cita, art, v };
      resultados.push(r2);
      if (v.veredicto !== 'correcta') porEscribir.push(aviso(r2));
    } catch { fallos++; }
  }));
  await guarda();
  if ((i / CONCURRENCIA) % 50 === 0) console.log(`  … ${Math.min(i + CONCURRENCIA, lote.length)} de ${lote.length}`);
}
await guarda(true);
const real = calculaGasto({ promptTokenCount: gastado.entrada, candidatesTokenCount: gastado.salida });

const cuenta = { correcta: 0, incorrecta: 0, dudosa: 0 };
for (const r of resultados) cuenta[r.v.veredicto]++;
const lineas = [];
const di = (t = '') => { console.log(t); lineas.push(t); };
di(`## Repaso contra la ley · ${new Date().toISOString().slice(0, 10)}${HAZLO ? '' : ' · MUESTRA (no escribe)'}`);
di();
di(`- Repasadas: ${resultados.length} de ${lote.length} (sin respuesta válida de la IA: ${fallos}) · gasto real ${real.coste.toFixed(3)} $`);
di(`- Correctas: **${cuenta.correcta}** · incorrectas: **${cuenta.incorrecta}** · dudosas: **${cuenta.dudosa}**`);
di();
di('<details><summary>Las que no cuadran</summary>');
di();
for (const r of resultados.filter((x) => x.v.veredicto !== 'correcta').slice(0, 120)) {
  di(`- **${r.v.veredicto}** · ${r.cita.norma}, ${preceptoLegible(r.cita.precepto)} · ${r.q.question_text.replace(/\s+/g, ' ').slice(0, 120)} → ${r.v.motivo.slice(0, 220)} \`${r.q.id.slice(0, 8)}\``);
}
di();
di('</details>');
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lineas.join('\n')}\n`);

if (!HAZLO) { console.log('\nMUESTRA: no se ha escrito nada.'); process.exit(0); }

// 4. Los avisos (solo de las que no cuadran) ya están guardados; queda la novedad.
const { error: errNov } = await db.from('novedades').insert({
  tipo: 'ia', organization_id: null,
  titulo: `Repaso contra la ley: la IA duda de ${escritos} de ${resultados.length} preguntas`,
  detalle: `${cuenta.incorrecta} que cree mal y ${cuenta.dudosa} que no puede confirmar con el texto vigente del BOE. Están en «Revisión → La IA duda» (y en «Revisar», modo «las que la IA duda, primero»). La IA también se equivoca: decide el tutor. Gasto: ${real.coste.toFixed(2)} $.`,
});
if (errNov) console.error('No se pudo anotar la novedad:', errNov.message);
console.log(`\nAvisos escritos: ${escritos} · gasto ${real.coste.toFixed(3)} $`);

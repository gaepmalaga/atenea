/**
 * ¿CADA PREGUNTA ES DE SU TEMA? (regla 138; la lógica en `app/lib/ambito-tema.ts`)
 *
 * Para cada pregunta que ningún tutor ha revisado (del banco o pendiente), una
 * IA la compara con el PROGRAMA OFICIAL del tema en el que está archivada
 * (`temario/temario.json`). Las que no encajan («otro_tema» o
 * «fuera_del_temario») reciben un aviso «La IA duda» en «Revisión». No cambia
 * ni mueve ninguna pregunta.
 *
 *   npm run ambito                        ENSAYO: cuántas se repasarían y cuánto costaría. Gratis.
 *   npm run ambito -- --muestra=60        repasa 60 repartidas por temas y enseña lo que dice, sin escribir. Céntimos.
 *   npm run ambito -- --hazlo             repasa todas y deja los avisos. Un euro o dos.
 *   npm run ambito -- --hazlo --limite=500
 *
 * Una pregunta que ya tuvo un aviso de ESTE repaso (abierto o archivado) no se
 * vuelve a repasar. Los exámenes oficiales (temas 46-50) no tienen programa y
 * quedan fuera. Necesita la clave de servicio y la de Gemini: va por «Operación».
 */
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from 'dotenv';
import { readFile, appendFile } from 'node:fs/promises';
import { normalizeSupabaseUrl } from '../../app/lib/supabase-url.ts';
import { calculaGasto } from '../../app/lib/ai-usage.ts';
import {
  INSTRUCCION_AMBITO, AMBITO_SCHEMA, TIPO_REPORTE_AMBITO, leeVeredictoAmbito, promptDeAmbito, avisoDeAmbito, costeAmbito,
} from '../../app/lib/ambito-tema.ts';

config({ path: '.env.local' });

const args = process.argv.slice(2);
const valor = (f) => args.find((x) => x.startsWith(`--${f}=`))?.split('=')[1];
const HAZLO = args.includes('--hazlo');
const MUESTRA = Number(valor('muestra') ?? 0);
const LIMITE = Number(valor('limite') ?? 0);
const CONCURRENCIA = 4;
const MODELO = 'gemini-3.5-flash-lite';
/** Marca del aviso de ESTE repaso, para no repetirlo (el tipo de reporte es el mismo que el del repaso contra la ley). */
const FIRMA = 'no es de este tema';
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

// 1. El programa oficial de los 45 temas.
const oficial = JSON.parse(await readFile(new globalThis.URL('../../temario/temario.json', import.meta.url), 'utf8')).temas;
const temas = oficial.map((t) => ({
  numero: t.numero, titulo: t.titulo, enunciado: t.enunciado,
  normas: [...new Set((t.fuentes ?? []).map((f) => f.nombre))],
}));
const porNumero = new Map(temas.map((t) => [t.numero, t]));
const titulos = new Map(temas.map((t) => [t.numero, t.titulo]));
const validos = new Set(temas.map((t) => t.numero));

// 2. Las preguntas sin revisar, con el número de su tema.
const preguntas = await todas(
  (d, h) => db.from('question_bank')
    .select('id, status, question_text, options, correct_index, explanation, subjects(topic_number)')
    .in('status', ['active', 'candidate']).is('reviewed_at', null).order('id').range(d, h),
  'question_bank',
);
const avisos = await todas(
  (d, h) => db.from('question_reports').select('id, question_id, message').eq('report_type', TIPO_REPORTE_AMBITO).order('id').range(d, h),
  'question_reports',
);
const yaAvisadas = new Set(avisos.filter((r) => (r.message ?? '').includes(FIRMA) || /de ningún tema del programa/.test(r.message ?? '')).map((r) => r.question_id));

const repasables = [];
let sinPrograma = 0;
for (const q of preguntas) {
  const t = porNumero.get(q.subjects?.topic_number);
  if (!t) { sinPrograma++; continue; }
  if (yaAvisadas.has(q.id)) continue;
  repasables.push({ q, t });
}
console.log(`Sin revisar: ${preguntas.length} · sin programa oficial (exámenes): ${sinPrograma} · ya avisadas por este repaso: ${yaAvisadas.size} · se pueden repasar: ${repasables.length}`);
console.log(`Coste estimado de repasarlas todas: ${costeAmbito(repasables.length).toFixed(2)} $ (por arriba)`);
if (!llama) { console.log('\nENSAYO: no se ha llamado a la IA ni se ha escrito nada. --muestra=60 para probar, --hazlo para todas.'); process.exit(0); }

// 3. La IA, pregunta a pregunta.
const modelo = new GoogleGenerativeAI(GEMINI).getGenerativeModel({
  model: MODELO,
  systemInstruction: INSTRUCCION_AMBITO,
  generationConfig: { responseMimeType: 'application/json', responseSchema: AMBITO_SCHEMA },
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

// La muestra, repartida por temas: ordenadas por tema, una de cada `paso`.
let lote = repasables;
if (MUESTRA > 0) {
  const ordenadas = [...repasables].sort((x, y) => x.t.numero - y.t.numero || (x.q.id < y.q.id ? -1 : 1));
  const paso = Math.max(1, Math.floor(ordenadas.length / MUESTRA));
  lote = ordenadas.filter((_, i) => i % paso === 0).slice(0, MUESTRA);
}
if (LIMITE > 0) lote = lote.slice(0, LIMITE);

const aviso = (r) => ({
  question_id: r.q.id, report_type: TIPO_REPORTE_AMBITO, status: 'open', user_id: null,
  message: avisoDeAmbito({ tema: r.t, veredicto: r.v, titulos }),
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
  await Promise.all(lote.slice(i, i + CONCURRENCIA).map(async ({ q, t }) => {
    const prompt = promptDeAmbito({ tema: t, todos: temas, pregunta: q.question_text, opciones: q.options, correcta: q.correct_index, explicacion: q.explanation });
    try {
      const r = await conReintentos(() => modelo.generateContent(prompt));
      gastado.entrada += r.response.usageMetadata?.promptTokenCount ?? 0;
      gastado.salida += r.response.usageMetadata?.candidatesTokenCount ?? 0;
      const v = leeVeredictoAmbito(r.response.text(), validos);
      if (!v) { fallos++; return; }
      const r2 = { q, t, v };
      resultados.push(r2);
      if (v.veredicto !== 'del_tema') porEscribir.push(aviso(r2));
    } catch { fallos++; }
  }));
  await guarda();
  if ((i / CONCURRENCIA) % 100 === 0) console.log(`  … ${Math.min(i + CONCURRENCIA, lote.length)} de ${lote.length}`);
}
await guarda(true);
const real = calculaGasto({ promptTokenCount: gastado.entrada, candidatesTokenCount: gastado.salida });

const cuenta = { del_tema: 0, otro_tema: 0, fuera_del_temario: 0 };
for (const r of resultados) cuenta[r.v.veredicto]++;
const lineas = [];
const di = (t = '') => { console.log(t); lineas.push(t); };
di(`## ¿Es de su tema? · ${new Date().toISOString().slice(0, 10)}${HAZLO ? '' : ' · MUESTRA (no escribe)'}`);
di();
di(`- Repasadas: ${resultados.length} de ${lote.length} (sin respuesta válida de la IA: ${fallos}) · gasto real ${real.coste.toFixed(3)} $`);
di(`- Del tema: **${cuenta.del_tema}** · de otro tema: **${cuenta.otro_tema}** · fuera del temario: **${cuenta.fuera_del_temario}**`);
di();
di('<details open><summary>Las que no encajan</summary>');
di();
for (const r of resultados.filter((x) => x.v.veredicto !== 'del_tema').slice(0, 150)) {
  const destino = r.v.veredicto === 'otro_tema' ? `→ tema ${r.v.temaProbable}` : '→ fuera del temario';
  di(`- **${r.v.veredicto}** (tema ${r.t.numero}) ${destino} · ${r.q.question_text.replace(/\s+/g, ' ').slice(0, 130)} · ${r.v.motivo.slice(0, 200)} \`${r.q.id.slice(0, 8)}\``);
}
di();
di('</details>');
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lineas.join('\n')}\n`);

if (!HAZLO) { console.log('\nMUESTRA: no se ha escrito nada.'); process.exit(0); }

// 4. Los avisos ya están guardados; queda la novedad.
const { error: errNov } = await db.from('novedades').insert({
  tipo: 'ia', organization_id: null,
  titulo: `Repaso «¿es de su tema?»: la IA duda de ${escritos} de ${resultados.length} preguntas`,
  detalle: `${cuenta.otro_tema} que cree de otro tema y ${cuenta.fuera_del_temario} que cree fuera del programa. Están en «Revisión → La IA duda». La IA también se equivoca: decide el tutor. Gasto: ${real.coste.toFixed(2)} $.`,
});
if (errNov) console.error('No se pudo anotar la novedad:', errNov.message);
console.log(`\nAvisos escritos: ${escritos} · gasto ${real.coste.toFixed(3)} $`);

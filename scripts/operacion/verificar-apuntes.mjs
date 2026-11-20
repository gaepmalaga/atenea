/**
 * LA COMPROBACIÓN CONTRA LOS APUNTES (regla 145; la lógica en `app/lib/verificacion-apuntes.ts`).
 *
 * Los temas de ciencias sociales, técnico-científicas y los apuntes propios de
 * los temas 4 y 24 no tienen artículo de ley detrás, así que el repaso contra el
 * BOE no puede con ellos. Aquí una IA compara cada pregunta con el APUNTE entero
 * de su tema, de diez en diez. No cambia ninguna pregunta: deja un aviso «La IA
 * duda» en «Revisión» solo para las que CONTRADICEN los apuntes (y, con
 * --con-dudosas, también para las que los apuntes no cubren).
 *
 *   npm run apuntes                       ENSAYO: cuántas se repasarían y cuánto costaría. Gratis.
 *   npm run apuntes -- --muestra=60       repasa 60 repartidas por temas y enseña lo que dice, sin escribir. Céntimos.
 *   npm run apuntes -- --hazlo            repasa todas y deja los avisos de las que contradicen los apuntes.
 *   npm run apuntes -- --hazlo --con-dudosas
 *
 * Una pregunta ya repasada por este script (con aviso, abierto o archivado) no se
 * repite. Necesita la clave de servicio y la de Gemini: va por «Operación».
 */
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from 'dotenv';
import { appendFile } from 'node:fs/promises';
import { normalizeSupabaseUrl } from '../../app/lib/supabase-url.ts';
import { calculaGasto } from '../../app/lib/ai-usage.ts';
import { temaSinLegislacion } from '../../app/lib/temas-sin-ley.ts';
import { TIPO_REPORTE_REVISION_IA } from '../../app/lib/verificacion.ts';
import {
  INSTRUCCION_APUNTES, APUNTES_SCHEMA, FIRMA_APUNTES, PREGUNTAS_POR_LOTE, promptDeApuntes, leeVeredictosApuntes, avisoDeApuntes, costeApuntes,
} from '../../app/lib/verificacion-apuntes.ts';

config({ path: '.env.local' });

const args = process.argv.slice(2);
const valor = (f) => args.find((x) => x.startsWith(`--${f}=`))?.split('=')[1];
const HAZLO = args.includes('--hazlo');
const CON_DUDOSAS = args.includes('--con-dudosas');
const MUESTRA = Number(valor('muestra') ?? 0);
const CONCURRENCIA = 3;
const MODELO = 'gemini-3.5-flash-lite';
const MAX_SEGUIDOS = 6;
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

// 1. Las preguntas de la IA sin revisar, de temas sin legislación y sin referencia legal.
const candidatas = (await todas((d, h) => db.from('question_bank')
  .select('id, question_text, options, correct_index, explanation, legal_reference, subject_id, subjects(topic_number, title)')
  .eq('fuente', 'ia').is('reviewed_at', null).in('status', ['active', 'candidate']).order('id').range(d, h), 'question_bank'))
  .filter((q) => !(q.legal_reference ?? '').trim() && temaSinLegislacion(q.subjects?.topic_number));
const avisos = await todas((d, h) => db.from('question_reports').select('id, question_id, message').eq('report_type', TIPO_REPORTE_REVISION_IA).order('id').range(d, h), 'question_reports');
const yaRepasadas = new Set(avisos.filter((r) => (r.message ?? '').includes(FIRMA_APUNTES)).map((r) => r.question_id));
const pendientes = candidatas.filter((q) => !yaRepasadas.has(q.id));

// 2. El apunte de cada tema (puede ser más de un documento).
const documentos = await todas((d, h) => db.from('documents').select('id, subject_id, full_text').order('id').range(d, h), 'documents');
const textoDe = new Map();
for (const doc of documentos) textoDe.set(doc.subject_id, [...(textoDe.get(doc.subject_id) ?? []), doc.full_text ?? ''].join('\n\n---\n\n'));
const sinApunte = pendientes.filter((q) => !(textoDe.get(q.subject_id) ?? '').trim());
const repasables = pendientes.filter((q) => (textoDe.get(q.subject_id) ?? '').trim());
console.log(`Sin revisar, sin referencia y de tema sin legislación: ${candidatas.length} · ya repasadas por esta comprobación: ${yaRepasadas.size} · sin apunte del tema: ${sinApunte.length} · se pueden repasar: ${repasables.length}`);
console.log(`Coste estimado de repasarlas todas: ${costeApuntes(repasables.length).toFixed(2)} $ (por arriba)`);
if (!llama) { console.log('\nENSAYO: no se ha llamado a la IA ni se ha escrito nada. --muestra=60 para probar, --hazlo para todas.'); process.exit(0); }

// 3. Los lotes: de diez en diez, de un mismo tema (la muestra, repartida por temas).
let lote = [...repasables].sort((a, b) => a.subjects.topic_number - b.subjects.topic_number || (a.id < b.id ? -1 : 1));
if (MUESTRA > 0) { const paso = Math.max(1, Math.floor(lote.length / MUESTRA)); lote = lote.filter((_, i) => i % paso === 0).slice(0, MUESTRA); }
const lotes = [];
for (const q of lote) {
  const ultimo = lotes.at(-1);
  if (ultimo && ultimo.subjectId === q.subject_id && ultimo.preguntas.length < PREGUNTAS_POR_LOTE) ultimo.preguntas.push(q);
  else lotes.push({ subjectId: q.subject_id, tema: q.subjects.topic_number, titulo: q.subjects.title, preguntas: [q] });
}

const modelo = new GoogleGenerativeAI(GEMINI).getGenerativeModel({
  model: MODELO,
  systemInstruction: INSTRUCCION_APUNTES,
  generationConfig: { responseMimeType: 'application/json', responseSchema: APUNTES_SCHEMA },
});
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function conReintentos(fn, intentos = 4) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (!/429|quota|rate|RESOURCE_EXHAUSTED|503|overloaded/i.test(String(e?.message ?? e)) || i >= intentos - 1) throw e;
      await espera(2000 * 2 ** i);
    }
  }
}

const gastado = { entrada: 0, salida: 0 };
const resultados = [];
let fallos = 0, seguidos = 0, ultimoError = '';
let porEscribir = [];
let escritos = 0;
const aviso = (r) => ({ question_id: r.q.id, report_type: TIPO_REPORTE_REVISION_IA, status: 'open', user_id: null, message: avisoDeApuntes({ tema: r.tema, veredicto: r.v, marcada: r.q.correct_index }) });
async function guarda(todo = false) {
  if (!HAZLO || (!todo && porEscribir.length < 50) || porEscribir.length === 0) return;
  const tanda = porEscribir; porEscribir = [];
  const { error } = await db.from('question_reports').insert(tanda);
  if (error) { console.error('No se pudieron guardar los avisos:', error.message); process.exit(1); }
  escritos += tanda.length;
}

for (let i = 0; i < lotes.length; i += CONCURRENCIA) {
  await Promise.all(lotes.slice(i, i + CONCURRENCIA).map(async (l) => {
    const prompt = promptDeApuntes({ tema: l.tema, titulo: l.titulo, texto: textoDe.get(l.subjectId), preguntas: l.preguntas });
    try {
      const r = await conReintentos(() => modelo.generateContent(prompt));
      gastado.entrada += r.response.usageMetadata?.promptTokenCount ?? 0;
      gastado.salida += r.response.usageMetadata?.candidatesTokenCount ?? 0;
      const vs = leeVeredictosApuntes(r.response.text(), l.preguntas.length);
      seguidos = 0;
      l.preguntas.forEach((q, n) => {
        const v = vs.get(n);
        if (!v) { fallos++; return; }
        const r2 = { q, tema: l.tema, v };
        resultados.push(r2);
        if (v.veredicto === 'incorrecta' || (CON_DUDOSAS && v.veredicto === 'dudosa')) porEscribir.push(aviso(r2));
      });
    } catch (e) { fallos += l.preguntas.length; seguidos++; ultimoError = String(e?.message ?? e).replace(/\s+/g, ' ').slice(0, 300); }
  }));
  await guarda();
  if (seguidos >= MAX_SEGUIDOS) { console.error(`\nGemini no responde (${seguidos} lotes seguidos fallan): ${ultimoError}\nSe para aquí: ${resultados.length} repasadas de ${lote.length}. Lo hecho queda guardado.`); break; }
  if ((i / CONCURRENCIA) % 20 === 0) console.log(`  … ${Math.min((i + CONCURRENCIA) * PREGUNTAS_POR_LOTE, lote.length)} de ${lote.length} (evaluadas ${resultados.length}, sin respuesta ${fallos})`);
}
await guarda(true);
const real = calculaGasto({ promptTokenCount: gastado.entrada, candidatesTokenCount: gastado.salida });

const cuenta = { correcta: 0, incorrecta: 0, dudosa: 0 };
for (const r of resultados) cuenta[r.v.veredicto]++;
const porTema = new Map();
for (const r of resultados) { const t = porTema.get(r.tema) ?? { n: 0, incorrecta: 0, dudosa: 0 }; t.n++; if (r.v.veredicto !== 'correcta') t[r.v.veredicto]++; porTema.set(r.tema, t); }
const lineas = [];
const di = (t = '') => { console.log(t); lineas.push(t); };
di(`## Comprobación contra los apuntes · ${new Date().toISOString().slice(0, 10)}${HAZLO ? '' : ' · MUESTRA (no escribe)'}`);
di();
di(`- Repasadas: ${resultados.length} de ${lote.length} (sin respuesta válida de la IA: ${fallos}) · gasto real ${real.coste.toFixed(3)} $`);
di(`- Los apuntes las respaldan: **${cuenta.correcta}** · las contradicen: **${cuenta.incorrecta}** · no las cubren: **${cuenta.dudosa}**`);
if (ultimoError) di(`- Último error de Gemini: ${ultimoError}`);
di();
di('Por tema (repasadas · contradicen · no cubiertas): ' + [...porTema].sort((a, b) => a[0] - b[0]).map(([t, x]) => `${t}: ${x.n}·${x.incorrecta}·${x.dudosa}`).join(' | '));
di();
di('<details open><summary>Las que contradicen los apuntes</summary>');
di();
for (const r of resultados.filter((x) => x.v.veredicto === 'incorrecta').slice(0, 80)) di(`- tema ${r.tema} · ${r.q.question_text.replace(/\s+/g, ' ').slice(0, 120)} → ${r.v.motivo.slice(0, 200)} \`${r.q.id.slice(0, 8)}\``);
di();
di('</details>');
di('<details><summary>Una muestra de las que los apuntes no cubren</summary>');
di();
for (const r of resultados.filter((x) => x.v.veredicto === 'dudosa').slice(0, 25)) di(`- tema ${r.tema} · ${r.q.question_text.replace(/\s+/g, ' ').slice(0, 120)} → ${r.v.motivo.slice(0, 160)} \`${r.q.id.slice(0, 8)}\``);
di();
di('</details>');
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lineas.join('\n')}\n`);

if (!HAZLO) { console.log('\nMUESTRA: no se ha escrito nada.'); process.exit(0); }
const { error: errNov } = await db.from('novedades').insert({
  tipo: 'ia', organization_id: null,
  titulo: `Comprobación contra los apuntes: la IA duda de ${escritos} de ${resultados.length} preguntas`,
  detalle: `${cuenta.incorrecta} contradicen los apuntes de su tema y ${cuenta.dudosa} no los cubren${CON_DUDOSAS ? ' (también avisadas)' : ' (sin aviso: solo las que los contradicen)'}. Son preguntas de temas sin legislación (ciencias sociales, técnico-científicas y los apuntes de los temas 4 y 24). Están en «Revisión → La IA duda». La IA también se equivoca: decide el tutor. Gasto: ${real.coste.toFixed(2)} $.`,
});
if (errNov) console.error('No se pudo anotar la novedad:', errNov.message);
console.log(`\nAvisos escritos: ${escritos} · gasto ${real.coste.toFixed(3)} $`);

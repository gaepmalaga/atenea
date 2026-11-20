/**
 * MEJORAS DEL BANCO QUE PROPONE CLAUDE (regla 138, fase 2). No toca ninguna
 * pregunta: deja PROPUESTAS que un tutor aprueba o rechaza en «Revisión →
 * Cambios propuestos». Una por pregunta, con todo lo que cambia junto:
 *
 *  1. Quitar «según el texto proporcionado» (y variantes) del enunciado y de
 *     la explicación: el alumno no tiene ningún texto delante. Si se sabe con
 *     seguridad de qué ley y artículo es, se pone en su sitio.
 *  2. Completar la referencia legal que falta o que no dice la ley
 *     («Artículo 2» → «Art. 2 LO 4/2015»). La norma y el artículo salen, por
 *     este orden, de la propia referencia, de la explicación, del tema (si
 *     solo una de sus normas tiene ese artículo) o del texto del BOE (si la
 *     pregunta coincide claramente con un artículo y no con los demás).
 *
 *   npm run mejoras                 ENSAYO: cuenta y enseña ejemplos, no escribe
 *   npm run mejoras -- --hazlo      deja las propuestas (y su línea en «Novedades»)
 *
 * Necesita la clave de servicio y el BOE (va por «Operación»).
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { readFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSupabaseUrl } from '../../app/lib/supabase-url.ts';
import { citasDeLaPregunta, cabeceraDelTemario, candidatasPorTema, eligePorTexto, NO_VIGILADAS, nombreCorto } from '../../app/lib/normativa.ts';
import { quitaTextoProporcionado, hablaDeUnTexto, referenciaCorta, articulosNombrados, palabras, mejorArticulo } from '../../app/lib/propuestas-banco.ts';
import { idDeNorma, textoPorPrecepto } from './fuentes-boe.mjs';
import { proponer } from './propuestas.mjs';

config({ path: '.env.local' });

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HAZLO = process.argv.includes('--hazlo');
const URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
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

// ---------------------------------------------------------------------------
// 1. Las preguntas que necesitan algo
// ---------------------------------------------------------------------------

const preguntas = await todas(
  (d, h) => db.from('question_bank')
    .select('id, organization_id, subject_id, document_id, question_text, options, correct_index, explanation, legal_reference')
    .eq('status', 'active').order('id').range(d, h),
  'question_bank',
);
const temas = await todas((d, h) => db.from('subjects').select('id, topic_number').order('id').range(d, h), 'subjects');
const temaDe = new Map(temas.map((s) => [s.id, s.topic_number]));
const documentos = await todas((d, h) => db.from('documents').select('id, filename').order('id').range(d, h), 'documents');
const manifiesto = JSON.parse(await readFile(join(RAIZ, 'temario', 'temario.json'), 'utf8'));
const temaDelManifiesto = new Map(manifiesto.temas.map((t) => [t.numero, t]));
const cabeceras = new Map();
for (const doc of documentos) {
  const ruta = join(RAIZ, 'temario', 'md', `${doc.filename}.md`);
  if (doc.filename && existsSync(ruta)) cabeceras.set(doc.id, cabeceraDelTemario(await readFile(ruta, 'utf8')));
}

const trabajo = [];
for (const q of preguntas) {
  const tema = temaDelManifiesto.get(temaDe.get(q.subject_id));
  const cab = cabeceras.get(q.document_id);
  const citas = citasDeLaPregunta(q.legal_reference, tema, cab?.boes).filter((c) => !c.norma || !NO_VIGILADAS.has(c.norma));
  const sinLey = !q.legal_reference?.trim() || citasDeLaPregunta(q.legal_reference, undefined).every((c) => !c.norma);
  const conTexto = hablaDeUnTexto(q.question_text) || hablaDeUnTexto(q.explanation);
  if (!sinLey && !conTexto) continue;
  trabajo.push({ q, tema, cab, citas, sinLey, conTexto });
}

// ---------------------------------------------------------------------------
// 2. Los textos del BOE que hacen falta
// ---------------------------------------------------------------------------

const idPorNombre = new Map();
const nombrePorId = new Map(); // id → nombre corto, para la frase y la referencia
const necesarios = new Set();
for (const { citas, tema, cab } of trabajo) {
  for (const c of citas) {
    if (c.boe) { necesarios.add(c.boe); if (c.norma) nombrePorId.set(c.boe, c.norma); }
    for (const cand of c.candidatas ?? []) { necesarios.add(cand.boe); nombrePorId.set(cand.boe, cand.nombre); }
    if (c.norma && !c.boe && !idPorNombre.has(c.norma)) idPorNombre.set(c.norma, null);
  }
  for (const f of tema?.fuentes ?? []) {
    if (f.boe_id && (!cab?.boes?.length || cab.boes.includes(f.boe_id))) { necesarios.add(f.boe_id); if (!nombrePorId.has(f.boe_id)) nombrePorId.set(f.boe_id, nombreCorto(f.nombre ?? f.boe_id)); }
  }
}
for (const nombre of idPorNombre.keys()) {
  const id = await idDeNorma(nombre);
  idPorNombre.set(nombre, id);
  if (id) { necesarios.add(id); nombrePorId.set(id, nombre); }
}
const textos = new Map(); // id → Map(precepto → { texto, palabras })
for (const id of necesarios) {
  const mapa = await textoPorPrecepto(id);
  if (!mapa) continue;
  for (const v of mapa.values()) v.palabras = palabras(v.texto);
  textos.set(id, mapa);
}
console.log(`Normas del BOE leídas: ${textos.size} de ${necesarios.size}`);

// ---------------------------------------------------------------------------
// 3. La ley y el artículo de cada pregunta, solo si es seguro
// ---------------------------------------------------------------------------

/** Las normas del tema (o de su parte del temario) que tienen texto y cubren ese precepto. */
function candidatas(tema, cab, precepto) {
  return candidatasPorTema(tema, precepto, cab?.boes).filter((c) => textos.get(c.boe)?.has(precepto));
}

function resuelve({ q, tema, cab, citas }) {
  const textoQ = palabras(`${q.question_text} ${Array.isArray(q.options) ? q.options[q.correct_index] ?? '' : ''}`);
  const comoTexto = `${q.explanation ?? ''} ${q.question_text}`;

  // a) La referencia ya dice la ley y el artículo.
  for (const c of citas) {
    const id = c.boe ?? (c.norma ? idPorNombre.get(c.norma) : null);
    if (c.norma && c.precepto && id) return { boe: id, norma: c.norma, precepto: c.precepto, como: 'la referencia' };
  }
  // b) El artículo está (en la referencia o en la explicación) y hay que saber de qué ley.
  const preceptos = [...new Set([...citas.filter((c) => c.precepto).map((c) => c.precepto), ...articulosNombrados(comoTexto)])];
  for (const p of preceptos) {
    const conNombre = citas.find((c) => c.norma && !c.precepto);
    if (conNombre) {
      const id = conNombre.boe ?? idPorNombre.get(conNombre.norma);
      if (id && textos.get(id)?.has(p)) return { boe: id, norma: conNombre.norma, precepto: p, como: 'la referencia y la explicación' };
    }
    const cands = candidatas(tema, cab, p);
    if (cands.length === 1) return { boe: cands[0].boe, norma: cands[0].nombre, precepto: p, como: 'el tema' };
    if (cands.length > 1) {
      const e = eligePorTexto(cands, comoTexto);
      if (e) return { boe: e.boe, norma: e.nombre, precepto: p, como: 'la explicación' };
      const m = mejorArticulo(textoQ, cands.map((c) => ({ clave: c.boe, palabras: textos.get(c.boe).get(p).palabras })));
      if (m) { const c = cands.find((x) => x.boe === m.clave); return { boe: c.boe, norma: c.nombre, precepto: p, como: `el texto del BOE (coincide el ${Math.round(m.cobertura * 100)} %)` }; }
    }
  }
  // c) Ni la referencia ni la explicación dicen el artículo: el que coincide claramente con la pregunta.
  if (preceptos.length === 0) {
    const fuentes = (tema?.fuentes ?? []).filter((f) => f.boe_id && textos.has(f.boe_id) && (!cab?.boes?.length || cab.boes.includes(f.boe_id)));
    const todos = [];
    for (const f of fuentes) {
      for (const [p, v] of textos.get(f.boe_id)) {
        if (!candidatasPorTema(tema, p, cab?.boes).some((c) => c.boe === f.boe_id)) continue; // dentro del alcance del tema
        if (v.palabras.size < 8) continue; // «(Derogado)», rótulos vacíos
        todos.push({ clave: `${f.boe_id}|${p}`, palabras: v.palabras });
      }
    }
    const m = mejorArticulo(textoQ, todos, 0.6, 0.15);
    if (m) {
      const [boe, p] = m.clave.split('|');
      return { boe, norma: nombrePorId.get(boe) ?? boe, precepto: p, como: `el texto del BOE (coincide el ${Math.round(m.cobertura * 100)} %)` };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 4. Las propuestas
// ---------------------------------------------------------------------------

const propuestas = [];
const cuenta = { conTexto: 0, textoArreglado: 0, textoDudoso: 0, sinLey: 0, leyPuesta: 0, sinResolver: 0 };
const como = new Map();
for (const t of trabajo) {
  const { q } = t;
  const cita = resuelve(t);
  const antes = {};
  const despues = {};
  const motivos = [];

  if (t.conTexto) {
    cuenta.conTexto++;
    const frase = cita ? { norma: cita.norma, precepto: cita.precepto } : { norma: null, precepto: null };
    let arreglado = false;
    for (const campo of ['question_text', 'explanation']) {
      if (!hablaDeUnTexto(q[campo])) continue;
      const nuevo = quitaTextoProporcionado(q[campo], frase);
      if (nuevo) { antes[campo] = q[campo]; despues[campo] = nuevo; arreglado = true; }
    }
    if (arreglado) {
      cuenta.textoArreglado++;
      motivos.push(cita
        ? `Quita «según el texto proporcionado» (el alumno no tiene ningún texto delante) y pone de qué ley es: ${cita.norma}, sacado de ${cita.como}.`
        : 'Quita «según el texto proporcionado»: el alumno no tiene ningún texto delante. No cambia lo que pregunta.');
    } else cuenta.textoDudoso++;
  }
  if (t.sinLey) {
    cuenta.sinLey++;
    if (cita) {
      const ref = referenciaCorta(cita.norma, cita.precepto);
      if (ref !== q.legal_reference) {
        antes.legal_reference = q.legal_reference ?? null;
        despues.legal_reference = ref;
        cuenta.leyPuesta++;
        como.set(cita.como.replace(/ \(coincide.*/, ''), (como.get(cita.como.replace(/ \(coincide.*/, '')) ?? 0) + 1);
        motivos.push(`${q.legal_reference ? `La referencia («${q.legal_reference}») no dice de qué ley es` : 'No tenía referencia legal'}: es ${ref}, sacado de ${cita.como}. Con la ley puesta, el vigilante de la normativa la cubre.`);
      }
    } else cuenta.sinResolver++;
  }
  if (Object.keys(despues).length) propuestas.push({ question_id: q.id, organization_id: q.organization_id ?? null, before: antes, after: despues, reason: motivos.join(' ') });
}

const lineas = [];
const di = (t = '') => { console.log(t); lineas.push(t); };
di(`## Mejoras del banco propuestas por Claude · ${new Date().toISOString().slice(0, 10)}${HAZLO ? '' : ' · ENSAYO (no escribe)'}`);
di();
di(`- Preguntas activas: ${preguntas.length} · con algo que mejorar: ${trabajo.length}`);
di(`- «Texto proporcionado»: ${cuenta.conTexto} · se arreglan: ${cuenta.textoArreglado} · quedan para el tutor: ${cuenta.textoDudoso}`);
di(`- Sin ley en la referencia: ${cuenta.sinLey} · se completan: ${cuenta.leyPuesta} · sin poder deducirla con seguridad: ${cuenta.sinResolver}`);
di(`- De dónde sale la ley: ${[...como].map(([k, n]) => `${k} ${n}`).join(' · ')}`);
di(`- **Propuestas: ${propuestas.length}** (una por pregunta)`);
di();
di('<details><summary>Ejemplos</summary>');
di();
const paso = Math.max(1, Math.floor(propuestas.length / 40));
for (let i = 0; i < propuestas.length; i += paso) {
  const p = propuestas[i];
  for (const k of Object.keys(p.after)) di(`- \`${p.question_id.slice(0, 8)}\` **${k}**: ${String(p.before[k] ?? '(vacío)').replace(/\s+/g, ' ').slice(0, 160)} → ${String(p.after[k]).replace(/\s+/g, ' ').slice(0, 160)}`);
}
di();
di('</details>');
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lineas.join('\n')}\n`);

if (!HAZLO) { console.log('\nENSAYO: no se ha escrito nada. Para dejar las propuestas: --hazlo'); process.exit(0); }
const res = await proponer(db, propuestas, {
  fuente: 'claude',
  titulo: 'Claude propone {n} mejoras del banco',
  detalle: 'Quitar «según el texto proporcionado» y completar la referencia legal que falta. Una a una, en «Revisión → Cambios propuestos».',
});
console.log(`\nPropuestas escritas: ${res.escritas} · ya había una pendiente: ${res.yaHabia} · descartadas por mal formadas: ${res.descartadas}`);

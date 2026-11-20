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
import { appendFile } from 'node:fs/promises';
import { normalizeSupabaseUrl } from '../../app/lib/supabase-url.ts';
import { citasDeLaPregunta } from '../../app/lib/normativa.ts';
import { quitaTextoProporcionado, hablaDeUnTexto, referenciaCorta, deCon } from '../../app/lib/propuestas-banco.ts';
import { preparaCitas } from './citas-banco.mjs';
import { proponer } from './propuestas.mjs';

config({ path: '.env.local' });

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
const ctx = await preparaCitas(db, preguntas);
console.log(`Normas del BOE leídas: ${ctx.normasLeidas} de ${ctx.normasPedidas}`);

const trabajo = [];
for (const q of preguntas) {
  const sinLey = !q.legal_reference?.trim() || citasDeLaPregunta(q.legal_reference, undefined).every((c) => !c.norma);
  const conTexto = hablaDeUnTexto(q.question_text) || hablaDeUnTexto(q.explanation);
  if (!sinLey && !conTexto) continue;
  trabajo.push({ q, sinLey, conTexto });
}

// ---------------------------------------------------------------------------
// 4. Las propuestas
// ---------------------------------------------------------------------------

const propuestas = [];
const cuenta = { conTexto: 0, textoArreglado: 0, textoDudoso: 0, sinLey: 0, leyPuesta: 0, sinResolver: 0 };
const como = new Map();
for (const t of trabajo) {
  const { q } = t;
  const cita = ctx.citaDe(q);
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
        ? `Quita «según el texto proporcionado» (el alumno no tiene ningún texto delante) y pone de qué ley es: ${cita.norma}, sacado ${deCon(cita.como)}.`
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
        motivos.push(`${q.legal_reference ? `La referencia («${q.legal_reference}») no dice de qué ley es` : 'No tenía referencia legal'}: es ${ref}, sacado ${deCon(cita.como)}. Con la ley puesta, el vigilante de la normativa la cubre.`);
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

/**
 * PROPONER EL ARREGLO DE LAS EXPLICACIONES QUE NUMERAN LAS OPCIONES (regla 139;
 * la lógica en `app/lib/numeracion-opciones.ts`).
 *
 * «La opción correcta es la 1» (contando desde 0) se lee como la A cuando era
 * la B. Se propone cambiar el número por la letra. NO cambia ninguna pregunta:
 * es una PROPUESTA que decide un tutor (regla 138).
 *
 * Solo hay una propuesta pendiente por pregunta: si la pregunta ya tiene una (de
 * Claude: la referencia legal o «texto proporcionado»), el arreglo se AÑADE a
 * ella (la explicación se suma a sus campos). Si no, se crea una nueva.
 *
 *   node --experimental-strip-types scripts/operacion/proponer-numeracion.mjs           ENSAYO: cuántas se arreglan y cuántas no. No escribe.
 *   node --experimental-strip-types scripts/operacion/proponer-numeracion.mjs --hazlo   deja las propuestas.
 *
 * Las que no se pueden arreglar con seguridad (listas «opciones 0 y 2», no se
 * sabe desde dónde cuenta, la explicación declara correcta otra) no se tocan.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { normalizeSupabaseUrl } from '../../app/lib/supabase-url.ts';
import { corrigeNumeracion, numeraOpciones, MOTIVO_NUMERACION } from '../../app/lib/numeracion-opciones.ts';
import { leeValores } from '../../app/lib/revision.ts';
import { proponer } from './propuestas.mjs';

config({ path: '.env.local' });
const HAZLO = process.argv.includes('--hazlo');
const URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
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

const preguntas = (await todas((d, h) => db.from('question_bank')
  .select('id, organization_id, status, correct_index, explanation')
  .is('reviewed_at', null).in('status', ['active', 'candidate']).order('id').range(d, h), 'question_bank'))
  .filter((q) => numeraOpciones(q.explanation));

const arreglos = [];
const sinArreglo = { total: 0 };
for (const q of preguntas) {
  const r = corrigeNumeracion(q.explanation, q.correct_index);
  if (r) arreglos.push({ q, r }); else sinArreglo.total++;
}
const pendientes = new Map();
for (let i = 0; i < arreglos.length; i += 100) {
  const { data, error } = await db.from('question_proposals').select('id, question_id, before, after, reason').eq('status', 'pending').in('question_id', arreglos.slice(i, i + 100).map((a) => a.q.id));
  if (error) { console.error('No se pudieron leer las propuestas:', error.message); process.exit(1); }
  for (const p of data ?? []) pendientes.set(p.question_id, p);
}
const aAmpliar = arreglos.filter((a) => pendientes.has(a.q.id));
const aCrear = arreglos.filter((a) => !pendientes.has(a.q.id));
const yaLlevan = aAmpliar.filter((a) => (leeValores(pendientes.get(a.q.id).after) ?? {}).explanation !== undefined).length;
console.log(`Explicaciones que numeran las opciones (sin revisar): ${preguntas.length}`);
console.log(`Se pueden arreglar con seguridad: ${arreglos.length} (desde 0: ${arreglos.filter((a) => a.r.desde === 0).length} · desde 1: ${arreglos.filter((a) => a.r.desde === 1).length})`);
console.log(`  · añadir a una propuesta que ya tiene la pregunta: ${aAmpliar.length - yaLlevan}${yaLlevan ? ` (${yaLlevan} ya llevan una explicación propuesta: se saltan)` : ''}`);
console.log(`  · propuesta nueva: ${aCrear.length}`);
console.log(`No se arreglan solas (las mira un tutor): ${sinArreglo.total}`);
if (!HAZLO) { console.log('\nENSAYO: no se ha escrito nada. Con --hazlo se dejan las propuestas.'); process.exit(0); }

let ampliadas = 0;
for (const a of aAmpliar) {
  const p = pendientes.get(a.q.id);
  const antes = leeValores(p.before); const despues = leeValores(p.after);
  if (!antes || !despues || despues.explanation !== undefined) continue;
  const { error } = await db.from('question_proposals').update({
    before: { ...antes, explanation: a.q.explanation },
    after: { ...despues, explanation: a.r.texto },
    reason: `${p.reason} Además: ${MOTIVO_NUMERACION}`,
  }).eq('id', p.id).eq('status', 'pending');
  if (error) { console.error('No se pudo ampliar la propuesta:', error.message); process.exit(1); }
  ampliadas++;
}
const nuevas = await proponer(db, aCrear.map((a) => ({
  question_id: a.q.id, organization_id: a.q.organization_id,
  before: { explanation: a.q.explanation }, after: { explanation: a.r.texto }, reason: MOTIVO_NUMERACION,
})), { fuente: 'claude', titulo: 'Claude propone cambiar la numeración de las opciones en {n} explicaciones', detalle: 'La explicación decía «la opción 0, 1, 2» y el alumno ve A, B y C. Se cambia el número por su letra.' });
if (ampliadas > 0) {
  const { error } = await db.from('novedades').insert({ tipo: 'propuestas', organization_id: null,
    titulo: `Claude propone cambiar la numeración de las opciones en ${ampliadas} explicaciones más`,
    detalle: 'Se suma al cambio que ya tenían propuesto (referencia legal o «texto proporcionado»). La explicación decía «la opción 0, 1, 2» y el alumno ve A, B y C.' });
  if (error) console.error('No se pudo anotar la novedad:', error.message);
}
console.log(`\nPropuestas ampliadas: ${ampliadas} · nuevas: ${nuevas.escritas} (ya había: ${nuevas.yaHabia}, descartadas: ${nuevas.descartadas})`);

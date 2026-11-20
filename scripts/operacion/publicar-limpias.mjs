/**
 * PUBLICAR LAS PREGUNTAS «LIMPIAS» SIN LECTURA INDIVIDUAL (regla 139; decisión
 * del dueño, 20 nov 2026).
 *
 * Revisar una a una las 5.601 preguntas escritas por la IA no es viable antes de
 * que entren los alumnos. Las que no tienen NINGÚN aviso abierto y llevan
 * referencia legal (el repaso contra el BOE ya las comparó y cuadran) se
 * publican, a la espera de las quejas de los alumnos.
 *
 * NO las marca como «revisadas por un tutor»: nadie las ha leído. Lleva su
 * marca propia (`publicada_sin_leer_el`) y siguen pendientes de revisión.
 *
 *   node --experimental-strip-types scripts/operacion/publicar-limpias.mjs            ENSAYO: cuántas y por qué se quedan fuera. No escribe.
 *   node --experimental-strip-types scripts/operacion/publicar-limpias.mjs --hazlo    las publica.
 *
 * Una pregunta se publica si cumple TODO:
 *  - la escribió la IA, ningún tutor la ha revisado y no está ya publicada sin leer;
 *  - tiene referencia legal;
 *  - no tiene ningún aviso abierto (ley, «La IA duda», queja);
 *  - no lleva un defecto conocido que dañaría al alumno: una explicación que
 *    numera las opciones («la opción 2», que el alumno leería como la B) o un
 *    enunciado «según el texto proporcionado». Esas esperan su arreglo;
 *  - si está pendiente (candidate), está completa (explicación y dificultad).
 *
 * Reversible: poner `publicada_sin_leer_el` a null la deja como estaba (las
 * pendientes publicadas vuelven a pendiente con `status = 'candidate'`).
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { normalizeSupabaseUrl } from '../../app/lib/supabase-url.ts';
import { esAvisoOtroTema } from '../../app/lib/ambito-tema.ts';

config({ path: '.env.local' });
const HAZLO = process.argv.includes('--hazlo');
// --con-otro-tema: también las que SOLO tienen el aviso «no es de este tema, sino de otro» (siguen siendo del temario;
// decisión del dueño, 20 nov). Cualquier otro aviso, y el de «fuera del temario», las sigue dejando fuera.
const CON_OTRO_TEMA = process.argv.includes('--con-otro-tema');
const URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const db = createClient(URL, KEY, { auth: { persistSession: false } });

/**
 * Lo mismo que `estaCompleta` (`app/lib/preguntas-edicion.ts`): explicación de
 * verdad y dificultad. Se repite aquí porque ese módulo importa sin extensión
 * y Node no lo resuelve; un test vigila que sigan igual.
 */
const MIN_EXPLICACION = 20;
const estaCompleta = (q) => (q.explanation ?? '').trim().length >= MIN_EXPLICACION && [1, 2, 3].includes(Number(q.difficulty_level));

/** La explicación numera las opciones («opción 0», «opción 2»): desde 0 o desde 1, el alumno la leería mal. */
const NUMERA_OPCIONES = /opci[oó]n\s+\d/i;
const TEXTO_PROPORCIONADO = /texto proporcionado/i;

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

const preguntas = await todas((d, h) => db.from('question_bank')
  .select('id, status, question_text, explanation, legal_reference, difficulty_level')
  .eq('fuente', 'ia').is('reviewed_at', null).is('publicada_sin_leer_el', null).in('status', ['active', 'candidate']).order('id').range(d, h), 'question_bank');
const abiertos = await todas((d, h) => db.from('question_reports').select('id, question_id, message').eq('status', 'open').order('id').range(d, h), 'question_reports');
const conAviso = new Set(abiertos.filter((r) => !(CON_OTRO_TEMA && esAvisoOtroTema(r.message))).map((r) => r.question_id));

const fuera = { sinReferencia: 0, conAviso: 0, numeraOpciones: 0, textoProporcionado: 0, incompleta: 0 };
const publicables = [];
for (const q of preguntas) {
  if (!(q.legal_reference ?? '').trim()) { fuera.sinReferencia++; continue; }
  if (conAviso.has(q.id)) { fuera.conAviso++; continue; }
  if (NUMERA_OPCIONES.test(q.explanation ?? '')) { fuera.numeraOpciones++; continue; }
  if (TEXTO_PROPORCIONADO.test(q.question_text ?? '')) { fuera.textoProporcionado++; continue; }
  if (q.status === 'candidate' && !estaCompleta(q)) { fuera.incompleta++; continue; }
  publicables.push(q);
}
const activas = publicables.filter((q) => q.status === 'active');
const pendientes = publicables.filter((q) => q.status === 'candidate');
console.log(`Escritas por la IA sin revisar ni publicar: ${preguntas.length}`);
console.log(`Se quedan fuera: sin referencia ${fuera.sinReferencia} · con aviso abierto ${fuera.conAviso} · explicación que numera las opciones ${fuera.numeraOpciones} · «texto proporcionado» ${fuera.textoProporcionado} · pendientes incompletas ${fuera.incompleta}`);
console.log(`SE PUBLICAN: ${publicables.length} (${activas.length} del banco + ${pendientes.length} pendientes del Tomo)`);
if (!HAZLO) { console.log('\nENSAYO: no se ha escrito nada. Con --hazlo se publican.'); process.exit(0); }

const ahora = new Date().toISOString();
let hechas = 0;
for (let i = 0; i < publicables.length; i += 100) {
  const tanda = publicables.slice(i, i + 100);
  for (const [estado, ids] of [['active', tanda.filter((q) => q.status === 'active').map((q) => q.id)], ['candidate', tanda.filter((q) => q.status === 'candidate').map((q) => q.id)]]) {
    if (!ids.length) continue;
    // Las guardas se repiten en el UPDATE: si algo cambió desde que se leyó (un tutor la revisó, la descartó), no se toca.
    const cambios = estado === 'candidate' ? { publicada_sin_leer_el: ahora, status: 'active' } : { publicada_sin_leer_el: ahora };
    const { data, error } = await db.from('question_bank').update(cambios)
      .in('id', ids).eq('status', estado).eq('fuente', 'ia').is('reviewed_at', null).is('publicada_sin_leer_el', null).select('id');
    if (error) { console.error('No se pudo publicar:', error.message); process.exit(1); }
    hechas += data?.length ?? 0;
  }
}
const { error: errNov } = await db.from('novedades').insert({
  tipo: 'lote', organization_id: null,
  titulo: `Publicadas ${hechas} preguntas sin leerlas una a una (decisión del dueño)`,
  detalle: `Son de la IA, sin ningún aviso${CON_OTRO_TEMA ? ' (salvo el de «otro tema», que sigue abierto para que un tutor les cambie el tema)' : ''} y con referencia legal (${activas.length} del banco y ${pendientes.length} pendientes del Tomo I). Ningún tutor las ha leído: siguen en «Revisión» como «publicadas sin leer» y se miran si llega una queja de un alumno o cuando haya tiempo. Quedan sin publicar las que tienen aviso, no tienen referencia o llevan un defecto conocido (numeran las opciones o dicen «texto proporcionado»).`,
});
if (errNov) console.error('No se pudo anotar la novedad:', errNov.message);
console.log(`\nPublicadas: ${hechas}`);

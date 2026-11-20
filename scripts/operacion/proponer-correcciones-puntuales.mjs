/**
 * CORRECCIONES PUNTUALES DEL 20 NOV (regla 145): 12 referencias legales que la
 * propia pregunta o su explicación citan con claridad, y 4 enunciados que decían
 * «según el texto proporcionado». Se dejan como PROPUESTAS de Claude que decide
 * un tutor (regla 138): no cambian la pregunta.
 *
 * Cada una solo se propone si la pregunta sigue tal como se leyó (la «foto»
 * del antes): si alguien la tocó, se salta.
 *
 *   node --experimental-strip-types scripts/operacion/proponer-correcciones-puntuales.mjs           ENSAYO
 *   node --experimental-strip-types scripts/operacion/proponer-correcciones-puntuales.mjs --hazlo   deja las propuestas
 *
 * Las 5 preguntas de los temas 7, 9, 22 y 42 que no nombran su ley con claridad
 * NO están aquí: las ve un tutor.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { normalizeSupabaseUrl } from '../../app/lib/supabase-url.ts';
import { proponer } from './propuestas.mjs';

config({ path: '.env.local' });
const HAZLO = process.argv.includes('--hazlo');
const URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const db = createClient(URL, KEY, { auth: { persistSession: false } });

/** [principio del id, referencia, de dónde sale]. */
const REFERENCIAS = [
  ['24d12c0c', 'Art. 588 ter g LECrim', 'la explicación cita el artículo 588 ter g de la Ley de Enjuiciamiento Criminal'],
  ['47e154f9', 'Art. 588 bis c.1 LECrim', 'la explicación cita el artículo 588 bis c.1 de la Ley de Enjuiciamiento Criminal'],
  ['77e05b73', 'Art. 588 bis c.1 LECrim', 'la explicación cita el artículo 588 bis c.1 de la Ley de Enjuiciamiento Criminal'],
  ['bcbd42ca', 'Art. 588 ter d.3 LECrim', 'la explicación cita el artículo 588 ter d, apartado 3, de la Ley de Enjuiciamiento Criminal'],
  ['dc7628a6', 'Art. 588 bis c.1 LECrim', 'el enunciado cita el artículo 588 bis c de la Ley de Enjuiciamiento Criminal y la explicación su apartado 1'],
  ['fc2080c6', 'Art. 588 bis c.1 LECrim', 'el enunciado cita el artículo 588 bis c.1 de la Ley de Enjuiciamiento Criminal'],
  ['f480af52', 'Art. 266 LECrim', 'el enunciado cita el artículo 266 de la Ley de Enjuiciamiento Criminal'],
  ['1f747ae3', 'Art. 636 LECrim', 'el enunciado cita el artículo 636 de la Ley de Enjuiciamiento Criminal'],
  ['64a456a7', 'Art. 201.2 Código Penal', 'la explicación cita el artículo 201.2 del Código Penal'],
  ['26809c43', 'Art. 5.1.e) Reglamento de Armas', 'el enunciado cita el artículo 5.1.e) del Reglamento de Armas'],
  ['b55a6575', 'Arts. 8.2.b y 11.1.b Ley 12/2009', 'la explicación cita los artículos 8.2.b y 11.1.b de la ley de asilo del tema 12 (Ley 12/2009)'],
  ['40ae3c69', 'Art. 34.1 Ley 5/2014 de Seguridad Privada', 'la explicación cita el artículo 34.1 de la ley de seguridad privada del tema 13 (Ley 5/2014)'],
];
/** [principio del id, enunciado nuevo]: solo se quita «según el texto proporcionado», sin cambiar lo que se pregunta. */
const ENUNCIADOS = [
  ['54290178', 'Según la Ley de Enjuiciamiento Criminal, ¿qué ámbito temático se asocia a la redacción reformada del Artículo 265?'],
  ['d80957ff', '¿Cuál de las siguientes afirmaciones sobre los adjetivos es correcta según la Gramática de la lengua española?'],
  ['eca64eba', '¿Qué afirmación es correcta respecto a los Equipos de Protección Individual (EPI) para el personal policial, en materia de Prevención de Riesgos Laborales en Seguridad Vial?'],
  ['8004fec0', '¿Qué característica principal diferencia el fundamentalismo del fanatismo, en relación con los contravalores?'],
];

const filas = [];
for (let desde = 0; ; desde += 1000) {
  const { data, error } = await db.from('question_bank')
    .select('id, organization_id, question_text, legal_reference, status')
    .is('reviewed_at', null).in('status', ['active', 'candidate']).order('id').range(desde, desde + 999);
  if (error) { console.error('No se pudo leer:', error.message); process.exit(1); }
  filas.push(...(data ?? []));
  if ((data ?? []).length < 1000) break;
}
const porPrefijo = (p) => filas.filter((f) => f.id.startsWith(p));

const propuestas = [];
const saltadas = [];
for (const [p, ref, porque] of REFERENCIAS) {
  const f = porPrefijo(p);
  if (f.length !== 1) { saltadas.push(`${p}: ${f.length} coincidencias`); continue; }
  if ((f[0].legal_reference ?? '').trim()) { saltadas.push(`${p}: ya tiene referencia`); continue; }
  propuestas.push({ question_id: f[0].id, organization_id: f[0].organization_id, before: { legal_reference: null }, after: { legal_reference: ref },
    reason: `Falta la referencia legal: ${porque}.` });
}
for (const [p, nuevo] of ENUNCIADOS) {
  const f = porPrefijo(p);
  if (f.length !== 1) { saltadas.push(`${p}: ${f.length} coincidencias`); continue; }
  if (!/texto proporcionado/i.test(f[0].question_text)) { saltadas.push(`${p}: ya no dice «texto proporcionado»`); continue; }
  propuestas.push({ question_id: f[0].id, organization_id: f[0].organization_id, before: { question_text: f[0].question_text }, after: { question_text: nuevo },
    reason: 'El enunciado dice «según el texto proporcionado», que el alumno no tiene delante: se quita sin cambiar lo que pregunta.' });
}
console.log(`Propuestas preparadas: ${propuestas.length} (referencias: ${propuestas.filter((x) => 'legal_reference' in x.after).length} · enunciados: ${propuestas.filter((x) => 'question_text' in x.after).length}) · saltadas: ${saltadas.length}`);
saltadas.forEach((s) => console.log('  saltada:', s));
if (!HAZLO) { console.log('\nENSAYO: no se ha escrito nada. Con --hazlo se dejan las propuestas.'); process.exit(0); }
const r = await proponer(db, propuestas, { fuente: 'claude', titulo: 'Claude propone {n} correcciones puntuales (referencia legal o «texto proporcionado»)', detalle: 'Doce referencias que la propia pregunta cita con claridad y cuatro enunciados que decían «según el texto proporcionado».' });
console.log(`Escritas: ${r.escritas} · ya había: ${r.yaHabia} · descartadas: ${r.descartadas}`);

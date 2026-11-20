/**
 * LA DIFICULTAD MEDIDA con las respuestas reales (docs/DIFICULTAD.md, capa 3;
 * la lógica está en `app/lib/dificultad-medida.ts`).
 *
 * Lee las respuestas de los alumnos (`question_attempts` y las entregas de los
 * exámenes en clase), deja fuera las cuentas de demostración, y para cada
 * pregunta con 30 respuestas o más calcula el acierto y el nivel que dice.
 *
 *   npm run dificultad:medida            ENSAYO: cuenta y enseña, no escribe nada
 *   npm run dificultad:medida -- --hazlo escribe
 *
 * QUÉ ESCRIBE (solo con `--hazlo`)
 *   · `global_success_rate` de cada pregunta medida (un hecho, siempre);
 *   · `difficulty_level` y `difficulty_source = 'medida'` donde la medida
 *     manda: la estimación de la IA y el 2 por defecto ceden. NUNCA lo que
 *     puso un preparador: si discrepan, lo enseña en el informe y no lo toca.
 *
 * No habla con Gemini: no cuesta nada. Necesita la clave de servicio, así que
 * va por el flujo «Operación» de GitHub Actions.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { normalizeSupabaseUrl } from '../../app/lib/supabase-url.ts';
import { proponer } from './propuestas.mjs';
import {
  MIN_RESPUESTAS, UMBRAL_FACIL, UMBRAL_DIFICIL, observaciones, respuestasDeIntentos, respuestasDeExamenClase, decideCambios,
} from '../../app/lib/dificultad-medida.ts';

config({ path: '.env.local' });

const HAZLO = process.argv.includes('--hazlo');
const URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const db = createClient(URL, KEY, { auth: { persistSession: false } });

/** Todas las filas de una consulta, de 1.000 en 1.000: PostgREST corta ahí sin avisar (regla 74). */
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

// 1. Las cuentas de demostración, fuera (la carga las apunta en `demo_registro`).
const demo = await todas((d, h) => db.from('demo_registro').select('id, clave').eq('tabla', 'auth.users').order('id').range(d, h), 'demo_registro');
const excluidos = new Set(demo.map((x) => x.clave?.id).filter(Boolean));

// 2. Las respuestas.
const intentos = await todas(
  (d, h) => db.from('question_attempts').select('id, user_id, question_id, selected_index, is_correct, created_at').order('id').range(d, h),
  'question_attempts',
);
const deIntentos = respuestasDeIntentos(intentos);

const entregas = await todas(
  (d, h) => db.from('exam_results').select('id, user_id, sitting_id, answers, submitted_at, absent').order('id').range(d, h),
  'exam_results',
);
const sittings = await todas((d, h) => db.from('exam_sittings').select('id, paper_id').order('id').range(d, h), 'exam_sittings');
const papers = await todas((d, h) => db.from('exam_papers').select('id, questions').order('id').range(d, h), 'exam_papers');
const papelDe = new Map(sittings.map((s) => [s.id, papers.find((p) => p.id === s.paper_id)]));
const deClase = [];
for (const e of entregas) {
  if (e.absent || !e.submitted_at || !Array.isArray(e.answers)) continue;
  const papel = papelDe.get(e.sitting_id);
  if (!papel || !Array.isArray(papel.questions)) continue;
  deClase.push(...respuestasDeExamenClase(e.user_id, e.submitted_at, papel.questions, e.answers));
}

const todasLasRespuestas = [...deIntentos, ...deClase];
const obs = observaciones(todasLasRespuestas, excluidos);

// 3. Las preguntas del banco y lo que habría que hacer.
const banco = await todas(
  (d, h) => db.from('question_bank').select('id, difficulty_level, difficulty_source, organization_id').eq('status', 'active').order('id').range(d, h),
  'question_bank',
);
const propuestas = decideCambios(banco, obs);

const deDemo = intentos.filter((i) => excluidos.has(i.user_id)).length;
console.log(`Cuentas de demostración excluidas: ${excluidos.size}`);
console.log(`question_attempts: ${intentos.length} (de demostración: ${deDemo}) · respuestas medibles de alumnos reales: ${deIntentos.filter((r) => !excluidos.has(r.userId)).length}`);
console.log(`Exámenes en clase: ${entregas.length} entregas · respuestas medibles: ${deClase.filter((r) => !excluidos.has(r.userId)).length}`);
console.log(`Preguntas con alguna respuesta real: ${obs.size} · con ${MIN_RESPUESTAS} o más: ${propuestas.length}`);
const mayor = [...obs.values()].reduce((m, o) => Math.max(m, o.contestadas), 0);
console.log(`Máximo de respuestas en una sola pregunta: ${mayor}`);
console.log(`Umbrales: fácil si acierta ≥ ${UMBRAL_FACIL * 100} % · difícil si < ${UMBRAL_DIFICIL * 100} % · media entre medias`);

if (propuestas.length === 0) {
  console.log(`\nTodavía no hay ninguna pregunta con ${MIN_RESPUESTAS} respuestas reales: nada que medir. Vuelve cuando haya más actividad o exámenes en clase.`);
  process.exit(0);
}

const reparto = { 1: 0, 2: 0, 3: 0 };
for (const p of propuestas) reparto[p.nivel]++;
const cambian = propuestas.filter((p) => p.escribeNivel);
const conflictos = propuestas.filter((p) => p.conflicto);
console.log(`\nNivel medido: ${JSON.stringify(reparto)} · cambiarían de nivel: ${cambian.length} · conflictos con un preparador: ${conflictos.length}`);
for (const c of conflictos.slice(0, 20)) console.log(`   conflicto ${c.id}: la medida dice ${c.nivel} (acierto ${Math.round(c.tasa * 100)} % con ${c.contestadas} respuestas)`);

if (!HAZLO) { console.log('\nEnsayo: no se ha escrito nada. Añade --hazlo para escribir.'); process.exit(0); }

// El acierto observado es un dato, no un cambio de la pregunta: se escribe.
// El NIVEL sí cambia lo que ve el alumno: se PROPONE y lo decide un tutor
// (regla 138). Antes se escribía solo.
let escritas = 0, fallidas = 0;
for (const p of propuestas) {
  const { error } = await db.from('question_bank').update({ global_success_rate: Math.round(p.tasa * 1000) / 1000 }).eq('id', p.id);
  if (error) fallidas++; else escritas++;
}
console.log(`\nAcierto observado escrito: ${escritas} · fallos al escribir: ${fallidas}`);

const filaDe = new Map(banco.map((b) => [b.id, b]));
const NOMBRE = { 1: 'fácil', 2: 'media', 3: 'difícil' };
// También donde un preparador puso otro nivel: antes se callaba (la medida
// no pisaba al preparador); ahora se le propone y decide él.
const res = await proponer(db, [...cambian, ...conflictos].map((p) => ({
  question_id: p.id,
  organization_id: filaDe.get(p.id)?.organization_id ?? null,
  before: { difficulty_level: filaDe.get(p.id)?.difficulty_level ?? null },
  after: { difficulty_level: p.nivel },
  reason: `Con ${p.contestadas} respuestas reales, el acierto es del ${Math.round(p.tasa * 100)} %: por cómo la contestan, es ${NOMBRE[p.nivel]}.`,
})), { fuente: 'dificultad', titulo: 'La medición de dificultad propone {n} cambios de nivel', detalle: 'Salen de las respuestas reales de los alumnos.' });
console.log(`Cambios de nivel propuestos a los tutores: ${res.escritas} · ya había una propuesta pendiente: ${res.yaHabia}`);

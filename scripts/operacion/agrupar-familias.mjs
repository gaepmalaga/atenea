/**
 * Agrupa las preguntas repetidas en familias (regla 119).
 *
 *   npm run familias                 # ENSAYO: calcula y cuenta, no escribe nada
 *   npm run familias -- --hazlo      # guarda `question_bank.family_id`
 *
 * El banco se generó con el modelo a partir de los mismos artículos y tiene
 * muchas preguntas que son la misma con otras palabras. Esto las agrupa por
 * similitud de texto (`app/lib/familias.ts`, sin IA y sin gasto) y guarda en
 * `family_id` el MISMO valor en todas las de una familia. No borra ni
 * desactiva ninguna: el generador de exámenes no mete dos de la misma familia.
 *
 * El id de una familia es el id más pequeño de sus miembros, así que repetir el
 * cálculo no cambia nada si el banco no ha cambiado, y solo se escriben las
 * diferencias. Hay que repetirlo cuando entren preguntas nuevas.
 *
 * Necesita `docs/sql/familias-preguntas.sql` ejecutado.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { writeFileSync } from 'node:fs';
import { normalizeSupabaseUrl } from '../../app/lib/supabase-url.ts';
import { familiasDelBanco, UMBRAL_FAMILIA, MAX_FAMILIA } from '../../app/lib/familias.ts';

config({ path: '.env.local' });
const URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const hazlo = process.argv.includes('--hazlo');
const db = createClient(URL, KEY, { auth: { persistSession: false } });

// Todas las activas, paginadas (PostgREST corta a 1.000, regla 74).
const filas = [];
for (let desde = 0; ; desde += 1000) {
  const { data, error } = await db.from('question_bank')
    .select('id, subject_id, question_text, options, correct_index, family_id')
    .eq('status', 'active').order('id').range(desde, desde + 999);
  if (error) { console.error('No se pudo leer el banco:', error.message); process.exit(1); }
  filas.push(...(data ?? []));
  if ((data ?? []).length < 1000) break;
}
const { data: temas } = await db.from('subjects').select('id, title, topic_number');
const tema = new Map((temas ?? []).map((t) => [t.id, t]));

const preguntas = filas.map((f) => ({ id: f.id, tema: f.subject_id, enunciado: f.question_text, opciones: f.options, correcta: f.correct_index }));
const { familias } = familiasDelBanco(preguntas);

const nuevo = new Map(); // id de pregunta -> id de familia
for (const f of familias) {
  const id = f.miembros.map((i) => preguntas[i].id).sort()[0];
  for (const i of f.miembros) nuevo.set(preguntas[i].id, id);
}
const sobran = familias.reduce((n, f) => n + f.miembros.length - 1, 0);

console.log(`Banco: ${filas.length} preguntas activas · umbral ${UMBRAL_FAMILIA} · tope de familia ${MAX_FAMILIA}`);
console.log(`Familias: ${familias.length} · preguntas implicadas: ${nuevo.size} · REPETICIONES: ${sobran} (${Math.round((sobran / filas.length) * 100)} %) · hechos distintos: ${filas.length - sobran}`);

// Por tema: cuántas preguntas y cuántos hechos distintos (esto dice dónde falta banco de verdad).
const porTema = new Map();
for (const f of filas) {
  const t = tema.get(f.subject_id);
  const k = t?.topic_number ?? 0;
  const x = porTema.get(k) ?? { titulo: t?.title ?? '?', total: 0, familias: new Set(), sueltas: 0 };
  x.total++;
  const fam = nuevo.get(f.id);
  if (fam) x.familias.add(fam); else x.sueltas++;
  porTema.set(k, x);
}
const resumen = [...porTema.entries()].sort((a, b) => a[0] - b[0]).map(([n, x]) => ({ tema: n, titulo: x.titulo, preguntas: x.total, hechos: x.familias.size + x.sueltas }));
console.log('\nTema · preguntas → hechos distintos');
for (const r of resumen) console.log(`  ${String(r.tema).padStart(2)} · ${String(r.preguntas).padStart(3)} → ${String(r.hechos).padStart(3)}  ${r.titulo.slice(0, 60)}`);
writeFileSync('docs/dificultad/hechos-por-tema.json', JSON.stringify(resumen, null, 1));

const cambios = filas.filter((f) => (nuevo.get(f.id) ?? null) !== (f.family_id ?? null));
console.log(`\n${cambios.length} preguntas cambian de familia respecto a lo guardado.`);
if (!hazlo) { console.log('Ensayo: no se ha escrito nada. Con --hazlo se guarda.'); process.exit(0); }

// Se escribe por familia (un UPDATE por familia) y se quitan las que ya no la tienen.
let escritas = 0;
const porFamilia = new Map();
for (const f of cambios) {
  const fam = nuevo.get(f.id) ?? null;
  (porFamilia.get(fam) ?? porFamilia.set(fam, []).get(fam)).push(f.id);
}
for (const [fam, ids] of porFamilia) {
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await db.from('question_bank').update({ family_id: fam }).in('id', ids.slice(i, i + 100));
    if (error) { console.error('Error al escribir:', error.message); process.exit(1); }
    escritas += ids.slice(i, i + 100).length;
  }
}
console.log(`Hecho: ${escritas} preguntas actualizadas.`);

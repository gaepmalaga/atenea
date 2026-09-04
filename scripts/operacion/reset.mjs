/**
 * RESET DEL CONTENIDO Y DE LA ACTIVIDAD.
 *
 * Deja la plataforma como recién instalada —sin documentos, sin preguntas y
 * sin historial— pero **sin tocar las cuentas**.
 *
 * POR QUÉ NO BORRA USUARIOS
 * Borrar `auth.users` es el único paso de todo esto que no se puede deshacer y
 * que puede dejarte fuera de tu propia plataforma: si el script muere después
 * del DELETE y antes de crear el admin, la única salida es el panel de
 * Supabase. Y no hace falta: lo que ensucia las estadísticas y el panel de
 * academia es `question_attempts`, no la fila de la cuenta. Vaciando la
 * actividad, las métricas quedan igual de a cero.
 *
 * TAMPOCO BORRA `subjects` NI `blocks`
 * Son la estructura oficial del programa del BOE, la define
 * `temario/temario.json`, y sus ids son la clave ajena de todo lo demás.
 * Recrearlos renumera los temas y deja huérfana cualquier fila que sobreviva.
 *
 * USO
 *   npm run reset              -- enseña lo que hay y NO borra nada
 *   npm run reset -- --hazlo   -- borra de verdad, pidiendo confirmación
 */
import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'node:readline/promises';
import { config } from 'dotenv';

config({ path: '.env.local' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

/**
 * El orden importa: primero lo que apunta a otra cosa.
 *
 * `document_chunks` antes que `documents`, y todo lo que referencia a
 * `question_bank` antes que el propio banco. Con las claves ajenas declaradas,
 * al revés falla; sin ellas, deja filas colgando de un id que ya no existe.
 */
/*
 * `filtro` es la columna con la que se hace el DELETE, y NO siempre es `id`:
 * seis de estas tablas no tienen esa columna —`question_votes` va por
 * `(question_id, user_id)`, los tres perfiles por `user_id`, `ai_quota` por
 * `(user_id, bucket)` y `exam_questions` por `(exam_id, position)`—. Escribirlo
 * a ojo es el fallo más caro de este repo: PostgREST rechaza la operación
 * entera cuando una columna no existe. Comprobado contra `supabase/schema.json`.
 */
const TABLAS = [
  // Actividad del alumno
  { nombre: 'question_attempts', filtro: 'id', que: 'respuestas a preguntas' },
  { nombre: 'test_results', filtro: 'id', que: 'resultados antiguos (tabla en desuso)' },
  { nombre: 'question_notes', filtro: 'id', que: 'notas privadas del alumno' },
  { nombre: 'question_votes', filtro: 'question_id', que: 'votos a preguntas' },
  { nombre: 'question_reports', filtro: 'id', que: 'reportes de preguntas' },
  { nombre: 'exam_questions', filtro: 'exam_id', que: 'preguntas de exámenes guardados' },
  { nombre: 'exams', filtro: 'id', que: 'exámenes guardados' },
  { nombre: 'flashcard_results', filtro: 'id', que: 'repasos de fichas' },
  { nombre: 'flashcard_progress', filtro: 'id', que: 'progreso de repetición espaciada' },
  { nombre: 'flashcard_bank', filtro: 'id', que: 'fichas generadas' },
  { nombre: 'workout_logs', filtro: 'id', que: 'sesiones de entrenamiento' },
  { nombre: 'training_plans', filtro: 'id', que: 'planes de entrenamiento' },
  { nombre: 'profiles_physical', filtro: 'user_id', que: 'perfiles físicos y marcas' },
  { nombre: 'profiles_biodata', filtro: 'user_id', que: 'biodata del perfilado' },
  { nombre: 'profiles_psych', filtro: 'user_id', que: 'psicotécnicos' },
  { nombre: 'ai_quota', filtro: 'user_id', que: 'contadores de cuota de IA' },
  // Contenido
  { nombre: 'question_bank', filtro: 'id', que: 'PREGUNTAS DEL BANCO' },
  { nombre: 'document_chunks', filtro: 'id', que: 'fragmentos indexados' },
  { nombre: 'documents', filtro: 'id', que: 'DOCUMENTOS DEL TEMARIO' },
  { nombre: 'content_documents', filtro: 'id', que: 'documentos de contenido (tabla en desuso)' },
];

/** Lo que NO se toca, y se dice en voz alta para que nadie lo dé por supuesto. */
const INTOCABLES = ['auth.users', 'profiles', 'subjects', 'blocks', 'module_settings'];

async function cuenta(tabla) {
  const { count, error } = await db.from(tabla).select('*', { count: 'exact', head: true });
  if (error) return { count: null, error: error.message };
  return { count: count ?? 0 };
}

async function main() {
  const hazlo = process.argv.includes('--hazlo');

  console.log(`\nProyecto: ${URL}`);
  console.log(hazlo ? '\n⚠  MODO REAL: se va a borrar.\n' : '\nEnsayo. No se borra nada. Añade --hazlo para ejecutarlo.\n');

  let total = 0;
  const presentes = [];
  for (const t of TABLAS) {
    const { count, error } = await cuenta(t.nombre);
    if (error) {
      // Una tabla que no existe en este proyecto no es un fallo: se dice y se
      // sigue. Lo que sí sería un fallo es borrar a ciegas y no enterarse.
      console.log(`  ·  ${t.nombre.padEnd(20)} no accesible (${error})`);
      continue;
    }
    console.log(`  ${count > 0 ? '✱' : '·'}  ${t.nombre.padEnd(20)} ${String(count).padStart(6)}  ${t.que}`);
    total += count;
    if (count > 0) presentes.push(t.nombre);
  }

  console.log(`\n  Total de filas a borrar: ${total}`);
  console.log(`  NO se tocan: ${INTOCABLES.join(', ')}`);

  // Las cuentas, para que se vea que siguen.
  const { data: perfiles } = await db.from('profiles').select('id, email, role');
  console.log(`\n  Cuentas que se quedan (${perfiles?.length ?? 0}):`);
  for (const p of perfiles ?? []) console.log(`    · ${p.email ?? p.id} — ${p.role ?? 'sin rol'}`);

  if (!hazlo) {
    console.log('\nEnsayo terminado. Nada se ha borrado.\n');
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const escrito = await rl.question(`\nEscribe RESET para borrar esas ${total} filas: `);
  rl.close();
  if (escrito.trim() !== 'RESET') {
    console.log('Cancelado. No se ha borrado nada.\n');
    return;
  }

  console.log('');
  for (const t of TABLAS) {
    if (!presentes.includes(t.nombre)) continue;
    // PostgREST exige un filtro en un DELETE: sin él devuelve error en vez de
    // vaciar la tabla, que es una protección sensata y aquí hay que
    // desactivarla a propósito. La columna sale de `filtro`, no siempre `id`.
    const { error } = await db.from(t.nombre).delete().not(t.filtro, 'is', null);
    if (error) console.log(`  ✗ ${t.nombre}: ${error.message}`);
    else console.log(`  ✓ ${t.nombre}`);
  }

  console.log('\nComprobando que ha quedado vacío…');
  let restos = 0;
  for (const t of TABLAS) {
    const { count, error } = await cuenta(t.nombre);
    if (error || !count) continue;
    console.log(`  ✗ ${t.nombre} conserva ${count} filas`);
    restos += count;
  }
  console.log(restos === 0 ? '\nVacío. Las cuentas y los temas siguen ahí.\n' : `\nQuedan ${restos} filas sin borrar (mira los errores de arriba).\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });

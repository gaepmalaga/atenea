/**
 * Ver QUÉ SESIÓN le montaría el entrenamiento adaptativo a un alumno, sin
 * levantar la aplicación y sin gastar nada.
 *
 * POR QUÉ EXISTE
 * P10 reparte las preguntas por cajones (repetición espaciada). Igual que el
 * chat, esto no se revisa leyendo el código: se revisa viendo lo que sale. Este
 * guion reproduce el mismo cálculo que `getAdaptiveSession` —importa
 * `question-scheduler` y `smart-session` de `app/lib/`— y enseña:
 *   · los cajones del alumno (nueva / recaída / en aprendizaje / … / atascada)
 *   · la curva de aprendizaje por tema
 *   · una sesión de ejemplo con su mezcla, el acierto estimado y el orden
 *
 * NO cuesta dinero y NO escribe nada. Solo lee.
 *
 *   npm run sesion:adaptativa -- alumno@correo.com
 *   npm run sesion:adaptativa -- alumno@correo.com 30      (30 preguntas)
 */

import { readFileSync } from 'node:fs';
import { computeQuestionStates, resumeCajonesPorTema } from '../app/lib/question-scheduler.ts';
import { buildSmartSession } from '../app/lib/smart-session.ts';

const env = Object.fromEntries(
  ['.env.local', '.env']
    .flatMap((f) => {
      try { return readFileSync(f, 'utf8').split(/\r?\n/); } catch { return []; }
    })
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const get = async (ruta) => (await fetch(`${URL}/rest/v1/${ruta}`, { headers: H })).json();

const correo = process.argv[2];
const limit = Number(process.argv[3]) || 20;
if (!correo) { console.error('Uso: npm run sesion:adaptativa -- alumno@correo.com [nº preguntas]'); process.exit(1); }

const perfiles = await get(`profiles?email=eq.${encodeURIComponent(correo)}&select=id,email,role`);
if (!perfiles.length) { console.error(`No hay ningún alumno con el correo ${correo}`); process.exit(1); }
const alumno = perfiles[0];

const [intentos, banco, temas] = await Promise.all([
  get(`question_attempts?user_id=eq.${alumno.id}&select=question_id,is_correct,error_type,selected_index,response_time_ms,option_changes,created_at&order=created_at.asc&limit=30000`),
  get(`question_bank?status=eq.active&select=id,subject_id,global_success_rate&limit=5000`),
  get(`subjects?select=id,title`),
]);

const tituloPorSubject = new Map(temas.map((s) => [s.id, s.title]));
const preguntasPorTema = new Map();
for (const q of banco) preguntasPorTema.set(q.id, tituloPorSubject.get(q.subject_id) ?? 'Sin tema');

const states = computeQuestionStates(intentos);

// --- Cajones -----------------------------------------------------------------
const porCajon = {};
for (const s of states.values()) porCajon[s.cajon] = (porCajon[s.cajon] ?? 0) + 1;
console.log(`\n═══ ${alumno.email} (${alumno.role}) ═══`);
console.log(`${intentos.length} respuestas · ${states.size} preguntas con estado · banco activo: ${banco.length}\n`);
console.log('CAJONES:');
for (const c of ['nueva', 'recaida', 'aprendiendo', 'consolidando', 'dominada', 'atascada']) {
  console.log(`  ${c.padEnd(13)} ${porCajon[c] ?? 0}`);
}

// --- Curva por tema (solo los que ha tocado) -------------------------------
const curva = resumeCajonesPorTema(states, preguntasPorTema).filter((t) => t.total - t.nuevas > 0);
if (curva.length) {
  console.log('\nDOMINIO DEL TEMARIO (temas empezados):');
  for (const t of curva) {
    const barra = '█'.repeat(Math.round(t.progreso / 5)).padEnd(20);
    console.log(`  ${String(t.progreso).padStart(3)}% ${barra} ${t.topic.slice(0, 55)}`);
    console.log(`       ${t.dominadas} dominadas · ${t.consolidando} consolidando · ${t.aprendiendo} en aprendizaje · ${t.nuevas} sin empezar${t.atascadas ? ` · ${t.atascadas} atascadas` : ''}`);
  }
}

// --- Sesión de ejemplo (todos los temas) ----------------------------------
const disponibles = banco.map((q) => ({
  questionId: q.id,
  topic: tituloPorSubject.get(q.subject_id) ?? 'Sin tema',
  globalSuccessRate: typeof q.global_success_rate === 'number' ? q.global_success_rate : null,
}));
const ses = buildSmartSession({ states, disponibles, limit });

console.log(`\nSESIÓN DE EJEMPLO (${limit} preguntas, todos los temas):`);
console.log(`  mezcla:  ${Object.entries(ses.resumen).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(' · ')}`);
console.log(`  acierto estimado: ${Math.round(ses.aciertoEstimado * 100)}%  ${ses.aciertoEstimado >= 0.8 && ses.aciertoEstimado <= 0.9 ? '(en el punto dulce)' : ''}`);
if (ses.bancoCorto) console.log(`  ⚠ el banco no daba para ${limit}: salieron ${ses.questionIds.length}`);
if (ses.atascadasTotales) console.log(`  el alumno tiene ${ses.atascadasTotales} preguntas atascadas en total`);
const temaDe = new Map(disponibles.map((d) => [d.questionId, d.topic]));
console.log(`  orden de temas: ${ses.questionIds.map((id) => (temaDe.get(id) ?? '?').split(/[:(]/)[0].trim().slice(0, 12)).join(' → ')}`);
console.log('');

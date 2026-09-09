/**
 * TEMPORAL — crea dos cuentas de prueba para el piloto y le mete al alumno un
 * mes de actividad realista. Borrar tras usar.
 *
 *   node scripts/_seed-piloto.mjs
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: SVC, Authorization: 'Bearer ' + SVC, 'Content-Type': 'application/json' };

const rest = (p, opts = {}) => fetch(URL + '/rest/v1/' + p, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
const admin = (p, opts = {}) => fetch(URL + '/auth/v1/admin/' + p, { ...opts, headers: H });

// ── 1. CUENTAS ──────────────────────────────────────────────
async function upsertUser(email, password, role) {
  const list = await admin('users?per_page=200').then((r) => r.json());
  let user = list.users.find((u) => u.email === email);
  if (user) {
    await admin('users/' + user.id, { method: 'PUT', body: JSON.stringify({ password, email_confirm: true }) });
    console.log(`  ${email} — ya existía, contraseña actualizada`);
  } else {
    const r = await admin('users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }) });
    user = await r.json();
    if (!user.id) throw new Error('no se pudo crear ' + email + ': ' + JSON.stringify(user));
    console.log(`  ${email} — creada`);
  }
  await rest('profiles?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: user.id, email, role }),
  });
  return user.id;
}

console.log('Cuentas:');
const adminId = await upsertUser('morato@atenea.com', 'alphapol', 'admin');
const alumnoId = await upsertUser('alumno@atenea.com', 'alphapol', 'student');

// Acceso del alumno
await rest('memberships?on_conflict=user_id', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates' },
  body: JSON.stringify({ user_id: alumnoId, access_status: 'active', payment_status: 'al_dia', updated_at: new Date().toISOString() }),
});

// ── 2. BANCO REAL ───────────────────────────────────────────
const subjects = await rest('subjects?select=id,title,topic_number').then((r) => r.json());
const tituloDe = new Map(subjects.map((s) => [s.id, s.title]));
const bank = await rest('question_bank?select=id,subject_id,legal_reference,difficulty_level&status=eq.active').then((r) => r.json());
const bankBySubj = new Map();
for (const q of bank) {
  if (!bankBySubj.has(q.subject_id)) bankBySubj.set(q.subject_id, []);
  bankBySubj.get(q.subject_id).push(q);
}

// Temas en los que el alumno ha trabajado (Bloque I + algo de penal)
const FOCO = subjects.filter((s) => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 17].includes(s.topic_number));
const preguntasFoco = FOCO.flatMap((s) => (bankBySubj.get(s.id) ?? []).map((q) => ({ ...q, topic: s.title })));

// ── 3. BORRAR LO ANTERIOR DEL ALUMNO ────────────────────────
await rest('question_attempts?user_id=eq.' + alumnoId, { method: 'DELETE' });
await rest('flashcard_progress?user_id=eq.' + alumnoId, { method: 'DELETE' });
await rest('flashcard_results?user_id=eq.' + alumnoId, { method: 'DELETE' });

// ── 4. UN MES DE ACTIVIDAD ──────────────────────────────────
const HOY = new Date();
const iso = (offsetDias, hora, min = 0) => {
  const d = new Date(HOY);
  d.setDate(d.getDate() - offsetDias);
  d.setHours(hora, min, Math.floor(Math.random() * 60), 0);
  return d.toISOString();
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const entre = (a, b) => a + Math.floor(Math.random() * (b - a));

const filas = [];
const nueva = (o) => filas.push({ id: randomUUID(), user_id: alumnoId, confidence: null, ...o });

// 4a. Preguntas que se le atascan (fallos repetidos, con artículo)
const atascadas = preguntasFoco.filter((q) => q.legal_reference).sort(() => Math.random() - 0.5).slice(0, 4);
atascadas.forEach((q, i) => {
  const distractorFijo = i < 2 ? entre(0, 3) : null; // 2 con creencia fija
  for (let k = 0; k < 5; k++) {
    const off = 27 - k * 6 - entre(0, 2);
    if (off < 1) continue;
    nueva({
      question_id: q.id, topic: q.topic, is_correct: false,
      selected_index: distractorFijo ?? entre(0, 3),
      response_time_ms: entre(9000, 30000), first_touch_ms: entre(9000, 30000), option_changes: 0,
      error_type: pick(['desconocimiento', 'olvido', 'trampa']),
      exam_id: null, created_at: iso(off, entre(17, 21)),
    });
  }
});

// 4b. Entrenamiento casi a diario, con el acierto subiendo semana a semana
const DIAS_ESTUDIO = [
  28, 27, 26, 24, 23, 22, 20, 19, 18, 16, 15, 14, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
]; // 25 de 29 días, con racha final
for (const off of DIAS_ESTUDIO) {
  const semana = Math.floor((28 - off) / 7); // 0..4
  const accBase = [0.46, 0.52, 0.58, 0.64, 0.68][Math.min(4, semana)];
  const nPreg = entre(8, 16);
  const tema = pick(FOCO);
  const pool = bankBySubj.get(tema.id) ?? [];
  for (let k = 0; k < nPreg; k++) {
    const q = pick(pool);
    const acierto = Math.random() < accBase + (Math.random() - 0.5) * 0.15;
    const t = entre(5000, 32000) - semana * 1500; // más rápido con el tiempo
    nueva({
      question_id: q.id, topic: tema.title, is_correct: acierto,
      selected_index: entre(0, 3),
      response_time_ms: Math.max(2500, t), first_touch_ms: Math.max(2500, t), option_changes: 0,
      error_type: !acierto && Math.random() < 0.4 ? pick(['olvido', 'desconocimiento', 'trampa', 'fallo_procesamiento']) : null,
      exam_id: null, created_at: iso(off, entre(8, 22), entre(0, 55)),
    });
  }
}

// 4c. Simulacros, con la nota subiendo y cruzando el aprobado
const SIMULACROS = [
  { off: 26, N: 25, A: 13, E: 10, B: 2 },
  { off: 21, N: 25, A: 15, E: 8, B: 2 },
  { off: 15, N: 50, A: 30, E: 16, B: 4 },
  { off: 9, N: 25, A: 16, E: 7, B: 2 },
  { off: 4, N: 50, A: 33, E: 14, B: 3 },
  { off: 1, N: 50, A: 36, E: 11, B: 3 },
];
for (const sim of SIMULACROS) {
  const examId = randomUUID();
  const preg = preguntasFoco.sort(() => Math.random() - 0.5).slice(0, sim.N);
  let iA = sim.A, iE = sim.E, iB = sim.B;
  preg.forEach((q, k) => {
    let is_correct, selected_index;
    if (iB > 0 && (Math.random() < 0.5 || iA + iE === 0)) { iB--; is_correct = false; selected_index = -1; }
    else if (iA > 0 && (Math.random() < iA / (iA + iE) || iE === 0)) { iA--; is_correct = true; selected_index = entre(0, 3); }
    else { iE--; is_correct = false; selected_index = entre(0, 3); }
    const total = entre(12000, 42000);
    nueva({
      question_id: q.id, topic: q.topic, is_correct, selected_index,
      response_time_ms: total,
      first_touch_ms: selected_index === -1 ? null : Math.round(total * (0.4 + Math.random() * 0.35)),
      option_changes: Math.random() < 0.2 ? entre(1, 3) : 0,
      error_type: null,
      exam_id: examId, created_at: iso(sim.off, entre(10, 13), k),
    });
  });
}

// Insertar en lotes
for (let i = 0; i < filas.length; i += 200) {
  const r = await rest('question_attempts', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(filas.slice(i, i + 200)) });
  if (!r.ok) throw new Error('insert question_attempts: ' + r.status + ' ' + (await r.text()));
}
console.log(`\n${filas.length} respuestas insertadas (${SIMULACROS.length} simulacros, ${atascadas.length} atascadas).`);

// ── 5. FICHAS ───────────────────────────────────────────────
const fcBank = await rest('flashcard_bank?select=id,front,back,topic&status=eq.active').then((r) => r.json());
const fcFoco = fcBank.filter((c) => FOCO.some((s) => s.title === c.topic));
const fcProg = [];
for (const c of fcFoco.sort(() => Math.random() - 0.5).slice(0, 55)) {
  const box = entre(1, 6);
  const nr = new Date(HOY);
  nr.setDate(nr.getDate() + entre(-3, [1, 3, 7, 15, 30][Math.min(4, box - 1)]));
  fcProg.push({
    id: randomUUID(), user_id: alumnoId, card_id: c.id, topic: c.topic,
    front: c.front, back: c.back, box, next_review: nr.toISOString(),
    created_at: iso(entre(2, 25), 20),
  });
}
const rf = await rest('flashcard_progress', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(fcProg) });
if (!rf.ok) console.log('  fichas:', rf.status, await rf.text());
else console.log(`${fcProg.length} fichas con progreso.`);

console.log('\n✅ Listo.');
console.log('   admin  → morato@atenea.com / alphapol');
console.log('   alumno → alumno@atenea.com / alphapol');

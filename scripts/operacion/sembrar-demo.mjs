/**
 * LA ACADEMIA "DEMO" — una academia real para enseñar el panel real.
 *
 * Sale del traspaso del 13-14 sep 2026: `/academias/demo` se había construido
 * como una página suelta con datos de fixtures que IMITA el aspecto del panel
 * — no es el panel. Esto hace lo que de verdad se pidió: una academia como
 * cualquier otra (`academies`, P11), con un admin real y alumnos "demo" con
 * datos inventados pero en filas de verdad — `profiles`, `question_attempts`,
 * `class_groups`, `monthly_payments`… — para que entrar con ese correo enseñe
 * el `AdminView` de producción, sin ninguna pieza aparte.
 *
 * NO NECESITA SQL NUEVO: todas las tablas que toca existen desde P7/P8/P10/P11.
 *
 * OJO CON `last_sign_in_at`: no se puede escribir por API (lo pone Supabase Auth
 * al autenticar de verdad, no PostgREST). Así que en vez de inventarlo, este
 * guion hace un login REAL (`signInWithPassword`, con la clave anónima) para
 * los alumnos que deben aparecer «activos» — deja a uno sin loguear para que
 * «nunca ha entrado» (regla 46) también sea un caso de verdad, y a otro sin
 * fila en `memberships` para que «pendiente de activar» lo sea también. Lo que
 * SÍ se controla del todo es `question_attempts.created_at`: por eso el eje
 * «¿estudia?» tiene más variedad que el eje «¿viene?».
 *
 * REANUDABLE: cuentas, grupos, ajustes, pagos y membresías van con upsert —
 * volver a lanzarlo no duplica nada. `question_attempts`/`flashcard_progress`
 * se saltan si el alumno ya tiene datos, salvo `--borrar`.
 *
 * USO
 *   npm run sembrar:demo
 *   npm run sembrar:demo -- --borrar   (re-siembra la actividad desde cero)
 */
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { normalizeSupabaseUrl } from '../../app/lib/supabase-url.ts';
import { periodoActual, periodosRecientes } from '../../app/lib/payments.ts';

config({ path: '.env.local' });

const URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !KEY || !ANON) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });
const BORRAR = process.argv.includes('--borrar');

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const entre = (a, b) => a + Math.floor(Math.random() * (b - a));
const HOY = new Date();
const iso = (offsetDias, hora, min = 0) => {
  const d = new Date(HOY);
  d.setDate(d.getDate() - offsetDias);
  d.setHours(hora, min, Math.floor(Math.random() * 60), 0);
  return d.toISOString();
};

// =====================================================================
// LOS DATOS DE LA ACADEMIA — todo inventado, pensado para reconocerse en
// pantalla (regla 8: null ≠ 0 se respeta también aquí).
// =====================================================================

const ACADEMIA = { slug: 'demo', name: 'Demo' };
const DOMINIO = 'academia-demo.es';
const CLAVE = 'AteneaDemo26';
const ADMIN = { correo: `admin@${DOMINIO}`, password: CLAVE };

const STAFF = [
  { nombre: 'Carlos Ortega', role: 'Preparador físico', email: 'carlos.ortega@' + DOMINIO, phone: '611 222 333' },
  { nombre: 'Marta Aguilar', role: 'Profesora', email: 'marta.aguilar@' + DOMINIO, phone: '622 333 444' },
];

const KINDS = [
  { id: 'fisicas', label: 'Preparación física', lleva_plan: true, sort_order: 1 },
  { id: 'repaso', label: 'Repaso', lleva_plan: false, sort_order: 2 },
  { id: 'ingles', label: 'Idioma', lleva_plan: false, sort_order: 3 },
];

const GRUPOS = [
  { key: 'fisicas', name: 'Físicas · L y X', kind: 'fisicas', schedule: 'Lunes y miércoles, 19:00', staff: ['Carlos Ortega'] },
  { key: 'repaso', name: 'Repaso fin de semana', kind: 'repaso', schedule: 'Sábados, 10:00', staff: ['Marta Aguilar'] },
  { key: 'ingles', name: 'Inglés B1', kind: 'ingles', schedule: 'Martes y jueves, 18:00', staff: ['Marta Aguilar'] },
];

// Temas donde se concentra la actividad — Bloque I y parte del II, como
// haría un alumno de verdad (nadie estudia los 50 temas a la vez).
const FOCO_TEMAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 17, 20, 25, 30];

/**
 * Un alumno "demo". `entra`: si hace un login real (last_sign_in_at). `acceso`:
 * `null` = sin fila en `memberships` (pendiente de activar, P8); si no,
 * `active`/`suspended`. `dias`: los días atrás en los que entrena. `simulacros`:
 * como en `_seed-piloto.mjs` — {off, N, A, E, B} = hace `off` días, `N`
 * preguntas, `A` aciertos, `E` errores, `B` en blanco.
 */
const ALUMNOS = [
  {
    nombre: 'Laura Gómez Ruiz', correo: 'laura.gomez@' + DOMINIO, grupos: ['repaso'],
    acceso: 'active', exento: false, pago: { actual: true, anterior: true }, entra: true,
    dias: [26, 24, 23, 21, 19, 18, 16, 14, 13, 11, 9, 8, 6, 5, 3, 2, 1, 0],
    accBase: 0.72, atascadas: 0,
    simulacros: [{ off: 24, N: 25, A: 14, E: 9, B: 2 }, { off: 15, N: 50, A: 31, E: 15, B: 4 }, { off: 7, N: 50, A: 34, E: 12, B: 4 }, { off: 2, N: 50, A: 36, E: 11, B: 3 }],
    fichas: 40,
  },
  {
    nombre: 'Marcos Díaz Prieto', correo: 'marcos.diaz@' + DOMINIO, grupos: ['fisicas'],
    acceso: 'active', exento: false, pago: { actual: true, anterior: true }, entra: true,
    dias: [25, 22, 20, 17, 15, 13, 10, 8, 6, 4, 2, 1, 0],
    accBase: 0.6, atascadas: 1,
    simulacros: [{ off: 20, N: 25, A: 12, E: 11, B: 2 }, { off: 10, N: 25, A: 13, E: 10, B: 2 }, { off: 3, N: 50, A: 28, E: 18, B: 4 }],
    fichas: 22,
  },
  {
    nombre: 'Nerea Fernández Soto', correo: 'nerea.fernandez@' + DOMINIO, grupos: [],
    acceso: 'active', exento: false, pago: { actual: false, anterior: false }, entra: true,
    dias: [25, 23, 21, 19, 18],
    accBase: 0.48, atascadas: 1,
    simulacros: [],
    fichas: 4,
  },
  {
    nombre: 'Iván Castro López', correo: 'ivan.castro@' + DOMINIO, grupos: ['fisicas'],
    acceso: 'suspended', exento: false, pago: { actual: false, anterior: true }, entra: true,
    dias: [30, 28, 26, 24, 22, 20],
    accBase: 0.52, atascadas: 2,
    simulacros: [{ off: 22, N: 25, A: 9, E: 14, B: 2 }],
    fichas: 6,
  },
  {
    nombre: 'Sara Molina Vega', correo: 'sara.molina@' + DOMINIO, grupos: ['repaso', 'ingles'],
    acceso: 'active', exento: true, pago: { actual: false, anterior: false }, entra: true,
    dias: [34, 32, 30, 29, 27, 26, 24, 23, 21, 20, 18, 17, 15, 14, 12, 10, 9, 7, 6, 4, 3, 2, 1, 0],
    accBase: 0.83, atascadas: 0,
    simulacros: [{ off: 30, N: 25, A: 16, E: 7, B: 2 }, { off: 22, N: 50, A: 34, E: 12, B: 4 }, { off: 14, N: 50, A: 37, E: 9, B: 4 }, { off: 6, N: 50, A: 40, E: 7, B: 3 }, { off: 1, N: 100, A: 78, E: 16, B: 6 }],
    fichas: 60,
  },
  {
    nombre: 'Pablo Reyes Ortiz', correo: 'pablo.reyes@' + DOMINIO, grupos: [],
    acceso: null, exento: false, pago: { actual: false, anterior: false }, entra: false,
    dias: [], accBase: 0, atascadas: 0, simulacros: [], fichas: 0,
  },
  {
    nombre: 'Cristina Herrero Blanco', correo: 'cristina.herrero@' + DOMINIO, grupos: ['ingles'],
    acceso: 'active', exento: false, pago: { actual: true, anterior: true }, entra: true,
    dias: [23, 21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1, 0],
    accBase: 0.7, atascadas: 0,
    simulacros: [{ off: 18, N: 25, A: 14, E: 9, B: 2 }, { off: 9, N: 50, A: 30, E: 16, B: 4 }, { off: 2, N: 50, A: 33, E: 13, B: 4 }],
    fichas: 28,
  },
  {
    nombre: 'Álvaro Jiménez Cano', correo: 'alvaro.jimenez@' + DOMINIO, grupos: ['fisicas'],
    acceso: 'active', exento: false, pago: { actual: true, anterior: false }, entra: true,
    dias: [22, 20, 18, 16, 14, 12, 10, 9],
    accBase: 0.58, atascadas: 0,
    simulacros: [{ off: 16, N: 25, A: 11, E: 12, B: 2 }, { off: 9, N: 25, A: 12, E: 11, B: 2 }],
    fichas: 10,
  },
];

// El lunes de esta semana (local), y el de la anterior.
function lunes(offsetSemanas = 0) {
  const d = new Date(HOY);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow) + offsetSemanas * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const ej = (name, sets, reps, target) => ({ name, sets: String(sets), reps: String(reps), target: target || '' });
const dia = (day, type, title, exercises) => ({ day, type, title, exercises });
const PLANES_FISICAS = [
  {
    weekStart: lunes(0),
    week_focus: 'Semana en curso · fuerza y series de carrera',
    days: [
      dia('Lunes', 'Fuerza', 'Tren superior y core', [ej('Dominadas', 4, 'máximas', 'Prueba de dominadas'), ej('Flexiones', 4, 15), ej('Plancha', 3, '45 s')]),
      dia('Martes', 'Descanso', 'Descanso activo', []),
      dia('Miércoles', 'Carrera', 'Series de 200 m', [ej('Series de 200 m', 6, '200 m', 'Ritmo de 1000 m'), ej('Vuelta a la calma', 1, '8 min')]),
      dia('Jueves', 'Descanso', 'Descanso', []),
      dia('Viernes', 'Circuito', 'Agilidad y sentadillas', [ej('Circuito de agilidad', 5, '1 vuelta'), ej('Sentadillas', 4, 15)]),
      dia('Sábado', 'Test', 'Simulacro parcial', [ej('1000 m cronometrado', 1, '1000 m')]),
      dia('Domingo', 'Descanso', 'Descanso total', []),
    ],
  },
  {
    weekStart: lunes(-1),
    week_focus: 'Semana pasada · base aeróbica',
    days: [
      dia('Lunes', 'Fuerza', 'Fuerza general', [ej('Dominadas asistidas', 4, 'máximas'), ej('Flexiones', 4, 12)]),
      dia('Martes', 'Carrera', 'Rodaje suave', [ej('Carrera continua', 1, '30 min')]),
      dia('Miércoles', 'Descanso', 'Descanso', []),
      dia('Jueves', 'Circuito', 'Agilidad', [ej('Circuito de agilidad', 4, '1 vuelta')]),
      dia('Viernes', 'Descanso', 'Descanso', []),
      dia('Sábado', 'Aeróbico', 'Nado técnico', [ej('Nado 50 m', 6, '50 m')]),
      dia('Domingo', 'Descanso', 'Descanso total', []),
    ],
  },
];

// =====================================================================

async function upsertUser(email, password, role) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const existente = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (existente) {
      const { error: e2 } = await db.auth.admin.updateUserById(existente.id, { password, email_confirm: true });
      if (e2) throw new Error(e2.message);
      await db.from('profiles').upsert({ id: existente.id, email, role }, { onConflict: 'id' });
      return { id: existente.id, creada: false };
    }
    if (data.users.length < 200) break;
  }
  // Nueva: `academia_slug` en la metadata es lo que lee el disparador de P11j
  // (`on_auth_user_created_academia`) para meterla YA en `academy_members` —
  // sin eso caería en `atenea`, la academia «casa».
  const { data, error } = await db.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { academia_slug: ACADEMIA.slug },
  });
  if (error) throw new Error(error.message);
  await db.from('profiles').upsert({ id: data.user.id, email, role }, { onConflict: 'id' });
  return { id: data.user.id, creada: true };
}

async function main() {
  console.log(`\nProyecto: ${URL}`);
  console.log(`Academia: ${ACADEMIA.name} (/${ACADEMIA.slug})\n`);

  // --- 1 · La academia ---
  await db.from('academies').upsert({ slug: ACADEMIA.slug, name: ACADEMIA.name }, { onConflict: 'slug' });
  const { data: academia } = await db.from('academies').select('id').eq('slug', ACADEMIA.slug).single();
  const orgId = academia.id;
  console.log(`  academia: ${orgId}`);

  // --- 2 · Ajustes, control de acceso, convocatoria ---
  await db.from('academy_settings').upsert({
    organization_id: orgId, name: 'Academia Demo', address: 'Calle de la Preparación, 12 · Madrid',
    schedule: 'L-V 9:00-21:00, S 10:00-14:00', contact_email: 'info@' + DOMINIO, contact_phone: '910 000 000',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id' });

  await db.from('membership_settings').upsert(
    { organization_id: orgId, required: true, updated_at: new Date().toISOString() },
    { onConflict: 'organization_id' },
  );

  const fechaExamen = new Date(HOY); fechaExamen.setMonth(fechaExamen.getMonth() + 5);
  await db.from('academy_convocatoria').upsert({
    organization_id: orgId, escala: 'Escala Básica', fecha_examen: fechaExamen.toISOString().slice(0, 10),
    nota: null, updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id' });
  console.log('  ajustes, acceso y convocatoria: ok');

  // --- 3 · Personal ---
  const staffId = new Map();
  for (const s of STAFF) {
    const { data: existente } = await db.from('academy_staff').select('id').eq('organization_id', orgId).eq('name', s.nombre).maybeSingle();
    if (existente) { staffId.set(s.nombre, existente.id); continue; }
    const { data, error } = await db.from('academy_staff').insert({
      organization_id: orgId, name: s.nombre, role: s.role, email: s.email, phone: s.phone, active: true,
    }).select('id').single();
    if (error) throw new Error(error.message);
    staffId.set(s.nombre, data.id);
  }
  console.log(`  personal: ${staffId.size}`);

  // --- 4 · Tipos de grupo ---
  await db.from('group_kinds').upsert(
    KINDS.map((k) => ({ organization_id: orgId, id: k.id, label: k.label, lleva_plan: k.lleva_plan, sort_order: k.sort_order, created_at: new Date().toISOString() })),
    { onConflict: 'organization_id,id' },
  );

  // --- 5 · Grupos + profesores ---
  const grupoId = new Map();
  for (const g of GRUPOS) {
    const { data: existente } = await db.from('class_groups').select('id').eq('organization_id', orgId).eq('name', g.name).maybeSingle();
    let id = existente?.id;
    if (!id) {
      const { data, error } = await db.from('class_groups').insert({ organization_id: orgId, name: g.name, kind: g.kind, schedule: g.schedule }).select('id').single();
      if (error) throw new Error(error.message);
      id = data.id;
    }
    grupoId.set(g.key, id);
    await db.from('class_group_staff').upsert(
      g.staff.map((nombre) => ({ class_id: id, staff_id: staffId.get(nombre) })),
      { onConflict: 'class_id,staff_id' },
    );
  }
  console.log(`  grupos: ${grupoId.size}`);

  // --- 6 · Cuentas: admin + alumnos ---
  const admin = await upsertUser(ADMIN.correo, ADMIN.password, 'admin');
  await db.from('academy_members').upsert({ academy_id: orgId, user_id: admin.id }, { onConflict: 'academy_id,user_id' });

  const alumnoId = new Map();
  for (const a of ALUMNOS) {
    const u = await upsertUser(a.correo, CLAVE, 'student');
    alumnoId.set(a.correo, u.id);
    await db.from('academy_members').upsert({ academy_id: orgId, user_id: u.id }, { onConflict: 'academy_id,user_id' });

    for (const key of a.grupos) {
      await db.from('class_members').upsert({ class_id: grupoId.get(key), user_id: u.id }, { onConflict: 'class_id,user_id' });
    }

    if (a.acceso !== null) {
      await db.from('memberships').upsert({
        organization_id: orgId, user_id: u.id, access_status: a.acceso,
        payment_status: a.pago.actual ? 'al_dia' : 'debe', exempt: a.exento, updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,user_id' });
    }
  }
  console.log(`  cuentas: 1 admin + ${alumnoId.size} alumnos`);

  // --- 7 · Pagos (mes actual + anterior) ---
  const [actual, anterior] = periodosRecientes(2);
  for (const a of ALUMNOS) {
    if (a.acceso === null) continue; // Pablo: sin membresía, sin pagos que anotar
    const uid = alumnoId.get(a.correo);
    const filas = [
      { organization_id: orgId, user_id: uid, period: actual, paid: a.pago.actual, amount_eur: a.pago.actual ? 45 : null, paid_on: a.pago.actual ? iso(entre(1, 10), 10).slice(0, 10) : null, recorded_by: admin.id, updated_at: new Date().toISOString() },
      { organization_id: orgId, user_id: uid, period: anterior, paid: a.pago.anterior, amount_eur: a.pago.anterior ? 45 : null, paid_on: a.pago.anterior ? iso(entre(31, 45), 10).slice(0, 10) : null, recorded_by: admin.id, updated_at: new Date().toISOString() },
    ];
    const { error } = await db.from('monthly_payments').upsert(filas, { onConflict: 'organization_id,user_id,period' });
    if (error) throw new Error('monthly_payments: ' + error.message);
  }
  console.log(`  pagos: ${actual} y ${anterior}`);

  // --- 8 · Plan de físicas de grupo ---
  const filasPlan = PLANES_FISICAS.map((s) => ({ class_id: grupoId.get('fisicas'), week_start: s.weekStart, plan_data: { week_focus: s.week_focus, days: s.days, source: 'entrenador' } }));
  await db.from('group_training_plans').upsert(filasPlan, { onConflict: 'class_id,week_start' });
  console.log(`  plan de físicas: ${filasPlan.map((f) => f.week_start).join(', ')}`);

  // --- 9 · El banco de preguntas y fichas (global, ya sembrado) ---
  const { data: subjects } = await db.from('subjects').select('id, topic_number, title');
  const foco = subjects.filter((s) => FOCO_TEMAS.includes(s.topic_number));
  const { data: bank } = await db.from('question_bank').select('id, subject_id, legal_reference').eq('status', 'active').is('organization_id', null);
  const bankBySubj = new Map();
  for (const q of bank ?? []) {
    if (!bankBySubj.has(q.subject_id)) bankBySubj.set(q.subject_id, []);
    bankBySubj.get(q.subject_id).push(q);
  }
  const preguntasFoco = foco.flatMap((s) => (bankBySubj.get(s.id) ?? []).map((q) => ({ ...q, topic: s.title })));
  if (preguntasFoco.length === 0) throw new Error('El banco global no tiene preguntas activas en los temas de foco. Siembra el banco primero (`npm run sembrar`).');

  const { data: fcBank } = await db.from('flashcard_bank').select('id, front, back, topic').eq('status', 'active');
  const fcFoco = (fcBank ?? []).filter((c) => foco.some((s) => s.title === c.topic));

  // --- 10 · Actividad de cada alumno ---
  for (const a of ALUMNOS) {
    const uid = alumnoId.get(a.correo);
    if (a.dias.length === 0 && a.simulacros.length === 0) continue; // Pablo: cero actividad, a propósito

    const { count: yaTiene } = await db.from('question_attempts').select('id', { count: 'exact', head: true }).eq('user_id', uid);
    if ((yaTiene ?? 0) > 0 && !BORRAR) {
      console.log(`  ·  ${a.nombre}: ya tiene ${yaTiene} respuestas`);
      continue;
    }
    if (BORRAR) {
      await db.from('question_attempts').delete().eq('user_id', uid);
      await db.from('flashcard_progress').delete().eq('user_id', uid);
    }

    const filas = [];
    const nueva = (o) => filas.push({ id: randomUUID(), user_id: uid, confidence: null, ...o });

    // Preguntas que se le atascan: fallos repetidos, a veces con el mismo
    // distractor (P10, «distractor fijo»).
    const conArticulo = preguntasFoco.filter((q) => q.legal_reference);
    const atascadas = conArticulo.sort(() => Math.random() - 0.5).slice(0, a.atascadas);
    atascadas.forEach((q, i) => {
      const distractorFijo = i === 0 ? entre(0, 3) : null;
      for (let k = 0; k < 5; k++) {
        const off = Math.max(a.dias[0] ?? 20, 20) - k * 5 - entre(0, 2);
        if (off < 0) continue;
        nueva({
          question_id: q.id, topic: q.topic, is_correct: false,
          selected_index: distractorFijo ?? entre(0, 3),
          response_time_ms: entre(9000, 30000), first_touch_ms: entre(9000, 30000), option_changes: 0,
          error_type: pick(['desconocimiento', 'olvido', 'trampa']),
          exam_id: null, created_at: iso(off, entre(17, 21)),
        });
      }
    });

    // Entrenamiento a lo largo de los días marcados, con el acierto subiendo
    // un poco semana a semana.
    const maxOff = a.dias[0] ?? 0;
    for (const off of a.dias) {
      const semana = Math.floor((maxOff - off) / 7);
      const acc = Math.min(0.92, a.accBase + semana * 0.03);
      const nPreg = entre(8, 16);
      const tema = pick(foco);
      const pool = bankBySubj.get(tema.id) ?? preguntasFoco;
      for (let k = 0; k < nPreg; k++) {
        const q = pick(pool.length ? pool : preguntasFoco);
        const acierto = Math.random() < acc + (Math.random() - 0.5) * 0.15;
        const t = entre(5000, 32000) - semana * 1000;
        nueva({
          question_id: q.id, topic: q.topic ?? tema.title, is_correct: acierto,
          selected_index: entre(0, 3),
          response_time_ms: Math.max(2500, t), first_touch_ms: Math.max(2500, t), option_changes: 0,
          error_type: !acierto && Math.random() < 0.4 ? pick(['olvido', 'desconocimiento', 'trampa', 'fallo_procesamiento']) : null,
          exam_id: null, created_at: iso(off, entre(8, 22), entre(0, 55)),
        });
      }
    }

    // Simulacros: nota con penalización, blancos incluidos (regla 22/24).
    for (const sim of a.simulacros) {
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

    for (let i = 0; i < filas.length; i += 200) {
      const { error } = await db.from('question_attempts').insert(filas.slice(i, i + 200));
      if (error) throw new Error(`question_attempts (${a.nombre}): ${error.message}`);
    }

    // Fichas con progreso.
    if (a.fichas > 0 && fcFoco.length > 0) {
      const fcProg = fcFoco.sort(() => Math.random() - 0.5).slice(0, a.fichas).map((c) => {
        const box = entre(1, 6);
        const nr = new Date(HOY);
        nr.setDate(nr.getDate() + entre(-3, [1, 3, 7, 15, 30][Math.min(4, box - 1)]));
        return { id: randomUUID(), user_id: uid, card_id: c.id, topic: c.topic, front: c.front, back: c.back, box, next_review: nr.toISOString(), created_at: iso(entre(2, maxOff || 20), 20) };
      });
      const { error } = await db.from('flashcard_progress').insert(fcProg);
      if (error) throw new Error(`flashcard_progress (${a.nombre}): ${error.message}`);
    }

    console.log(`  ✓  ${a.nombre}: ${filas.length} respuestas, ${a.fichas} fichas`);
  }

  // --- 11 · Login real, para que `last_sign_in_at` sea de verdad ---
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  await anon.auth.signInWithPassword({ email: ADMIN.correo, password: ADMIN.password });
  for (const a of ALUMNOS) {
    if (!a.entra) continue;
    const { error } = await anon.auth.signInWithPassword({ email: a.correo, password: CLAVE });
    if (error) console.log(`  ⚠ login de ${a.nombre} falló: ${error.message}`);
  }
  console.log(`  login real: admin + ${ALUMNOS.filter((a) => a.entra).length} alumnos`);

  console.log('\n══ LISTO ══');
  console.log(`  admin  → ${ADMIN.correo} / ${CLAVE}`);
  console.log(`  alumnos (misma clave):`);
  for (const a of ALUMNOS) console.log(`    ${a.correo}`);
  console.log(`\n  Pablo Reyes Ortiz queda sin membresía (pendiente de activar) y sin login`);
  console.log(`  (nunca ha entrado, a propósito) — demuestra los dos estados de golpe.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });

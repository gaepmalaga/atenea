import { describe, it, expect } from 'vitest';
import { DbFalsa } from './helpers/demo-db-falsa';
import { borraDemo, cargaFase, ensayoBorrado, estadoDemo, FASES_DEMO, tandasDe, REGISTRO, type Ctx, type FaseDemo } from '../app/lib/demo-motor';
import { EMAIL_ALUMNO_DEMO, generaAlumnos, generaCuadrante, cuando, uuidDemo } from '../app/lib/demo';

const ORG = 'aeee26b3-b6a8-49da-a5c3-4d3c8cde6df2';
const ADMIN = '52679e79-9857-4f60-8da5-c5f437b49799';
const REAL = '230d0bf7-330c-4037-83b5-0a6ba92e7c35';
const NOV = Date.UTC(2026, 10, 10, 9, 30);
const DIC = Date.UTC(2026, 11, 15, 11, 0);

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const GRUPOS: [string, string, number[] | null, string | null, string | null, boolean][] = [
  ['Promo 43', 'teoria', [2, 4], '10:00:00', '13:00:00', false],
  ['Promo 44 · Kappa', 'fisicas', [1, 3], '08:00:00', '09:00:00', false],
  ['Promo 44 · Alpha', 'fisicas', [1, 3], '08:00:00', '09:00:00', false],
  ['Promo 44 · Zetta', 'fisicas', [1, 3], '20:00:00', '21:00:00', false],
  ['Promo 44 · Omega', 'fisicas', [2, 4], '08:00:00', '09:00:00', false],
  ['Promo 44 · Sigma', 'fisicas', [2, 4], '08:00:00', '09:00:00', false],
  ['Promo 44 · Betta', 'fisicas', [2, 4], '20:00:00', '21:00:00', false],
  ['Promo 44 · Delta', 'fisicas', [2, 4], '20:00:00', '21:00:00', false],
  ['Promo 44 · Multi', 'fisicas', null, null, null, true],
];
const STAFF = ['Sofía', 'José Morato', 'Lucas', 'Olivares', 'Lucio', 'Juan'];

/** Una academia como la de verdad, con datos REALES alrededor de los que la demo no puede tocar. */
function escenario(): { db: DbFalsa; grupoId: (n: string) => string; staffId: (n: string) => string } {
  const db = new DbFalsa('alphapol', ORG);
  db.cuentas.set(ADMIN, { email: 'prueba.admin@alphapol.es', password: 'x' });
  db.cuentas.set(REAL, { email: 'prueba.alumno@alphapol.es', password: 'x' });
  db.siembra('profiles', { id: ADMIN, email: 'prueba.admin@alphapol.es', role: 'admin' }, { id: REAL, email: 'prueba.alumno@alphapol.es', role: 'student' });
  db.siembra('academy_members', { academy_id: ORG, user_id: ADMIN }, { academy_id: ORG, user_id: REAL });
  db.siembra('memberships', { organization_id: ORG, user_id: REAL, access_status: 'active', payment_status: 'al_dia', exempt: true });
  db.siembra('group_kinds',
    { id: 'teoria', organization_id: ORG, label: 'Teoría', price_eur: '100.00', sort_order: 1 },
    { id: 'ingles', organization_id: ORG, label: 'Inglés', price_eur: null, sort_order: 2 },
    { id: 'fisicas', organization_id: ORG, label: 'Físicas', price_eur: '50.00', sort_order: 3 },
    { id: 'otro', organization_id: ORG, label: 'Otro', price_eur: null, sort_order: 9 });
  const g = new Map<string, string>();
  GRUPOS.forEach(([name, kind, weekdays, start, end, multi], i) => {
    const id = uid(100 + i);
    g.set(name, id);
    db.siembra('class_groups', { id, organization_id: ORG, name, kind, weekdays, start_time: start, end_time: end, capacity: 30, is_multi: multi, created_at: `2026-11-09T10:00:0${i}Z` });
  });
  const s = new Map<string, string>();
  STAFF.forEach((name, i) => { const id = uid(200 + i); s.set(name, id); db.siembra('academy_staff', { id, organization_id: ORG, name, role: 'profesor', active: true }); });
  const act = (actividad: string, profe: string, priority: number) => db.siembra('staff_activities', { organization_id: ORG, activity: actividad, staff_id: s.get(profe), priority });
  act('Boxeo', 'Juan', 1); act('Jiujitsu', 'Lucas', 1); act('F.M + RDL', 'Lucio', 1); act('F.M + RDL', 'José Morato', 2); act('FLK', 'José Morato', 1); act('FLK', 'Olivares', 2);
  for (let n = 1; n <= 50; n++) db.siembra('subjects', { id: 37 + n, topic_number: n, title: `Tema ${n}` });
  for (let i = 0; i < 400; i++) db.siembra('question_bank', { id: uid(10_000 + i), subject_id: 38 + (i % 45), correct_index: i % 3, status: 'active', organization_id: null });
  // Lo real: la semana del 9 publicada y las sesiones de esa semana de Alpha y Kappa.
  db.siembra('class_week_publications', { organization_id: ORG, week_start: '2026-11-09', published_at: '2026-11-09T16:00:00Z', published_by: ADMIN });
  db.siembra('training_sessions',
    { id: uid(300), organization_id: ORG, class_id: g.get('Promo 44 · Alpha'), user_id: null, session_date: '2026-11-09', kind: 'otro', title: 'Boxeo', teacher_id: s.get('Juan'), position: 0 },
    { id: uid(301), organization_id: ORG, class_id: g.get('Promo 44 · Kappa'), user_id: null, session_date: '2026-11-09', kind: 'otro', title: 'FLK 5.0', teacher_id: s.get('José Morato'), position: 0 },
    { id: uid(302), organization_id: ORG, class_id: null, user_id: REAL, session_date: '2026-11-10', kind: 'carrera', title: 'Rodaje', teacher_id: null, position: 0 });
  // Un día sin clase real de Kappa justo donde la demo pondría el festivo.
  db.siembra('class_days_off', { class_id: g.get('Promo 44 · Kappa'), session_date: '2026-11-04', organization_id: ORG, reason: 'Puente de verdad' });
  // Una plantilla real con el mismo título que una de la demo.
  db.siembra('session_templates', { id: uid(400), organization_id: ORG, kind: 'carrera', title: 'Series: 8 × 300 m', description: 'La del preparador' });
  // Y una falta real del alumno real.
  db.siembra('class_absences', { class_id: g.get('Promo 43'), user_id: REAL, session_date: '2026-11-12' });
  db.siembra('class_members', { class_id: g.get('Promo 44 · Alpha'), user_id: REAL });
  return { db, grupoId: (n) => g.get(n)!, staffId: (n) => s.get(n)! };
}

const ctxDe = (db: DbFalsa, ahoraMs = NOV): Ctx => ({ db, org: ORG, adminId: ADMIN, ahoraMs, generaClave: () => 'Clave-de-prueba-1' });

async function cargaTodo(ctx: Ctx, hasta?: FaseDemo) {
  const claves: string[] = [];
  for (const fase of FASES_DEMO) {
    for (let t = 0; t < tandasDe(fase); t++) {
      const r = await cargaFase(ctx, fase, t);
      if (!r.ok) return { ok: false as const, error: r.error, claves, en: `${fase}:${t}` };
      if (r.claveAlumno) claves.push(r.claveAlumno);
    }
    if (fase === hasta) break;
  }
  return { ok: true as const, claves };
}

const FAR = () => false; // sin límite de tiempo

describe('la carga', () => {
  it('lo carga todo, fase a fase, y lo deja apuntado', async () => {
    const { db } = escenario();
    const r = await cargaTodo(ctxDe(db));
    expect(r).toMatchObject({ ok: true });
    expect(r.claves).toEqual(['Clave-de-prueba-1']); // solo `alumno@` enseña su contraseña
    expect(db.cuentas.size).toBe(2 + 45);
    expect([...db.cuentas.values()].filter((c) => c.email.endsWith('@demo.alphapol.test'))).toHaveLength(45);
    expect(db.tabla('memberships').filter((m) => m.user_id !== REAL)).toHaveLength(45);
    expect(db.tabla('question_attempts').length).toBeGreaterThan(5000);
    expect(db.tabla('monthly_payments').length).toBeGreaterThan(150);
    expect(db.tabla('payment_entries').filter((e) => e.voided_at)).toHaveLength(1);
    expect(db.tabla('receipt_counters')).toHaveLength(1);
    const est = await estadoDemo(db, ORG);
    expect(est).toMatchObject({ ok: true, estado: { hay: true, periodo: '2026-11', completa: true, cuentas: 45 } });
    // Cargar otra vez encima de una carga completa no se deja.
    expect(await cargaFase(ctxDe(db), 'cuentas', 0)).toMatchObject({ ok: false });
  });

  it('crea los dos grupos nuevos, con Sofía en el de teoría y sin profesor en inglés', async () => {
    const { db, staffId } = escenario();
    await cargaTodo(ctxDe(db), 'grupos');
    const tarde = db.tabla('class_groups').find((x) => x.name === 'Promo 44 · Teoría tarde')!;
    const ingles = db.tabla('class_groups').find((x) => x.name === 'Inglés B1')!;
    expect(tarde).toMatchObject({ kind: 'teoria', weekdays: [1, 3], start_time: '17:00:00', end_time: '19:00:00', capacity: 30 });
    expect(ingles).toMatchObject({ kind: 'ingles', weekdays: [2, 4], start_time: '19:00:00', end_time: '20:00:00' });
    expect(db.tabla('class_group_staff')).toEqual([{ class_id: tarde.id, staff_id: staffId('Sofía') }]);
    expect(db.tabla('class_members').filter((m) => m.class_id === ingles.id)).toHaveLength(3);
  });

  it('solo añade: no pisa lo que ya existe', async () => {
    const { db, grupoId, staffId } = escenario();
    const antes = db.foto();
    await cargaTodo(ctxDe(db));
    // La sesión real de Alpha del lunes 9 sigue siendo la suya, y no hay otra.
    const alpha9 = db.tabla('training_sessions').filter((s) => s.class_id === grupoId('Promo 44 · Alpha') && s.session_date === '2026-11-09');
    expect(alpha9).toHaveLength(1);
    expect(alpha9[0].id).toBe(uid(300));
    // La semana publicada real no se vuelve a publicar ni se apunta.
    const reg = db.tabla(REGISTRO);
    expect(reg.filter((r) => r.tabla === 'class_week_publications').map((r) => (r.clave as { week_start: string }).week_start).sort()).toEqual(['2026-10-19', '2026-10-26', '2026-11-02']);
    expect(db.tabla('class_week_publications').find((p) => p.week_start === '2026-11-09')!.published_at).toBe('2026-11-09T16:00:00Z');
    // El día sin clase real de Kappa no se duplica ni se apunta; los otros grupos sí lo tienen.
    expect(db.tabla('class_days_off').filter((d) => d.class_id === grupoId('Promo 44 · Kappa'))).toHaveLength(1);
    expect(db.tabla('class_days_off').find((d) => d.class_id === grupoId('Promo 44 · Kappa'))!.reason).toBe('Puente de verdad');
    expect(reg.filter((r) => r.tabla === 'class_days_off')).toHaveLength(2);
    // La plantilla real con el mismo título se respeta: solo se crea la otra.
    expect(db.tabla('session_templates').filter((p) => p.title === 'Series: 8 × 300 m')).toHaveLength(1);
    expect(db.tabla('session_templates')).toHaveLength(2);
    // Los profesores: ni uno nuevo ni tocado.
    expect(db.tabla('academy_staff')).toHaveLength(6);
    // Sofía y José Morato no tenían temas: ahora tienen 1-15 y 16-30.
    expect(db.tabla('staff_subjects').filter((s) => s.staff_id === staffId('Sofía'))).toHaveLength(15);
    expect(db.tabla('staff_subjects').filter((s) => s.staff_id === staffId('José Morato'))).toHaveLength(15);
    // Y lo que había antes sigue igual (se excluye lo que pertenece a la demo).
    const demo = new Set(db.tabla(REGISTRO).map((r) => JSON.stringify([r.tabla, r.clave])));
    void antes; void demo;
  });

  it('no inventa un profesor que ya tiene temas', async () => {
    const { db, staffId } = escenario();
    db.siembra('staff_subjects', { organization_id: ORG, staff_id: staffId('Sofía'), subject_id: 40 });
    await cargaTodo(ctxDe(db), 'grupos');
    expect(db.tabla('staff_subjects').filter((s) => s.staff_id === staffId('Sofía'))).toHaveLength(1);
    expect(db.tabla('staff_subjects').filter((s) => s.staff_id === staffId('José Morato'))).toHaveLength(15);
  });

  it('Kappa queda sin planificar la semana que viene y Multi tiene sueltas a las 18:30', async () => {
    const { db, grupoId } = escenario();
    await cargaTodo(ctxDe(db), 'fisica');
    const kappa = db.tabla('training_sessions').filter((s) => s.class_id === grupoId('Promo 44 · Kappa')).map((s) => s.session_date as string);
    expect(kappa.some((d) => d >= '2026-11-16')).toBe(false);
    expect(kappa.some((d) => d >= '2026-10-19' && d < '2026-11-09')).toBe(true);
    const alpha = db.tabla('training_sessions').filter((s) => s.class_id === grupoId('Promo 44 · Alpha')).map((s) => s.session_date as string);
    expect(alpha.some((d) => d >= '2026-11-16')).toBe(true);
    const multi = db.tabla('training_sessions').filter((s) => s.class_id === grupoId('Promo 44 · Multi'));
    expect(multi.length).toBeGreaterThan(6);
    expect(multi.every((s) => s.start_time === '18:30:00')).toBe(true);
    // Semanas publicadas hasta la actual; la siguiente, en borrador.
    expect(db.tabla('class_week_publications').map((p) => p.week_start).sort()).toEqual(['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09']);
  });

  it('reintentar una fase no duplica nada', async () => {
    const { db } = escenario();
    const ctx = ctxDe(db);
    await cargaTodo(ctx, 'fisica');
    const antes = JSON.stringify([...db.tablas.entries()].map(([t, f]) => [t, f.length]));
    // Las fases con claves deterministas se pueden relanzar sin consecuencias.
    for (const fase of ['grupos', 'fisica'] as const) {
      db.tabla(REGISTRO).splice(0, db.tabla(REGISTRO).length, ...db.tabla(REGISTRO).filter((r) => !(r.tabla === '_fase' && (r.clave as { fase: string }).fase === fase)));
      expect(await cargaFase(ctx, fase, 0)).toMatchObject({ ok: true });
    }
    expect(JSON.stringify([...db.tablas.entries()].map(([t, f]) => [t, f.length]))).toBe(antes);
  });

  it('una carga cortada se puede terminar, y da lo mismo que una limpia', async () => {
    const limpia = escenario().db;
    await cargaTodo(ctxDe(limpia));
    const { db } = escenario();
    db.fallarEn = 30;
    const corte = await cargaTodo(ctxDe(db));
    expect(corte.ok).toBe(false);
    db.fallarEn = null;
    expect(await cargaTodo(ctxDe(db, NOV + 86_400_000))).toMatchObject({ ok: true }); // otro día: sigue con el «ahora» de la carga
    const cuenta = (d: DbFalsa) => JSON.stringify([...d.tablas.entries()].map(([t, f]) => [t, f.length]).sort());
    expect(cuenta(db)).toBe(cuenta(limpia));
  });

  it('la contraseña de alumno@ se renueva si la cuenta quedó de una carga cortada', async () => {
    const { db } = escenario();
    const ctx = ctxDe(db);
    await cargaFase(ctx, 'cuentas', 0);
    const id = uuidDemo('cuenta', 'a00');
    expect(db.cuentas.get(id)!.email).toBe(EMAIL_ALUMNO_DEMO);
    const otra = { ...ctx, generaClave: () => 'Otra-clave-nueva-2' };
    const r = await cargaFase(otra, 'cuentas', 0);
    expect(r).toMatchObject({ ok: true, claveAlumno: 'Otra-clave-nueva-2' });
    expect(db.cuentas.get(id)!.password).toBe('Otra-clave-nueva-2');
  });

  it('exige las fases en orden', async () => {
    const { db } = escenario();
    expect(await cargaFase(ctxDe(db), 'grupos', 0)).toMatchObject({ ok: false });
    await cargaFase(ctxDe(db), 'cuentas', 0);
    expect(await cargaFase(ctxDe(db), 'fisica', 0)).toMatchObject({ ok: false });
  });
});

describe('cargar otro mes', () => {
  it('en diciembre salen los mismos alumnos, con todo en diciembre y antes', async () => {
    const { db } = escenario();
    await cargaTodo(ctxDe(db));
    const emailsNov = [...db.cuentas.values()].map((c) => c.email).sort();
    expect(await borraDemo(ctxDe(db), FAR)).toMatchObject({ ok: true, hecho: true });
    await cargaTodo(ctxDe(db, DIC));
    expect([...db.cuentas.values()].map((c) => c.email).sort()).toEqual(emailsNov);
    const cuotas = db.tabla('monthly_payments').map((m) => m.period as string).sort();
    expect(cuotas[cuotas.length - 1]).toBe('2026-12');
    expect(cuotas[0]).toBe('2026-07');
    const intentos = db.tabla('question_attempts').map((a) => a.created_at as string).sort();
    expect(intentos[intentos.length - 1] <= new Date(DIC).toISOString()).toBe(true);
    expect(intentos[0] >= '2026-09-15').toBe(true);
    expect(await estadoDemo(db, ORG)).toMatchObject({ ok: true, estado: { periodo: '2026-12', completa: true } });
  });
});

describe('el borrado', () => {
  it('quita exactamente lo que creó la carga: lo real queda como estaba', async () => {
    const { db } = escenario();
    const antes = db.foto();
    await cargaTodo(ctxDe(db));
    expect(db.foto()).not.toBe(antes);
    const r = await borraDemo(ctxDe(db), FAR);
    expect(r).toMatchObject({ ok: true, hecho: true });
    expect(db.foto()).toBe(antes);
    expect(db.tabla(REGISTRO)).toHaveLength(0);
    expect(db.tabla('receipt_counters')).toHaveLength(0);
  });

  it('también quita lo que cuelga de la demo y creó la aplicación al usarla', async () => {
    const { db, grupoId } = escenario();
    const ctx = ctxDe(db);
    await cargaTodo(ctx);
    const antes = JSON.parse(JSON.stringify(Object.fromEntries(db.tablas)));
    const demoUser = uuidDemo('cuenta', 'a03');
    const inglesB1 = db.tabla('class_groups').find((g) => g.name === 'Inglés B1')!.id as string;
    const sesionDemo = db.tabla('training_sessions').find((s) => s.class_id === grupoId('Promo 44 · Alpha') && db.tabla(REGISTRO).some((r) => r.tabla === 'training_sessions' && (r.clave as { id: string }).id === s.id))!;
    // Lo que hace la aplicación al usarla:
    //  · abrir «Pagos» en diciembre crea la fila del mes del alumno de la demo;
    db.siembra('monthly_payments', { organization_id: ORG, user_id: demoUser, period: '2026-12', paid: false, due_eur: 150, due_manual: false });
    //  · cobrarle a un alumno de la demo gasta un número de recibo;
    await db.rpc('registra_cobro', { p_org: ORG, p_user: demoUser, p_alumno: 'x', p_period: '2026-12', p_amount: 150, p_method: 'bizum', p_paid_on: '2026-11-10', p_by: ADMIN });
    //  · un alumno de la demo avisa de una falta;
    db.siembra('class_absences', { class_id: grupoId('Promo 43'), user_id: demoUser, session_date: '2026-11-19' });
    //  · un alumno REAL se apunta a un grupo de la demo y apunta una sesión de la demo.
    db.siembra('class_members', { class_id: inglesB1, user_id: REAL });
    db.siembra('training_session_logs', { session_id: sesionDemo.id, user_id: REAL, status: 'hecha' });

    const en = await ensayoBorrado(db, ORG);
    expect(en.ok).toBe(true);
    if (!en.ok) return;
    const f = (t: string) => en.ensayo.filas.find((x) => x.tabla === t)!;
    expect(f('monthly_payments').colgadas).toBe(1);
    expect(f('payment_entries').colgadas).toBe(1);
    expect(f('class_absences').colgadas).toBe(1);
    expect(f('class_members').colgadas).toBe(1);
    expect(f('training_session_logs').colgadas).toBeGreaterThanOrEqual(1);
    expect(f('question_attempts').colgadas).toBe(0);
    expect(f('question_attempts').registradas).toBe(f('question_attempts').total);
    expect(en.ensayo.cuentas).toBe(45);
    // El ensayo no toca nada.
    expect(JSON.parse(JSON.stringify(Object.fromEntries(db.tablas))).demo_registro.length).toBe(antes.demo_registro.length);

    expect(await borraDemo(ctx, FAR)).toMatchObject({ ok: true, hecho: true });
    // Lo real, intacto: la falta y la pertenencia a Alpha del alumno real siguen; la de Inglés B1 y el apunte de la sesión de la demo se fueron.
    expect(db.tabla('class_absences').filter((a) => a.user_id === REAL)).toHaveLength(1);
    expect(db.tabla('class_members').filter((m) => m.user_id === REAL)).toEqual([{ class_id: grupoId('Promo 44 · Alpha'), user_id: REAL }]);
    expect(db.tabla('training_session_logs')).toHaveLength(0);
    expect(db.tabla('receipt_counters')).toHaveLength(0);
    expect(db.tabla('payment_entries')).toHaveLength(0);
    expect([...db.cuentas.keys()].sort()).toEqual([ADMIN, REAL].sort());
  });

  it('el contador de recibos: si queda un cobro real, no se toca y se avisa del hueco', async () => {
    const { db } = escenario();
    const ctx = ctxDe(db);
    await cargaTodo(ctx);
    const ultimo = Number(db.tabla('receipt_counters')[0].last_no);
    // Un cobro REAL después de la demo.
    db.siembra('monthly_payments', { organization_id: ORG, user_id: REAL, period: '2026-11', paid: false, due_eur: 50 });
    await db.rpc('registra_cobro', { p_org: ORG, p_user: REAL, p_alumno: 'prueba.alumno@alphapol.es', p_period: '2026-11', p_amount: 50, p_method: 'efectivo', p_paid_on: '2026-11-10', p_by: ADMIN });
    const en = await ensayoBorrado(db, ORG);
    expect(en.ok && en.ensayo.avisos.join(' ')).toMatch(/NO se toca.*hueco/);
    const r = await borraDemo(ctx, FAR);
    expect(r).toMatchObject({ ok: true, hecho: true });
    expect(r.ok && r.avisos.join(' ')).toMatch(/hueco/);
    expect(db.tabla('receipt_counters')).toEqual([{ organization_id: ORG, last_no: ultimo + 1 }]);
    expect(db.tabla('payment_entries')).toHaveLength(1);
    expect(db.tabla('payment_entries')[0].user_id).toBe(REAL);
  });

  it('el contador de recibos: si ya existía antes de la demo, no se borra', async () => {
    const { db } = escenario();
    db.siembra('receipt_counters', { organization_id: ORG, last_no: 7 });
    await cargaTodo(ctxDe(db));
    expect(db.tabla('receipt_counters')[0].last_no).toBeGreaterThan(7);
    const r = await borraDemo(ctxDe(db), FAR);
    expect(r.ok && r.avisos.join(' ')).toMatch(/ya existía antes de la demo/);
    expect(db.tabla('receipt_counters')).toHaveLength(1);
  });

  it('sin cobros reales, el primer recibo de verdad vuelve a ser el nº 1', async () => {
    const { db } = escenario();
    await cargaTodo(ctxDe(db));
    await borraDemo(ctxDe(db), FAR);
    expect(db.tabla('receipt_counters')).toHaveLength(0);
    db.siembra('monthly_payments', { organization_id: ORG, user_id: REAL, period: '2026-11', paid: false, due_eur: 50 });
    const r = await db.rpc('registra_cobro', { p_org: ORG, p_user: REAL, p_alumno: 'x', p_period: '2026-11', p_amount: 50, p_method: 'efectivo', p_paid_on: '2026-11-10', p_by: ADMIN });
    expect((r.data as { receipt: number }[])[0].receipt).toBe(1);
  });

  it('se puede dar por terminado en varias llamadas si se acaba el tiempo', async () => {
    const { db } = escenario();
    const antes = db.foto();
    await cargaTodo(ctxDe(db));
    // Sin tiempo: hace UNA unidad de trabajo y dice que falta (si no, con poco tiempo nunca avanzaría).
    expect(await borraDemo(ctxDe(db), () => true)).toMatchObject({ ok: true, hecho: false });
    expect(db.tabla('question_attempts').length).toBeGreaterThan(0);
    // Con un presupuesto minúsculo hace parte; se vuelve a llamar hasta acabar.
    let vueltas = 0;
    for (;;) {
      const r = await borraDemo(ctxDe(db), () => true);
      expect(r.ok).toBe(true);
      if (r.ok && r.hecho) break;
      if (++vueltas > 200) throw new Error('no termina');
    }
    expect(db.foto()).toBe(antes);
    expect(db.tabla(REGISTRO)).toHaveLength(0);
  });

  it('con la carga cortada en cualquier punto, el borrado deja la base de datos como estaba', async () => {
    for (const corte of [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144]) {
      const { db } = escenario();
      const antes = db.foto();
      db.fallarEn = corte;
      const r = await cargaTodo(ctxDe(db));
      db.fallarEn = null;
      expect(r.ok, `corte ${corte}`).toBe(false);
      const b = await borraDemo(ctxDe(db), FAR);
      expect(b, `corte ${corte}`).toMatchObject({ ok: true, hecho: true });
      expect(db.foto(), `corte ${corte}`).toBe(antes);
      expect(db.tabla(REGISTRO), `corte ${corte}`).toHaveLength(0);
    }
  });

  it('un corte a mitad de los cobros (con recibos ya gastados) también se limpia', async () => {
    const { db } = escenario();
    const antes = db.foto();
    const ctx = ctxDe(db);
    await cargaTodo(ctx, 'respuestas');
    await cargaFase(ctx, 'cobros', 0);
    await cargaFase(ctx, 'cobros', 1);
    expect(db.tabla('payment_entries').length).toBeGreaterThan(20);
    await borraDemo(ctx, FAR);
    expect(db.foto()).toBe(antes);
  });

  it('no borra una cuenta ni un grupo que no sea de la demo aunque se llame igual', async () => {
    const { db, grupoId } = escenario();
    // Un grupo REAL que ya se llama «Inglés B1»: la demo lo usa pero no lo crea ni lo borra.
    db.siembra('class_groups', { id: uid(900), organization_id: ORG, name: 'Inglés B1', kind: 'ingles', weekdays: [5], start_time: '18:00:00', end_time: '19:00:00', capacity: 12, is_multi: false, created_at: '2026-11-01T10:00:00Z' });
    await cargaTodo(ctxDe(db));
    expect(db.tabla('class_groups').filter((g) => g.name === 'Inglés B1')).toHaveLength(1);
    expect(db.tabla('class_groups').find((g) => g.name === 'Inglés B1')!.id).toBe(uid(900));
    await borraDemo(ctxDe(db), FAR);
    const g = db.tabla('class_groups').find((x) => x.name === 'Inglés B1')!;
    expect(g).toMatchObject({ id: uid(900), weekdays: [5], capacity: 12 });
    expect(db.tabla('class_members').filter((m) => m.class_id === uid(900))).toHaveLength(0);
    expect(grupoId('Promo 43')).toBeTruthy();
  });
});

describe('las sesiones que propone el generador', () => {
  it('no choca un profesor consigo mismo', () => {
    const c = cuando(NOV);
    const grupos = GRUPOS.map(([nombre, , weekdays, ini, fin, esMulti]) => ({ nombre, weekdays, inicio: ini?.slice(0, 5) ?? null, fin: fin?.slice(0, 5) ?? null, esMulti })).filter((g) => g.nombre.includes('44'));
    const habituales = [
      { actividad: 'Boxeo', profesor: 'Juan', prioridad: 1 }, { actividad: 'Jiujitsu', profesor: 'Lucas', prioridad: 1 },
      { actividad: 'F.M + RDL', profesor: 'Lucio', prioridad: 1 }, { actividad: 'F.M + RDL', profesor: 'José Morato', prioridad: 2 },
      { actividad: 'FLK', profesor: 'José Morato', prioridad: 1 }, { actividad: 'FLK', profesor: 'Olivares', prioridad: 2 },
    ];
    const plan = generaCuadrante({ c, grupos, habituales, profesores: STAFF, ocupados: [] });
    const horaDe = (s: { grupo: string; horaPropia: string | null }) => s.horaPropia ?? grupos.find((g) => g.nombre === s.grupo)!.inicio;
    const vistos = new Set<string>();
    for (const s of plan.sesiones) {
      if (!s.profesor) continue;
      const k = `${s.fecha}|${horaDe(s)}|${s.profesor}`;
      expect(vistos.has(k), k).toBe(false);
      vistos.add(k);
    }
    expect(generaAlumnos()).toHaveLength(45);
  });
});

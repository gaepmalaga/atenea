/**
 * UNA BASE DE DATOS FALSA EN MEMORIA para probar el motor de la demo
 * (`app/lib/demo-motor.ts`) sin Supabase: desde la nube no llega PostgREST y,
 * aunque llegara, la de verdad es la de producción.
 *
 * Imita lo que importa para el borrado:
 *   · claves primarias y el índice único del registro (un duplicado es un error
 *     y no inserta NADA de esa llamada, como Postgres);
 *   · claves ajenas con semántica «restrict»: no se puede borrar un grupo con
 *     miembros, una sesión con apuntes ni una cuenta con filas colgando. Es MÁS
 *     estricto que la base de datos real (que a veces borra en cascada) a
 *     propósito: así un borrado que se olvida de una tabla falla aquí;
 *   · las funciones de cobros (`registra_cobro`, `anula_cobros`) y los
 *     disparadores que crean el perfil y la pertenencia a la academia;
 *   · algunas restricciones de columna, para pillar datos inventados inválidos.
 */
import type { Clave, DemoDb, Fila, Filtro } from '../../app/lib/demo-motor';
import { claveTexto } from '../../app/lib/demo-motor';

const PK: Record<string, string[]> = {
  academies: ['id'],
  class_groups: ['id'],
  class_members: ['class_id', 'user_id'],
  class_group_staff: ['class_id', 'staff_id'],
  academy_staff: ['id'],
  staff_subjects: ['staff_id', 'subject_id'],
  staff_activities: ['organization_id', 'activity', 'staff_id'],
  memberships: ['organization_id', 'user_id'],
  academy_members: ['academy_id', 'user_id'],
  profiles: ['id'],
  profiles_physical: ['user_id'],
  training_sessions: ['id'],
  training_session_logs: ['session_id', 'user_id'],
  training_week_notes: ['id'],
  class_days_off: ['class_id', 'session_date'],
  class_absences: ['class_id', 'user_id', 'session_date'],
  class_session_joins: ['class_id', 'user_id', 'session_date'],
  class_week_publications: ['organization_id', 'week_start'],
  session_templates: ['id'],
  question_attempts: ['id'],
  question_bank: ['id'],
  subjects: ['id'],
  physical_marks: ['id'],
  rm_marks: ['id'],
  monthly_payments: ['organization_id', 'user_id', 'period'],
  payment_entries: ['id'],
  receipt_counters: ['organization_id'],
  group_kinds: ['id'],
  fee_packs: ['id'],
  admin_audit_log: ['id'],
};

/** Hijas que apuntan a otra tabla: [tabla, columna, tablaPadre, columnaPadre]. `auth.users` es la tabla de cuentas. */
const FK: [string, string, string, string][] = [
  ['class_members', 'class_id', 'class_groups', 'id'], ['class_members', 'user_id', 'auth.users', 'id'],
  ['class_group_staff', 'class_id', 'class_groups', 'id'], ['class_group_staff', 'staff_id', 'academy_staff', 'id'],
  ['staff_subjects', 'staff_id', 'academy_staff', 'id'], ['staff_subjects', 'subject_id', 'subjects', 'id'],
  ['memberships', 'user_id', 'auth.users', 'id'], ['academy_members', 'user_id', 'auth.users', 'id'],
  ['profiles', 'id', 'auth.users', 'id'], ['profiles_physical', 'user_id', 'auth.users', 'id'],
  ['training_sessions', 'class_id', 'class_groups', 'id'], ['training_sessions', 'user_id', 'auth.users', 'id'],
  ['training_sessions', 'teacher_id', 'academy_staff', 'id'],
  ['training_session_logs', 'session_id', 'training_sessions', 'id'], ['training_session_logs', 'user_id', 'auth.users', 'id'],
  ['training_week_notes', 'user_id', 'auth.users', 'id'], ['class_days_off', 'class_id', 'class_groups', 'id'],
  ['class_absences', 'class_id', 'class_groups', 'id'], ['class_absences', 'user_id', 'auth.users', 'id'],
  ['class_session_joins', 'class_id', 'class_groups', 'id'], ['class_session_joins', 'user_id', 'auth.users', 'id'],
  ['physical_marks', 'user_id', 'auth.users', 'id'], ['rm_marks', 'user_id', 'auth.users', 'id'],
  ['monthly_payments', 'user_id', 'auth.users', 'id'],
  ['payment_entries', 'user_id', 'auth.users', 'id'], // en la real es «set null»; aquí «restrict» para pillar olvidos
  ['question_attempts', 'question_id', 'question_bank', 'id'],
];
const NULABLES = new Set(['training_sessions.class_id', 'training_sessions.user_id', 'training_sessions.teacher_id', 'question_attempts.question_id']);

const KINDS = ['fuerza', 'carrera', 'agilidad', 'circuito', 'movilidad', 'descanso', 'otro'];

/** Cada escritura que ha hecho el motor, en orden: sirve para reproducirlas en SQL contra el esquema real. */
export type Operacion =
  | { k: 'inserta'; tabla: string; filas: Fila[]; ignora: boolean }
  | { k: 'rpc'; nombre: string; args: Record<string, unknown>; idFalso?: string }
  | { k: 'cuenta'; id: string; email: string }
  | { k: 'borraEn'; tabla: string; columna: string; ids: (string | number)[] }
  | { k: 'borraClave'; tabla: string; clave: Clave }
  | { k: 'borraCuenta'; id: string };

export class DbFalsa implements DemoDb {
  tablas = new Map<string, Fila[]>();
  /** Lo que ha escrito el motor (no cuenta lo que se siembra a mano). */
  operaciones: Operacion[] = [];
  cuentas = new Map<string, { email: string; password: string }>();
  /** Cuántas llamadas a `inserta` quedan antes de fallar (para simular un corte). `null`: nunca. */
  fallarEn: number | null = null;
  llamadas = { inserta: 0, borraEn: 0, borraClave: 0, correos: 0 };
  private siguienteRegistro = 1;

  constructor(public academiaSlug: string, public academiaId: string) {
    this.tabla('academies').push({ id: academiaId, slug: academiaSlug, name: 'Alphapol' });
  }

  tabla(nombre: string): Fila[] {
    if (!this.tablas.has(nombre)) this.tablas.set(nombre, []);
    return this.tablas.get(nombre)!;
  }

  /** Mete una fila «real» (de antes de la demo) saltándose las comprobaciones. */
  siembra(nombre: string, ...filas: Fila[]) {
    this.tabla(nombre).push(...filas.map((f) => ({ ...f })));
  }

  /** Una foto de todo lo que NO es de la demo, para comparar antes y después. */
  foto(excluyendo: (tabla: string, fila: Fila) => boolean = () => false): string {
    const out: Record<string, Fila[]> = {};
    for (const [t, filas] of [...this.tablas.entries()].sort()) {
      const buenas = filas.filter((f) => !excluyendo(t, f));
      if (buenas.length) out[t] = buenas;
    }
    return JSON.stringify(out) + JSON.stringify([...this.cuentas.keys()].sort());
  }

  /** Las claves de cada tabla, en caché: se rehacen solo cuando la tabla cambia (el registro tiene miles de filas). */
  private versiones = new Map<string, number>();
  private indices = new Map<string, { v: number; n: number; claves: Set<string> }>();
  private toca(tabla: string) { this.versiones.set(tabla, (this.versiones.get(tabla) ?? 0) + 1); }
  private clavesDe(tabla: string): Set<string> {
    const filas = this.tabla(tabla);
    const v = this.versiones.get(tabla) ?? 0;
    const hit = this.indices.get(tabla);
    if (hit && hit.v === v && hit.n === filas.length) return hit.claves;
    const claves = new Set(filas.map((f) => this.clavePk(tabla, f)).filter((k): k is string => k !== null));
    this.indices.set(tabla, { v, n: filas.length, claves });
    return claves;
  }

  private clavePk(tabla: string, f: Fila): string | null {
    if (tabla === 'demo_registro') return JSON.stringify([f.organization_id, f.tabla, claveTexto(f.clave as Clave)]);
    const pk = PK[tabla];
    return pk ? JSON.stringify(pk.map((k) => f[k] ?? null)) : null;
  }

  private cumple(f: Fila, filtros: Filtro[]): boolean {
    return filtros.every((x) => {
      const v = f[x.columna];
      if ('en' in x) return x.en.map(String).includes(String(v));
      if ('igual' in x) return String(v) === String(x.igual);
      if ('nulo' in x) return v === null || v === undefined;
      return v !== null && v !== undefined && String(v) >= String(x.entre[0]) && String(v) <= String(x.entre[1]);
    });
  }

  private existePadre(tabla: string, col: string, valor: unknown, memo: Map<string, Set<string>>): boolean {
    if (tabla === 'auth.users') return this.cuentas.has(String(valor));
    const k = `${tabla}.${col}`;
    if (!memo.has(k)) memo.set(k, new Set(this.tabla(tabla).map((f) => String(f[col]))));
    return memo.get(k)!.has(String(valor));
  }

  private valida(tabla: string, f: Fila, memo: Map<string, Set<string>> = new Map()): string | null {
    for (const [t, col, padre, colPadre] of FK) {
      if (t !== tabla) continue;
      const v = f[col];
      if (v === null || v === undefined) {
        if (!NULABLES.has(`${t}.${col}`)) return `${tabla}.${col} es obligatoria`;
        continue;
      }
      if (!this.existePadre(padre, colPadre, v, memo)) return `viola la clave ajena ${tabla}.${col} → ${padre}`;
    }
    const lleva = (...cols: string[]) => cols.filter((c) => f[c] !== undefined && f[c] !== null);
    if (tabla === 'training_sessions') {
      if ((lleva('class_id').length > 0) === (lleva('user_id').length > 0)) return 'training_sessions: o class_id o user_id';
      if (!KINDS.includes(String(f.kind))) return `training_sessions.kind no válido: ${f.kind}`;
      if (!f.title || String(f.title).length > 120) return 'training_sessions.title no válido';
      if (f.duration_min != null && (Number(f.duration_min) < 1 || Number(f.duration_min) > 600)) return 'duration_min fuera de rango';
      if (f.distance_km != null && !(Number(f.distance_km) > 0 && Number(f.distance_km) < 1000)) return 'distance_km fuera de rango';
    }
    if (tabla === 'training_session_logs') {
      if (!['hecha', 'no_hecha'].includes(String(f.status))) return 'status no válido';
      if (f.rpe != null && (Number(f.rpe) < 1 || Number(f.rpe) > 10)) return 'rpe fuera de rango';
      if (f.comment != null && String(f.comment).length > 500) return 'comment demasiado largo';
      if (f.coach_reply != null && String(f.coach_reply).length > 500) return 'coach_reply demasiado largo';
    }
    if (tabla === 'physical_marks') {
      if (!['agilidad', 'dominadas', 'suspension', 'carrera_1000'].includes(String(f.test))) return 'physical_marks.test no válido';
      if (!(Number(f.value) >= 0)) return 'physical_marks.value no válido';
    }
    if (tabla === 'rm_marks') {
      if (!(Number(f.reps) >= 1 && Number(f.reps) <= 12)) return 'rm_marks.reps fuera de rango';
      if (!(Number(f.weight_kg) > 0 && Number(f.weight_kg) < 1000)) return 'rm_marks.weight_kg fuera de rango';
    }
    if (tabla === 'memberships') {
      if (!['active', 'suspended', 'pending'].includes(String(f.access_status))) return 'access_status no válido';
      if (!['al_dia', 'debe'].includes(String(f.payment_status))) return 'payment_status no válido';
    }
    if (tabla === 'question_attempts') {
      if (f.confidence != null && (Number(f.confidence) < 0 || Number(f.confidence) > 2)) return 'confidence fuera de rango';
      if (f.answer_path != null && !Array.isArray(f.answer_path)) return 'answer_path no es un array';
      if (typeof f.topic !== 'string') return 'topic es obligatorio';
    }
    if (tabla === 'class_groups') {
      if (f.start_time && f.end_time && String(f.end_time) <= String(f.start_time)) return 'class_groups: la hora de fin ha de ser posterior';
      if (Array.isArray(f.weekdays) && f.weekdays.some((d) => d < 1 || d > 7)) return 'class_groups.weekdays no válido';
    }
    if (tabla === 'session_templates' && !KINDS.includes(String(f.kind))) return 'session_templates.kind no válido';
    if (tabla === 'monthly_payments' && f.due_eur != null && !(Number(f.due_eur) >= 0 && Number(f.due_eur) < 10000)) return 'due_eur fuera de rango';
    return null;
  }

  async lee(tabla: string, columnas: string, filtros: Filtro[], orden: string[]) {
    const cols = columnas.split(',').map((c) => c.trim());
    const filas = this.tabla(tabla).filter((f) => this.cumple(f, filtros));
    const ord = [...filas].sort((a, b) => orden.map((o) => String(a[o]).localeCompare(String(b[o]))).find((x) => x !== 0) ?? 0);
    return { data: ord.map((f) => Object.fromEntries(cols.map((c) => [c, f[c] ?? null]))), error: null };
  }

  async cuenta(tabla: string, filtros: Filtro[]) {
    return { n: this.tabla(tabla).filter((f) => this.cumple(f, filtros)).length, error: null };
  }

  async inserta(tabla: string, filas: Fila[], opciones?: { ignoraDuplicados?: boolean }) {
    this.llamadas.inserta++;
    if (this.fallarEn !== null && this.llamadas.inserta > this.fallarEn) return { error: 'corte simulado', duplicado: false };
    const existentes = this.tabla(tabla);
    const claves = this.clavesDe(tabla);
    const nuevas: Fila[] = [];
    const vistas = new Set<string>();
    const memo = new Map<string, Set<string>>();
    for (const f of filas) {
      const k = this.clavePk(tabla, f);
      const dup = k !== null && (claves.has(k) || vistas.has(k));
      if (dup) {
        if (opciones?.ignoraDuplicados) continue;
        return { error: `duplicate key value violates unique constraint (${tabla})`, duplicado: true };
      }
      const malo = this.valida(tabla, f, memo);
      if (malo) return { error: malo, duplicado: false };
      if (k !== null) vistas.add(k);
      nuevas.push({ ...f });
    }
    this.toca(tabla);
    this.operaciones.push({ k: 'inserta', tabla, filas: filas.map((f) => ({ ...f })), ignora: opciones?.ignoraDuplicados === true });
    for (const f of nuevas) {
      if (tabla === 'demo_registro') { f.id = this.siguienteRegistro++; f.creado_en = f.creado_en ?? new Date().toISOString(); f.datos = f.datos ?? null; }
      existentes.push(f);
    }
    return { error: null, duplicado: false };
  }

  private hijasDe(tabla: string, col: string, ids: Set<string>): string | null {
    for (const [t, c, padre, colPadre] of FK) {
      if (padre !== tabla || colPadre !== col) continue;
      if (this.tabla(t).some((f) => ids.has(String(f[c])))) return `${t}.${c}`;
    }
    return null;
  }

  async borraEn(tabla: string, columna: string, ids: (string | number)[]) {
    this.llamadas.borraEn++;
    this.operaciones.push({ k: 'borraEn', tabla, columna, ids: [...ids] });
    const set = new Set(ids.map(String));
    const filas = this.tabla(tabla);
    const caen = filas.filter((f) => set.has(String(f[columna])));
    const idsDelPadre = new Set(caen.map((f) => String(f.id)));
    const colgando = columna === 'id' ? this.hijasDe(tabla, 'id', idsDelPadre) : null;
    if (colgando) return { error: `violates foreign key constraint: ${colgando} aún apunta a ${tabla}` };
    this.toca(tabla);
    this.tablas.set(tabla, filas.filter((f) => !set.has(String(f[columna]))));
    return { error: null };
  }

  async borraClave(tabla: string, clave: Clave) {
    this.llamadas.borraClave++;
    this.operaciones.push({ k: 'borraClave', tabla, clave: { ...clave } });
    const k = Object.keys(clave);
    this.toca(tabla);
    this.tablas.set(tabla, this.tabla(tabla).filter((f) => !k.every((c) => String(f[c]) === String(clave[c]))));
    return { error: null };
  }

  private recalcula(org: string, user: string, period: string) {
    const fila = this.tabla('monthly_payments').find((m) => m.organization_id === org && m.user_id === user && m.period === period);
    if (!fila) return;
    const validos = this.tabla('payment_entries').filter((e) => e.organization_id === org && e.user_id === user && e.period === period && !e.voided_at);
    const total = validos.reduce((s, e) => s + Number(e.amount_eur), 0);
    fila.amount_eur = total === 0 ? null : total;
    fila.paid = fila.due_eur == null ? total > 0 : Number(fila.due_eur) <= 0 ? true : total >= Number(fila.due_eur) - 0.005;
    fila.paid_on = validos.map((e) => String(e.paid_on)).sort().pop() ?? null;
  }

  async rpc(nombre: string, a: Record<string, unknown>) {
    if (nombre === 'registra_cobro') {
      const { p_org, p_user, p_alumno, p_period, p_amount, p_method, p_paid_on, p_by } = a as Record<string, string | number>;
      const mes = this.tabla('monthly_payments').find((m) => m.organization_id === p_org && m.user_id === p_user && m.period === p_period);
      if (!mes) return { data: null, error: `No existe la fila de ${p_period} para ese alumno` };
      if (!(Number(p_amount) > 0)) return { data: null, error: 'importe no válido' };
      if (!['efectivo', 'bizum', 'transferencia', 'tarjeta'].includes(String(p_method))) return { data: null, error: 'método no válido' };
      let contador = this.tabla('receipt_counters').find((c) => c.organization_id === p_org);
      if (!contador) { contador = { organization_id: p_org, last_no: 0 }; this.tabla('receipt_counters').push(contador); }
      contador.last_no = Number(contador.last_no) + 1;
      const id = `00000000-0000-4000-8000-${String(this.tabla('payment_entries').length + 1000).padStart(12, '0')}`;
      this.tabla('payment_entries').push({
        id, organization_id: p_org, user_id: p_user, alumno: p_alumno, period: p_period, amount_eur: p_amount, method: p_method,
        receipt_no: contador.last_no, paid_on: p_paid_on, recorded_by: p_by, voided_at: null, voided_by: null,
      });
      this.recalcula(String(p_org), String(p_user), String(p_period));
      this.operaciones.push({ k: 'rpc', nombre, args: { ...a }, idFalso: id });
      return { data: [{ entry_id: id, receipt: contador.last_no }], error: null };
    }
    if (nombre === 'anula_cobros') {
      const { p_org, p_user, p_period, p_entry, p_by } = a as Record<string, string | null>;
      let n = 0;
      for (const e of this.tabla('payment_entries')) {
        if (e.organization_id === p_org && e.user_id === p_user && e.period === p_period && !e.voided_at && (!p_entry || e.id === p_entry)) {
          e.voided_at = 'ahora'; e.voided_by = p_by; n++;
        }
      }
      this.recalcula(String(p_org), String(p_user), String(p_period));
      this.operaciones.push({ k: 'rpc', nombre, args: { ...a } });
      return { data: n, error: null };
    }
    return { data: null, error: `rpc desconocida: ${nombre}` };
  }

  async existeCuenta(id: string) { return { existe: this.cuentas.has(id), error: null }; }

  async creaCuenta(c: { id: string; email: string; password: string }) {
    if (this.cuentas.has(c.id)) return { error: 'ya existe' };
    if ([...this.cuentas.values()].some((x) => x.email === c.email)) return { error: 'correo repetido' };
    if (c.password.length < 8) return { error: 'contraseña corta' };
    this.cuentas.set(c.id, { email: c.email, password: c.password });
    this.operaciones.push({ k: 'cuenta', id: c.id, email: c.email });
    // Los disparadores de la base de datos: el perfil y la pertenencia a la academia.
    this.tabla('profiles').push({ id: c.id, email: c.email, role: 'student' });
    this.tabla('academy_members').push({ academy_id: this.academiaId, user_id: c.id });
    return { error: null };
  }

  async ponClave(id: string, password: string) {
    const c = this.cuentas.get(id);
    if (!c) return { error: 'no existe' };
    c.password = password;
    return { error: null };
  }

  async borraCuenta(id: string) {
    // `restrict`: si algo cuelga de la cuenta, el borrado falla (la real borraría en cascada algunas tablas; aquí no, para pillar olvidos).
    for (const [t, c, padre] of FK) {
      if (padre !== 'auth.users') continue;
      if (this.tabla(t).some((f) => String(f[c]) === id)) return { error: `la cuenta aún tiene filas en ${t}.${c}` };
    }
    this.operaciones.push({ k: 'borraCuenta', id });
    this.cuentas.delete(id);
    return { error: null };
  }
}

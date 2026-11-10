/**
 * DATOS DE DEMOSTRACIÓN (regla 106): el motor que carga y borra.
 *
 * `demo.ts` decide QUÉ se inventa. Esto lo CREA y, sobre todo, lo DESHACE, con
 * una regla de oro: el borrado quita EXACTAMENTE lo que creó la carga, ni más
 * ni menos. La base de datos es la de producción y no tiene copias.
 *
 * Cómo se cumple:
 *   1. SOLO SE AÑADEN FILAS. Nunca se modifica ni se borra una fila que no haya
 *      creado la carga: ni precios, ni ajustes, ni grupos, profesores o
 *      sesiones que ya existan. Se USAN, no se tocan.
 *   2. EL REGISTRO (`demo_registro`). Cada fila que se crea se apunta con su
 *      tabla y su clave primaria ANTES de crearla; si la carga se corta a
 *      medias, el borrado sabe qué limpiar. Si la fila ya existía con esa clave
 *      (una sesión de ese grupo ese día, una semana ya publicada…), ni se crea
 *      ni se apunta: se salta.
 *   3. EL BORRADO quita lo registrado y lo que CUELGA de ello aunque lo haya
 *      creado la aplicación al usarla (el mes que abre «Pagos», un cobro, una
 *      falta de un alumno de la demo): lo que apunta a una cuenta, un grupo o
 *      una sesión de la demo. Nada más. NUNCA «por academia»: cada borrado va
 *      acotado a una lista de ids o de claves que sale del registro.
 *   4. Antes, un ENSAYO cuenta lo que se iría, y cuántas filas son «colgadas»
 *      (no registradas).
 *
 * El motor no importa Supabase: habla con una `DemoDb` (lo implementa
 * `actions/demo.ts`). Así `tests/demo-motor.test.ts` lo recorre entero contra
 * una base de datos falsa en memoria, con filas «reales» alrededor para
 * comprobar que ni una se toca.
 *
 * Módulo PURO en el sentido de la regla 21: sin servidor, sin red.
 */

import {
  cuando, generaAlumnos, generaRespuestas, generaSimulacros, generaMarcas, generaRm, generaEntreno, generaCuadrante,
  generaAsistencia, generaCobros, indexaPool, perfilFisico, uuidDemo, tieneRespuestas, estadoPagoDe,
  GRUPOS_NUEVOS, PLANTILLAS_DEMO, TEMAS_PROFESORES_DEMO, DEUDORES_DEMO, gruposDe,
  EMAIL_ALUMNO_DEMO, type AlumnoDemo, type Cuando, type GrupoRef, type HabitualRef, type OcupadoRef, type PreguntaPool,
} from './demo';
import { TABLAS_POR_USUARIO, TABLAS_POR_GRUPO, trozos } from './limpieza';
import { FASES_DEMO, ETIQUETA_FASE, type FaseDemo, type EstadoDemo, type EnsayoDemo, type FilaEnsayo } from './demo-fases';
import { sumaDias } from './asistencia';
import { sumaMeses, type Tarifa } from './cuotas';

// ============================================================
// LA BASE DE DATOS, COMO LA NECESITA EL MOTOR
// ============================================================

export type Fila = Record<string, unknown>;
/** Una clave primaria: columna → valor. */
export type Clave = Record<string, string | number>;

export type Filtro =
  | { columna: string; en: (string | number)[] }
  | { columna: string; igual: string | number | boolean }
  | { columna: string; nulo: true }
  | { columna: string; entre: [string | number, string | number] };

export interface DemoDb {
  /** SELECT. Pagina y trocea por dentro. `orden`: columnas que, juntas, no se repiten. */
  lee(tabla: string, columnas: string, filtros: Filtro[], orden: string[]): Promise<{ data: Fila[]; error: string | null }>;
  /** COUNT exacto de las filas que cumplen los filtros. */
  cuenta(tabla: string, filtros: Filtro[]): Promise<{ n: number; error: string | null }>;
  /**
   * INSERT. Con `ignoraDuplicados`, una fila cuya clave ya existe se salta
   * (ON CONFLICT DO NOTHING). Sin él, un duplicado es un error (`duplicado`)
   * y no se inserta NINGUNA fila de la llamada.
   */
  inserta(tabla: string, filas: Fila[], opciones?: { ignoraDuplicados?: boolean }): Promise<{ error: string | null; duplicado: boolean }>;
  /** DELETE de las filas con `columna` en la lista de ids. */
  borraEn(tabla: string, columna: string, ids: (string | number)[]): Promise<{ error: string | null }>;
  /** DELETE de UNA fila, por su clave primaria entera. */
  borraClave(tabla: string, clave: Clave): Promise<{ error: string | null }>;
  rpc(nombre: string, args: Record<string, unknown>): Promise<{ data: unknown; error: string | null }>;
  existeCuenta(id: string): Promise<{ existe: boolean; error: string | null }>;
  /** Crea la cuenta con el correo ya confirmado y SIN mandar ningún correo. */
  creaCuenta(c: { id: string; email: string; password: string }): Promise<{ error: string | null }>;
  ponClave(id: string, password: string): Promise<{ error: string | null }>;
  borraCuenta(id: string): Promise<{ error: string | null }>;
}

export type Ctx = {
  db: DemoDb;
  /** La academia de la sesión (regla 65). */
  org: string;
  /** Quien carga: `created_by`, `recorded_by`, `published_by`. */
  adminId: string;
  /** El «ahora» real de esta petición (solo se usa para fijar el de una carga nueva). */
  ahoraMs: number;
  /** Una contraseña aleatoria. Inyectada para que los tests sean deterministas. */
  generaClave: () => string;
};

export const REGISTRO = 'demo_registro';
export const CUENTAS = 'auth.users';
const META_CARGA = '_carga';
const META_FASE = '_fase';

export const claveTexto = (c: Clave): string => JSON.stringify(Object.keys(c).sort().map((k) => [k, c[k]]));
const idCuenta = (clave: string) => uuidDemo('cuenta', clave);
const aHora = (h: string | null) => (h && /^\d{2}:\d{2}$/.test(h) ? `${h}:00` : h);

// ============================================================
// FASES
// ============================================================

export { FASES_DEMO, ETIQUETA_FASE };
export type { FaseDemo, EstadoDemo, EnsayoDemo, FilaEnsayo };

const POR_TANDA_CUENTAS = 12;
const CUENTAS_A_LA_VEZ = 6;
const POR_TANDA_RESPUESTAS = 8;
const MESES_COBROS = 6; // los 5 anteriores y el actual

/** Cuántas tandas tiene cada fase: el botón las llama una tras otra. */
export function tandasDe(fase: FaseDemo): number {
  const alumnos = generaAlumnos();
  switch (fase) {
    case 'cuentas': return Math.ceil(alumnos.length / POR_TANDA_CUENTAS);
    case 'respuestas': return Math.ceil(alumnos.filter(tieneRespuestas).length / POR_TANDA_RESPUESTAS);
    case 'cobros': return MESES_COBROS;
    default: return 1;
  }
}

export type ResultadoFase =
  | { ok: true; fase: FaseDemo; tanda: number; tandas: number; siguiente: number | null; filas: number; texto: string; claveAlumno?: string }
  | { ok: false; error: string };

const fallo = (error: string): { ok: false; error: string } => ({ ok: false, error });

// ============================================================
// EL REGISTRO
// ============================================================

type FilaRegistro = { id: number; tabla: string; clave: Clave; datos: Fila | null; fase: string; periodo: string; creado_en: string };

/** Apunta filas en el registro (una vez cada una: reintentar no duplica). */
async function apunta(ctx: Ctx, periodo: string, fase: FaseDemo, tabla: string, claves: Clave[], datos?: Fila): Promise<string | null> {
  for (const lote of trozos(claves, 500)) {
    const filas = lote.map((clave) => ({ organization_id: ctx.org, periodo, fase, tabla, clave, ...(datos ? { datos } : {}) }));
    const { error } = await ctx.db.inserta(REGISTRO, filas, { ignoraDuplicados: true });
    if (error) return `No he podido apuntar en el registro (${tabla}): ${error}`;
  }
  return null;
}

/** Lo apuntado de una tabla. */
async function registradas(db: DemoDb, org: string, tabla: string): Promise<{ data: FilaRegistro[]; error: string | null }> {
  const r = await db.lee(REGISTRO, 'id, tabla, clave, datos, fase, periodo, creado_en', [{ columna: 'organization_id', igual: org }, { columna: 'tabla', igual: tabla }], ['id']);
  return { data: r.data as unknown as FilaRegistro[], error: r.error };
}

const idsDe = (filas: FilaRegistro[]): string[] => filas.map((f) => String(f.clave.id));

/** Se quita del registro lo que se apuntó y no llegó a crearse (la fila ya existía). */
async function desapunta(db: DemoDb, org: string, tabla: string, claves: Clave[]): Promise<void> {
  if (!claves.length) return;
  const { data } = await registradas(db, org, tabla);
  const quitar = new Set(claves.map(claveTexto));
  const ids = data.filter((f) => quitar.has(claveTexto(f.clave))).map((f) => f.id);
  for (const lote of trozos(ids, 150)) await db.borraEn(REGISTRO, 'id', lote);
}

type Carga = { ahoraMs: number; periodo: string };

async function leeCarga(db: DemoDb, org: string): Promise<{ carga: Carga | null; error: string | null }> {
  const { data, error } = await registradas(db, org, META_CARGA);
  if (error) return { carga: null, error };
  const d = data[0]?.datos as { ahoraMs?: number } | null | undefined;
  if (!data[0] || typeof d?.ahoraMs !== 'number') return { carga: null, error: null };
  return { carga: { ahoraMs: d.ahoraMs, periodo: data[0].periodo }, error: null };
}

async function tandasHechas(db: DemoDb, org: string): Promise<{ hechas: Set<string>; error: string | null }> {
  const { data, error } = await registradas(db, org, META_FASE);
  return { hechas: new Set(data.map((f) => `${f.clave.fase}:${f.clave.tanda}`)), error };
}

const todasLasTandas = (): string[] => FASES_DEMO.flatMap((f) => Array.from({ length: tandasDe(f) }, (_, t) => `${f}:${t}`));

// ============================================================
// ESTADO
// ============================================================

export async function estadoDemo(db: DemoDb, org: string): Promise<{ ok: true; estado: EstadoDemo } | { ok: false; error: string }> {
  const { carga, error } = await leeCarga(db, org);
  if (error) return fallo(error);
  const total = await db.cuenta(REGISTRO, [{ columna: 'organization_id', igual: org }]);
  const meta = await db.cuenta(REGISTRO, [{ columna: 'organization_id', igual: org }, { columna: 'tabla', en: [META_CARGA, META_FASE] }]);
  const cuentas = await db.cuenta(REGISTRO, [{ columna: 'organization_id', igual: org }, { columna: 'tabla', igual: CUENTAS }]);
  const t = await tandasHechas(db, org);
  const err = total.error ?? meta.error ?? cuentas.error ?? t.error;
  if (err) return fallo(err);
  const tandas = todasLasTandas();
  const hechas = tandas.filter((x) => t.hechas.has(x)).length;
  return {
    ok: true,
    estado: {
      hay: total.n > 0,
      periodo: carga?.periodo ?? null,
      filas: total.n - meta.n,
      cuentas: cuentas.n,
      completa: !!carga && hechas === tandas.length,
      hechas,
      tandas: tandas.length,
    },
  };
}

// ============================================================
// LA CARGA
// ============================================================

/** Lo que cada fase necesita saber de la academia, sin tocarlo. */
type GrupoBD = { id: string; name: string; kind: string; weekdays: number[] | null; start_time: string | null; end_time: string | null; is_multi: boolean; created_at: string };

async function gruposDeLaAcademia(db: DemoDb, org: string) {
  const r = await db.lee('class_groups', 'id, name, kind, weekdays, start_time, end_time, is_multi, created_at', [{ columna: 'organization_id', igual: org }], ['id']);
  const data = (r.data as unknown as GrupoBD[]).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.name.localeCompare(b.name, 'es'));
  return { data, error: r.error };
}

const horaDe = (h: string | null) => (h ? h.slice(0, 5) : null);
const refDeGrupo = (g: GrupoBD): GrupoRef => ({ nombre: g.name, weekdays: g.weekdays, inicio: horaDe(g.start_time), fin: horaDe(g.end_time), esMulti: g.is_multi });

export async function cargaFase(ctx: Ctx, fase: FaseDemo, tanda: number): Promise<ResultadoFase> {
  const total = tandasDe(fase);
  if (!FASES_DEMO.includes(fase) || !Number.isInteger(tanda) || tanda < 0 || tanda >= total) return fallo('Esa fase de la carga no existe.');

  const { db, org } = ctx;
  const actual = await leeCarga(db, org);
  if (actual.error) return fallo(actual.error);
  const hechas = await tandasHechas(db, org);
  if (hechas.error) return fallo(hechas.error);

  let carga = actual.carga;
  if (fase === 'cuentas' && tanda === 0) {
    if (carga && todasLasTandas().every((x) => hechas.hechas.has(x))) {
      return fallo(`Ya hay una carga de datos de demostración (${carga.periodo}). Bórrala antes de cargar otra.`);
    }
    if (!carga) {
      // Una carga nueva: el «ahora» se fija aquí y lo usan todas las fases.
      const otras = await db.cuenta(REGISTRO, [{ columna: 'organization_id', igual: org }]);
      if (otras.error) return fallo(otras.error);
      if (otras.n > 0) return fallo('Hay restos de una carga anterior sin marca de inicio. Bórralos antes de cargar.');
      const c = cuando(ctx.ahoraMs);
      const { error } = await db.inserta(REGISTRO, [{
        organization_id: ctx.org, periodo: c.periodo, fase: 'cuentas', tabla: META_CARGA, clave: { carga: 1 }, datos: { ahoraMs: ctx.ahoraMs },
      }], { ignoraDuplicados: true });
      if (error) return fallo(`No he podido empezar la carga: ${error}`);
      carga = { ahoraMs: ctx.ahoraMs, periodo: c.periodo };
    }
  } else {
    if (!carga) return fallo('No hay una carga empezada. Empieza por «Cargar datos».');
    const previa = FASES_DEMO[FASES_DEMO.indexOf(fase) - 1];
    if (tanda === 0 && previa) {
      const faltan = Array.from({ length: tandasDe(previa) }, (_, t) => `${previa}:${t}`).filter((x) => !hechas.hechas.has(x));
      if (faltan.length) return fallo(`Falta terminar la fase anterior (${ETIQUETA_FASE[previa]}).`);
    }
  }
  if (!carga) return fallo('No hay una carga empezada.');

  // Una tanda ya hecha no se repite (salvo las cuentas, que son idempotentes y
  // devuelven la contraseña de `alumno@` si hay que volver a enseñarla).
  if (fase !== 'cuentas' && hechas.hechas.has(`${fase}:${tanda}`)) {
    return { ok: true, fase, tanda, tandas: total, siguiente: tanda + 1 < total ? tanda + 1 : null, filas: 0, texto: 'ya estaba hecha' };
  }

  const c = cuando(carga.ahoraMs);
  const alumnos = generaAlumnos();
  const e = { ctx, c, periodo: carga.periodo, alumnos };

  let r: { error: string | null; filas: number; texto: string; claveAlumno?: string };
  try {
    if (fase === 'cuentas') r = await faseCuentas(e, tanda);
    else if (fase === 'grupos') r = await faseGrupos(e);
    else if (fase === 'fisica') r = await faseFisica(e);
    else if (fase === 'respuestas') r = await faseRespuestas(e, tanda);
    else r = await faseCobros(e, tanda);
  } catch (err) {
    return fallo(err instanceof Error ? err.message : String(err));
  }
  if (r.error) return fallo(r.error);

  const marca = await apunta(ctx, carga.periodo, fase, META_FASE, [{ fase, tanda }]);
  if (marca) return fallo(marca);
  return { ok: true, fase, tanda, tandas: total, siguiente: tanda + 1 < total ? tanda + 1 : null, filas: r.filas, texto: r.texto, claveAlumno: r.claveAlumno };
}

type Entorno = { ctx: Ctx; c: Cuando; periodo: string; alumnos: AlumnoDemo[] };
type SalidaFase = { error: string | null; filas: number; texto: string; claveAlumno?: string };

/**
 * Apunta y crea filas que son SOLO de la demo (cuelgan de cuentas o grupos que
 * crea la carga, con ids que salen de su clave): un reintento las salta.
 */
async function creaPropias(e: Entorno, fase: FaseDemo, tabla: string, filas: Fila[], clave: (f: Fila) => Clave): Promise<string | null> {
  if (!filas.length) return null;
  const err = await apunta(e.ctx, e.periodo, fase, tabla, filas.map(clave));
  if (err) return err;
  for (const lote of trozos(filas, 500)) {
    const { error } = await e.ctx.db.inserta(tabla, lote, { ignoraDuplicados: true });
    if (error) return `No he podido crear filas en ${tabla}: ${error}`;
  }
  return null;
}

/**
 * Apunta y crea filas con CLAVE NATURAL en una tabla que ya tiene filas de
 * verdad (un día sin clase de un grupo que ya existe, una semana publicada…).
 * Si la clave ya existe, la fila NO es de la demo: ni se crea ni se apunta.
 */
async function creaSiNoExiste(e: Entorno, fase: FaseDemo, tabla: string, filas: Fila[], columnasClave: string[], yaExisten: Set<string>): Promise<{ error: string | null; creadas: number }> {
  const clave = (f: Fila): Clave => Object.fromEntries(columnasClave.map((k) => [k, f[k] as string | number]));
  const nuevas = filas.filter((f) => !yaExisten.has(claveTexto(clave(f))));
  if (!nuevas.length) return { error: null, creadas: 0 };

  // Lo que ya estaba apuntado de una carga anterior (cortada) sigue siendo nuestro.
  const previas = await registradas(e.ctx.db, e.ctx.org, tabla);
  if (previas.error) return { error: previas.error, creadas: 0 };
  const apuntadas = new Set(previas.data.map((f) => claveTexto(f.clave)));
  const porApuntar = nuevas.filter((f) => !apuntadas.has(claveTexto(clave(f))));

  const err = await apunta(e.ctx, e.periodo, fase, tabla, porApuntar.map(clave));
  if (err) return { error: err, creadas: 0 };

  const r = await e.ctx.db.inserta(tabla, nuevas);
  if (!r.error) return { error: null, creadas: nuevas.length };
  if (!r.duplicado) return { error: `No he podido crear filas en ${tabla}: ${r.error}`, creadas: 0 };

  // Alguien creó una de esas claves entre la comprobación y el insert: fila a
  // fila. La que choca NO es nuestra, y se quita del registro.
  let creadas = 0;
  const chocan: Clave[] = [];
  for (const f of nuevas) {
    const una = await e.ctx.db.inserta(tabla, [f]);
    if (!una.error) creadas++;
    else if (una.duplicado) { if (porApuntar.includes(f)) chocan.push(clave(f)); }
    else return { error: `No he podido crear una fila en ${tabla}: ${una.error}`, creadas };
  }
  await desapunta(e.ctx.db, e.ctx.org, tabla, chocan);
  return { error: null, creadas };
}

// ---------------- cuentas ----------------

async function faseCuentas(e: Entorno, tanda: number): Promise<SalidaFase> {
  const { ctx, c } = e;
  const lote = e.alumnos.slice(tanda * POR_TANDA_CUENTAS, (tanda + 1) * POR_TANDA_CUENTAS);
  const ids = lote.map((a) => idCuenta(a.clave));

  // Se apunta TODO lo que va a existir antes de crear nada: la cuenta y lo que
  // sus disparadores crean solos (perfil y pertenencia a la academia).
  for (const [tabla, claves] of [
    [CUENTAS, ids.map((id) => ({ id }))],
    ['profiles', ids.map((id) => ({ id }))],
    ['academy_members', ids.map((id) => ({ academy_id: ctx.org, user_id: id }))],
    ['memberships', ids.map((id) => ({ organization_id: ctx.org, user_id: id }))],
    ['profiles_physical', ids.map((id) => ({ user_id: id }))],
  ] as [string, Clave[]][]) {
    const err = await apunta(ctx, e.periodo, 'cuentas', tabla, claves);
    if (err) return { error: err, filas: 0, texto: '' };
  }

  // Las cuentas, en paralelo y por tandas pequeñas. Con el correo ya
  // confirmado y SIN mandar ningún correo. Solo la de `alumno@` tiene una
  // contraseña que alguien necesita: las demás nadie las usa.
  let claveAlumno: string | undefined;
  let creadas = 0;
  for (const grupo of trozos(lote, CUENTAS_A_LA_VEZ)) {
    const rs = await Promise.all(grupo.map(async (a) => {
      const id = idCuenta(a.clave);
      const clave = ctx.generaClave();
      const ex = await ctx.db.existeCuenta(id);
      if (ex.error) return { error: ex.error };
      if (!ex.existe) {
        const r = await ctx.db.creaCuenta({ id, email: a.email, password: clave });
        if (r.error) return { error: `${a.email}: ${r.error}` };
        creadas++;
      } else if (a.email === EMAIL_ALUMNO_DEMO) {
        // La cuenta quedó de una carga cortada: la contraseña de entonces ya no se sabe.
        const r = await ctx.db.ponClave(id, clave);
        if (r.error) return { error: r.error };
      }
      return { error: null, clave: a.email === EMAIL_ALUMNO_DEMO ? clave : undefined };
    }));
    for (const r of rs) {
      if (r.error) return { error: `No he podido crear una cuenta: ${r.error}`, filas: 0, texto: '' };
      if ('clave' in r && r.clave) claveAlumno = r.clave;
    }
  }

  const ahora = new Date(ctx.ahoraMs).toISOString();
  const pertenencia = lote.map((a) => ({ academy_id: ctx.org, user_id: idCuenta(a.clave) }));
  let r = await ctx.db.inserta('academy_members', pertenencia, { ignoraDuplicados: true });
  if (r.error) return { error: `No he podido añadir a la academia: ${r.error}`, filas: 0, texto: '' };

  r = await ctx.db.inserta('memberships', lote.map((a) => ({
    organization_id: ctx.org,
    user_id: idCuenta(a.clave),
    access_status: a.acceso,
    payment_status: estadoPagoDe(a, [...DEUDORES_DEMO]),
    exempt: a.exento,
    custom_fee_eur: a.propia?.eur ?? null,
    custom_fee_note: a.propia?.nota ?? null,
    note: a.nota,
    updated_at: ahora,
  })), { ignoraDuplicados: true });
  if (r.error) return { error: `No he podido crear las membresías: ${r.error}`, filas: 0, texto: '' };

  r = await ctx.db.inserta('profiles_physical', lote.map((a) => ({ user_id: idCuenta(a.clave), ...perfilFisico(a, c) })), { ignoraDuplicados: true });
  if (r.error) return { error: `No he podido guardar el sexo: ${r.error}`, filas: 0, texto: '' };

  return { error: null, filas: lote.length, texto: `${lote.length} cuentas${creadas < lote.length ? ` (${lote.length - creadas} ya estaban)` : ''}`, claveAlumno };
}

// ---------------- grupos y horario ----------------

async function faseGrupos(e: Entorno): Promise<SalidaFase> {
  const { ctx, c } = e;
  const { db, org } = ctx;
  const g = await gruposDeLaAcademia(db, org);
  if (g.error) return { error: g.error, filas: 0, texto: '' };
  const porNombre = new Map(g.data.map((x) => [x.name, x.id]));
  let filas = 0;
  const avisos: string[] = [];

  // Los dos grupos nuevos, si no existen ya con ese nombre.
  const nuevos = GRUPOS_NUEVOS.filter((n) => !porNombre.has(n.nombre));
  const filasGrupo = nuevos.map((n, i) => ({
    id: uuidDemo('grupo', n.nombre),
    organization_id: org,
    name: n.nombre,
    kind: n.tipo,
    weekdays: n.weekdays,
    start_time: aHora(n.inicio),
    end_time: aHora(n.fin),
    capacity: n.aforo,
    is_multi: false,
    // Un segundo entre uno y otro: el orden de alta es el del cuadrante (regla 96).
    created_at: new Date(c.ahoraMs + i * 1000).toISOString(),
  }));
  let err = await creaPropias(e, 'grupos', 'class_groups', filasGrupo, (f) => ({ id: f.id as string }));
  if (err) return { error: err, filas, texto: '' };
  for (const f of filasGrupo) porNombre.set(f.name, f.id);
  filas += filasGrupo.length;

  // El profesor de cada grupo nuevo (solo si el profesor ya existe).
  const staff = await db.lee('academy_staff', 'id, name', [{ columna: 'organization_id', igual: org }], ['id']);
  if (staff.error) return { error: staff.error, filas, texto: '' };
  const staffId = new Map(staff.data.map((s) => [String(s.name), String(s.id)]));
  const propios = new Set(idsDe((await registradas(db, org, 'class_groups')).data));
  const filasStaff: Fila[] = [];
  for (const n of GRUPOS_NUEVOS) {
    // Solo a los grupos que creó la carga: a uno que ya existía con ese nombre no se le toca el profesor.
    if (!n.profesor || !propios.has(porNombre.get(n.nombre) ?? '')) continue;
    const sid = staffId.get(n.profesor);
    if (!sid) { avisos.push(`no hay profesor «${n.profesor}»`); continue; }
    filasStaff.push({ class_id: porNombre.get(n.nombre), staff_id: sid });
  }
  err = await creaPropias(e, 'grupos', 'class_group_staff', filasStaff, (f) => ({ class_id: f.class_id as string, staff_id: f.staff_id as string }));
  if (err) return { error: err, filas, texto: '' };
  filas += filasStaff.length;

  // Los alumnos, en sus grupos (los de la solicitud pendiente no tienen).
  const miembros: Fila[] = [];
  const faltan = new Set<string>();
  for (const a of e.alumnos) {
    if (a.acceso === 'pending') continue;
    for (const nombre of gruposDe(a)) {
      const id = porNombre.get(nombre);
      if (!id) { faltan.add(nombre); continue; }
      miembros.push({ class_id: id, user_id: idCuenta(a.clave) });
    }
  }
  err = await creaPropias(e, 'grupos', 'class_members', miembros, (f) => ({ class_id: f.class_id as string, user_id: f.user_id as string }));
  if (err) return { error: err, filas, texto: '' };
  filas += miembros.length;
  if (faltan.size) avisos.push(`faltan grupos: ${[...faltan].join(', ')}`);

  // Los temas de cada uno de los dos profesores de teoría: solo si no tiene ninguno.
  const temas = await db.lee('subjects', 'id, topic_number', [], ['id']);
  const staffTemas = await db.lee('staff_subjects', 'staff_id, subject_id', [{ columna: 'organization_id', igual: org }], ['staff_id', 'subject_id']);
  if (temas.error || staffTemas.error) return { error: (temas.error ?? staffTemas.error)!, filas, texto: '' };
  const idTema = new Map(temas.data.map((t) => [Number(t.topic_number), Number(t.id)]));
  const yaTemas = new Set(staffTemas.data.map((s) => claveTexto({ staff_id: String(s.staff_id), subject_id: Number(s.subject_id) })));
  const conTemas = new Set(staffTemas.data.map((s) => String(s.staff_id)));
  const filasTemas: Fila[] = [];
  for (const t of TEMAS_PROFESORES_DEMO) {
    const sid = staffId.get(t.profesor);
    if (!sid || conTemas.has(sid)) continue;
    for (let n = t.desde; n <= t.hasta; n++) {
      const subject = idTema.get(n);
      if (subject !== undefined) filasTemas.push({ organization_id: org, staff_id: sid, subject_id: subject });
    }
  }
  const rt = await creaSiNoExiste(e, 'grupos', 'staff_subjects', filasTemas, ['staff_id', 'subject_id'], yaTemas);
  if (rt.error) return { error: rt.error, filas, texto: '' };
  filas += rt.creadas;

  return { error: null, filas, texto: `${nuevos.length} grupos nuevos, ${miembros.length} alumnos en grupos${avisos.length ? ` (${avisos.join('; ')})` : ''}` };
}

// ---------------- física ----------------

async function faseFisica(e: Entorno): Promise<SalidaFase> {
  const { ctx, c } = e;
  const { db, org } = ctx;
  const g = await gruposDeLaAcademia(db, org);
  if (g.error) return { error: g.error, filas: 0, texto: '' };
  const porNombre = new Map(g.data.map((x) => [x.name, x]));
  const fisicas = g.data.filter((x) => x.kind === 'fisicas');
  const idsFisicas = fisicas.map((x) => x.id);

  const staff = await db.lee('academy_staff', 'id, name, active', [{ columna: 'organization_id', igual: org }], ['id']);
  const acts = await db.lee('staff_activities', 'activity, staff_id, priority', [{ columna: 'organization_id', igual: org }], ['activity', 'staff_id']);
  if (staff.error || acts.error) return { error: (staff.error ?? acts.error)!, filas: 0, texto: '' };
  const nombreDe = new Map(staff.data.map((s) => [String(s.id), String(s.name)]));
  const idDe = new Map(staff.data.map((s) => [String(s.name), String(s.id)]));
  const habituales: HabitualRef[] = acts.data.flatMap((a) => {
    const profesor = nombreDe.get(String(a.staff_id));
    return profesor ? [{ actividad: String(a.activity), profesor, prioridad: Number(a.priority) }] : [];
  });
  const profesores = staff.data.filter((s) => s.active === true).map((s) => String(s.name));

  // Lo que ya hay en la ventana: se respeta y ocupa a sus profesores.
  const desde = sumaDias(c.lunes, -21);
  const hasta = sumaDias(c.lunes, 13);
  const previas = idsFisicas.length
    ? await db.lee('training_sessions', 'id, class_id, session_date, start_time, teacher_id', [{ columna: 'class_id', en: idsFisicas }, { columna: 'session_date', entre: [desde, hasta] }], ['id'])
    : { data: [] as Fila[], error: null };
  if (previas.error) return { error: previas.error, filas: 0, texto: '' };
  const grupoPorId = new Map(g.data.map((x) => [x.id, x]));
  const ocupados: OcupadoRef[] = previas.data.flatMap((s) => {
    const profesor = s.teacher_id ? nombreDe.get(String(s.teacher_id)) : null;
    if (!profesor) return [];
    const gr = grupoPorId.get(String(s.class_id));
    return [{ fecha: String(s.session_date), inicio: horaDe((s.start_time as string | null) ?? gr?.start_time ?? null), profesor }];
  });
  const hayClase = new Set(previas.data.map((s) => `${s.class_id}|${s.session_date}`));

  const plan = generaCuadrante({ c, grupos: fisicas.map(refDeGrupo), habituales, profesores, ocupados });
  let filas = 0;

  // Las sesiones del cuadrante: solo donde ese grupo no tiene ya una ese día.
  const sesiones: Fila[] = plan.sesiones.flatMap((s) => {
    const grupo = porNombre.get(s.grupo);
    if (!grupo || hayClase.has(`${grupo.id}|${s.fecha}`)) return [];
    return [{
      id: s.id, organization_id: org, class_id: grupo.id, session_date: s.fecha, kind: s.kind, title: s.titulo, position: 0,
      created_by: ctx.adminId, teacher_id: s.profesor ? idDe.get(s.profesor) ?? null : null, start_time: aHora(s.horaPropia),
    }];
  });
  let err = await creaPropias(e, 'fisica', 'training_sessions', sesiones, (f) => ({ id: f.id as string }));
  if (err) return { error: err, filas, texto: '' };
  filas += sesiones.length;

  // Un festivo (un día sin clase, con motivo): solo donde no hay ya sesión ni día quitado.
  const quitadosBD = idsFisicas.length
    ? await db.lee('class_days_off', 'class_id, session_date', [{ columna: 'class_id', en: idsFisicas }, { columna: 'session_date', entre: [desde, hasta] }], ['class_id', 'session_date'])
    : { data: [] as Fila[], error: null };
  if (quitadosBD.error) return { error: quitadosBD.error, filas, texto: '' };
  const yaQuitados = new Set(quitadosBD.data.map((x) => claveTexto({ class_id: String(x.class_id), session_date: String(x.session_date) })));
  const festivos: Fila[] = plan.festivos.flatMap((f) => {
    const grupo = porNombre.get(f.grupo);
    if (!grupo || hayClase.has(`${grupo.id}|${f.fecha}`)) return [];
    return [{ class_id: grupo.id, session_date: f.fecha, organization_id: org, reason: f.motivo, created_by: ctx.adminId }];
  });
  const rf = await creaSiNoExiste(e, 'fisica', 'class_days_off', festivos, ['class_id', 'session_date'], yaQuitados);
  if (rf.error) return { error: rf.error, filas, texto: '' };
  filas += rf.creadas;

  // Las semanas publicadas que falten (la siguiente se queda en borrador).
  const pubs = await db.lee('class_week_publications', 'organization_id, week_start', [{ columna: 'organization_id', igual: org }], ['week_start']);
  if (pubs.error) return { error: pubs.error, filas, texto: '' };
  const yaPublicadas = new Set(pubs.data.map((x) => claveTexto({ organization_id: org, week_start: String(x.week_start) })));
  const publicaciones: Fila[] = plan.semanasPublicadas.map((w) => ({ organization_id: org, week_start: w, published_at: new Date(c.ahoraMs).toISOString(), published_by: ctx.adminId }));
  const rp = await creaSiNoExiste(e, 'fisica', 'class_week_publications', publicaciones, ['organization_id', 'week_start'], yaPublicadas);
  if (rp.error) return { error: rp.error, filas, texto: '' };
  filas += rp.creadas;

  // Dos plantillas de sesión (si no hay ya una con ese título).
  const plantillasBD = await db.lee('session_templates', 'id, title', [{ columna: 'organization_id', igual: org }], ['id']);
  if (plantillasBD.error) return { error: plantillasBD.error, filas, texto: '' };
  const titulos = new Set(plantillasBD.data.map((t) => String(t.title).trim().toLowerCase()));
  const plantillas: Fila[] = PLANTILLAS_DEMO.filter((p) => !titulos.has(p.title.toLowerCase())).map((p) => ({
    id: uuidDemo('plantilla', p.clave), organization_id: org, kind: p.kind, title: p.title, description: p.description,
    duration_min: p.duration_min, distance_km: p.distance_km, created_by: ctx.adminId,
  }));
  err = await creaPropias(e, 'fisica', 'session_templates', plantillas, (f) => ({ id: f.id as string }));
  if (err) return { error: err, filas, texto: '' };
  filas += plantillas.length;

  // Faltas avisadas y multis apuntados.
  const todosGrupos = g.data.map(refDeGrupo);
  const asis = generaAsistencia({ c, alumnos: e.alumnos, grupos: todosGrupos, festivos: plan.festivos, sinPlanificar: plan.sinPlanificar });
  const cuenta = (a: string) => idCuenta(a);
  const faltas: Fila[] = asis.faltas.flatMap((f) => {
    const gr = porNombre.get(f.grupo);
    return gr ? [{ class_id: gr.id, user_id: cuenta(f.alumno), session_date: f.fecha }] : [];
  });
  err = await creaPropias(e, 'fisica', 'class_absences', faltas, (f) => ({ class_id: f.class_id as string, user_id: f.user_id as string, session_date: f.session_date as string }));
  if (err) return { error: err, filas, texto: '' };
  filas += faltas.length;
  const uniones: Fila[] = asis.uniones.flatMap((u) => {
    const gr = porNombre.get(u.grupo);
    return gr ? [{ class_id: gr.id, user_id: cuenta(u.alumno), session_date: u.fecha }] : [];
  });
  err = await creaPropias(e, 'fisica', 'class_session_joins', uniones, (f) => ({ class_id: f.class_id as string, user_id: f.user_id as string, session_date: f.session_date as string }));
  if (err) return { error: err, filas, texto: '' };
  filas += uniones.length;

  // El entreno individual de los alumnos que lo tienen, con su registro.
  const entrenos = e.alumnos.filter((a) => a.entreno).map((a) => ({ a, ...generaEntreno(a, c) }));
  const sesionesAlumno: Fila[] = entrenos.flatMap(({ a, sesiones }) => sesiones.map((s) => ({
    id: s.id, organization_id: org, user_id: cuenta(a.clave), session_date: s.session_date, kind: s.kind, title: s.title,
    description: s.description, duration_min: s.duration_min, distance_km: s.distance_km, video: s.video, position: s.position,
    loads: s.loads, created_by: ctx.adminId,
  })));
  err = await creaPropias(e, 'fisica', 'training_sessions', sesionesAlumno, (f) => ({ id: f.id as string }));
  if (err) return { error: err, filas, texto: '' };
  filas += sesionesAlumno.length;
  const fechaDeSesion = new Map(entrenos.flatMap(({ sesiones }) => sesiones.map((s) => [s.id, s.session_date] as const)));
  const registros: Fila[] = entrenos.flatMap(({ a, registros: rs }) => rs.map((r) => {
    const dia = fechaDeSesion.get(r.sessionId)!;
    return {
      session_id: r.sessionId, user_id: cuenta(a.clave), status: r.status, rpe: r.rpe, comment: r.comment,
      duration_min: r.duration_min, distance_km: r.distance_km, coach_reply: r.coach_reply,
      coach_reply_at: r.respuestaEl ? new Date(Date.parse(`${r.respuestaEl}T19:00:00Z`)).toISOString() : null,
      created_at: new Date(Date.parse(`${dia}T19:30:00Z`)).toISOString(), updated_at: new Date(Date.parse(`${dia}T19:30:00Z`)).toISOString(),
    };
  }));
  err = await creaPropias(e, 'fisica', 'training_session_logs', registros, (f) => ({ session_id: f.session_id as string, user_id: f.user_id as string }));
  if (err) return { error: err, filas, texto: '' };
  filas += registros.length;
  const notas: Fila[] = entrenos.flatMap(({ a, notas: ns }) => ns.map((n) => ({ id: n.id, organization_id: org, user_id: cuenta(a.clave), week_start: n.week_start, note: n.note })));
  err = await creaPropias(e, 'fisica', 'training_week_notes', notas, (f) => ({ id: f.id as string }));
  if (err) return { error: err, filas, texto: '' };
  filas += notas.length;

  const sinPlan = plan.sesiones.length - sesiones.length;
  return {
    error: null, filas,
    texto: `${sesiones.length} clases (${sinPlan > 0 ? `${sinPlan} ya estaban, ` : ''}${rf.creadas} festivo, ${rp.creadas} semanas publicadas), ${faltas.length} faltas, ${uniones.length} multis, ${sesionesAlumno.length} entrenos`,
  };
}

// ---------------- respuestas y marcas ----------------

/** Todas las preguntas activas del banco común, lo mínimo para inventar respuestas. */
async function poolDelBanco(db: DemoDb): Promise<{ pool: PreguntaPool[]; temas: { subjectId: number; titulo: string }[]; error: string | null }> {
  const temas = await db.lee('subjects', 'id, title, topic_number', [{ columna: 'topic_number', entre: [1, 45] }], ['id']);
  if (temas.error) return { pool: [], temas: [], error: temas.error };
  const ordenados = [...temas.data].sort((a, b) => Number(a.topic_number) - Number(b.topic_number));
  const ids = ordenados.map((t) => Number(t.id));
  const banco = await db.lee('question_bank', 'id, subject_id, correct_index', [{ columna: 'status', igual: 'active' }, { columna: 'organization_id', nulo: true }, { columna: 'subject_id', en: ids }], ['id']);
  if (banco.error) return { pool: [], temas: [], error: banco.error };
  return {
    pool: banco.data.map((q) => ({ id: String(q.id), subjectId: Number(q.subject_id), correctIndex: Number(q.correct_index) })),
    temas: ordenados.map((t) => ({ subjectId: Number(t.id), titulo: String(t.title) })),
    error: null,
  };
}

async function faseRespuestas(e: Entorno, tanda: number): Promise<SalidaFase> {
  const { ctx, c } = e;
  const lote = e.alumnos.filter(tieneRespuestas).slice(tanda * POR_TANDA_RESPUESTAS, (tanda + 1) * POR_TANDA_RESPUESTAS);
  const banco = await poolDelBanco(ctx.db);
  if (banco.error) return { error: banco.error, filas: 0, texto: '' };
  if (!banco.pool.length) return { error: 'No hay preguntas en el banco: no se pueden inventar respuestas.', filas: 0, texto: '' };
  const idx = indexaPool(banco.pool, banco.temas);

  let intentos = 0, marcas = 0, rms = 0;
  for (const a of lote) {
    const user = idCuenta(a.clave);
    const filas: Fila[] = [...generaRespuestas(a, c, idx), ...generaSimulacros(a, c, idx)].map((i) => ({ ...i, user_id: user }));
    let err = await creaPropias(e, 'respuestas', 'question_attempts', filas, (f) => ({ id: f.id as string }));
    if (err) return { error: err, filas: intentos, texto: '' };
    intentos += filas.length;

    const filasMarcas: Fila[] = generaMarcas(a, c).map((m) => ({
      id: m.id, organization_id: ctx.org, user_id: user, test: m.test, value: m.value, measured_on: m.measured_on, note: m.note,
      recorded_by: m.apuntadaPor === 'alumno' ? user : ctx.adminId,
    }));
    err = await creaPropias(e, 'respuestas', 'physical_marks', filasMarcas, (f) => ({ id: f.id as string }));
    if (err) return { error: err, filas: intentos, texto: '' };
    marcas += filasMarcas.length;

    const filasRm: Fila[] = generaRm(a, c).map((m) => ({
      id: m.id, organization_id: ctx.org, user_id: user, exercise: m.exercise, weight_kg: m.weight_kg, reps: m.reps,
      measured_on: m.measured_on, note: m.note, recorded_by: ctx.adminId,
    }));
    err = await creaPropias(e, 'respuestas', 'rm_marks', filasRm, (f) => ({ id: f.id as string }));
    if (err) return { error: err, filas: intentos, texto: '' };
    rms += filasRm.length;
  }
  return { error: null, filas: intentos + marcas + rms, texto: `${lote.length} alumnos: ${intentos} respuestas, ${marcas} marcas, ${rms} 1RM` };
}

// ---------------- cobros ----------------

async function tarifaDeLaAcademia(db: DemoDb, org: string): Promise<{ tarifa: Tarifa; error: string | null }> {
  const kinds = await db.lee('group_kinds', 'id, label, price_eur, sort_order', [{ columna: 'organization_id', igual: org }], ['id']);
  const packs = await db.lee('fee_packs', 'id, name, kinds, price_eur', [{ columna: 'organization_id', igual: org }], ['id']);
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
  return {
    error: kinds.error ?? packs.error,
    tarifa: {
      tipos: [...kinds.data].sort((a, b) => Number(a.sort_order) - Number(b.sort_order)).map((k) => ({ id: String(k.id), label: String(k.label), precio: num(k.price_eur) })),
      packs: packs.data.map((p) => ({ id: String(p.id), nombre: String(p.name), tipos: Array.isArray(p.kinds) ? (p.kinds as string[]) : [], precio: num(p.price_eur) ?? 0 })),
    },
  };
}

async function faseCobros(e: Entorno, tanda: number): Promise<SalidaFase> {
  const { ctx, c } = e;
  const { db, org } = ctx;
  const t = await tarifaDeLaAcademia(db, org);
  if (t.error) return { error: t.error, filas: 0, texto: '' };
  const plan = generaCobros({ c, alumnos: e.alumnos, tarifa: t.tarifa });
  const periodos = Array.from({ length: MESES_COBROS }, (_, i) => sumaMeses(c.periodo, i - (MESES_COBROS - 1)));
  const periodo = periodos[tanda];
  let filas = 0;

  if (tanda === 0) {
    // El contador de recibos: se apunta si EXISTÍA antes de la carga, ANTES del
    // primer cobro (que lo crea o lo sube). Al deshacer, esto decide si se borra.
    const contador = await db.lee('receipt_counters', 'organization_id, last_no', [{ columna: 'organization_id', igual: org }], ['organization_id']);
    if (contador.error) return { error: contador.error, filas, texto: '' };
    const antes = contador.data[0];
    const err = await apunta(ctx, e.periodo, 'cobros', 'receipt_counters', [{ organization_id: org }], { existia: !!antes, last_no_antes: antes ? Number(antes.last_no) : 0 });
    if (err) return { error: err, filas, texto: '' };

    // La fila de cada alumno y mes, con la cuota que sale de sus grupos.
    const meses: Fila[] = plan.meses.map((m) => ({
      organization_id: org, user_id: idCuenta(m.alumno), period: m.periodo, paid: false, due_eur: m.debido, due_manual: false,
      updated_at: new Date(c.ahoraMs).toISOString(),
    }));
    const err2 = await creaPropias(e, 'cobros', 'monthly_payments', meses, (f) => ({ organization_id: org, user_id: f.user_id as string, period: f.period as string }));
    if (err2) return { error: err2, filas, texto: '' };
    filas += meses.length;
  }

  // Los cobros de este mes, en orden de fecha (así los recibos siguen a las fechas).
  const eventos = plan.eventos.filter((x) => x.periodo === periodo);
  const usuarios = [...new Set(eventos.map((x) => idCuenta(x.alumno)))];
  const previos = usuarios.length
    ? await db.lee('payment_entries', 'id, user_id, amount_eur, method, paid_on, voided_at', [{ columna: 'organization_id', igual: org }, { columna: 'period', igual: periodo }, { columna: 'user_id', en: usuarios }], ['id'])
    : { data: [] as Fila[], error: null };
  if (previos.error) return { error: previos.error, filas, texto: '' };
  const usados = new Set<string>();
  const entradas = new Map<string, string>();
  const nuevos: string[] = [];

  // Los apuntes que crea `registra_cobro` se apuntan al terminar el mes (o al
  // fallar). Si la carga se cortara antes, igualmente cuelgan de una cuenta de
  // la demo y el borrado los quita.
  const cierra = async (error: string | null): Promise<SalidaFase> => {
    const err = await apunta(ctx, e.periodo, 'cobros', 'payment_entries', nuevos.map((id) => ({ id })));
    return { error: error ?? err, filas: filas + nuevos.length, texto: `${periodo}: ${nuevos.length} cobros${tanda === 0 ? `, ${plan.meses.length} cuotas de alumno y mes` : ''}` };
  };

  for (const ev of eventos) {
    const user = idCuenta(ev.alumno);
    if (ev.tipo === 'cobro') {
      // Si una carga cortada ya hizo este cobro, no se repite (se cobraría dos veces).
      const igual = previos.data.find((p) => !usados.has(String(p.id)) && p.user_id === user && Number(p.amount_eur) === ev.importe && p.method === ev.metodo && String(p.paid_on) === ev.fecha);
      if (igual) { usados.add(String(igual.id)); entradas.set(ev.ref, String(igual.id)); nuevos.push(String(igual.id)); continue; }
      const r = await db.rpc('registra_cobro', { p_org: org, p_user: user, p_alumno: e.alumnos.find((a) => a.clave === ev.alumno)!.email, p_period: ev.periodo, p_amount: ev.importe, p_method: ev.metodo, p_paid_on: ev.fecha, p_by: ctx.adminId });
      if (r.error) return cierra(`No he podido registrar un cobro: ${r.error}`);
      const fila = (Array.isArray(r.data) ? r.data[0] : r.data) as { entry_id?: string } | null;
      if (!fila?.entry_id) return cierra('El cobro no devolvió su recibo.');
      entradas.set(ev.ref, fila.entry_id);
      nuevos.push(fila.entry_id);
    } else {
      const id = entradas.get(ev.ref);
      if (!id) return cierra('Una anulación no encuentra su cobro.');
      const ya = previos.data.find((p) => p.id === id);
      if (ya && ya.voided_at) continue;
      const r = await db.rpc('anula_cobros', { p_org: org, p_user: user, p_period: ev.periodo, p_entry: id, p_by: ctx.adminId });
      if (r.error) return cierra(`No he podido anular un cobro: ${r.error}`);
    }
  }
  return cierra(null);
}

// ============================================================
// EL BORRADO
// ============================================================

export type OrigenPaso = 'usuarios' | 'grupos' | 'sesiones' | 'registro';

/**
 * Un borrado: de qué tabla, por qué columna y de qué lista de ids. NO existe
 * un origen «academia»: cada paso sale de una cuenta, un grupo o una sesión de
 * la demo, o de una fila apuntada en el registro (regla 106).
 */
export type PasoBorrado = {
  tabla: string;
  columna: string;
  origen: OrigenPaso;
  /** Solo `registro`: las columnas de la clave primaria cuando es compuesta. */
  claveCompuesta?: string[];
  /** Tablas con muchas filas: se borran por trozos de usuarios. */
  pesado?: boolean;
};

const porUsuario = (tabla: string): PasoBorrado => ({ tabla, columna: 'user_id', origen: 'usuarios', pesado: tabla === 'question_attempts' });

/**
 * Lo que se borra, en orden de dependencia (de lo que apunta a lo apuntado).
 * Las listas de tablas son las de la limpieza (`limpieza.ts`), que un test
 * cruza con el esquema: una tabla nueva con `user_id` entra aquí sola.
 */
export const PASOS_BORRADO: PasoBorrado[] = [
  // Los cobros: el libro y las cuotas de las cuentas de la demo.
  { tabla: 'payment_entries', columna: 'user_id', origen: 'usuarios' },
  { tabla: 'monthly_payments', columna: 'user_id', origen: 'usuarios' },
  // Lo que cuelga de una sesión de la demo.
  { tabla: 'training_session_logs', columna: 'session_id', origen: 'sesiones' },
  ...TABLAS_POR_USUARIO.filter((t) => t !== 'payment_entries' && t !== 'monthly_payments' && t !== 'memberships' && t !== 'academy_members').map(porUsuario),
  // Las sesiones de la demo: las apuntadas, las de sus grupos y las de sus alumnos.
  { tabla: 'training_sessions', columna: 'id', origen: 'sesiones' },
  // Lo que cuelga de un grupo de la demo.
  ...TABLAS_POR_GRUPO.map((tabla): PasoBorrado => ({ tabla, columna: 'class_id', origen: 'grupos' })),
  // Las filas que la carga añadió a lo que YA existía (apuntadas, una a una).
  { tabla: 'class_days_off', columna: 'class_id', origen: 'registro', claveCompuesta: ['class_id', 'session_date'] },
  { tabla: 'class_week_publications', columna: 'week_start', origen: 'registro', claveCompuesta: ['organization_id', 'week_start'] },
  { tabla: 'staff_subjects', columna: 'subject_id', origen: 'registro', claveCompuesta: ['staff_id', 'subject_id'] },
  { tabla: 'session_templates', columna: 'id', origen: 'registro' },
  { tabla: 'class_groups', columna: 'id', origen: 'grupos' },
  // Las cuentas, por último: primero lo suyo.
  { tabla: 'memberships', columna: 'user_id', origen: 'usuarios' },
  { tabla: 'academy_members', columna: 'user_id', origen: 'usuarios' },
  { tabla: 'profiles', columna: 'id', origen: 'usuarios' },
];

/** La clave primaria de las tablas en las que dos pasos pueden tocar la misma fila: se cuenta una vez. */
export const CLAVES_TABLAS: Record<string, string[]> = {
  class_absences: ['class_id', 'user_id', 'session_date'],
  class_session_joins: ['class_id', 'user_id', 'session_date'],
  training_session_logs: ['session_id', 'user_id'],
  training_sessions: ['id'],
  training_week_notes: ['id'],
  class_members: ['class_id', 'user_id'],
  class_days_off: ['class_id', 'session_date'],
  class_group_staff: ['class_id', 'staff_id'],
};

export type Conjuntos = { usuarios: string[]; grupos: string[]; sesiones: string[]; registro: Map<string, FilaRegistro[]> };

async function conjuntosDeBorrado(db: DemoDb, org: string): Promise<{ c: Conjuntos | null; error: string | null }> {
  const cuentas = await registradas(db, org, CUENTAS);
  const grupos = await registradas(db, org, 'class_groups');
  const sesionesReg = await registradas(db, org, 'training_sessions');
  const dias = await registradas(db, org, 'class_days_off');
  const pubs = await registradas(db, org, 'class_week_publications');
  const temas = await registradas(db, org, 'staff_subjects');
  const plantillas = await registradas(db, org, 'session_templates');
  const error = cuentas.error ?? grupos.error ?? sesionesReg.error ?? dias.error ?? pubs.error ?? temas.error ?? plantillas.error;
  if (error) return { c: null, error };
  const usuarios = idsDe(cuentas.data);
  const gruposIds = idsDe(grupos.data);

  // Las sesiones: las apuntadas, más las que cuelgan de un grupo o de una cuenta de la demo.
  const sesiones = new Set<string>();
  for (const lote of trozos(idsDe(sesionesReg.data), 150)) {
    const r = await db.lee('training_sessions', 'id', [{ columna: 'id', en: lote }], ['id']);
    if (r.error) return { c: null, error: r.error };
    r.data.forEach((s) => sesiones.add(String(s.id)));
  }
  for (const [columna, ids] of [['class_id', gruposIds], ['user_id', usuarios]] as const) {
    for (const lote of trozos(ids, 150)) {
      const r = await db.lee('training_sessions', 'id', [{ columna, en: lote }], ['id']);
      if (r.error) return { c: null, error: r.error };
      r.data.forEach((s) => sesiones.add(String(s.id)));
    }
  }
  return {
    c: {
      usuarios, grupos: gruposIds, sesiones: [...sesiones],
      registro: new Map<string, FilaRegistro[]>([['class_days_off', dias.data], ['class_week_publications', pubs.data], ['staff_subjects', temas.data], ['session_templates', plantillas.data]]),
    },
    error: null,
  };
}

/**
 * De las claves compuestas apuntadas de una tabla, las que SIGUEN existiendo.
 * Una clave apuntada que ya no existe (se borró, o la carga se cortó antes de
 * crearla) no cuenta ni se borra.
 */
async function clavesQueExisten(db: DemoDb, p: PasoBorrado, c: Conjuntos): Promise<{ claves: Clave[]; error: string | null }> {
  const cols = p.claveCompuesta!;
  const apuntadas = (c.registro.get(p.tabla) ?? []).map((f) => f.clave);
  const existen: Clave[] = [];
  for (const lote of trozos([...new Set(apuntadas.map((k) => k[cols[0]]))], 150)) {
    const r = await db.lee(p.tabla, cols.join(', '), [{ columna: cols[0], en: lote }], cols);
    if (r.error) return { claves: existen, error: r.error };
    const hay = new Set(r.data.map((f) => claveTexto(Object.fromEntries(cols.map((k) => [k, f[k] as string | number])))));
    for (const k of apuntadas) if (lote.includes(k[cols[0]]) && hay.has(claveTexto(k))) existen.push(k);
  }
  return { claves: existen, error: null };
}

const idsDelPaso = (p: PasoBorrado, c: Conjuntos): (string | number)[] =>
  p.origen === 'usuarios' ? c.usuarios : p.origen === 'grupos' ? c.grupos : p.origen === 'sesiones' ? c.sesiones : idsDe(c.registro.get(p.tabla) ?? []);

/** Las filas que un paso se llevaría, contadas con el MISMO filtro con el que luego borra. */
async function cuentaPaso(db: DemoDb, p: PasoBorrado, c: Conjuntos): Promise<{ n: number; error: string | null }> {
  if (p.claveCompuesta) {
    const r = await clavesQueExisten(db, p, c);
    return { n: r.claves.length, error: r.error };
  }
  const ids = idsDelPaso(p, c);
  let n = 0;
  for (const lote of trozos(ids, 150)) {
    const r = await db.cuenta(p.tabla, [{ columna: p.columna, en: lote }]);
    if (r.error) return { n, error: r.error };
    n += r.n;
  }
  return { n, error: null };
}

/** Las claves de las filas que se llevaría un paso (solo para las tablas de `CLAVES_TABLAS`). */
async function clavesPaso(db: DemoDb, p: PasoBorrado, c: Conjuntos): Promise<{ claves: Set<string>; error: string | null }> {
  const pk = CLAVES_TABLAS[p.tabla];
  const claves = new Set<string>();
  if (p.claveCompuesta) {
    const r = await clavesQueExisten(db, p, c);
    for (const k of r.claves) claves.add(claveTexto(k));
    return { claves, error: r.error };
  }
  for (const lote of trozos(idsDelPaso(p, c), 150)) {
    const r = await db.lee(p.tabla, pk.join(', '), [{ columna: p.columna, en: lote }], pk);
    if (r.error) return { claves, error: r.error };
    for (const f of r.data) claves.add(claveTexto(Object.fromEntries(pk.map((k) => [k, f[k] as string | number]))));
  }
  return { claves, error: null };
}

type RecibosDemo = { n: number; min: number | null; max: number | null };

/** Los cobros de las cuentas de la demo: cuántos y de qué número a qué número. */
async function recibosDeLaDemo(db: DemoDb, usuarios: string[]): Promise<{ r: RecibosDemo; error: string | null }> {
  const r: RecibosDemo = { n: 0, min: null, max: null };
  for (const lote of trozos(usuarios, 150)) {
    const q = await db.lee('payment_entries', 'id, receipt_no', [{ columna: 'user_id', en: lote }], ['id']);
    if (q.error) return { r, error: q.error };
    for (const f of q.data) {
      const no = Number(f.receipt_no);
      r.n++;
      r.min = r.min === null ? no : Math.min(r.min, no);
      r.max = r.max === null ? no : Math.max(r.max, no);
    }
  }
  return { r, error: null };
}

/** Qué pasaría con el contador de recibos al borrar. */
async function planContador(db: DemoDb, org: string, demo: RecibosDemo): Promise<{ accion: 'borrar' | 'dejar' | 'nada'; aviso: string | null; error: string | null }> {
  const reg = await registradas(db, org, 'receipt_counters');
  if (reg.error) return { accion: 'nada', aviso: null, error: reg.error };
  const datos = reg.data[0]?.datos as { existia?: boolean; last_no_antes?: number } | null | undefined;
  if (!reg.data[0] || !datos) return { accion: 'nada', aviso: null, error: null };
  const contador = await db.lee('receipt_counters', 'last_no', [{ columna: 'organization_id', igual: org }], ['organization_id']);
  if (contador.error) return { accion: 'nada', aviso: null, error: contador.error };
  const ultimo = contador.data[0] ? Number(contador.data[0].last_no) : null;
  if (ultimo === null) return { accion: 'nada', aviso: null, error: null };
  const todos = await db.cuenta('payment_entries', [{ columna: 'organization_id', igual: org }]);
  if (todos.error) return { accion: 'nada', aviso: null, error: todos.error };
  const quedan = todos.n - demo.n;
  const rango = demo.min !== null && demo.max !== null ? ` Los recibos del ${demo.min} al ${demo.max} eran de la demo.` : '';

  if (datos.existia === false) {
    if (quedan <= 0) return { accion: 'borrar', aviso: 'El contador de recibos se borra: el primer recibo de verdad será el nº 1.', error: null };
    return { accion: 'dejar', aviso: `Hay ${quedan} cobro${quedan === 1 ? '' : 's'} que no son de la demo: el contador de recibos NO se toca y habrá un hueco en la numeración.${rango}`, error: null };
  }
  if (ultimo > (datos.last_no_antes ?? 0)) return { accion: 'dejar', aviso: `El contador de recibos ya existía antes de la demo (en el ${datos.last_no_antes ?? 0}) y no se toca: habrá un hueco en la numeración hasta el ${ultimo}.${rango}`, error: null };
  return { accion: 'dejar', aviso: null, error: null };
}

/** Cuántos apuntes del registro de auditoría mencionan a una cuenta de la demo (no se tocan). */
async function mencionesEnAuditoria(db: DemoDb, org: string, usuarios: string[]): Promise<number> {
  let n = 0;
  for (const lote of trozos(usuarios, 150)) {
    const r = await db.cuenta('admin_audit_log', [{ columna: 'organization_id', igual: org }, { columna: 'target', en: lote }]);
    if (!r.error) n += r.n;
  }
  return n;
}

/**
 * El ensayo: qué se iría, tabla a tabla, y cuántas filas son «colgadas» (las
 * creó la aplicación al usarla, no la carga). No toca nada.
 */
export async function ensayoBorrado(db: DemoDb, org: string): Promise<{ ok: true; ensayo: EnsayoDemo } | { ok: false; error: string }> {
  const cj = await conjuntosDeBorrado(db, org);
  if (!cj.c) return fallo(cj.error ?? 'No he podido leer el registro.');
  const c = cj.c;
  const avisos: string[] = [];

  const porTabla = new Map<string, PasoBorrado[]>();
  for (const p of PASOS_BORRADO) porTabla.set(p.tabla, [...(porTabla.get(p.tabla) ?? []), p]);

  const filas: FilaEnsayo[] = [];
  for (const [tabla, pasos] of porTabla) {
    let total = 0;
    if (pasos.length === 1 && !CLAVES_TABLAS[tabla]) {
      const r = await cuentaPaso(db, pasos[0], c);
      if (r.error) return fallo(r.error);
      total = r.n;
    } else if (pasos.every((p) => p.claveCompuesta || CLAVES_TABLAS[tabla])) {
      // Varios pasos pueden tocar la misma fila (una falta de un alumno de la demo en un grupo de la demo): se cuenta una vez.
      const union = new Set<string>();
      for (const p of pasos) {
        const r = await clavesPaso(db, p, c);
        if (r.error) return fallo(r.error);
        r.claves.forEach((k) => union.add(k));
      }
      total = union.size;
    } else {
      return fallo(`Falta la clave primaria de ${tabla} para contar sin duplicar.`);
    }
    if (total === 0) continue;
    const reg = await db.cuenta(REGISTRO, [{ columna: 'organization_id', igual: org }, { columna: 'tabla', igual: tabla }]);
    if (reg.error) return fallo(reg.error);
    // Las apuntadas que ya no existen no cuentan como «colgadas» negativas.
    const apuntadas = Math.min(reg.n, total);
    filas.push({ tabla, total, registradas: apuntadas, colgadas: total - apuntadas });
  }

  const recibos = await recibosDeLaDemo(db, c.usuarios);
  if (recibos.error) return fallo(recibos.error);
  const cont = await planContador(db, org, recibos.r);
  if (cont.error) return fallo(cont.error);
  if (cont.aviso) avisos.push(cont.aviso);
  const audit = await mencionesEnAuditoria(db, org, c.usuarios);
  if (audit > 0) avisos.push(`El registro de auditoría no se toca (${audit} apunte${audit === 1 ? '' : 's'} nombran cuentas de la demo).`);

  const sinCuentas = filas.filter((f) => f.tabla !== 'profiles');
  return {
    ok: true,
    ensayo: {
      filas: filas.sort((a, b) => b.total - a.total),
      total: sinCuentas.reduce((s, f) => s + f.total, 0),
      colgadas: filas.reduce((s, f) => s + f.colgadas, 0),
      cuentas: c.usuarios.length,
      avisos,
    },
  };
}

export type ResultadoBorrado =
  | { ok: true; hecho: boolean; borradas: number; avisos: string[] }
  | { ok: false; error: string };

/**
 * Borra los datos de demostración. Cada paso borra por una lista de ids que
 * sale del registro (cuentas, grupos, sesiones o claves apuntadas) y nunca por
 * academia. Si se acaba el tiempo (`sinTiempo()`), devuelve `hecho: false`: se vuelve
 * a llamar y sigue donde estaba (cada paso, sin nada que borrar, no hace nada).
 */
export async function borraDemo(ctx: Pick<Ctx, 'db' | 'org'>, sinTiempo: () => boolean): Promise<ResultadoBorrado> {
  const { db, org } = ctx;
  const cj = await conjuntosDeBorrado(db, org);
  if (!cj.c) return fallo(cj.error ?? 'No he podido leer el registro.');
  const c = cj.c;
  let borradas = 0;
  const avisos: string[] = [];

  // Antes de borrar los cobros: cuántos recibos eran de la demo, para el contador.
  const recibos = await recibosDeLaDemo(db, c.usuarios);
  if (recibos.error) return fallo(recibos.error);

  // Cada llamada hace al menos UNA unidad de trabajo antes de mirar el reloj:
  // con poco tiempo seguiría avanzando y nunca terminaría.
  for (const p of PASOS_BORRADO) {
    const r = await ejecutaPaso(db, p, c);
    if (r.error) return fallo(`No he podido borrar de ${p.tabla}: ${r.error}`);
    borradas += r.n;
    // Solo cuenta como trabajo un paso que borró algo; uno vacío no gasta la llamada.
    if (r.n > 0 && sinTiempo()) return { ok: true, hecho: false, borradas, avisos };
  }

  // El contador de recibos (después de los cobros, antes de cerrar el registro).
  // Los cobros de la demo ya no existen: lo que quede en el libro es de verdad.
  const cont = await planContador(db, org, { n: 0, min: recibos.r.min, max: recibos.r.max });
  if (cont.error) return fallo(cont.error);
  if (cont.aviso) avisos.push(cont.aviso);
  if (cont.accion === 'borrar') {
    const r = await db.borraClave('receipt_counters', { organization_id: org });
    if (r.error) return fallo(`No he podido borrar el contador de recibos: ${r.error}`);
    borradas++;
  }

  // Las cuentas, cada una DESPUÉS de sus filas (ya borradas arriba).
  for (const grupo of trozos(c.usuarios, CUENTAS_A_LA_VEZ)) {
    const rs = await Promise.all(grupo.map(async (id) => ({ id, ...(await db.borraCuenta(id)) })));
    const mal = rs.find((r) => r.error);
    if (mal) return fallo(`No he podido borrar una cuenta: ${mal.error}`);
    borradas += grupo.length;
    // Su sitio en el registro se quita en cuanto la cuenta ya no existe.
    const { data } = await registradas(db, org, CUENTAS);
    const idsRegistro = data.filter((f) => grupo.includes(String(f.clave.id))).map((f) => f.id);
    for (const lote of trozos(idsRegistro, 150)) await db.borraEn(REGISTRO, 'id', lote);
    if (sinTiempo() && grupo.at(-1) !== c.usuarios.at(-1)) return { ok: true, hecho: false, borradas, avisos };
  }

  // Y el registro entero: al terminar no queda nada.
  while (true) {
    const r = await db.lee(REGISTRO, 'id', [{ columna: 'organization_id', igual: org }], ['id']);
    if (r.error) return fallo(r.error);
    if (!r.data.length) break;
    for (const lote of trozos(r.data.map((f) => Number(f.id)), 500)) {
      const d = await db.borraEn(REGISTRO, 'id', lote);
      if (d.error) return fallo(`No he podido vaciar el registro: ${d.error}`);
    }
    if (sinTiempo()) return { ok: true, hecho: false, borradas, avisos };
  }
  return { ok: true, hecho: true, borradas, avisos };
}

/** Un paso. El ÚNICO sitio que borra datos de las tablas de la demo. */
async function ejecutaPaso(db: DemoDb, p: PasoBorrado, c: Conjuntos): Promise<{ n: number; error: string | null }> {
  if (p.claveCompuesta) {
    const existen = await clavesQueExisten(db, p, c);
    if (existen.error) return { n: 0, error: existen.error };
    let n = 0;
    for (const clave of existen.claves) {
      const r = await db.borraClave(p.tabla, clave);
      if (r.error) return { n, error: r.error };
      n++;
    }
    return { n, error: null };
  }
  const ids = idsDelPaso(p, c);
  const antes = await cuentaPaso(db, p, c);
  if (antes.error) return antes;
  if (antes.n === 0) return { n: 0, error: null };
  // Las tablas pesadas, de pocos en pocos: un solo DELETE de miles de filas no cabe en el tiempo de la base de datos.
  for (const lote of trozos(ids, p.pesado ? 5 : 150)) {
    const r = await db.borraEn(p.tabla, p.columna, lote);
    if (r.error) return { n: 0, error: r.error };
  }
  return { n: antes.n, error: null };
}

'use server';

import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from './core';
import { requireAdmin } from '../lib/auth';
import { registraAccion } from '../lib/admin-audit';
import { paginaCompleta, type ResultadoPagina } from '../lib/pagination';
import { trozos } from '../lib/limpieza';
import { periodoEnZona } from '../lib/cuotas';
import {
  cargaFase, borraDemo, ensayoBorrado, estadoDemo, FASES_DEMO, tandasDe,
  type DemoDb, type EnsayoDemo, type EstadoDemo, type Fila, type FaseDemo, type Filtro,
} from '../lib/demo-motor';

/**
 * DATOS DE DEMOSTRACIÓN (regla 106): el botón de Ajustes.
 *
 * Detrás de `requireAdmin()` y de la academia de la sesión (regla 65). La
 * lógica entera (qué se inventa, qué se apunta, qué se borra) está en
 * `lib/demo.ts` y `lib/demo-motor.ts`, con tests; esto solo:
 *   · comprueba quién llama,
 *   · habla con Supabase por la interfaz `DemoDb`,
 *   · trocea el trabajo en llamadas cortas (Vercel Hobby corta una función a
 *     los 60 s): la pantalla llama a cada fase y a cada tanda, una tras otra.
 *
 * EL ÚNICO SITIO QUE BORRA son `borraEn` y `borraClave`, de aquí abajo: una
 * acota por una lista de ids y la otra por la clave primaria entera de UNA fila.
 * Ninguna borra «por academia». Un test estático (`demo-borrado.test.ts`)
 * vigila que siga así.
 *
 * Sin IA y sin gasto: nada de Gemini. Sin correos: las cuentas se crean ya
 * confirmadas con la API de administración, que no manda nada.
 */

/** El tope de ids por consulta: un `in (...)` con miles no cabe en una URL. */
const POR_CONSULTA = 150;
/** Las funciones de la base de datos que la demo puede llamar. */
const RPC_PERMITIDAS = new Set(['registra_cobro', 'anula_cobros']);
/** Clave de conflicto de las tablas cuyo único índice no es la clave primaria. */
const CONFLICTO: Record<string, string> = { demo_registro: 'organization_id,tabla,clave' };

type Consulta = {
  eq(c: string, v: unknown): Consulta; in(c: string, v: unknown[]): Consulta; is(c: string, v: null): Consulta;
  gte(c: string, v: unknown): Consulta; lte(c: string, v: unknown): Consulta;
};

function aplica<T>(q: T, filtros: Filtro[]): T {
  let r = q as unknown as Consulta;
  for (const f of filtros) {
    if ('en' in f) r = r.in(f.columna, f.en);
    else if ('igual' in f) r = r.eq(f.columna, f.igual);
    else if ('nulo' in f) r = r.is(f.columna, null);
    else r = r.gte(f.columna, f.entre[0]).lte(f.columna, f.entre[1]);
  }
  return r as unknown as T;
}

/** Parte en trozos el primer filtro `en` que no cabe en una URL. */
function lotesDeFiltros(filtros: Filtro[]): Filtro[][] {
  const i = filtros.findIndex((f) => 'en' in f && f.en.length > POR_CONSULTA);
  if (i < 0) return [filtros];
  const grande = filtros[i] as Extract<Filtro, { en: (string | number)[] }>;
  return trozos(grande.en, POR_CONSULTA).map((lote) => filtros.map((f, k) => (k === i ? { columna: grande.columna, en: lote } : f)));
}

const mensaje = (e: { message: string } | null | undefined) => e?.message ?? null;
/** Una cuenta que ya no existe no es un error al borrarla. */
const noExiste = (e: { message: string; status?: number }) => e.status === 404 || /not.?found|no.*user/i.test(e.message);

const dbDemo: DemoDb = {
  async lee(tabla, columnas, filtros, orden) {
    const out: Fila[] = [];
    for (const lote of lotesDeFiltros(filtros)) {
      const r = await paginaCompleta<Fila>(
        (desde, hasta) => {
          let q = aplica(supabaseAdmin.from(tabla).select(columnas), lote);
          for (const o of orden) q = q.order(o, { ascending: true });
          return q.range(desde, hasta) as unknown as Promise<ResultadoPagina<Fila>>;
        },
        { maxFilas: 200_000 },
      );
      if (r.error) return { data: out, error: r.error };
      out.push(...r.data);
    }
    return { data: out, error: null };
  },

  async cuenta(tabla, filtros) {
    let n = 0;
    for (const lote of lotesDeFiltros(filtros)) {
      const { count, error } = await aplica(supabaseAdmin.from(tabla).select('*', { count: 'exact', head: true }), lote);
      if (error) return { n, error: error.message };
      n += count ?? 0;
    }
    return { n, error: null };
  },

  async inserta(tabla, filas, opciones) {
    if (!filas.length) return { error: null, duplicado: false };
    const { error } = opciones?.ignoraDuplicados
      ? await supabaseAdmin.from(tabla).upsert(filas, { ignoreDuplicates: true, ...(CONFLICTO[tabla] ? { onConflict: CONFLICTO[tabla] } : {}) })
      : await supabaseAdmin.from(tabla).insert(filas);
    return { error: mensaje(error), duplicado: error?.code === '23505' };
  },

  // ---- LOS DOS ÚNICOS BORRADOS ----

  async borraEn(tabla, columna, ids) {
    // Sin ids no se borra NADA: un `in ()` vacío no debe convertirse en «todo».
    if (!ids.length) return { error: null };
    const { error } = await supabaseAdmin.from(tabla).delete().in(columna, ids);
    return { error: mensaje(error) };
  },

  async borraClave(tabla, clave) {
    // Una clave vacía borraría la tabla entera.
    if (!Object.keys(clave).length) return { error: 'Una clave vacía no borra nada.' };
    const { error } = await supabaseAdmin.from(tabla).delete().match(clave);
    return { error: mensaje(error) };
  },

  async rpc(nombre, args) {
    if (!RPC_PERMITIDAS.has(nombre)) return { data: null, error: `La demo no puede llamar a ${nombre}.` };
    const { data, error } = await supabaseAdmin.rpc(nombre, args);
    return { data, error: mensaje(error) };
  },

  async existeCuenta(id) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
    if (error) return noExiste(error) ? { existe: false, error: null } : { existe: false, error: error.message };
    return { existe: !!data.user, error: null };
  },

  async creaCuenta({ id, email, password }) {
    // `email_confirm: true`: la cuenta nace confirmada y NO se manda ningún correo.
    const { error } = await supabaseAdmin.auth.admin.createUser({ id, email, password, email_confirm: true, user_metadata: { demo: true } });
    return { error: mensaje(error) };
  },

  async ponClave(id, password) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { password });
    return { error: mensaje(error) };
  },

  async borraCuenta(id) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    return { error: error && !noExiste(error) ? error.message : null };
  },
};

/** 24 caracteres sin signos que confundan, con mayúscula, minúscula y número (cumple cualquier política). */
function claveAleatoria(): string {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(24);
  return `Aa1${Array.from(bytes, (b) => abc[b % abc.length]).join('')}`;
}

/** Lo que el motor necesita de quien llama. La sesión y la academia se resuelven en cada acción (`requireAdmin`). */
const contexto = (adminId: string, org: string) => ({ db: dbDemo, org, adminId, ahoraMs: Date.now(), generaClave: claveAleatoria });

const SIN_ACADEMIA = 'No hay una academia seleccionada.';

export type EstadoDemoVista = { estado: EstadoDemo; mesActual: string; fases: { fase: FaseDemo; tandas: number }[] };

/** Si hay una carga (de qué mes y cuántas filas) y qué mes tocaría cargar. */
export async function getEstadoDemo(): Promise<{ success: true; data: EstadoDemoVista } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: SIN_ACADEMIA };
  const r = await estadoDemo(dbDemo, org);
  if (!r.ok) return { success: false as const, error: r.error };
  return { success: true as const, data: { estado: r.estado, mesActual: periodoEnZona(), fases: FASES_DEMO.map((fase) => ({ fase, tandas: tandasDe(fase) })) } };
}

/** Una tanda de una fase de la carga. La pantalla las llama una tras otra. */
export async function cargaDemoFase(input: unknown): Promise<
  { success: true; fase: FaseDemo; tanda: number; tandas: number; siguiente: number | null; filas: number; texto: string; claveAlumno?: string } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: SIN_ACADEMIA };
  const ctx = contexto(auth.user.id, org);
  const raw = (input ?? {}) as Record<string, unknown>;
  const fase = FASES_DEMO.find((f) => f === raw.fase);
  const tanda = typeof raw.tanda === 'number' ? raw.tanda : NaN;
  if (!fase || !Number.isInteger(tanda)) return { success: false as const, error: 'Esa fase de la carga no existe.' };

  const r = await cargaFase(ctx, fase, tanda);
  if (!r.ok) {
    console.error('cargaDemoFase:', fase, tanda, r.error);
    return { success: false as const, error: r.error };
  }
  if (fase === 'cuentas' && tanda === 0) {
    registraAccion({ actorId: auth.user.id, action: 'cargar_demo', detail: { periodo: periodoEnZona(ctx.ahoraMs) }, organizationId: org });
  }
  return { success: true as const, fase: r.fase, tanda: r.tanda, tandas: r.tandas, siguiente: r.siguiente, filas: r.filas, texto: r.texto, claveAlumno: r.claveAlumno };
}

/** Qué se iría: tabla a tabla, y cuáles son «colgadas». No toca nada. */
export async function ensayoDemo(): Promise<{ success: true; data: EnsayoDemo } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: SIN_ACADEMIA };
  const r = await ensayoBorrado(dbDemo, org);
  if (!r.ok) return { success: false as const, error: r.error };
  return { success: true as const, data: r.ensayo };
}

/** El tiempo que se deja a cada llamada: Vercel corta a los 60 s. */
const PRESUPUESTO_MS = 40_000;

/**
 * Borra los datos de demostración. Hay que escribir BORRAR: se comprueba aquí,
 * no solo en la pantalla (una Server Action es un endpoint público). Si se
 * acaba el tiempo devuelve `hecho: false` y la pantalla vuelve a llamar.
 */
export async function borraDemoPaso(input: unknown): Promise<{ success: true; hecho: boolean; borradas: number; avisos: string[] } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: SIN_ACADEMIA };
  const raw = (input ?? {}) as Record<string, unknown>;
  if (raw.confirmacion !== 'BORRAR') return { success: false as const, error: 'Escribe BORRAR para confirmar.' };

  const limite = Date.now() + PRESUPUESTO_MS;
  const r = await borraDemo({ db: dbDemo, org }, () => Date.now() > limite);
  if (!r.ok) {
    console.error('borraDemoPaso:', r.error);
    return { success: false as const, error: r.error };
  }
  if (r.hecho) registraAccion({ actorId: auth.user.id, action: 'borrar_demo', detail: { avisos: r.avisos.length }, organizationId: org });
  return { success: true as const, hecho: r.hecho, borradas: r.borradas, avisos: r.avisos };
}

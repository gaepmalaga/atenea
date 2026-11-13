'use server'
import { randomInt } from 'node:crypto';
import { supabaseAdmin } from './core';
import { requireAdmin, requireUser } from '../lib/auth';
import { requireModule } from '../lib/module-guard';
import { fallo } from '../lib/fallos';
import { ahoraEnZona } from '../lib/asistencia';
import { estadoEntrega, esParticipante, type EstadoEntrega } from '../lib/examen-clase';
import { nombreVisible } from '../lib/perfil-alumno';
import { participantesDe, misGrupos } from '../lib/participantes-clase';
import { validaExamenPsico, validaAplicacion, resumenDeClase, type FilaResultado } from '../lib/psico-clase';
import {
  VERSION_PSICO, aPublica, corrigeSesion, generaSesion, normalizaRespuesta, tiposValidos, notaDeSesionGuardada, esVersionPsico,
  type PreguntaPsico, type ResultadoPsico, type TipoPsico,
} from '../lib/psico';
import type { SesionPsico, RevisionPsico } from './psico';

/**
 * PSICOTÉCNICOS EN CLASE (regla 127): el mismo examen para un turno.
 *
 * Las dos tablas (`psico_clase`, `psico_clase_resultados`) tienen RLS y ninguna
 * política: solo las toca la clave de servicio, y cada consulta lleva
 * `organization_id` y el usuario de la sesión (reglas 1, 34 y 65). El examen no
 * guarda preguntas, guarda la semilla: se regenera idéntico, y el alumno nunca
 * recibe la respuesta hasta que entrega (regla 110).
 */

const SIN_ACADEMIA = 'No hay una academia seleccionada.';
const FALTA_GUION = 'Los psicotécnicos en clase todavía no están activados. Avisa al administrador de la plataforma.';
const UUID = /^[0-9a-f-]{36}$/i;
const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const hoyAcademia = () => ahoraEnZona(Date.now()).fecha;

/** Una aplicación (el examen puesto a un turno) con los datos del examen: lo que hace falta para regenerarlo. */
type FilaClase = {
  id: string; examen_id: string; label: string; class_ids: string[] | null; sat_on: string; closes_on: string | null;
  seed: number; version: number; kinds: string[]; total: number; minutes: number; title: string;
};
const COLS_APLICACION = 'id, examen_id, label, class_ids, sat_on, closes_on';
const COLS_EXAMEN = 'id, title, seed, version, kinds, total, minutes';
type FilaExamen = { id: string; title: string; seed: number; version: number; kinds: string[]; total: number; minutes: number };

/** Une cada aplicación con su examen (dos consultas acotadas por la academia, sin depender de un embed). */
async function conExamen(org: string, aplicaciones: { id: string; examen_id: string; label: string; class_ids: string[] | null; sat_on: string; closes_on: string | null }[]): Promise<{ data: FilaClase[]; error: string | null }> {
  if (!aplicaciones.length) return { data: [], error: null };
  const { data, error } = await supabaseAdmin.from('psico_examenes').select(COLS_EXAMEN).eq('organization_id', org).in('id', [...new Set(aplicaciones.map((a) => a.examen_id))]);
  if (error) return { data: [], error: fallo('psico-clase', error) };
  const porId = new Map(((data ?? []) as FilaExamen[]).map((e) => [e.id, e]));
  const out: FilaClase[] = [];
  for (const a of aplicaciones) {
    const e = porId.get(a.examen_id);
    if (e) out.push({ ...a, seed: e.seed, version: e.version, kinds: e.kinds, total: e.total, minutes: e.minutes, title: e.title });
  }
  return { data: out, error: null };
}

/** Las preguntas de un examen de clase, regeneradas con su semilla y la versión que tenía. */
function preguntasDe(f: Pick<FilaClase, 'seed' | 'kinds' | 'total' | 'version'>): PreguntaPsico[] | null {
  if (!esVersionPsico(f.version)) return null;
  return generaSesion(Number(f.seed), tiposValidos(f.kinds) as TipoPsico[], f.total, f.version);
}

// ===========================================================================
// LA ACADEMIA
// ===========================================================================

// ── El examen guardado (PREPARAR y GUARDAR) ──

export type PsicoGuardado = {
  id: string; titulo: string; total: number; minutos: number; tipos: TipoPsico[]; creado: string;
  /** A qué grupos y qué día se ha puesto ya: para avisar antes de repetir. */
  puestos: { fecha: string; classIds: string[] }[];
};

export async function getPsicoGuardados(): Promise<{ success: true; examenes: PsicoGuardado[] } | { success: false; error: string; faltaGuion?: boolean }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: SIN_ACADEMIA };

  const { data, error } = await supabaseAdmin.from('psico_examenes').select(`${COLS_EXAMEN}, created_at`).eq('organization_id', org).order('created_at', { ascending: false }).limit(200);
  if (error) { fallo('getPsicoGuardados', error); return { success: false as const, error: FALTA_GUION, faltaGuion: true }; }
  const examenes = (data ?? []) as (FilaExamen & { created_at: string })[];
  if (!examenes.length) return { success: true as const, examenes: [] };
  const { data: aps, error: e2 } = await supabaseAdmin.from('psico_clase').select('examen_id, sat_on, class_ids').eq('organization_id', org).in('examen_id', examenes.map((e) => e.id)).limit(2000);
  if (e2) return { success: false as const, error: fallo('getPsicoGuardados', e2) };
  return {
    success: true as const,
    examenes: examenes.map((e) => ({
      id: e.id, titulo: e.title, total: e.total, minutos: e.minutes, tipos: tiposValidos(e.kinds), creado: e.created_at,
      puestos: (aps ?? []).filter((a) => a.examen_id === e.id).map((a) => ({ fecha: a.sat_on as string, classIds: (a.class_ids as string[]) ?? [] })),
    })),
  };
}

/** Guarda un examen: la semilla la elige el servidor y es la misma para todo el que lo haga. */
export async function guardaPsicoExamen(input: unknown): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: SIN_ACADEMIA };
  const d = (input ?? {}) as Record<string, unknown>;
  const v = validaExamenPsico({ titulo: d.titulo, ejercicio: d.ejercicio, tipos: d.tipos, total: d.total, minutos: d.minutos, hoy: hoyAcademia() });
  if (!v.ok) return { success: false as const, error: v.error };

  const { data, error } = await supabaseAdmin.from('psico_examenes').insert({
    organization_id: org, title: v.valor.titulo, seed: randomInt(1, 2 ** 31 - 1), version: VERSION_PSICO, kinds: v.valor.tipos,
    total: v.valor.total, minutes: v.valor.minutos, created_by: auth.user.id,
  }).select('id').single();
  if (error || !data) { fallo('guardaPsicoExamen', error ?? { message: 'sin fila' }); return { success: false as const, error: FALTA_GUION }; }
  return { success: true as const, id: data.id as string };
}

export async function borraPsicoExamen(id: unknown): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false, error: SIN_ACADEMIA };
  if (!esUuid(id)) return { success: false, error: 'Datos no válidos.' };
  const { error } = await supabaseAdmin.from('psico_examenes').delete().eq('organization_id', org).eq('id', id);
  if (error) return { success: false, error: fallo('borraPsicoExamen', error) };
  return { success: true };
}

/** El examen guardado para IMPRIMIRLO: preguntas con respuesta y explicación (solo el admin las ve). */
export async function getHojaPsicoExamen(id: unknown): Promise<
  { success: true; titulo: string; minutos: number; preguntas: PreguntaPsico[] } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: SIN_ACADEMIA };
  if (!esUuid(id)) return { success: false as const, error: 'Datos no válidos.' };
  const { data: e, error } = await supabaseAdmin.from('psico_examenes').select(COLS_EXAMEN).eq('organization_id', org).eq('id', id).maybeSingle();
  if (error) return { success: false as const, error: fallo('getHojaPsicoExamen', error) };
  if (!e) return { success: false as const, error: 'Ese examen no existe.' };
  const f = e as FilaExamen;
  const preguntas = preguntasDe(f);
  if (!preguntas) return { success: false as const, error: 'Este examen es de una versión anterior y ya no se puede imprimir.' };
  return { success: true as const, titulo: f.title, minutos: f.minutes, preguntas };
}

// ── Ponerlo a un turno ──

/** Pone un examen guardado a un turno: los grupos tienen que ser de ESTA academia (regla 65). */
export async function aplicaPsicoExamen(input: unknown): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: SIN_ACADEMIA };
  const d = (input ?? {}) as Record<string, unknown>;
  if (!esUuid(d.examenId)) return { success: false as const, error: 'Datos no válidos.' };
  const v = validaAplicacion({ etiqueta: d.etiqueta, fecha: d.fecha, cierre: d.cierre, classIds: d.grupos });
  if (!v.ok) return { success: false as const, error: v.error };
  const a = v.valor;

  const { data: e, error: e1 } = await supabaseAdmin.from('psico_examenes').select('id, title').eq('organization_id', org).eq('id', d.examenId).maybeSingle();
  if (e1) return { success: false as const, error: fallo('aplicaPsicoExamen', e1) };
  if (!e) return { success: false as const, error: 'Ese examen no existe.' };
  if (a.classIds.length) {
    const { data, error } = await supabaseAdmin.from('class_groups').select('id').eq('organization_id', org).in('id', a.classIds);
    if (error) return { success: false as const, error: fallo('aplicaPsicoExamen', error) };
    if ((data ?? []).length !== a.classIds.length) return { success: false as const, error: 'Alguno de los grupos no es de tu academia.' };
  }
  const { data, error } = await supabaseAdmin.from('psico_clase').insert({
    organization_id: org, examen_id: e.id, label: a.etiqueta ?? (e.title as string), class_ids: a.classIds, sat_on: a.fecha, closes_on: a.cierre, created_by: auth.user.id,
  }).select('id').single();
  if (error || !data) { fallo('aplicaPsicoExamen', error ?? { message: 'sin fila' }); return { success: false as const, error: FALTA_GUION }; }
  return { success: true as const, id: data.id as string };
}

// ── En clase ──

export type PsicoClaseResumen = {
  id: string; titulo: string; fecha: string; cierre: string | null; total: number; minutos: number;
  tipos: TipoPsico[]; grupos: string[]; participantes: number; entregados: number; notaMedia: number | null;
};

export async function getPsicoClases(): Promise<{ success: true; examenes: PsicoClaseResumen[] } | { success: false; error: string; faltaGuion?: boolean }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: SIN_ACADEMIA };

  const { data: filas, error } = await supabaseAdmin
    .from('psico_clase').select(COLS_APLICACION).eq('organization_id', org).order('sat_on', { ascending: false }).order('created_at', { ascending: false }).limit(200);
  if (error) { fallo('getPsicoClases', error); return { success: false as const, error: FALTA_GUION, faltaGuion: true }; }
  const unidos = await conExamen(org, (filas ?? []) as Parameters<typeof conExamen>[1]);
  if (unidos.error) return { success: false as const, error: unidos.error };
  const examenes = unidos.data;
  if (!examenes.length) return { success: true as const, examenes: [] };

  const [grupos, resultados] = await Promise.all([
    supabaseAdmin.from('class_groups').select('id, name').eq('organization_id', org),
    supabaseAdmin.from('psico_clase_resultados')
      .select('psico_clase_id, user_id, finished_at, correct, wrong, blank, by_kind')
      .eq('organization_id', org).in('psico_clase_id', examenes.map((e) => e.id)).limit(5000),
  ]);
  const base = grupos.error ?? resultados.error;
  if (base) return { success: false as const, error: fallo('getPsicoClases', base) };
  const nombreGrupo = new Map((grupos.data ?? []).map((g) => [g.id as string, g.name as string]));

  const out: PsicoClaseResumen[] = [];
  for (const e of examenes) {
    const gente = await participantesDe(org, e.class_ids ?? []);
    if (gente.error) return { success: false as const, error: gente.error };
    const suyos = (resultados.data ?? []).filter((r) => r.psico_clase_id === e.id);
    const filasRes: FilaResultado[] = suyos.map((r) => ({
      userId: r.user_id as string, entregado: !!r.finished_at, version: e.version, total: e.total,
      aciertos: (r.correct as number) ?? 0, fallos: (r.wrong as number) ?? 0, blancos: (r.blank as number) ?? 0,
      porTipo: (r.by_kind as ResultadoPsico['porTipo']) ?? {},
    }));
    const resumen = resumenDeClase(filasRes, gente.data.length);
    out.push({
      id: e.id, titulo: e.label, fecha: e.sat_on, cierre: e.closes_on, total: e.total, minutos: e.minutes,
      tipos: tiposValidos(e.kinds), grupos: (e.class_ids ?? []).map((c) => nombreGrupo.get(c) ?? '(grupo borrado)'),
      participantes: resumen.participantes, entregados: resumen.entregados, notaMedia: resumen.notaMedia,
    });
  }
  return { success: true as const, examenes: out };
}

export type ParticipantePsico = {
  id: string; nombre: string; email: string | null; estado: EstadoEntrega; via: 'app' | 'hoja' | null;
  nota: number | null; aciertos: number | null; fallos: number | null; blancos: number | null;
};
export type DetallePsicoClase = {
  examen: Omit<PsicoClaseResumen, 'participantes' | 'entregados' | 'notaMedia'> & { examenId: string };
  participantes: ParticipantePsico[];
  resumen: ReturnType<typeof resumenDeClase>;
};

export async function getDetallePsicoClase(id: unknown): Promise<{ success: true; detalle: DetallePsicoClase } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: SIN_ACADEMIA };
  if (!esUuid(id)) return { success: false as const, error: 'Datos no válidos.' };

  const { data: a, error } = await supabaseAdmin.from('psico_clase').select(COLS_APLICACION).eq('organization_id', org).eq('id', id).maybeSingle();
  if (error) return { success: false as const, error: fallo('getDetallePsicoClase', error) };
  if (!a) return { success: false as const, error: 'Ese examen no existe.' };
  const unidos = await conExamen(org, [a as Parameters<typeof conExamen>[1][number]]);
  if (unidos.error) return { success: false as const, error: unidos.error };
  const f = unidos.data[0];
  if (!f) return { success: false as const, error: 'El examen de este turno ya no existe.' };

  const [grupos, resultados, gente] = await Promise.all([
    supabaseAdmin.from('class_groups').select('id, name').eq('organization_id', org),
    supabaseAdmin.from('psico_clase_resultados').select('user_id, finished_at, correct, wrong, blank, by_kind, via').eq('organization_id', org).eq('psico_clase_id', id).limit(5000),
    participantesDe(org, f.class_ids ?? []),
  ]);
  const base = grupos.error ?? resultados.error;
  if (base) return { success: false as const, error: fallo('getDetallePsicoClase', base) };
  if (gente.error) return { success: false as const, error: gente.error };

  const hoy = hoyAcademia();
  const nombreGrupo = new Map((grupos.data ?? []).map((g) => [g.id as string, g.name as string]));
  const porAlumno = new Map((resultados.data ?? []).map((r) => [r.user_id as string, r]));
  const participantes: ParticipantePsico[] = gente.data.map((al) => {
    const r = porAlumno.get(al.id);
    const entregado = !!r?.finished_at;
    const porTipo = (r?.by_kind as ResultadoPsico['porTipo']) ?? {};
    return {
      id: al.id, nombre: nombreVisible(al.nombre, al.email) || 'Alumno', email: al.email,
      estado: estadoEntrega({ satOn: f.sat_on, closesOn: f.closes_on, hoy, absent: false, entregado }),
      via: entregado ? ((r?.via as 'app' | 'hoja') ?? 'app') : null,
      nota: entregado ? notaDeSesionGuardada({ version: f.version, total: f.total, aciertos: (r?.correct as number) ?? 0, fallos: (r?.wrong as number) ?? 0, porTipo }) : null,
      aciertos: entregado ? ((r?.correct as number) ?? 0) : null, fallos: entregado ? ((r?.wrong as number) ?? 0) : null, blancos: entregado ? ((r?.blank as number) ?? 0) : null,
    };
  });
  participantes.sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));

  const filasRes: FilaResultado[] = (resultados.data ?? []).filter((r) => gente.data.some((g) => g.id === r.user_id)).map((r) => ({
    userId: r.user_id as string, entregado: !!r.finished_at, version: f.version, total: f.total,
    aciertos: (r.correct as number) ?? 0, fallos: (r.wrong as number) ?? 0, blancos: (r.blank as number) ?? 0, porTipo: (r.by_kind as ResultadoPsico['porTipo']) ?? {},
  }));
  return {
    success: true as const,
    detalle: {
      examen: {
        id: f.id, examenId: f.examen_id, titulo: f.label, fecha: f.sat_on, cierre: f.closes_on, total: f.total, minutos: f.minutes,
        tipos: tiposValidos(f.kinds), grupos: (f.class_ids ?? []).map((c) => nombreGrupo.get(c) ?? '(grupo borrado)'),
      },
      participantes,
      resumen: resumenDeClase(filasRes, gente.data.length),
    },
  };
}

/** Borra la aplicación (y sus notas); el examen guardado se queda para ponerlo a otro turno. */
export async function borraPsicoClase(id: unknown): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false, error: SIN_ACADEMIA };
  if (!esUuid(id)) return { success: false, error: 'Datos no válidos.' };
  const { error } = await supabaseAdmin.from('psico_clase').delete().eq('organization_id', org).eq('id', id);
  if (error) return { success: false, error: fallo('borraPsicoClase', error) };
  return { success: true };
}

// ===========================================================================
// EL ALUMNO
// ===========================================================================

export type MiPsicoClase = {
  id: string; titulo: string; fecha: string; cierre: string | null; total: number; minutos: number; tipos: TipoPsico[];
  estado: EstadoEntrega; empezado: boolean;
  nota: number | null; aciertos: number | null; fallos: number | null; blancos: number | null;
  /** Cuántas opciones tiene cada pregunta, para pasar la hoja en papel sin ver las preguntas. */
  opciones: number[];
};

async function acotado(org: string | null, userId: string, id: unknown): Promise<{ ok: true; org: string; fila: FilaClase } | { ok: false; error: string }> {
  if (!org) return { ok: false, error: 'No hemos encontrado tu academia.' };
  if (!esUuid(id)) return { ok: false, error: 'Datos no válidos.' };
  const { data: a, error } = await supabaseAdmin.from('psico_clase').select(COLS_APLICACION).eq('organization_id', org).eq('id', id).maybeSingle();
  if (error) return { ok: false, error: fallo('psico-clase', error) };
  if (!a) return { ok: false, error: 'Ese examen no existe.' };
  const grupos = await misGrupos(org, userId);
  if (grupos.error) return { ok: false, error: grupos.error };
  if (!esParticipante((a.class_ids as string[]) ?? [], grupos.data)) return { ok: false, error: 'Ese examen no es de tu turno.' };
  const unidos = await conExamen(org, [a as Parameters<typeof conExamen>[1][number]]);
  if (unidos.error) return { ok: false, error: unidos.error };
  if (!unidos.data[0]) return { ok: false, error: 'El examen de este turno ya no existe.' };
  return { ok: true, org, fila: unidos.data[0] };
}

export async function getMisPsicoClase(): Promise<{ success: true; examenes: MiPsicoClase[] } | { success: false; error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const modulo = await requireModule('psico', auth.user.organizationId);
  if (!modulo.ok) return { success: false as const, error: modulo.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: 'No hemos encontrado tu academia.' };

  const { data, error } = await supabaseAdmin.from('psico_clase').select(COLS_APLICACION).eq('organization_id', org).order('sat_on', { ascending: false }).limit(100);
  if (error) {
    // Sin las tablas todavía, el módulo se abre igual: simplemente no hay exámenes de clase.
    fallo('getMisPsicoClase', error);
    return { success: true as const, examenes: [] };
  }
  const grupos = await misGrupos(org, auth.user.id);
  if (grupos.error) return { success: false as const, error: grupos.error };
  const suyas = ((data ?? []) as Parameters<typeof conExamen>[1]).filter((e) => esParticipante(e.class_ids ?? [], grupos.data));
  const unidos = await conExamen(org, suyas);
  if (unidos.error) return { success: false as const, error: unidos.error };
  const mios = unidos.data;
  if (!mios.length) return { success: true as const, examenes: [] };

  const { data: res, error: eR } = await supabaseAdmin.from('psico_clase_resultados')
    .select('psico_clase_id, finished_at, correct, wrong, blank, by_kind').eq('organization_id', org).eq('user_id', auth.user.id).in('psico_clase_id', mios.map((e) => e.id));
  if (eR) return { success: false as const, error: fallo('getMisPsicoClase', eR) };
  const mio = new Map((res ?? []).map((r) => [r.psico_clase_id as string, r]));
  const hoy = hoyAcademia();

  return {
    success: true as const,
    examenes: mios.map((e) => {
      const r = mio.get(e.id);
      const entregado = !!r?.finished_at;
      const preguntas = preguntasDe(e);
      return {
        id: e.id, titulo: e.label, fecha: e.sat_on, cierre: e.closes_on, total: e.total, minutos: e.minutes, tipos: tiposValidos(e.kinds),
        estado: estadoEntrega({ satOn: e.sat_on, closesOn: e.closes_on, hoy, absent: false, entregado }),
        empezado: !!r && !entregado,
        nota: entregado ? notaDeSesionGuardada({ version: e.version, total: e.total, aciertos: (r!.correct as number) ?? 0, fallos: (r!.wrong as number) ?? 0, porTipo: (r!.by_kind as ResultadoPsico['porTipo']) ?? {} }) : null,
        aciertos: entregado ? ((r!.correct as number) ?? 0) : null, fallos: entregado ? ((r!.wrong as number) ?? 0) : null, blancos: entregado ? ((r!.blank as number) ?? 0) : null,
        opciones: (preguntas ?? []).map((q) => q.opciones.length),
      };
    }),
  };
}

/**
 * Empezar el examen en la pantalla. El reloj es el del servidor: la fila se crea
 * ahora y, si se vuelve a abrir, el tiempo que queda sale de ahí (regla 14). Solo
 * el día del examen o después, y dentro del plazo; una sola vez.
 */
export async function empiezaPsicoClase(id: unknown): Promise<{ success: true; sesion: SesionPsico } | { success: false; error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const modulo = await requireModule('psico', auth.user.organizationId);
  if (!modulo.ok) return { success: false as const, error: modulo.error };
  const c = await acotado(auth.user.organizationId, auth.user.id, id);
  if (!c.ok) return { success: false as const, error: c.error };

  const hoy = hoyAcademia();
  if (hoy < c.fila.sat_on) return { success: false as const, error: 'Este examen todavía no se puede hacer: es el día indicado.' };
  if (c.fila.closes_on && hoy > c.fila.closes_on) return { success: false as const, error: 'El plazo para hacer este examen ha terminado.' };
  const preguntas = preguntasDe(c.fila);
  if (!preguntas) return { success: false as const, error: 'Este examen es de una versión anterior y ya no se puede hacer.' };

  const { data: previo, error: eP } = await supabaseAdmin.from('psico_clase_resultados').select('id, started_at, finished_at')
    .eq('organization_id', c.org).eq('psico_clase_id', c.fila.id).eq('user_id', auth.user.id).maybeSingle();
  if (eP) return { success: false as const, error: fallo('empiezaPsicoClase', eP) };
  if (previo?.finished_at) return { success: false as const, error: 'Ya has entregado este examen.' };

  let empezado = previo ? new Date(previo.started_at as string).getTime() : Date.now();
  if (!previo) {
    const { error } = await supabaseAdmin.from('psico_clase_resultados').insert({
      organization_id: c.org, psico_clase_id: c.fila.id, user_id: auth.user.id, via: 'app',
    });
    if (error) return { success: false as const, error: fallo('empiezaPsicoClase', error) };
    empezado = Date.now();
  }
  const quedaMs = Math.max(0, c.fila.minutes * 60_000 - (Date.now() - empezado));
  if (quedaMs <= 0) return { success: false as const, error: 'Se te ha acabado el tiempo de este examen. Pídele a tu profesor que lo revise.' };
  return { success: true as const, sesion: { id: c.fila.id, minutos: Math.max(1, Math.ceil(quedaMs / 60_000)), preguntas: preguntas.map(aPublica) } };
}

/**
 * Entregar: con las respuestas de la pantalla (`via: 'app'`) o las que pasa el
 * alumno desde la hoja en papel (`via: 'hoja'`, sin reloj pero dentro del plazo).
 * El servidor regenera el examen y corrige (regla 110); se entrega una sola vez.
 */
export async function entregaPsicoClase(input: unknown): Promise<
  { success: true; resultado: ResultadoPsico; revision: RevisionPsico; duracionMs: number } | { success: false; error: string }
> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const modulo = await requireModule('psico', auth.user.organizationId);
  if (!modulo.ok) return { success: false as const, error: modulo.error };
  const d = (input ?? {}) as { id?: unknown; respuestas?: unknown; via?: unknown };
  const c = await acotado(auth.user.organizationId, auth.user.id, d.id);
  if (!c.ok) return { success: false as const, error: c.error };
  const via = d.via === 'hoja' ? 'hoja' : 'app';

  const hoy = hoyAcademia();
  if (hoy < c.fila.sat_on) return { success: false as const, error: 'Este examen todavía no se puede entregar: es el día indicado.' };
  if (c.fila.closes_on && hoy > c.fila.closes_on) return { success: false as const, error: 'El plazo para entregar este examen ha terminado.' };
  const preguntas = preguntasDe(c.fila);
  if (!preguntas) return { success: false as const, error: 'Este examen es de una versión anterior y ya no se puede corregir.' };

  const { data: previo, error: eP } = await supabaseAdmin.from('psico_clase_resultados').select('id, started_at, finished_at')
    .eq('organization_id', c.org).eq('psico_clase_id', c.fila.id).eq('user_id', auth.user.id).maybeSingle();
  if (eP) return { success: false as const, error: fallo('entregaPsicoClase', eP) };
  if (previo?.finished_at) return { success: false as const, error: 'Ya has entregado este examen.' };
  if (via === 'app' && !previo) return { success: false as const, error: 'Empieza el examen antes de entregarlo.' };

  const respuestas = preguntas.map((q, i) => normalizaRespuesta(Array.isArray(d.respuestas) ? d.respuestas[i] : -1, q.opciones.length));
  const resultado = corrigeSesion(preguntas, respuestas);
  const tope = c.fila.minutes * 60_000;
  const duracionMs = via === 'app' && previo ? Math.max(0, Math.min(tope, Date.now() - new Date(previo.started_at as string).getTime())) : 0;
  const cambios = {
    finished_at: new Date().toISOString(), correct: resultado.aciertos, wrong: resultado.fallos, blank: resultado.blancos,
    score: resultado.nota, duration_ms: duracionMs, by_kind: resultado.porTipo, answers: respuestas, via,
  };

  // Una sola vez: `finished_at is null` va en la propia escritura (un doble toque no la reescribe).
  if (previo) {
    const { data, error } = await supabaseAdmin.from('psico_clase_resultados').update(cambios)
      .eq('organization_id', c.org).eq('id', previo.id as string).is('finished_at', null).select('id');
    if (error) return { success: false as const, error: fallo('entregaPsicoClase', error) };
    if (!data?.length) return { success: false as const, error: 'Ya has entregado este examen.' };
  } else {
    const { error } = await supabaseAdmin.from('psico_clase_resultados').insert({ organization_id: c.org, psico_clase_id: c.fila.id, user_id: auth.user.id, ...cambios });
    if (error) return { success: false as const, error: fallo('entregaPsicoClase', error) };
  }
  return { success: true as const, resultado, revision: preguntas.map((q, i) => ({ ...q, marcada: respuestas[i] })), duracionMs };
}

/** El repaso de un examen de clase ya entregado: las mismas preguntas, lo que marcó y por qué. */
export async function getRevisionPsicoClase(id: unknown): Promise<
  { success: true; revision: RevisionPsico; resultado: ResultadoPsico; duracionMs: number; titulo: string } | { success: false; error: string }
> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const modulo = await requireModule('psico', auth.user.organizationId);
  if (!modulo.ok) return { success: false as const, error: modulo.error };
  const c = await acotado(auth.user.organizationId, auth.user.id, id);
  if (!c.ok) return { success: false as const, error: c.error };
  const preguntas = preguntasDe(c.fila);
  if (!preguntas) return { success: false as const, error: 'Este examen es de una versión anterior y ya no se puede repasar.' };

  const { data: r, error } = await supabaseAdmin.from('psico_clase_resultados').select('finished_at, answers, duration_ms')
    .eq('organization_id', c.org).eq('psico_clase_id', c.fila.id).eq('user_id', auth.user.id).maybeSingle();
  if (error) return { success: false as const, error: fallo('getRevisionPsicoClase', error) };
  // La solución no se enseña hasta entregar.
  if (!r?.finished_at) return { success: false as const, error: 'La solución se ve cuando entregas el examen.' };
  const guardadas = Array.isArray(r.answers) ? r.answers : [];
  const respuestas = preguntas.map((q, i) => normalizaRespuesta(guardadas[i], q.opciones.length));
  return {
    success: true as const, titulo: c.fila.label,
    revision: preguntas.map((q, i) => ({ ...q, marcada: respuestas[i] })),
    resultado: corrigeSesion(preguntas, respuestas), duracionMs: (r.duration_ms as number) ?? 0,
  };
}

'use server';

/**
 * LA FÍSICA COMO LA LLEVA UN PREPARADOR (regla 86).
 *
 * Sesiones sueltas en el calendario, de un grupo o de un alumno; lo que cada
 * alumno apunta de cada una; la biblioteca de plantillas; la nota de cada
 * semana; y el histórico de marcas en las pruebas oficiales.
 *
 * Todas las tablas tienen RLS y CERO políticas (`docs/sql/fisica-sesiones.sql`),
 * como `class_absences` (regla 82): solo la clave de servicio. Lo del alumno
 * filtra SIEMPRE por su id y comprueba que la sesión es suya o de un grupo
 * suyo; lo del preparador va detrás de `requireAdmin` y acotado a su academia,
 * también dentro de cada consulta.
 *
 * La lógica (validar lo que se escribe, el baremo, copiar una semana…) vive en
 * `app/lib/sesiones.ts` y `app/lib/baremo-fisico.ts`, pura y con tests.
 */

import { supabaseAdmin } from './core';
import { requireUser, requireAdmin } from '../lib/auth';
import { requireModule } from '../lib/module-guard';
import { leeTrainingSwitches } from '../lib/training-switch-guard';
import { createSupabaseServerClient } from '../lib/supabase/server';
import { ahoraEnZona, esFecha, sumaDias } from '../lib/asistencia';
import {
  normalizaContenido, normalizaApunte, sePuedeApuntar, esDestino, lunesDe, copiaSemana,
  MAX_COMENTARIO, MAX_NOTA_SEMANA,
  type Destino, type Sesion, type Plantilla, type Apunte, type TipoSesion,
} from '../lib/sesiones';
import { esPrueba, leeMarca, type Marca, type Prueba, type Sexo } from '../lib/baremo-fisico';
import { leeCargas, leeKg, normalizaEjercicio, rmVigentes, MAX_REPS_ESTIMACION, type MarcaRM } from '../lib/rm';

const hoyAcademia = () => ahoraEnZona(Date.now()).fecha;
const MAX_RANGO_DIAS = 62;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

const COLS_SESION = 'id, class_id, user_id, session_date, kind, title, description, duration_min, distance_km, video, position, loads';
const COLS_APUNTE = 'session_id, user_id, status, rpe, comment, duration_min, distance_km, coach_reply';
const COLS_PLANTILLA = 'id, kind, title, description, duration_min, distance_km, video, loads';

type Fila = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function aSesion(r: Fila): Sesion {
  return {
    id: r.id as string,
    classId: (r.class_id as string | null) ?? null,
    userId: (r.user_id as string | null) ?? null,
    fecha: r.session_date as string,
    kind: r.kind as TipoSesion,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    durationMin: num(r.duration_min),
    // `numeric` llega como cadena desde PostgREST (regla 51).
    distanceKm: num(r.distance_km),
    video: (r.video as string | null) ?? null,
    position: Number(r.position ?? 0),
    cargas: leeCargas(r.loads),
  };
}

function aApunte(r: Fila): Apunte {
  return {
    sessionId: r.session_id as string,
    userId: r.user_id as string,
    status: r.status as Apunte['status'],
    rpe: num(r.rpe),
    comment: (r.comment as string | null) ?? null,
    durationMin: num(r.duration_min),
    distanceKm: num(r.distance_km),
    coachReply: (r.coach_reply as string | null) ?? null,
  };
}

function aPlantilla(r: Fila): Plantilla {
  return {
    id: r.id as string,
    kind: r.kind as TipoSesion,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    durationMin: num(r.duration_min),
    distanceKm: num(r.distance_km),
    video: (r.video as string | null) ?? null,
    cargas: leeCargas(r.loads),
  };
}

function rangoValido(desde: unknown, hasta: unknown): desde is string {
  if (!esFecha(desde as string) || !esFecha(hasta as string)) return false;
  return (hasta as string) >= (desde as string) && sumaDias(desde as string, MAX_RANGO_DIAS) >= (hasta as string);
}

/** Los grupos de un alumno dentro de una academia. */
async function gruposDelAlumno(userId: string, organizationId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('class_members')
    .select('class_id, class_groups!inner(organization_id)')
    .eq('user_id', userId)
    .eq('class_groups.organization_id', organizationId);
  return (data ?? []).map((m) => m.class_id as string);
}

/** ¿Es ese grupo, o ese alumno, de la academia? */
async function destinoDeLaAcademia(destino: Destino, organizationId: string): Promise<boolean> {
  if (!esUuid(destino.id)) return false;
  if (destino.tipo === 'grupo') {
    const { data } = await supabaseAdmin.from('class_groups').select('id').eq('id', destino.id).eq('organization_id', organizationId).maybeSingle();
    return !!data;
  }
  const { data } = await supabaseAdmin.from('academy_members').select('user_id').eq('user_id', destino.id).eq('academy_id', organizationId).maybeSingle();
  return !!data;
}

/** El filtro de «lo de este alumno»: sus sesiones y las de sus grupos. */
function filtroAlumno(userId: string, grupos: string[]): string {
  const g = grupos.filter(esUuid);
  return g.length ? `user_id.eq.${userId},class_id.in.(${g.join(',')})` : `user_id.eq.${userId}`;
}

async function correos(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data } = await supabaseAdmin.from('profiles').select('id, email').in('id', ids);
  return new Map((data ?? []).map((p) => [p.id as string, (p.email as string | null) ?? '—']));
}

async function nombresDeGrupos(organizationId: string): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin.from('class_groups').select('id, name').eq('organization_id', organizationId);
  return Object.fromEntries((data ?? []).map((g) => [g.id as string, g.name as string]));
}

export type NotaSemana = { weekStart: string; note: string; classId: string | null };

/** El 1RM vigente de cada ejercicio, por clave (regla 87). */
export type RMVigente = Record<string, { ejercicio: string; rm: number }>;

const COLS_RM = 'id, exercise, weight_kg, reps, measured_on, note';
function aMarcaRM(r: Fila): MarcaRM {
  return {
    id: r.id as string,
    ejercicio: r.exercise as string,
    pesoKg: Number(r.weight_kg),
    reps: Number(r.reps ?? 1),
    fecha: r.measured_on as string,
    nota: (r.note as string | null) ?? null,
  };
}

async function rmDelAlumno(userId: string, organizationId: string): Promise<RMVigente> {
  const { data } = await supabaseAdmin.from('rm_marks').select(COLS_RM).eq('user_id', userId).eq('organization_id', organizationId);
  return Object.fromEntries([...rmVigentes((data ?? []).map(aMarcaRM))].map(([k, v]) => [k, { ejercicio: v.ejercicio, rm: v.rm }]));
}

function leeEntradaRM(params: { ejercicio?: unknown; pesoKg?: unknown; reps?: unknown; fecha?: unknown; nota?: unknown }, hoy: string):
  { ok: true; ejercicio: string; peso: number; reps: number; fecha: string; nota: string | null } | { ok: false; error: string } {
  const ejercicio = normalizaEjercicio(params.ejercicio);
  if (!ejercicio) return { ok: false, error: 'Escribe el ejercicio.' };
  const peso = leeKg(params.pesoKg);
  if (peso === null || peso >= 1000) return { ok: false, error: 'El peso va en kilos (por ejemplo, 80 o 82,5).' };
  const reps = params.reps === null || params.reps === undefined || String(params.reps).trim() === '' ? 1 : Number(params.reps);
  if (!Number.isInteger(reps) || reps < 1 || reps > MAX_REPS_ESTIMACION) {
    return { ok: false, error: `Las repeticiones van de 1 a ${MAX_REPS_ESTIMACION}: con más, la estimación del 1RM no es fiable.` };
  }
  const fecha = typeof params.fecha === 'string' ? params.fecha : '';
  if (!esFecha(fecha) || fecha > hoy) return { ok: false, error: 'La fecha no puede ser futura.' };
  const nota = typeof params.nota === 'string' ? params.nota.trim().slice(0, 300) : '';
  return { ok: true, ejercicio, peso: Math.round(peso * 100) / 100, reps, fecha, nota: nota || null };
}

// ═════════════════════════════════════════════════════════════════════════
// EL PREPARADOR
// ═════════════════════════════════════════════════════════════════════════

export type DestinoGrupo = { id: string; name: string; kind: string; miembros: number };
export type DestinoAlumno = { id: string; email: string; grupos: string[] };

/** Para quién se puede planificar: los grupos y los alumnos de la academia. */
export async function getDestinosFisica(): Promise<
  { success: true; grupos: DestinoGrupo[]; alumnos: DestinoAlumno[] } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: true as const, grupos: [], alumnos: [] };

  const [{ data: grupos, error }, { data: socios }] = await Promise.all([
    supabaseAdmin.from('class_groups').select('id, name, kind').eq('organization_id', org).order('name'),
    supabaseAdmin.from('academy_members').select('user_id').eq('academy_id', org),
  ]);
  if (error) return { success: false as const, error: error.message };

  const ids = (socios ?? []).map((s) => s.user_id as string);
  const { data: perfiles } = ids.length
    ? await supabaseAdmin.from('profiles').select('id, email, role').in('id', ids)
    : { data: [] as Fila[] };
  const idsGrupos = (grupos ?? []).map((g) => g.id as string);
  const { data: miembros } = idsGrupos.length
    ? await supabaseAdmin.from('class_members').select('class_id, user_id').in('class_id', idsGrupos)
    : { data: [] as Fila[] };

  const alumnos = (perfiles ?? [])
    .filter((p) => p.role !== 'admin' && p.role !== 'superadmin')
    .map((p) => ({
      id: p.id as string,
      email: (p.email as string | null) ?? '—',
      grupos: (miembros ?? []).filter((m) => m.user_id === p.id).map((m) => m.class_id as string),
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  return {
    success: true as const,
    grupos: (grupos ?? []).map((g) => ({
      id: g.id as string,
      name: g.name as string,
      kind: g.kind as string,
      miembros: (miembros ?? []).filter((m) => m.class_id === g.id).length,
    })),
    alumnos,
  };
}

export type ApunteConCorreo = Apunte & { email: string };

/**
 * El calendario de un grupo o de un alumno entre dos fechas. En el de un
 * alumno salen también las sesiones de sus grupos, marcadas con su `classId`:
 * se ven, pero se cambian desde el grupo (cambiarlas aquí cambiaría las de todos).
 */
export async function getPlanificador(params: { destino: Destino; desde: string; hasta: string }): Promise<
  | {
      success: true;
      sesiones: Sesion[];
      apuntes: ApunteConCorreo[];
      miembros: { id: string; email: string }[];
      notas: NotaSemana[];
      nombresGrupo: Record<string, string>;
      /** El 1RM del alumno (solo en la vista de un alumno): para ver sus kilos al planificar. */
      rm: RMVigente;
      hoy: string;
    }
  | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const { destino, desde, hasta } = params ?? ({} as typeof params);
  if (!org) return { success: false as const, error: 'No hay una academia seleccionada.' };
  if (!esDestino(destino) || !rangoValido(desde, hasta)) return { success: false as const, error: 'Datos no válidos.' };
  if (!(await destinoDeLaAcademia(destino, org))) return { success: false as const, error: 'Ese grupo o alumno no es de tu academia.' };

  let sesionesQ = supabaseAdmin.from('training_sessions').select(COLS_SESION).eq('organization_id', org).gte('session_date', desde).lte('session_date', hasta);
  let notasQ = supabaseAdmin.from('training_week_notes').select('week_start, note, class_id').eq('organization_id', org)
    .gte('week_start', lunesDe(desde)).lte('week_start', hasta);
  let idsMiembros: string[];

  if (destino.tipo === 'grupo') {
    sesionesQ = sesionesQ.eq('class_id', destino.id);
    notasQ = notasQ.eq('class_id', destino.id);
    const { data: m } = await supabaseAdmin.from('class_members').select('user_id').eq('class_id', destino.id);
    idsMiembros = (m ?? []).map((x) => x.user_id as string);
  } else {
    const grupos = await gruposDelAlumno(destino.id, org);
    sesionesQ = sesionesQ.or(filtroAlumno(destino.id, grupos));
    notasQ = notasQ.or(filtroAlumno(destino.id, grupos));
    idsMiembros = [destino.id];
  }

  const [{ data: filas, error }, { data: notas }, mapaCorreos, nombresGrupo, rm] = await Promise.all([
    sesionesQ, notasQ, correos(idsMiembros), nombresDeGrupos(org),
    destino.tipo === 'alumno' ? rmDelAlumno(destino.id, org) : Promise.resolve({} as RMVigente),
  ]);
  if (error) return { success: false as const, error: error.message };
  const sesiones = (filas ?? []).map(aSesion);

  const ids = sesiones.map((s) => s.id);
  const { data: logs } = ids.length
    ? await supabaseAdmin.from('training_session_logs').select(COLS_APUNTE).in('session_id', ids).in('user_id', idsMiembros.length ? idsMiembros : ['00000000-0000-0000-0000-000000000000'])
    : { data: [] as Fila[] };

  return {
    success: true as const,
    sesiones,
    apuntes: (logs ?? []).map((l) => ({ ...aApunte(l), email: mapaCorreos.get(l.user_id as string) ?? '—' })),
    miembros: idsMiembros.map((id) => ({ id, email: mapaCorreos.get(id) ?? '—' })).sort((a, b) => a.email.localeCompare(b.email)),
    notas: (notas ?? []).map((n) => ({ weekStart: n.week_start as string, note: n.note as string, classId: (n.class_id as string | null) ?? null })),
    nombresGrupo,
    rm,
    hoy: hoyAcademia(),
  };
}

/** Crea una sesión, o la cambia si trae `id`. */
export async function saveSesion(params: {
  id?: string | null;
  destino: Destino;
  fecha: string;
  contenido: Record<string, unknown>;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const { id, destino, fecha, contenido } = params ?? ({} as typeof params);
  if (!org) return { success: false as const, error: 'No hay una academia seleccionada.' };
  if (!esFecha(fecha) || !esDestino(destino)) return { success: false as const, error: 'Datos no válidos.' };
  const c = normalizaContenido(contenido);
  if (!c.ok) return { success: false as const, error: c.error };
  if (!(await destinoDeLaAcademia(destino, org))) return { success: false as const, error: 'Ese grupo o alumno no es de tu academia.' };

  const fila = {
    class_id: destino.tipo === 'grupo' ? destino.id : null,
    user_id: destino.tipo === 'alumno' ? destino.id : null,
    session_date: fecha,
    kind: c.valor.kind,
    title: c.valor.title,
    description: c.valor.description,
    duration_min: c.valor.durationMin,
    distance_km: c.valor.distanceKm,
    video: c.valor.video,
    loads: c.valor.cargas.length ? c.valor.cargas : null,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    if (!esUuid(id)) return { success: false as const, error: 'Datos no válidos.' };
    const { data, error } = await supabaseAdmin.from('training_sessions').update(fila).eq('id', id).eq('organization_id', org).select('id').maybeSingle();
    if (error) return { success: false as const, error: error.message };
    if (!data) return { success: false as const, error: 'No se ha encontrado la sesión.' };
    return { success: true as const, id: data.id as string };
  }

  const { count } = await supabaseAdmin.from('training_sessions').select('id', { count: 'exact', head: true })
    .eq('organization_id', org).eq('session_date', fecha)
    .eq(destino.tipo === 'grupo' ? 'class_id' : 'user_id', destino.id);
  const { data, error } = await supabaseAdmin.from('training_sessions')
    .insert({ ...fila, organization_id: org, position: count ?? 0, created_by: auth.user.id })
    .select('id').single();
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, id: data.id as string };
}

export async function deleteSesion(params: { id: string }): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const org = auth.user.organizationId;
  if (!org || !esUuid(params?.id)) return { success: false, error: 'Datos no válidos.' };
  const { error } = await supabaseAdmin.from('training_sessions').delete().eq('id', params.id).eq('organization_id', org);
  return { success: !error, error: error?.message };
}

/** Lleva una sesión a otro día; con `copiar`, deja la original y crea otra igual. */
export async function moverSesion(params: { id: string; fecha: string; copiar?: boolean }): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const org = auth.user.organizationId;
  const { id, fecha, copiar } = params ?? ({} as typeof params);
  if (!org || !esUuid(id) || !esFecha(fecha)) return { success: false, error: 'Datos no válidos.' };

  if (!copiar) {
    const { data, error } = await supabaseAdmin.from('training_sessions')
      .update({ session_date: fecha, updated_at: new Date().toISOString() })
      .eq('id', id).eq('organization_id', org).select('id').maybeSingle();
    if (error) return { success: false, error: error.message };
    return data ? { success: true } : { success: false, error: 'No se ha encontrado la sesión.' };
  }
  const { data: s } = await supabaseAdmin.from('training_sessions').select(COLS_SESION).eq('id', id).eq('organization_id', org).maybeSingle();
  if (!s) return { success: false, error: 'No se ha encontrado la sesión.' };
  const { error } = await supabaseAdmin.from('training_sessions').insert({
    organization_id: org, class_id: s.class_id, user_id: s.user_id, session_date: fecha, kind: s.kind, title: s.title,
    description: s.description, duration_min: s.duration_min, distance_km: s.distance_km, video: s.video,
    loads: s.loads ?? null, position: 99, created_by: auth.user.id,
  });
  return { success: !error, error: error?.message };
}

/** Copia las sesiones de una semana a otra, para el mismo grupo o alumno. */
export async function copiarSemanaFisica(params: { destino: Destino; desde: string; a: string }): Promise<
  { success: true; creadas: number } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const { destino, desde, a } = params ?? ({} as typeof params);
  if (!org || !esDestino(destino) || !esFecha(desde) || !esFecha(a) || lunesDe(desde) !== desde || lunesDe(a) !== a || desde === a) {
    return { success: false as const, error: 'Datos no válidos.' };
  }
  if (!(await destinoDeLaAcademia(destino, org))) return { success: false as const, error: 'Ese grupo o alumno no es de tu academia.' };

  const col = destino.tipo === 'grupo' ? 'class_id' : 'user_id';
  const { data, error } = await supabaseAdmin.from('training_sessions').select(COLS_SESION)
    .eq('organization_id', org).eq(col, destino.id).gte('session_date', desde).lte('session_date', sumaDias(desde, 6));
  if (error) return { success: false as const, error: error.message };
  const copias = copiaSemana((data ?? []).map(aSesion), desde, a);
  if (!copias.length) return { success: false as const, error: 'Esa semana no tiene sesiones que copiar.' };

  const { error: e2 } = await supabaseAdmin.from('training_sessions').insert(copias.map((c) => ({
    organization_id: org,
    class_id: destino.tipo === 'grupo' ? destino.id : null,
    user_id: destino.tipo === 'alumno' ? destino.id : null,
    session_date: c.fecha, kind: c.kind, title: c.title, description: c.description,
    duration_min: c.durationMin, distance_km: c.distanceKm, video: c.video, position: c.position,
    loads: c.cargas.length ? c.cargas : null, created_by: auth.user.id,
  })));
  if (e2) return { success: false as const, error: e2.message };
  return { success: true as const, creadas: copias.length };
}

/** La nota de una semana («Semana de carga»). Vacía, la borra. */
export async function setNotaSemana(params: { destino: Destino; weekStart: string; note: string }): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const org = auth.user.organizationId;
  const { destino, weekStart } = params ?? ({} as typeof params);
  if (!org || !esDestino(destino) || !esFecha(weekStart) || lunesDe(weekStart) !== weekStart) return { success: false, error: 'Datos no válidos.' };
  if (!(await destinoDeLaAcademia(destino, org))) return { success: false, error: 'Ese grupo o alumno no es de tu academia.' };
  const nota = typeof params.note === 'string' ? params.note.trim().slice(0, MAX_NOTA_SEMANA) : '';
  const col = destino.tipo === 'grupo' ? 'class_id' : 'user_id';

  const { error: e1 } = await supabaseAdmin.from('training_week_notes').delete()
    .eq('organization_id', org).eq(col, destino.id).eq('week_start', weekStart);
  if (e1) return { success: false, error: e1.message };
  if (!nota) return { success: true };
  const { error } = await supabaseAdmin.from('training_week_notes').insert({
    organization_id: org, [col]: destino.id, week_start: weekStart, note: nota, updated_at: new Date().toISOString(),
  });
  return { success: !error, error: error?.message };
}

/** El preparador contesta a lo que ha apuntado un alumno. */
export async function responderApunte(params: { sessionId: string; alumnoId: string; reply: string }): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const org = auth.user.organizationId;
  const { sessionId, alumnoId } = params ?? ({} as typeof params);
  if (!org || !esUuid(sessionId) || !esUuid(alumnoId)) return { success: false, error: 'Datos no válidos.' };
  const { data: s } = await supabaseAdmin.from('training_sessions').select('id').eq('id', sessionId).eq('organization_id', org).maybeSingle();
  if (!s) return { success: false, error: 'No se ha encontrado la sesión.' };
  const texto = typeof params.reply === 'string' ? params.reply.trim().slice(0, MAX_COMENTARIO) : '';
  const { data, error } = await supabaseAdmin.from('training_session_logs')
    .update({ coach_reply: texto || null, coach_reply_at: texto ? new Date().toISOString() : null })
    .eq('session_id', sessionId).eq('user_id', alumnoId).select('session_id').maybeSingle();
  if (error) return { success: false, error: error.message };
  return data ? { success: true } : { success: false, error: 'Ese alumno aún no ha apuntado la sesión.' };
}

// ── La biblioteca de plantillas ──────────────────────────────────────────

export async function getPlantillas(): Promise<{ success: true; plantillas: Plantilla[] } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: true as const, plantillas: [] };
  const { data, error } = await supabaseAdmin.from('session_templates').select(COLS_PLANTILLA).eq('organization_id', org).order('kind').order('title');
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, plantillas: (data ?? []).map(aPlantilla) };
}

export async function savePlantilla(params: { id?: string | null; contenido: Record<string, unknown> }): Promise<
  { success: true; id: string } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: 'No hay una academia seleccionada.' };
  const c = normalizaContenido(params?.contenido);
  if (!c.ok) return { success: false as const, error: c.error };
  const fila = {
    kind: c.valor.kind, title: c.valor.title, description: c.valor.description, duration_min: c.valor.durationMin,
    distance_km: c.valor.distanceKm, video: c.valor.video, loads: c.valor.cargas.length ? c.valor.cargas : null,
    updated_at: new Date().toISOString(),
  };
  if (params.id) {
    if (!esUuid(params.id)) return { success: false as const, error: 'Datos no válidos.' };
    const { data, error } = await supabaseAdmin.from('session_templates').update(fila).eq('id', params.id).eq('organization_id', org).select('id').maybeSingle();
    if (error) return { success: false as const, error: error.message };
    return data ? { success: true as const, id: data.id as string } : { success: false as const, error: 'No se ha encontrado la plantilla.' };
  }
  const { data, error } = await supabaseAdmin.from('session_templates').insert({ ...fila, organization_id: org, created_by: auth.user.id }).select('id').single();
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, id: data.id as string };
}

export async function deletePlantilla(params: { id: string }): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const org = auth.user.organizationId;
  if (!org || !esUuid(params?.id)) return { success: false, error: 'Datos no válidos.' };
  const { error } = await supabaseAdmin.from('session_templates').delete().eq('id', params.id).eq('organization_id', org);
  return { success: !error, error: error?.message };
}

// ── Las marcas de la academia ────────────────────────────────────────────

export type MarcaGuardada = Marca & { porMi: boolean };
export type AlumnoConMarcas = { id: string; email: string; sexo: Sexo | null; marcas: Marca[]; rms: MarcaRM[] };

const aSexo = (v: unknown): Sexo | null => (v === 'male' || v === 'female' ? v : null);

function aMarca(r: Fila): Marca {
  return { id: r.id as string, prueba: r.test as Prueba, valor: Number(r.value), fecha: r.measured_on as string, nota: (r.note as string | null) ?? null };
}

/** Todos los alumnos de la academia, con su sexo (para el baremo) y sus marcas. */
export async function getMarcasAcademia(): Promise<{ success: true; alumnos: AlumnoConMarcas[]; hoy: string } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: true as const, alumnos: [], hoy: hoyAcademia() };

  const { data: socios } = await supabaseAdmin.from('academy_members').select('user_id').eq('academy_id', org);
  const ids = (socios ?? []).map((s) => s.user_id as string);
  if (!ids.length) return { success: true as const, alumnos: [], hoy: hoyAcademia() };

  const [{ data: perfiles }, { data: fisicos }, { data: marcas, error }, { data: rms }] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, email, role').in('id', ids),
    // Un admin leyendo el sexo de OTRO alumno: la sesión del alumno no sirve aquí
    // (regla 48). Detrás de `requireAdmin`.
    supabaseAdmin.from('profiles_physical').select('user_id, gender').in('user_id', ids),
    supabaseAdmin.from('physical_marks').select('id, user_id, test, value, measured_on, note').eq('organization_id', org).order('measured_on'),
    supabaseAdmin.from('rm_marks').select(`${COLS_RM}, user_id`).eq('organization_id', org).order('measured_on'),
  ]);
  if (error) return { success: false as const, error: error.message };
  const sexo = new Map((fisicos ?? []).map((f) => [f.user_id as string, aSexo(f.gender)]));

  return {
    success: true as const,
    hoy: hoyAcademia(),
    alumnos: (perfiles ?? [])
      .filter((p) => p.role !== 'admin' && p.role !== 'superadmin')
      .map((p) => ({
        id: p.id as string,
        email: (p.email as string | null) ?? '—',
        sexo: sexo.get(p.id as string) ?? null,
        marcas: (marcas ?? []).filter((m) => m.user_id === p.id).map(aMarca),
        rms: (rms ?? []).filter((m) => m.user_id === p.id).map(aMarcaRM),
      }))
      .sort((a, b) => a.email.localeCompare(b.email)),
  };
}

async function esAlumnoDe(userId: string, org: string): Promise<boolean> {
  if (!esUuid(userId)) return false;
  const { data } = await supabaseAdmin.from('academy_members').select('user_id').eq('user_id', userId).eq('academy_id', org).maybeSingle();
  return !!data;
}

function leeEntradaMarca(params: { prueba?: unknown; valor?: unknown; fecha?: unknown; nota?: unknown }, hoy: string):
  { ok: true; prueba: Prueba; valor: number; fecha: string; nota: string | null } | { ok: false; error: string } {
  if (!esPrueba(params.prueba)) return { ok: false, error: 'Elige la prueba.' };
  const valor = leeMarca(params.prueba, params.valor as string);
  if (valor === null) return { ok: false, error: 'Esa marca no se entiende. Mira el ejemplo del campo.' };
  const fecha = typeof params.fecha === 'string' ? params.fecha : '';
  if (!esFecha(fecha) || fecha > hoy) return { ok: false, error: 'La fecha no puede ser futura.' };
  const nota = typeof params.nota === 'string' ? params.nota.trim().slice(0, 300) : '';
  return { ok: true, prueba: params.prueba, valor, fecha, nota: nota || null };
}

export async function addMarca(params: { alumnoId: string; prueba: string; valor: string; fecha: string; nota?: string }): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const org = auth.user.organizationId;
  if (!org || !(await esAlumnoDe(params?.alumnoId, org))) return { success: false, error: 'Ese alumno no es de tu academia.' };
  const m = leeEntradaMarca(params, hoyAcademia());
  if (!m.ok) return { success: false, error: m.error };
  const { error } = await supabaseAdmin.from('physical_marks').insert({
    organization_id: org, user_id: params.alumnoId, test: m.prueba, value: m.valor, measured_on: m.fecha, note: m.nota, recorded_by: auth.user.id,
  });
  return { success: !error, error: error?.message };
}

export async function deleteMarca(params: { id: string }): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const org = auth.user.organizationId;
  if (!org || !esUuid(params?.id)) return { success: false, error: 'Datos no válidos.' };
  const { error } = await supabaseAdmin.from('physical_marks').delete().eq('id', params.id).eq('organization_id', org);
  return { success: !error, error: error?.message };
}

/** Apunta un 1RM de un alumno: el peso y cuántas repeticiones (1 = medido; 2-12, estimado). */
export async function addRM(params: { alumnoId: string; ejercicio: string; pesoKg: string; reps?: string; fecha: string; nota?: string }): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const org = auth.user.organizationId;
  if (!org || !(await esAlumnoDe(params?.alumnoId, org))) return { success: false, error: 'Ese alumno no es de tu academia.' };
  const m = leeEntradaRM(params, hoyAcademia());
  if (!m.ok) return { success: false, error: m.error };
  const { error } = await supabaseAdmin.from('rm_marks').insert({
    organization_id: org, user_id: params.alumnoId, exercise: m.ejercicio, weight_kg: m.peso, reps: m.reps,
    measured_on: m.fecha, note: m.nota, recorded_by: auth.user.id,
  });
  return { success: !error, error: error?.message };
}

export async function deleteRM(params: { id: string }): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const org = auth.user.organizationId;
  if (!org || !esUuid(params?.id)) return { success: false, error: 'Datos no válidos.' };
  const { error } = await supabaseAdmin.from('rm_marks').delete().eq('id', params.id).eq('organization_id', org);
  return { success: !error, error: error?.message };
}

/** El sexo de un alumno, que decide su prueba de fuerza y su baremo. */
export async function setSexoAlumno(params: { alumnoId: string; sexo: string }): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const org = auth.user.organizationId;
  const sexo = aSexo(params?.sexo);
  if (!org || !sexo || !(await esAlumnoDe(params.alumnoId, org))) return { success: false, error: 'Datos no válidos.' };
  const { error } = await supabaseAdmin.from('profiles_physical').upsert({ user_id: params.alumnoId, gender: sexo }, { onConflict: 'user_id' });
  return { success: !error, error: error?.message };
}

// ═════════════════════════════════════════════════════════════════════════
// EL ALUMNO
// ═════════════════════════════════════════════════════════════════════════

/** Su calendario: sus sesiones y las de sus grupos, con lo que ha apuntado. */
export async function getMiFisica(params: { desde: string; hasta: string }): Promise<
  | { success: true; sesiones: Sesion[]; apuntes: Apunte[]; notas: NotaSemana[]; nombresGrupo: Record<string, string>; rm: RMVigente; hoy: string }
  | { success: false; error: string }
> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const modulo = await requireModule('training');
  if (!modulo.ok) return { success: false as const, error: modulo.error };
  const org = auth.user.organizationId;
  const hoy = hoyAcademia();
  if (!org) return { success: true as const, sesiones: [], apuntes: [], notas: [], nombresGrupo: {}, rm: {}, hoy };
  const { desde, hasta } = params ?? ({} as typeof params);
  if (!rangoValido(desde, hasta)) return { success: false as const, error: 'Datos no válidos.' };

  // Con el plan manual apagado por la academia, no hay calendario (regla 54).
  const switches = await leeTrainingSwitches(org);
  if (!switches.group) return { success: true as const, sesiones: [], apuntes: [], notas: [], nombresGrupo: {}, rm: {}, hoy };

  const grupos = await gruposDelAlumno(auth.user.id, org);
  const filtro = filtroAlumno(auth.user.id, grupos);
  const [{ data: filas, error }, { data: notas }, nombresGrupo, rm] = await Promise.all([
    supabaseAdmin.from('training_sessions').select(COLS_SESION).eq('organization_id', org).or(filtro).gte('session_date', desde).lte('session_date', hasta),
    supabaseAdmin.from('training_week_notes').select('week_start, note, class_id').eq('organization_id', org).or(filtro).gte('week_start', lunesDe(desde)).lte('week_start', hasta),
    nombresDeGrupos(org),
    rmDelAlumno(auth.user.id, org),
  ]);
  if (error) return { success: false as const, error: error.message };
  const sesiones = (filas ?? []).map(aSesion);
  const ids = sesiones.map((s) => s.id);
  const { data: logs } = ids.length
    ? await supabaseAdmin.from('training_session_logs').select(COLS_APUNTE).eq('user_id', auth.user.id).in('session_id', ids)
    : { data: [] as Fila[] };

  return {
    success: true as const,
    sesiones,
    apuntes: (logs ?? []).map(aApunte),
    notas: (notas ?? []).map((n) => ({ weekStart: n.week_start as string, note: n.note as string, classId: (n.class_id as string | null) ?? null })),
    nombresGrupo: Object.fromEntries(Object.entries(nombresGrupo).filter(([id]) => grupos.includes(id))),
    rm,
    hoy,
  };
}

/**
 * Apunta una sesión (hecha o no, con su esfuerzo y sensaciones), la corrige, o
 * la deja sin apuntar (`status: null`). La respuesta del preparador no se toca.
 */
export async function setMiApunte(params: {
  sessionId: string;
  status: 'hecha' | 'no_hecha' | null;
  rpe?: number | null;
  comment?: string | null;
  durationMin?: string | number | null;
  distanceKm?: string | number | null;
}): Promise<{ success: true; apunte: Apunte | null } | { success: false; error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const sessionId = params?.sessionId;
  if (!org || !esUuid(sessionId)) return { success: false as const, error: 'Datos no válidos.' };

  const { data: s } = await supabaseAdmin.from('training_sessions').select('id, class_id, user_id, session_date')
    .eq('id', sessionId).eq('organization_id', org).maybeSingle();
  if (!s) return { success: false as const, error: 'No se ha encontrado la sesión.' };
  const esMia = s.user_id === auth.user.id || (s.class_id && (await gruposDelAlumno(auth.user.id, org)).includes(s.class_id as string));
  if (!esMia) return { success: false as const, error: 'Esa sesión no es tuya.' };
  if (!sePuedeApuntar(s.session_date as string, hoyAcademia())) {
    return { success: false as const, error: 'Esa sesión no se puede apuntar: aún no ha llegado o queda muy atrás.' };
  }

  if (params.status === null) {
    const { error } = await supabaseAdmin.from('training_session_logs').delete().eq('session_id', sessionId).eq('user_id', auth.user.id);
    return error ? { success: false as const, error: error.message } : { success: true as const, apunte: null };
  }

  const a = normalizaApunte(params as unknown as Record<string, unknown>);
  if (!a.ok) return { success: false as const, error: a.error };
  const { data, error } = await supabaseAdmin.from('training_session_logs').upsert({
    session_id: sessionId, user_id: auth.user.id, status: a.valor.status, rpe: a.valor.rpe, comment: a.valor.comment,
    duration_min: a.valor.durationMin, distance_km: a.valor.distanceKm, updated_at: new Date().toISOString(),
  }, { onConflict: 'session_id,user_id' }).select(COLS_APUNTE).single();
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, apunte: aApunte(data) };
}

/** Sus marcas, y su sexo (para el baremo). */
export type MarcaRMGuardada = MarcaRM & { porMi: boolean };

export async function getMisMarcas(): Promise<{ success: true; sexo: Sexo | null; marcas: MarcaGuardada[]; rms: MarcaRMGuardada[]; hoy: string } | { success: false; error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const db = await createSupabaseServerClient();
  const { data: fisico } = await db.from('profiles_physical').select('gender').eq('user_id', auth.user.id).maybeSingle();
  if (!org) return { success: true as const, sexo: aSexo(fisico?.gender), marcas: [], rms: [], hoy: hoyAcademia() };
  const [{ data, error }, { data: rms }] = await Promise.all([
    supabaseAdmin.from('physical_marks').select('id, test, value, measured_on, note, recorded_by')
      .eq('user_id', auth.user.id).eq('organization_id', org).order('measured_on'),
    supabaseAdmin.from('rm_marks').select(`${COLS_RM}, recorded_by`).eq('user_id', auth.user.id).eq('organization_id', org).order('measured_on'),
  ]);
  if (error) return { success: false as const, error: error.message };
  return {
    success: true as const,
    sexo: aSexo(fisico?.gender),
    hoy: hoyAcademia(),
    marcas: (data ?? []).map((r) => ({ ...aMarca(r), porMi: r.recorded_by === auth.user.id })),
    rms: (rms ?? []).map((r) => ({ ...aMarcaRM(r), porMi: r.recorded_by === auth.user.id })),
  };
}

/** Apunta un 1RM suyo (peso y repeticiones). */
export async function addMiRM(params: { ejercicio: string; pesoKg: string; reps?: string; fecha: string; nota?: string }): Promise<{ success: boolean; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false, error: 'No hemos encontrado tu academia.' };
  const m = leeEntradaRM(params ?? {}, hoyAcademia());
  if (!m.ok) return { success: false, error: m.error };
  const { error } = await supabaseAdmin.from('rm_marks').insert({
    organization_id: org, user_id: auth.user.id, exercise: m.ejercicio, weight_kg: m.peso, reps: m.reps,
    measured_on: m.fecha, note: m.nota, recorded_by: auth.user.id,
  });
  return { success: !error, error: error?.message };
}

/** Borra un 1RM SUYO, que haya apuntado él. Los del preparador no. */
export async function deleteMiRM(params: { id: string }): Promise<{ success: boolean; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  if (!esUuid(params?.id)) return { success: false, error: 'Datos no válidos.' };
  const { data, error } = await supabaseAdmin.from('rm_marks').delete()
    .eq('id', params.id).eq('user_id', auth.user.id).eq('recorded_by', auth.user.id).select('id');
  if (error) return { success: false, error: error.message };
  return data?.length ? { success: true } : { success: false, error: 'Ese 1RM lo apuntó tu preparador: solo él puede borrarlo.' };
}

export async function addMiMarca(params: { prueba: string; valor: string; fecha: string; nota?: string }): Promise<{ success: boolean; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false, error: 'No hemos encontrado tu academia.' };
  const m = leeEntradaMarca(params ?? {}, hoyAcademia());
  if (!m.ok) return { success: false, error: m.error };
  const { error } = await supabaseAdmin.from('physical_marks').insert({
    organization_id: org, user_id: auth.user.id, test: m.prueba, value: m.valor, measured_on: m.fecha, note: m.nota, recorded_by: auth.user.id,
  });
  return { success: !error, error: error?.message };
}

/** Borra una marca SUYA, que haya apuntado él. Las del preparador no. */
export async function deleteMiMarca(params: { id: string }): Promise<{ success: boolean; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  if (!esUuid(params?.id)) return { success: false, error: 'Datos no válidos.' };
  const { data, error } = await supabaseAdmin.from('physical_marks').delete()
    .eq('id', params.id).eq('user_id', auth.user.id).eq('recorded_by', auth.user.id).select('id');
  if (error) return { success: false, error: error.message };
  return data?.length ? { success: true } : { success: false, error: 'Esa marca la apuntó tu preparador: solo él puede borrarla.' };
}

/** Su sexo, para saber qué prueba de fuerza hace y con qué baremo. */
export async function setMiSexo(params: { sexo: string }): Promise<{ success: boolean; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const sexo = aSexo(params?.sexo);
  if (!sexo) return { success: false, error: 'Datos no válidos.' };
  const db = await createSupabaseServerClient();
  const { error } = await db.from('profiles_physical').upsert({ user_id: auth.user.id, gender: sexo }, { onConflict: 'user_id' });
  return { success: !error, error: error?.message };
}

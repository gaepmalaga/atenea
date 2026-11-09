'use server';

/**
 * EL CUADRANTE SEMANAL DE FÍSICA Y LOS MULTIDISCIPLINARES (regla 96).
 *
 * Preparador: ve y edita la rejilla grupo × día de una semana (qué toca y qué
 * profesor lo da), la copia de la semana anterior y ve quién de Multi va a
 * cada clase. Alumno multi: se apunta a las sesiones de otros grupos.
 *
 * Las sesiones son las de siempre (`training_sessions`, regla 86), con dos
 * columnas más (`teacher_id`, `start_time`: `docs/sql/fisica-cuadrante.sql`).
 * Lo que se apunta un multi vive en `class_session_joins`, con RLS y CERO
 * políticas como `class_absences` (regla 82): solo la clave de servicio, así
 * que cada acción del alumno filtra por su id y comprueba que es multi, que el
 * grupo es de su academia, que es un día de clase y que no ha empezado — con
 * la clave de servicio nada más que este código lo impide (regla 34).
 *
 * La lógica (rejilla, choques de profesor, plazas, texto) vive en
 * `app/lib/cuadrante.ts`, pura y con tests (regla 21).
 */

import { supabaseAdmin } from './core';
import { requireUser, requireAdmin } from '../lib/auth';
import { requireModule } from '../lib/module-guard';
import { leeTrainingSwitches } from '../lib/training-switch-guard';
import {
  ahoraEnZona, esFecha, sumaDias, horarioDeFila, proximasSesiones, sePuedeAvisar, etiquetaFecha,
  type HorarioGrupo, type CuentaSesion,
} from '../lib/asistencia';
import { lunesDe } from '../lib/sesiones';
import {
  nombreCorto, normalizaCelda, plazasSesion, quedaPlaza, nombrePila,
  type GrupoCuadrante, type Profesor, type SesionCuadrante,
} from '../lib/cuadrante';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const hoyAcademia = () => ahoraEnZona(Date.now()).fecha;

type Fila = Record<string, unknown>;
const COLS_GRUPO = 'id, name, organization_id, weekdays, start_time, end_time, capacity, is_multi';
const COLS_SESION = 'id, class_id, session_date, kind, title, position, teacher_id, start_time';

const aGrupo = (g: Fila, inscritos: number): GrupoCuadrante => ({
  id: g.id as string,
  nombre: g.name as string,
  corto: nombreCorto(g.name as string),
  esMulti: g.is_multi === true,
  horario: horarioDeFila(g),
  inscritos,
});

const aSesion = (r: Fila): SesionCuadrante => ({
  id: r.id as string,
  classId: r.class_id as string,
  fecha: r.session_date as string,
  titulo: r.title as string,
  tipo: r.kind as SesionCuadrante['tipo'],
  profesorId: (r.teacher_id as string | null) ?? null,
  horaPropia: typeof r.start_time === 'string' ? r.start_time.slice(0, 5) : null,
  position: Number(r.position ?? 0),
});

async function profesoresDe(org: string): Promise<Profesor[]> {
  const { data } = await supabaseAdmin.from('academy_staff').select('id, name').eq('organization_id', org).eq('active', true).order('name');
  return (data ?? []).map((p) => ({ id: p.id as string, nombre: p.name as string }));
}

/** Cuántos van a cada sesión de unos grupos entre dos fechas: propios, faltas y multis. */
type Cuentas = Map<string, { inscritos: number; faltan: number; multis: number }>;
async function cuentasDeSesiones(grupos: { id: string }[], desde: string, hasta: string): Promise<{ cuentas: Cuentas; miembros: Map<string, Set<string>> }> {
  const ids = grupos.map((g) => g.id);
  const vacio = { data: [] as Fila[] };
  const [m, f, j] = ids.length
    ? await Promise.all([
        supabaseAdmin.from('class_members').select('class_id, user_id').in('class_id', ids),
        supabaseAdmin.from('class_absences').select('class_id, user_id, session_date').in('class_id', ids).gte('session_date', desde).lte('session_date', hasta),
        supabaseAdmin.from('class_session_joins').select('class_id, user_id, session_date').in('class_id', ids).gte('session_date', desde).lte('session_date', hasta),
      ])
    : [vacio, vacio, vacio];

  const miembros = new Map<string, Set<string>>();
  for (const x of m.data ?? []) {
    const set = miembros.get(x.class_id as string) ?? new Set<string>();
    set.add(x.user_id as string);
    miembros.set(x.class_id as string, set);
  }
  const cuentas: Cuentas = new Map();
  const toca = (classId: string, fecha: string) => {
    const k = `${classId}|${fecha}`;
    const c = cuentas.get(k) ?? { inscritos: miembros.get(classId)?.size ?? 0, faltan: 0, multis: 0 };
    cuentas.set(k, c);
    return c;
  };
  // Solo cuenta la falta de quien SIGUE en el grupo (regla 82).
  for (const x of f.data ?? []) if (miembros.get(x.class_id as string)?.has(x.user_id as string)) toca(x.class_id as string, x.session_date as string).faltan += 1;
  for (const x of j.data ?? []) toca(x.class_id as string, x.session_date as string).multis += 1;
  return { cuentas, miembros };
}

const cuentaDe = (cuentas: Cuentas, miembros: Map<string, Set<string>>, classId: string, fecha: string, aforo: number | null): CuentaSesion => {
  const c = cuentas.get(`${classId}|${fecha}`) ?? { inscritos: miembros.get(classId)?.size ?? 0, faltan: 0, multis: 0 };
  return plazasSesion(aforo, c.inscritos, c.faltan, c.multis);
};

const esLunes = (f: unknown): f is string => esFecha(f) && lunesDe(f) === f;

// ═════════════════════════════════════════════════════════════════════════
// EL PREPARADOR
// ═════════════════════════════════════════════════════════════════════════

export type ApuntadoMulti = { userId: string; email: string };

export type DatosCuadrante = {
  lunes: string;
  hoy: string;
  grupos: GrupoCuadrante[];
  profesores: Profesor[];
  sesiones: SesionCuadrante[];
  /** Por `classId|fecha`: las plazas de esa sesión, con los multis dentro. */
  plazas: Record<string, CuentaSesion>;
  /** Por `classId|fecha`: los multis apuntados. */
  multis: Record<string, ApuntadoMulti[]>;
  /** Cuántos alumnos hay en el grupo Multi. */
  totalMultis: number;
};

/** El cuadrante de una semana (`lunes` = su lunes). */
export async function getCuadrante(params: { lunes: string }): Promise<
  { success: true; datos: DatosCuadrante } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: 'No hay una academia seleccionada.' };
  const lunes = params?.lunes;
  if (!esLunes(lunes)) return { success: false as const, error: 'Datos no válidos.' };
  const domingo = sumaDias(lunes, 6);

  const { data: filas, error } = await supabaseAdmin
    .from('class_groups').select(COLS_GRUPO).eq('organization_id', org).eq('kind', 'fisicas').order('created_at').order('name');
  if (error) return { success: false as const, error: error.message };
  const grupos0 = filas ?? [];
  const ids = grupos0.map((g) => g.id as string);

  const [{ cuentas, miembros }, profesores, sesionesRes, joinsRes] = await Promise.all([
    cuentasDeSesiones(grupos0.map((g) => ({ id: g.id as string })), lunes, domingo),
    profesoresDe(org),
    ids.length
      ? supabaseAdmin.from('training_sessions').select(COLS_SESION).eq('organization_id', org).in('class_id', ids).gte('session_date', lunes).lte('session_date', domingo)
      : Promise.resolve({ data: [] as Fila[], error: null }),
    ids.length
      ? supabaseAdmin.from('class_session_joins').select('class_id, user_id, session_date').in('class_id', ids).gte('session_date', lunes).lte('session_date', domingo)
      : Promise.resolve({ data: [] as Fila[], error: null }),
  ]);
  if (sesionesRes.error) return { success: false as const, error: sesionesRes.error.message };
  if (joinsRes.error) return { success: false as const, error: joinsRes.error.message };

  const usuarios = [...new Set((joinsRes.data ?? []).map((j) => j.user_id as string))];
  const { data: perfiles } = usuarios.length
    ? await supabaseAdmin.from('profiles').select('id, email').in('id', usuarios)
    : { data: [] as Fila[] };
  const correo = new Map((perfiles ?? []).map((p) => [p.id as string, (p.email as string | null) ?? '—']));

  const grupos = grupos0.map((g) => aGrupo(g, miembros.get(g.id as string)?.size ?? 0));
  const porId = new Map(grupos.map((g) => [g.id, g]));
  const plazas: Record<string, CuentaSesion> = {};
  const multis: Record<string, ApuntadoMulti[]> = {};
  for (const [k] of cuentas) {
    const [classId, fecha] = k.split('|');
    plazas[k] = cuentaDe(cuentas, miembros, classId, fecha, porId.get(classId)?.horario.capacity ?? null);
  }
  for (const j of joinsRes.data ?? []) {
    const k = `${j.class_id}|${j.session_date}`;
    (multis[k] ??= []).push({ userId: j.user_id as string, email: correo.get(j.user_id as string) ?? '—' });
  }
  for (const k of Object.keys(multis)) multis[k].sort((a, b) => a.email.localeCompare(b.email));

  return {
    success: true as const,
    datos: {
      lunes,
      hoy: hoyAcademia(),
      grupos,
      profesores,
      sesiones: (sesionesRes.data ?? []).map(aSesion),
      plazas,
      multis,
      totalMultis: grupos.filter((g) => g.esMulti).reduce((n, g) => n + g.inscritos, 0),
    },
  };
}

/**
 * Pone lo que toca a un grupo un día (una celda del cuadrante): la crea o, si
 * el grupo ya tiene sesión ese día, cambia la primera. Quedan intactos la
 * descripción, las cargas y lo demás que la sesión tuviera del planificador.
 */
export async function saveCelda(params: {
  classId: string;
  fecha: string;
  celda: Record<string, unknown>;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const { classId, fecha, celda } = params ?? ({} as typeof params);
  if (!org || !esUuid(classId) || !esFecha(fecha)) return { success: false as const, error: 'Datos no válidos.' };
  const c = normalizaCelda(celda);
  if (!c.ok) return { success: false as const, error: c.error };

  const { data: grupo } = await supabaseAdmin.from('class_groups').select('id').eq('id', classId).eq('organization_id', org).maybeSingle();
  if (!grupo) return { success: false as const, error: 'Ese grupo no es de tu academia.' };
  if (c.valor.profesorId) {
    const { data: prof } = await supabaseAdmin.from('academy_staff').select('id').eq('id', c.valor.profesorId).eq('organization_id', org).maybeSingle();
    if (!prof) return { success: false as const, error: 'Ese profesor no es de tu academia.' };
  }

  const cambios = {
    kind: c.valor.tipo,
    title: c.valor.titulo,
    teacher_id: c.valor.profesorId,
    start_time: c.valor.horaPropia,
    updated_at: new Date().toISOString(),
  };
  const { data: previa, error: e0 } = await supabaseAdmin.from('training_sessions').select('id')
    .eq('organization_id', org).eq('class_id', classId).eq('session_date', fecha)
    .order('position').order('created_at').limit(1).maybeSingle();
  if (e0) return { success: false as const, error: e0.message };

  if (previa) {
    const { error } = await supabaseAdmin.from('training_sessions').update(cambios).eq('id', previa.id as string).eq('organization_id', org);
    if (error) return { success: false as const, error: error.message };
    return { success: true as const, id: previa.id as string };
  }
  const { data, error } = await supabaseAdmin.from('training_sessions')
    .insert({ ...cambios, organization_id: org, class_id: classId, session_date: fecha, position: 0, created_by: auth.user.id })
    .select('id').single();
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, id: data.id as string };
}

/**
 * Copia el cuadrante de una semana a otra: las sesiones de cada grupo, con su
 * profesor y su hora. Si el grupo ya tiene sesión ese día en la semana de
 * destino, no se toca (no se duplica ni se pisa).
 */
export async function copiarCuadrante(params: { desde: string; a: string }): Promise<
  { success: true; creadas: number; omitidas: number } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const { desde, a } = params ?? ({} as typeof params);
  if (!org || !esLunes(desde) || !esLunes(a) || desde === a) return { success: false as const, error: 'Datos no válidos.' };

  const { data: grupos } = await supabaseAdmin.from('class_groups').select('id').eq('organization_id', org).eq('kind', 'fisicas');
  const ids = (grupos ?? []).map((g) => g.id as string);
  if (!ids.length) return { success: false as const, error: 'No hay grupos de física.' };

  const [orig, dest] = await Promise.all([
    supabaseAdmin.from('training_sessions')
      .select('class_id, session_date, kind, title, description, duration_min, distance_km, video, loads, position, teacher_id, start_time')
      .eq('organization_id', org).in('class_id', ids).gte('session_date', desde).lte('session_date', sumaDias(desde, 6)),
    supabaseAdmin.from('training_sessions').select('class_id, session_date')
      .eq('organization_id', org).in('class_id', ids).gte('session_date', a).lte('session_date', sumaDias(a, 6)),
  ]);
  if (orig.error) return { success: false as const, error: orig.error.message };
  if (dest.error) return { success: false as const, error: dest.error.message };
  if (!(orig.data ?? []).length) return { success: false as const, error: 'Esa semana no tiene sesiones que copiar.' };

  const ocupadas = new Set((dest.data ?? []).map((s) => `${s.class_id}|${s.session_date}`));
  const dias = (f: string) => Math.round((Date.parse(`${f}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
  const nuevas = (orig.data ?? [])
    .map((s) => ({ ...s, nueva: sumaDias(a, dias(s.session_date as string)) }))
    .filter((s) => !ocupadas.has(`${s.class_id}|${s.nueva}`));
  const omitidas = (orig.data ?? []).length - nuevas.length;
  if (!nuevas.length) return { success: false as const, error: 'La semana de destino ya tiene todas esas sesiones.' };

  const { error } = await supabaseAdmin.from('training_sessions').insert(nuevas.map((s) => ({
    organization_id: org, class_id: s.class_id, session_date: s.nueva, kind: s.kind, title: s.title,
    description: s.description, duration_min: s.duration_min, distance_km: s.distance_km, video: s.video,
    loads: s.loads ?? null, position: s.position, teacher_id: s.teacher_id, start_time: s.start_time,
    created_by: auth.user.id,
  })));
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, creadas: nuevas.length, omitidas };
}

// ═════════════════════════════════════════════════════════════════════════
// EL ALUMNO MULTIDISCIPLINAR
// ═════════════════════════════════════════════════════════════════════════

export type SesionMulti = {
  classId: string;
  grupo: string;
  fecha: string;
  etiqueta: string;
  hora: string | null;
  titulo: string | null;
  profesor: string | null;
  /** Plazas libres de esa sesión; `null` si el grupo no tiene aforo puesto. */
  libres: number | null;
  /** Está apuntado. */
  unido: boolean;
  /** Todavía puede apuntarse o quitarse (la clase no ha empezado). */
  editable: boolean;
  /** No hay plaza y no está apuntado. */
  llena: boolean;
};

export type DiaMulti = { fecha: string; etiqueta: string; sesiones: SesionMulti[] };

export type SemanaGrupoMulti = {
  classId: string;
  grupo: string;
  lunes: string;
  /** Cuántas sesiones de ese grupo esa semana están a su alcance, y a cuántas va. */
  total: number;
  unidas: number;
};

/** ¿Es el alumno de un grupo multi de su academia? */
async function esMulti(userId: string, org: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('class_members')
    .select('class_id, class_groups!inner(organization_id, is_multi)')
    .eq('user_id', userId)
    .eq('class_groups.organization_id', org)
    .eq('class_groups.is_multi', true)
    .limit(1);
  return (data ?? []).length > 0;
}

/**
 * Las sesiones de las dos próximas semanas a las que puede apuntarse un multi,
 * con las plazas que quedan. Un alumno que no es multi recibe `esMulti: false`
 * y nada que pintar.
 */
export async function getMiMulti(): Promise<
  | { success: true; esMulti: false }
  | { success: true; esMulti: true; dias: DiaMulti[]; semanas: SemanaGrupoMulti[] }
  | { success: false; error: string }
> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const modulo = await requireModule('training');
  if (!modulo.ok) return { success: false as const, error: modulo.error };
  const org = auth.user.organizationId;
  if (!org || !(await esMulti(auth.user.id, org))) return { success: true as const, esMulti: false as const };
  const switches = await leeTrainingSwitches(org);
  if (!switches.group) return { success: true as const, esMulti: false as const };

  const ahora = ahoraEnZona(Date.now());
  const hasta = sumaDias(lunesDe(ahora.fecha), 13);
  const { data: filas, error } = await supabaseAdmin.from('class_groups').select(COLS_GRUPO)
    .eq('organization_id', org).eq('kind', 'fisicas').eq('is_multi', false).order('created_at').order('name');
  if (error) return { success: false as const, error: error.message };
  const grupos = (filas ?? []).filter((g) => (g.weekdays as number[] | null)?.length);
  const ids = grupos.map((g) => g.id as string);
  if (!ids.length) return { success: true as const, esMulti: true as const, dias: [], semanas: [] };

  const [{ cuentas, miembros }, sesionesRes, mias, profesores] = await Promise.all([
    cuentasDeSesiones(grupos.map((g) => ({ id: g.id as string })), ahora.fecha, hasta),
    supabaseAdmin.from('training_sessions').select(COLS_SESION).eq('organization_id', org).in('class_id', ids)
      .gte('session_date', ahora.fecha).lte('session_date', hasta),
    supabaseAdmin.from('class_session_joins').select('class_id, session_date').eq('user_id', auth.user.id).in('class_id', ids)
      .gte('session_date', ahora.fecha).lte('session_date', hasta),
    profesoresDe(org),
  ]);
  const unidas = new Set((mias.data ?? []).map((j) => `${j.class_id}|${j.session_date}`));
  const sesiones = (sesionesRes.data ?? []).map(aSesion);
  const nomProf = new Map(profesores.map((p) => [p.id, nombrePila(p.nombre)]));

  const porDia = new Map<string, SesionMulti[]>();
  const semanas = new Map<string, SemanaGrupoMulti>();
  for (const g of grupos) {
    const h: HorarioGrupo = horarioDeFila(g);
    const corto = nombreCorto(g.name as string);
    for (const fecha of proximasSesiones(h, ahora, 14)) {
      if (fecha > hasta) continue;
      const delDia = sesiones.filter((s) => s.classId === g.id && s.fecha === fecha).sort((x, y) => x.position - y.position)[0];
      const c = cuentaDe(cuentas, miembros, g.id as string, fecha, h.capacity);
      const unido = unidas.has(`${g.id}|${fecha}`);
      const editable = sePuedeAvisar(h, fecha, ahora);
      (porDia.get(fecha) ?? porDia.set(fecha, []).get(fecha)!).push({
        classId: g.id as string,
        grupo: corto,
        fecha,
        etiqueta: etiquetaFecha(fecha),
        hora: delDia?.horaPropia ?? h.startTime,
        titulo: delDia?.titulo ?? null,
        profesor: delDia?.profesorId ? nomProf.get(delDia.profesorId) ?? null : null,
        libres: c.libres,
        unido,
        editable,
        llena: !unido && !quedaPlaza(c),
      });
      if (editable) {
        const k = `${g.id}|${lunesDe(fecha)}`;
        const s = semanas.get(k) ?? { classId: g.id as string, grupo: corto, lunes: lunesDe(fecha), total: 0, unidas: 0 };
        s.total += 1;
        if (unido) s.unidas += 1;
        semanas.set(k, s);
      }
    }
  }

  const dias: DiaMulti[] = [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, ses]) => ({
      fecha,
      etiqueta: etiquetaFecha(fecha),
      sesiones: ses.sort((a, b) => (a.hora ?? '99').localeCompare(b.hora ?? '99') || a.grupo.localeCompare(b.grupo, 'es')),
    }));
  const sem = [...semanas.values()].sort((a, b) => a.lunes.localeCompare(b.lunes) || a.grupo.localeCompare(b.grupo, 'es'));
  return { success: true as const, esMulti: true as const, dias, semanas: sem };
}

/** Lo que comparten apuntarse a una sesión y a una semana: ¿es multi y existe ese grupo? */
async function grupoParaMulti(userId: string, org: string, classId: string): Promise<
  { ok: true; horario: HorarioGrupo } | { ok: false; error: string }
> {
  if (!esUuid(classId)) return { ok: false, error: 'Datos no válidos.' };
  if (!(await esMulti(userId, org))) return { ok: false, error: 'Esto es solo para el grupo Multi.' };
  const { data: grupo } = await supabaseAdmin.from('class_groups').select(COLS_GRUPO)
    .eq('id', classId).eq('organization_id', org).eq('kind', 'fisicas').eq('is_multi', false).maybeSingle();
  if (!grupo) return { ok: false, error: 'Ese grupo no existe.' };
  return { ok: true, horario: horarioDeFila(grupo) };
}

/** Se apunta (`unir: true`) o se quita (`false`) de la sesión de un grupo un día. */
export async function setMiUnion(params: { classId: string; fecha: string; unir: boolean }): Promise<
  { success: true } | { success: false; error: string }
> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const { classId, fecha, unir } = params ?? ({} as typeof params);
  if (!auth.user.organizationId || !esFecha(fecha)) return { success: false as const, error: 'Datos no válidos.' };
  const ctx = await grupoParaMulti(auth.user.id, auth.user.organizationId, classId);
  if (!ctx.ok) return { success: false as const, error: ctx.error };
  if (!sePuedeAvisar(ctx.horario, fecha, ahoraEnZona(Date.now()))) {
    return { success: false as const, error: 'Esa clase ya ha empezado o no es un día de clase de ese grupo.' };
  }

  if (!unir) {
    const { error } = await supabaseAdmin.from('class_session_joins').delete()
      .eq('class_id', classId).eq('user_id', auth.user.id).eq('session_date', fecha);
    return error ? { success: false as const, error: error.message } : { success: true as const };
  }
  const { cuentas, miembros } = await cuentasDeSesiones([{ id: classId }], fecha, fecha);
  if (!quedaPlaza(cuentaDe(cuentas, miembros, classId, fecha, ctx.horario.capacity))) {
    return { success: false as const, error: 'Esa sesión está completa.' };
  }
  const { error } = await supabaseAdmin.from('class_session_joins')
    .upsert({ class_id: classId, user_id: auth.user.id, session_date: fecha }, { onConflict: 'class_id,user_id,session_date', ignoreDuplicates: true });
  return error ? { success: false as const, error: error.message } : { success: true as const };
}

/**
 * «Esta semana voy con OMEGA»: se apunta a todas las sesiones de ese grupo de
 * la semana que aún no han empezado y tengan plaza (o se quita de todas).
 */
export async function setMiUnionSemana(params: { classId: string; lunes: string; unir: boolean }): Promise<
  { success: true; cambiadas: number; completas: number } | { success: false; error: string }
> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const { classId, lunes, unir } = params ?? ({} as typeof params);
  if (!auth.user.organizationId || !esLunes(lunes)) return { success: false as const, error: 'Datos no válidos.' };
  const ctx = await grupoParaMulti(auth.user.id, auth.user.organizationId, classId);
  if (!ctx.ok) return { success: false as const, error: ctx.error };

  const ahora = ahoraEnZona(Date.now());
  const fechas = (ctx.horario.weekdays ?? []).map((n) => sumaDias(lunes, n - 1)).filter((f) => sePuedeAvisar(ctx.horario, f, ahora));
  if (!fechas.length) return { success: false as const, error: 'Esa semana ya no tiene sesiones a las que apuntarse.' };

  if (!unir) {
    const { error } = await supabaseAdmin.from('class_session_joins').delete()
      .eq('class_id', classId).eq('user_id', auth.user.id).in('session_date', fechas);
    return error ? { success: false as const, error: error.message } : { success: true as const, cambiadas: fechas.length, completas: 0 };
  }

  const { cuentas, miembros } = await cuentasDeSesiones([{ id: classId }], fechas[0], fechas[fechas.length - 1]);
  const conPlaza = fechas.filter((f) => quedaPlaza(cuentaDe(cuentas, miembros, classId, f, ctx.horario.capacity)));
  if (conPlaza.length) {
    const { error } = await supabaseAdmin.from('class_session_joins').upsert(
      conPlaza.map((f) => ({ class_id: classId, user_id: auth.user.id, session_date: f })),
      { onConflict: 'class_id,user_id,session_date', ignoreDuplicates: true },
    );
    if (error) return { success: false as const, error: error.message };
  }
  return { success: true as const, cambiadas: conPlaza.length, completas: fechas.length - conPlaza.length };
}

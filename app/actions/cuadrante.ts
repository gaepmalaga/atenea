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
 * SOLO CLASES DE GRUPO (regla 97): entran los grupos con horario semanal y
 * los de Multi; un grupo sin horario no sale nunca. Un grupo (o el día entero)
 * se puede marcar «sin clase» en una fecha (`class_days_off`), sin tocar el
 * horario fijo: no sale en el cuadrante, el alumno lo ve como «sin clase» y un
 * multi no se puede apuntar.
 *
 * La lógica (rejilla, choques de profesor, plazas, texto) vive en
 * `app/lib/cuadrante.ts`, pura y con tests (regla 21).
 */

import { supabaseAdmin } from './core';
import { requireUser, requireAdmin } from '../lib/auth';
import { requireModule } from '../lib/module-guard';
import { leeTrainingSwitches } from '../lib/training-switch-guard';
import {
  ahoraEnZona, esFecha, sumaDias, horarioDeFila, proximasSesiones, sePuedeAvisar, etiquetaFecha, diaSemanaDe,
  type HorarioGrupo, type CuentaSesion,
} from '../lib/asistencia';
import { lunesDe } from '../lib/sesiones';
import { paginaCompleta } from '../lib/pagination';
import { agrupaHabituales, type ClaseHabitual } from '../lib/profesores';
import {
  nombreCorto, normalizaCelda, plazasSesion, quedaPlaza, nombrePila, tipoDeTitulo, titulosFrecuentes, normalizaMotivo,
  type GrupoCuadrante, type Profesor, type SesionCuadrante, type DiaSinClase,
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
type Asistencia = {
  cuentas: Cuentas;
  miembros: Map<string, Set<string>>;
  /** Por `classId|fecha`: quién de los propios ha avisado de que falta. */
  quienFalta: Map<string, string[]>;
  /** Por `classId|fecha`: los multis apuntados. */
  quienSeUne: Map<string, string[]>;
};
async function cuentasDeSesiones(grupos: { id: string }[], desde: string, hasta: string): Promise<Asistencia> {
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
  const quienFalta = new Map<string, string[]>();
  const quienSeUne = new Map<string, string[]>();
  const toca = (k: string, classId: string) => {
    const c = cuentas.get(k) ?? { inscritos: miembros.get(classId)?.size ?? 0, faltan: 0, multis: 0 };
    cuentas.set(k, c);
    return c;
  };
  // Solo cuenta la falta de quien SIGUE en el grupo (regla 82).
  for (const x of f.data ?? []) {
    if (!miembros.get(x.class_id as string)?.has(x.user_id as string)) continue;
    const k = `${x.class_id}|${x.session_date}`;
    toca(k, x.class_id as string).faltan += 1;
    quienFalta.set(k, [...(quienFalta.get(k) ?? []), x.user_id as string]);
  }
  for (const x of j.data ?? []) {
    const k = `${x.class_id}|${x.session_date}`;
    toca(k, x.class_id as string).multis += 1;
    quienSeUne.set(k, [...(quienSeUne.get(k) ?? []), x.user_id as string]);
  }
  return { cuentas, miembros, quienFalta, quienSeUne };
}

const cuentaDe = (cuentas: Cuentas, miembros: Map<string, Set<string>>, classId: string, fecha: string, aforo: number | null): CuentaSesion => {
  const c = cuentas.get(`${classId}|${fecha}`) ?? { inscritos: miembros.get(classId)?.size ?? 0, faltan: 0, multis: 0 };
  return plazasSesion(aforo, c.inscritos, c.faltan, c.multis);
};

/** Los días «sin clase» de unos grupos entre dos fechas (regla 97). */
async function diasSinClase(org: string, ids: string[], desde: string, hasta: string): Promise<DiaSinClase[]> {
  if (!ids.length) return [];
  const { data } = await supabaseAdmin.from('class_days_off').select('class_id, session_date, reason')
    .eq('organization_id', org).in('class_id', ids).gte('session_date', desde).lte('session_date', hasta);
  return (data ?? []).map((d) => ({ classId: d.class_id as string, fecha: d.session_date as string, motivo: (d.reason as string | null) ?? null }));
}

/** Los lunes de las semanas con el cuadrante publicado (regla 98) entre dos fechas. */
async function semanasPublicadas(org: string, desde: string, hasta: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin.from('class_week_publications').select('week_start')
    .eq('organization_id', org).gte('week_start', lunesDe(desde)).lte('week_start', hasta);
  return new Set((data ?? []).map((x) => x.week_start as string));
}

/**
 * Lo que el ALUMNO puede saber de los días sin clase: solo los de semanas
 * publicadas (regla 98). Un festivo en un borrador aún no existe para él.
 */
async function diasSinClasePublicados(org: string, ids: string[], desde: string, hasta: string): Promise<DiaSinClase[]> {
  const [dias, publicadas] = await Promise.all([diasSinClase(org, ids, desde, hasta), semanasPublicadas(org, desde, hasta)]);
  return dias.filter((d) => publicadas.has(lunesDe(d.fecha)));
}

/** ¿Es una fecha de clase del horario fijo del grupo? */
const esDiaDeClase = (h: HorarioGrupo, fecha: string) => esFecha(fecha) && !!h.weekdays?.includes(diaSemanaDe(fecha));

/** Solo las clases de grupo: grupos con horario semanal o de Multi (regla 97). */
const conHorarioOMulti = (g: Fila) => g.is_multi === true || ((g.weekdays as number[] | null)?.length ?? 0) > 0;

async function correosDe(ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)];
  if (!unicos.length) return new Map();
  const { data } = await supabaseAdmin.from('profiles').select('id, email').in('id', unicos);
  return new Map((data ?? []).map((p) => [p.id as string, (p.email as string | null) ?? '—']));
}

const esLunes = (f: unknown): f is string => esFecha(f) && lunesDe(f) === f;

// ═════════════════════════════════════════════════════════════════════════
// EL PREPARADOR
// ═════════════════════════════════════════════════════════════════════════

export type ApuntadoMulti = { userId: string; email: string };

export type DatosCuadrante = {
  lunes: string;
  hoy: string;
  /** Solo los grupos con horario semanal y los de Multi (regla 97). */
  grupos: GrupoCuadrante[];
  profesores: Profesor[];
  sesiones: SesionCuadrante[];
  /** Lo marcado «sin clase» esa semana. */
  sinClase: DiaSinClase[];
  /** Por `classId|fecha`: las plazas de esa sesión, con los multis dentro. */
  plazas: Record<string, CuentaSesion>;
  /** Por `classId|fecha`: los multis apuntados. */
  multis: Record<string, ApuntadoMulti[]>;
  /** Por `classId|fecha`: quién del grupo ha avisado de que falta. */
  faltan: Record<string, ApuntadoMulti[]>;
  /** Los alumnos de Multi, para que el preparador los apunte a una clase. */
  alumnosMulti: ApuntadoMulti[];
  /** Cuántos alumnos hay en el grupo Multi. */
  totalMultis: number;
  /** Los títulos que ya se han usado, del más repetido al menos: las sugerencias. */
  titulos: string[];
  /** Cuándo se publicó la semana para los alumnos (regla 98); `null` = sin publicar. */
  publicada: string | null;
  /** El profesor habitual de cada clase, en orden (regla 100): se propone al escribir el título. */
  habituales: ClaseHabitual[];
};

/** Hasta dónde se miran los títulos usados para sugerirlos. */
const DIAS_TITULOS = 120;

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
  // Un grupo sin horario (un plan común) no es una clase: no sale (regla 97).
  const grupos0 = (filas ?? []).filter(conHorarioOMulti);
  const ids = grupos0.map((g) => g.id as string);

  const [asistencia, profesores, sesionesRes, sinClase, titulosRes, publicacion, habitualesRes] = await Promise.all([
    cuentasDeSesiones(grupos0.map((g) => ({ id: g.id as string })), lunes, domingo),
    profesoresDe(org),
    ids.length
      ? supabaseAdmin.from('training_sessions').select(COLS_SESION).eq('organization_id', org).in('class_id', ids).gte('session_date', lunes).lte('session_date', domingo)
      : Promise.resolve({ data: [] as Fila[], error: null }),
    diasSinClase(org, ids, lunes, domingo),
    ids.length
      ? paginaCompleta<Fila>(async (desde, hasta) => supabaseAdmin.from('training_sessions').select('id, title')
          .eq('organization_id', org).in('class_id', ids).gte('session_date', sumaDias(lunes, -DIAS_TITULOS))
          .order('id').range(desde, hasta), { maxFilas: 5_000 })
      : Promise.resolve({ data: [] as Fila[], error: null }),
    supabaseAdmin.from('class_week_publications').select('published_at').eq('organization_id', org).eq('week_start', lunes).maybeSingle(),
    supabaseAdmin.from('staff_activities').select('activity, staff_id, priority').eq('organization_id', org),
  ]);
  if (sesionesRes.error) return { success: false as const, error: sesionesRes.error.message };
  const { cuentas, miembros, quienFalta, quienSeUne } = asistencia;

  const idsMulti = grupos0.filter((g) => g.is_multi === true).map((g) => g.id as string);
  const alumnosMultiIds = idsMulti.flatMap((id) => [...(miembros.get(id) ?? [])]);
  const correo = await correosDe([
    ...[...quienFalta.values()].flat(), ...[...quienSeUne.values()].flat(), ...alumnosMultiIds,
  ]);
  const apuntado = (userId: string): ApuntadoMulti => ({ userId, email: correo.get(userId) ?? '—' });
  const porCorreo = (a: ApuntadoMulti, b: ApuntadoMulti) => a.email.localeCompare(b.email);

  const grupos = grupos0.map((g) => aGrupo(g, miembros.get(g.id as string)?.size ?? 0));
  const porId = new Map(grupos.map((g) => [g.id, g]));
  const plazas: Record<string, CuentaSesion> = {};
  for (const [k] of cuentas) {
    const [classId, fecha] = k.split('|');
    plazas[k] = cuentaDe(cuentas, miembros, classId, fecha, porId.get(classId)?.horario.capacity ?? null);
  }
  const multis = Object.fromEntries([...quienSeUne].map(([k, us]) => [k, us.map(apuntado).sort(porCorreo)]));
  const faltan = Object.fromEntries([...quienFalta].map(([k, us]) => [k, us.map(apuntado).sort(porCorreo)]));

  return {
    success: true as const,
    datos: {
      lunes,
      hoy: hoyAcademia(),
      grupos,
      profesores,
      sesiones: (sesionesRes.data ?? []).map(aSesion),
      sinClase,
      plazas,
      multis,
      faltan,
      alumnosMulti: [...new Set(alumnosMultiIds)].map(apuntado).sort(porCorreo),
      totalMultis: grupos.filter((g) => g.esMulti).reduce((n, g) => n + g.inscritos, 0),
      titulos: titulosFrecuentes((titulosRes.data ?? []).map((t) => t.title as string)),
      publicada: (publicacion.data?.published_at as string | undefined) ?? null,
      // Si falla, el cuadrante sigue: solo no se propone profesor.
      habituales: agrupaHabituales((habitualesRes.data ?? []).map((r) => ({
        actividad: r.activity as string, profesorId: r.staff_id as string, prioridad: Number(r.priority),
      }))),
    },
  };
}

/**
 * Publica (o retira) el cuadrante de una semana para los alumnos (regla 98).
 * Sin publicar, el alumno ve solo el horario de su grupo; publicada, qué toca,
 * el profesor y los días sin clase. Lo que se cambie después se ve al momento.
 */
export async function publicarCuadrante(params: { lunes: string; publicar: boolean }): Promise<
  { success: true; publicada: string | null } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const { lunes, publicar } = params ?? ({} as typeof params);
  if (!org || !esLunes(lunes)) return { success: false as const, error: 'Datos no válidos.' };

  if (!publicar) {
    const { error } = await supabaseAdmin.from('class_week_publications').delete().eq('organization_id', org).eq('week_start', lunes);
    return error ? { success: false as const, error: error.message } : { success: true as const, publicada: null };
  }
  const { data, error } = await supabaseAdmin.from('class_week_publications')
    .upsert({ organization_id: org, week_start: lunes, published_at: new Date().toISOString(), published_by: auth.user.id }, { onConflict: 'organization_id,week_start' })
    .select('published_at').single();
  return error ? { success: false as const, error: error.message } : { success: true as const, publicada: data.published_at as string };
}

/**
 * Lo común a poner una celda y a copiarla: la primera sesión del grupo ese día
 * se cambia, o se crea si no hay. Quedan intactos la descripción, las cargas y
 * lo demás que la sesión tuviera del planificador.
 *
 * El TIPO (el color en el calendario del alumno) sale del título (regla 97);
 * si el título no cambia, se respeta el que ya tenía, que pudo ponerse a mano
 * en el detalle de la sesión.
 */
async function ponCelda(org: string, autor: string, classId: string, fecha: string, valor: {
  titulo: string; profesorId: string | null; horaPropia: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data: previa, error: e0 } = await supabaseAdmin.from('training_sessions').select('id, title, kind')
    .eq('organization_id', org).eq('class_id', classId).eq('session_date', fecha)
    .order('position').order('created_at').limit(1).maybeSingle();
  if (e0) return { ok: false, error: e0.message };

  const cambios = {
    kind: previa && previa.title === valor.titulo ? (previa.kind as string) : tipoDeTitulo(valor.titulo),
    title: valor.titulo,
    teacher_id: valor.profesorId,
    start_time: valor.horaPropia,
    updated_at: new Date().toISOString(),
  };
  if (previa) {
    const { error } = await supabaseAdmin.from('training_sessions').update(cambios).eq('id', previa.id as string).eq('organization_id', org);
    return error ? { ok: false, error: error.message } : { ok: true, id: previa.id as string };
  }
  const { data, error } = await supabaseAdmin.from('training_sessions')
    .insert({ ...cambios, organization_id: org, class_id: classId, session_date: fecha, position: 0, created_by: autor })
    .select('id').single();
  return error ? { ok: false, error: error.message } : { ok: true, id: data.id as string };
}

/** Pone lo que toca a un grupo un día (una celda del cuadrante): la crea o cambia la primera. */
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
  const r = await ponCelda(org, auth.user.id, classId, fecha, c.valor);
  return r.ok ? { success: true as const, id: r.id } : { success: false as const, error: r.error };
}

/**
 * Copia una celda a otras: a otro día del mismo grupo o a otro grupo
 * (regla 97). Lo que haya en la celda de destino se cambia, como al
 * escribirla; la descripción y las cargas de la de destino no se tocan. La
 * hora propia solo viaja dentro del mismo grupo: la de Multi (18:30) no es la
 * de Kappa.
 */
export async function copiarCelda(params: {
  origenId: string;
  destinos: { classId: string; fecha: string }[];
  conProfesor: boolean;
}): Promise<{ success: true; copiadas: number } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const { origenId, destinos, conProfesor } = params ?? ({} as typeof params);
  if (!org || !esUuid(origenId) || !Array.isArray(destinos) || !destinos.length || destinos.length > 40) {
    return { success: false as const, error: 'Datos no válidos.' };
  }
  if (!destinos.every((d) => d && esUuid(d.classId) && esFecha(d.fecha))) return { success: false as const, error: 'Datos no válidos.' };

  const { data: o } = await supabaseAdmin.from('training_sessions').select('id, class_id, session_date, title, teacher_id, start_time')
    .eq('id', origenId).eq('organization_id', org).not('class_id', 'is', null).maybeSingle();
  if (!o) return { success: false as const, error: 'No se ha encontrado la celda que copiar.' };
  const idsGrupo = [...new Set(destinos.map((d) => d.classId))];
  const { data: grupos } = await supabaseAdmin.from('class_groups').select('id').eq('organization_id', org).in('id', idsGrupo);
  if ((grupos ?? []).length !== idsGrupo.length) return { success: false as const, error: 'Algún grupo no es de tu academia.' };

  let copiadas = 0;
  for (const d of destinos) {
    if (d.classId === o.class_id && d.fecha === o.session_date) continue;
    const r = await ponCelda(org, auth.user.id, d.classId, d.fecha, {
      titulo: o.title as string,
      profesorId: conProfesor ? (o.teacher_id as string | null) ?? null : null,
      horaPropia: d.classId === o.class_id ? (typeof o.start_time === 'string' ? o.start_time.slice(0, 5) : null) : null,
    });
    if (!r.ok) return { success: false as const, error: r.error };
    copiadas += 1;
  }
  return { success: true as const, copiadas };
}

/**
 * Marca (o devuelve) «sin clase» a unos grupos en una fecha: festivo, no hay
 * profesor… (regla 97). El horario fijo del grupo no se toca, y las sesiones
 * que tuviera ese día tampoco: se esconden, y vuelven al devolver el día.
 */
export async function setSinClase(params: {
  fecha: string;
  classIds: string[];
  sinClase: boolean;
  motivo?: string | null;
}): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const { fecha, classIds, sinClase } = params ?? ({} as typeof params);
  if (!org || !esFecha(fecha) || !Array.isArray(classIds) || !classIds.length || classIds.length > 30 || !classIds.every(esUuid)) {
    return { success: false as const, error: 'Datos no válidos.' };
  }
  const ids = [...new Set(classIds)];
  const { data: grupos } = await supabaseAdmin.from('class_groups').select('id').eq('organization_id', org).in('id', ids);
  if ((grupos ?? []).length !== ids.length) return { success: false as const, error: 'Algún grupo no es de tu academia.' };

  if (!sinClase) {
    const { error } = await supabaseAdmin.from('class_days_off').delete()
      .eq('organization_id', org).eq('session_date', fecha).in('class_id', ids);
    return error ? { success: false as const, error: error.message } : { success: true as const };
  }
  const motivo = normalizaMotivo(params.motivo);
  const { error } = await supabaseAdmin.from('class_days_off').upsert(
    ids.map((id) => ({ class_id: id, session_date: fecha, organization_id: org, reason: motivo, created_by: auth.user.id })),
    { onConflict: 'class_id,session_date' },
  );
  return error ? { success: false as const, error: error.message } : { success: true as const };
}

/**
 * Quita un día SUELTO del cuadrante (uno que no es de ningún horario fijo,
 * como una sesión de Multi en sábado): borra esas sesiones de grupo. Se pide
 * confirmación en la pantalla, porque se pierde también lo que hayan apuntado
 * los alumnos.
 */
export async function borrarSesionesDia(params: { fecha: string; ids: string[] }): Promise<
  { success: true; borradas: number } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const { fecha, ids } = params ?? ({} as typeof params);
  if (!org || !esFecha(fecha) || !Array.isArray(ids) || !ids.length || ids.length > 30 || !ids.every(esUuid)) {
    return { success: false as const, error: 'Datos no válidos.' };
  }
  const { data, error } = await supabaseAdmin.from('training_sessions').delete()
    .eq('organization_id', org).eq('session_date', fecha).in('id', ids).not('class_id', 'is', null).select('id');
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, borradas: (data ?? []).length };
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

  const { data: grupos } = await supabaseAdmin.from('class_groups').select('id, weekdays, is_multi').eq('organization_id', org).eq('kind', 'fisicas');
  const ids = (grupos ?? []).filter(conHorarioOMulti).map((g) => g.id as string);
  if (!ids.length) return { success: false as const, error: 'No hay grupos de física con horario.' };
  // Lo de un día quitado (festivo) no estaba en el cuadrante: no se copia.
  const quitados = new Set((await diasSinClase(org, ids, desde, sumaDias(desde, 6))).map((d) => `${d.classId}|${d.fecha}`));

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
  const copiables = (orig.data ?? [])
    .filter((s) => !quitados.has(`${s.class_id}|${s.session_date}`))
    .map((s) => ({ ...s, nueva: sumaDias(a, dias(s.session_date as string)) }));
  if (!copiables.length) return { success: false as const, error: 'Esa semana no tiene sesiones que copiar.' };
  const nuevas = copiables.filter((s) => !ocupadas.has(`${s.class_id}|${s.nueva}`));
  const omitidas = copiables.length - nuevas.length;
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
// LOS PROFESORES (regla 99)
// ═════════════════════════════════════════════════════════════════════════

export type ClaseProfesor = { fecha: string; grupo: string; titulo: string; hora: string | null };
export type AgendaProfesor = {
  profesorId: string;
  /** Los grupos que lleva (asignados en «Grupos»), de teoría o de física. */
  grupos: { id: string; nombre: string; tipo: string }[];
  /** Sus clases de física de la semana, del cuadrante (sin los días quitados). */
  clases: ClaseProfesor[];
};

/** Qué lleva cada profesor: sus grupos y sus clases de física de una semana. */
export async function getAgendaProfesores(params: { lunes: string }): Promise<
  { success: true; lunes: string; agenda: AgendaProfesor[] } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const lunes = params?.lunes;
  if (!org) return { success: false as const, error: 'No hay una academia seleccionada.' };
  if (!esLunes(lunes)) return { success: false as const, error: 'Datos no válidos.' };
  const domingo = sumaDias(lunes, 6);

  const [staffRes, gruposRes, kindsRes, sesRes] = await Promise.all([
    supabaseAdmin.from('academy_staff').select('id').eq('organization_id', org),
    supabaseAdmin.from('class_groups').select(COLS_GRUPO + ', kind').eq('organization_id', org).order('created_at'),
    supabaseAdmin.from('group_kinds').select('id, label').eq('organization_id', org),
    supabaseAdmin.from('training_sessions').select('class_id, session_date, title, teacher_id, start_time')
      .eq('organization_id', org).not('teacher_id', 'is', null).not('class_id', 'is', null)
      .gte('session_date', lunes).lte('session_date', domingo).order('session_date'),
  ]);
  if (staffRes.error) return { success: false as const, error: staffRes.error.message };
  if (gruposRes.error) return { success: false as const, error: gruposRes.error.message };
  if (sesRes.error) return { success: false as const, error: sesRes.error.message };

  const grupos = (gruposRes.data ?? []) as unknown as Fila[];
  const ids = grupos.map((g) => g.id as string);
  const [asignados, quitados] = await Promise.all([
    ids.length ? supabaseAdmin.from('class_group_staff').select('class_id, staff_id').in('class_id', ids) : Promise.resolve({ data: [] as Fila[] }),
    diasSinClase(org, ids, lunes, domingo),
  ]);
  const off = new Set(quitados.map((d) => `${d.classId}|${d.fecha}`));
  const porId = new Map(grupos.map((g) => [g.id as string, g]));
  const tipo = new Map((kindsRes.data ?? []).map((k) => [k.id as string, k.label as string]));

  const agenda: AgendaProfesor[] = (staffRes.data ?? []).map((p) => {
    const id = p.id as string;
    return {
      profesorId: id,
      grupos: (asignados.data ?? []).filter((a) => a.staff_id === id).flatMap((a) => {
        const g = porId.get(a.class_id as string);
        return g ? [{ id: g.id as string, nombre: g.name as string, tipo: tipo.get(g.kind as string) ?? (g.kind as string) }] : [];
      }),
      clases: (sesRes.data ?? [])
        .filter((x) => x.teacher_id === id && porId.has(x.class_id as string) && conHorarioOMulti(porId.get(x.class_id as string)!)
          && !off.has(`${x.class_id}|${x.session_date}`))
        .map((x) => {
          const g = porId.get(x.class_id as string)!;
          const propia = typeof x.start_time === 'string' ? x.start_time.slice(0, 5) : null;
          return {
            fecha: x.session_date as string,
            grupo: nombreCorto(g.name as string),
            titulo: x.title as string,
            hora: propia ?? horarioDeFila(g).startTime,
          };
        })
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora ?? '99').localeCompare(b.hora ?? '99')),
    };
  });
  return { success: true as const, lunes, agenda };
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

  const [{ cuentas, miembros }, sesionesRes, mias, profesores, sinClase, publicadas] = await Promise.all([
    cuentasDeSesiones(grupos.map((g) => ({ id: g.id as string })), ahora.fecha, hasta),
    supabaseAdmin.from('training_sessions').select(COLS_SESION).eq('organization_id', org).in('class_id', ids)
      .gte('session_date', ahora.fecha).lte('session_date', hasta),
    supabaseAdmin.from('class_session_joins').select('class_id, session_date').eq('user_id', auth.user.id).in('class_id', ids)
      .gte('session_date', ahora.fecha).lte('session_date', hasta),
    profesoresDe(org),
    diasSinClasePublicados(org, ids, ahora.fecha, hasta),
    semanasPublicadas(org, ahora.fecha, hasta),
  ]);
  const unidas = new Set((mias.data ?? []).map((j) => `${j.class_id}|${j.session_date}`));
  // Un día quitado (festivo, sin profesor) no tiene clase a la que apuntarse (regla 97).
  const quitados = new Set(sinClase.map((d) => `${d.classId}|${d.fecha}`));
  const sesiones = (sesionesRes.data ?? []).map(aSesion);
  const nomProf = new Map(profesores.map((p) => [p.id, nombrePila(p.nombre)]));

  const porDia = new Map<string, SesionMulti[]>();
  const semanas = new Map<string, SemanaGrupoMulti>();
  for (const g of grupos) {
    const h: HorarioGrupo = horarioDeFila(g);
    const corto = nombreCorto(g.name as string);
    for (const fecha of proximasSesiones(h, ahora, 14)) {
      if (fecha > hasta || quitados.has(`${g.id}|${fecha}`)) continue;
      // De una semana sin publicar, solo el horario (regla 98).
      const delDia = publicadas.has(lunesDe(fecha))
        ? sesiones.filter((s) => s.classId === g.id && s.fecha === fecha).sort((x, y) => x.position - y.position)[0]
        : undefined;
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
  if ((await diasSinClasePublicados(auth.user.organizationId, [classId], fecha, fecha)).length) {
    return { success: false as const, error: 'Ese día ese grupo no tiene clase.' };
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

  const quitados = new Set((await diasSinClasePublicados(auth.user.organizationId, [classId], fechas[0], fechas[fechas.length - 1])).map((d) => d.fecha));
  const { cuentas, miembros } = await cuentasDeSesiones([{ id: classId }], fechas[0], fechas[fechas.length - 1]);
  const conPlaza = fechas.filter((f) => !quitados.has(f) && quedaPlaza(cuentaDe(cuentas, miembros, classId, f, ctx.horario.capacity)));
  if (conPlaza.length) {
    const { error } = await supabaseAdmin.from('class_session_joins').upsert(
      conPlaza.map((f) => ({ class_id: classId, user_id: auth.user.id, session_date: f })),
      { onConflict: 'class_id,user_id,session_date', ignoreDuplicates: true },
    );
    if (error) return { success: false as const, error: error.message };
  }
  return { success: true as const, cambiadas: conPlaza.length, completas: fechas.filter((f) => !quitados.has(f)).length - conPlaza.length };
}

// ═════════════════════════════════════════════════════════════════════════
// EL PREPARADOR Y LOS MULTIS (regla 97)
// ═════════════════════════════════════════════════════════════════════════

/** La clase de un grupo (no Multi) de la academia, si esa fecha es día de clase y no está quitada. */
async function claseParaMulti(org: string, classId: string, fecha: string): Promise<
  { ok: true; horario: HorarioGrupo } | { ok: false; error: string }
> {
  if (!esUuid(classId) || !esFecha(fecha)) return { ok: false, error: 'Datos no válidos.' };
  const { data: grupo } = await supabaseAdmin.from('class_groups').select(COLS_GRUPO)
    .eq('id', classId).eq('organization_id', org).eq('kind', 'fisicas').eq('is_multi', false).maybeSingle();
  if (!grupo) return { ok: false, error: 'Ese grupo no es de tu academia.' };
  const horario = horarioDeFila(grupo);
  if (!esDiaDeClase(horario, fecha)) return { ok: false, error: 'Ese día no es de clase de ese grupo.' };
  if ((await diasSinClase(org, [classId], fecha, fecha)).length) return { ok: false, error: 'Ese día ese grupo no tiene clase.' };
  return { ok: true, horario };
}

type ResultadoMulti = { success: true } | { success: false; error: string; completa?: boolean };

/**
 * Apunta a un multi a una clase (lo hacía solo él). El preparador puede
 * hacerlo también con la clase empezada o ya pasada, para dejar bien la
 * asistencia; lo que no hace sin preguntar es pasarse del aforo: sin `forzar`,
 * una clase completa devuelve `completa` y la pantalla le pregunta.
 */
async function uneMulti(org: string, alumnoId: string, classId: string, fecha: string, forzar: boolean): Promise<ResultadoMulti> {
  const c = await claseParaMulti(org, classId, fecha);
  if (!c.ok) return { success: false, error: c.error };
  if (!forzar) {
    const { cuentas, miembros, quienSeUne } = await cuentasDeSesiones([{ id: classId }], fecha, fecha);
    const yaVa = (quienSeUne.get(`${classId}|${fecha}`) ?? []).includes(alumnoId);
    if (!yaVa && !quedaPlaza(cuentaDe(cuentas, miembros, classId, fecha, c.horario.capacity))) {
      return { success: false, error: 'Esa clase está completa.', completa: true };
    }
  }
  const { error } = await supabaseAdmin.from('class_session_joins')
    .upsert({ class_id: classId, user_id: alumnoId, session_date: fecha }, { onConflict: 'class_id,user_id,session_date', ignoreDuplicates: true });
  return error ? { success: false, error: error.message } : { success: true };
}

/** El preparador apunta (`unir`) o quita a un alumno de Multi de la clase de un grupo. */
export async function setMultiEnClase(params: {
  alumnoId: string;
  classId: string;
  fecha: string;
  unir: boolean;
  forzar?: boolean;
}): Promise<ResultadoMulti> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const { alumnoId, classId, fecha, unir } = params ?? ({} as typeof params);
  if (!org || !esUuid(alumnoId) || !esUuid(classId) || !esFecha(fecha)) return { success: false as const, error: 'Datos no válidos.' };
  if (!(await esMulti(alumnoId, org))) return { success: false as const, error: 'Ese alumno no es de Multi.' };

  if (!unir) {
    const { data: grupo } = await supabaseAdmin.from('class_groups').select('id').eq('id', classId).eq('organization_id', org).maybeSingle();
    if (!grupo) return { success: false as const, error: 'Ese grupo no es de tu academia.' };
    const { error } = await supabaseAdmin.from('class_session_joins').delete()
      .eq('class_id', classId).eq('user_id', alumnoId).eq('session_date', fecha);
    return error ? { success: false as const, error: error.message } : { success: true as const };
  }
  return uneMulti(org, alumnoId, classId, fecha, params.forzar === true);
}

/** Cambia a un multi de una clase a otra (de Omega el martes a Delta el jueves, por ejemplo). */
export async function moverMulti(params: {
  alumnoId: string;
  de: { classId: string; fecha: string };
  a: { classId: string; fecha: string };
  forzar?: boolean;
}): Promise<ResultadoMulti> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const { alumnoId, de, a } = params ?? ({} as typeof params);
  if (!org || !esUuid(alumnoId) || !de || !a || !esUuid(de.classId) || !esFecha(de.fecha)) return { success: false as const, error: 'Datos no válidos.' };
  if (de.classId === a?.classId && de.fecha === a?.fecha) return { success: true as const };
  if (!(await esMulti(alumnoId, org))) return { success: false as const, error: 'Ese alumno no es de Multi.' };
  const { data: origen } = await supabaseAdmin.from('class_groups').select('id').eq('id', de.classId).eq('organization_id', org).maybeSingle();
  if (!origen) return { success: false as const, error: 'Ese grupo no es de tu academia.' };

  // Primero se le apunta a la nueva: si no cabe, no se queda sin ninguna.
  const r = await uneMulti(org, alumnoId, a.classId, a.fecha, params.forzar === true);
  if (!r.success) return r;
  const { error } = await supabaseAdmin.from('class_session_joins').delete()
    .eq('class_id', de.classId).eq('user_id', alumnoId).eq('session_date', de.fecha);
  return error ? { success: false as const, error: error.message } : { success: true as const };
}

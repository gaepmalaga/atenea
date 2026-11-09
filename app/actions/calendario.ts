'use server'

import { supabaseAdmin } from './core';
import { requireAdmin } from '../lib/auth';
import { paginaCompleta } from '../lib/pagination';
import { horarioDeFila, esFecha, ahoraEnZona, sumaDias } from '../lib/asistencia';
import { armaCalendario, colorDe, type EventoCalendario, type GrupoCal, type SesionCal } from '../lib/calendario';

/**
 * EL CALENDARIO DE LA ACADEMIA (regla 105): todo lo que tiene fecha entre dos
 * días, para el panel. No guarda nada: lee el horario de los grupos, el
 * cuadrante de física, los entrenos de cada alumno, los días sin clase, las
 * faltas avisadas, los multis y el examen, y lo arma `armaCalendario`.
 *
 * Con la clave de servicio, detrás de `requireAdmin`, y todo acotado a la
 * academia DENTRO de cada consulta (reglas 34, 65 y 75): lo que no lleva
 * `organization_id` se pide por los grupos de la academia. Paginado: un mes
 * de entrenos de cien alumnos pasa de las 1.000 filas (regla 74).
 */

/** Lo que más abarca una petición: un mes en semanas enteras son 42 días. */
const MAX_DIAS = 62;

export type DatosCalendario = {
  desde: string;
  hasta: string;
  /** Hoy en la hora de la academia. */
  hoy: string;
  eventos: EventoCalendario[];
  grupos: { id: string; nombre: string; kind: string; color: { fondo: string; texto: string }; esMulti: boolean }[];
  tipos: { id: string; label: string }[];
  profesores: { id: string; nombre: string }[];
};

type Fila = Record<string, unknown>;

export async function getCalendario(params: { desde: string; hasta: string }): Promise<
  { success: true; datos: DatosCalendario } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: 'No hay una academia seleccionada.' };
  const desde = params?.desde;
  const hasta = params?.hasta;
  if (!esFecha(desde) || !esFecha(hasta) || hasta < desde || sumaDias(desde, MAX_DIAS) < hasta) {
    return { success: false as const, error: 'Fechas no válidas.' };
  }

  const [gruposRes, kindsRes, staffRes, sinClaseRes, convRes] = await Promise.all([
    supabaseAdmin.from('class_groups').select('id, name, kind, weekdays, start_time, end_time, capacity, is_multi').eq('organization_id', org).order('name'),
    supabaseAdmin.from('group_kinds').select('id, label, lleva_plan, sort_order').eq('organization_id', org).order('sort_order'),
    supabaseAdmin.from('academy_staff').select('id, name, active').eq('organization_id', org).order('name'),
    supabaseAdmin.from('class_days_off').select('class_id, session_date, reason').eq('organization_id', org).gte('session_date', desde).lte('session_date', hasta),
    supabaseAdmin.from('academy_convocatoria').select('fecha_examen').eq('organization_id', org).maybeSingle(),
  ]);
  const error = gruposRes.error ?? kindsRes.error ?? staffRes.error ?? sinClaseRes.error ?? convRes.error;
  if (error) {
    console.error('getCalendario:', error.message);
    return { success: false as const, error: error.message };
  }

  const filas = (gruposRes.data ?? []) as Fila[];
  const ids = filas.map((g) => g.id as string);
  const kinds = (kindsRes.data ?? []) as Fila[];
  const kind = new Map(kinds.map((k) => [k.id as string, k]));

  const [staffGrupo, miembros, faltas, multis, sesiones] = await Promise.all([
    ids.length ? supabaseAdmin.from('class_group_staff').select('class_id, staff_id').in('class_id', ids) : Promise.resolve({ data: [] as Fila[], error: null }),
    ids.length
      ? paginaCompleta<Fila>(async (d, h) => await supabaseAdmin.from('class_members').select('class_id, user_id').in('class_id', ids).order('class_id').order('user_id').range(d, h))
      : Promise.resolve({ data: [] as Fila[], error: null }),
    ids.length
      ? paginaCompleta<Fila>(async (d, h) => await supabaseAdmin.from('class_absences').select('class_id, user_id, session_date').in('class_id', ids)
          .gte('session_date', desde).lte('session_date', hasta).order('class_id').order('user_id').order('session_date').range(d, h))
      : Promise.resolve({ data: [] as Fila[], error: null }),
    ids.length
      ? paginaCompleta<Fila>(async (d, h) => await supabaseAdmin.from('class_session_joins').select('class_id, user_id, session_date').in('class_id', ids)
          .gte('session_date', desde).lte('session_date', hasta).order('class_id').order('user_id').order('session_date').range(d, h))
      : Promise.resolve({ data: [] as Fila[], error: null }),
    paginaCompleta<Fila>(async (d, h) => await supabaseAdmin.from('training_sessions')
      .select('id, class_id, user_id, session_date, start_time, title, teacher_id, duration_min')
      .eq('organization_id', org).gte('session_date', desde).lte('session_date', hasta).order('id').range(d, h)),
  ]);
  const error2 = staffGrupo.error ? (staffGrupo.error as { message: string }).message : miembros.error ?? faltas.error ?? multis.error ?? sesiones.error;
  if (error2) {
    console.error('getCalendario:', error2);
    return { success: false as const, error: String(error2) };
  }

  // Los alumnos de los entrenos, por su correo; solo los que salen.
  const idsAlumnos = [...new Set(sesiones.data.filter((s) => s.user_id && !s.class_id).map((s) => s.user_id as string))];
  const perfiles = idsAlumnos.length
    ? await paginaCompleta<Fila>(async (d, h) => await supabaseAdmin.from('profiles').select('id, email').in('id', idsAlumnos).order('id').range(d, h))
    : { data: [] as Fila[], error: null };

  const staffDe = new Map<string, string[]>();
  for (const s of (staffGrupo.data ?? []) as Fila[]) staffDe.set(s.class_id as string, [...(staffDe.get(s.class_id as string) ?? []), s.staff_id as string]);
  const inscritosDe = new Map<string, Set<string>>();
  for (const m of miembros.data) {
    const set = inscritosDe.get(m.class_id as string) ?? new Set<string>();
    set.add(m.user_id as string);
    inscritosDe.set(m.class_id as string, set);
  }
  const cuentas = new Map<string, { inscritos: number; faltan: number; multis: number }>();
  const toca = (classId: string, fecha: string) => {
    const k = `${classId}|${fecha}`;
    const c = cuentas.get(k) ?? { inscritos: inscritosDe.get(classId)?.size ?? 0, faltan: 0, multis: 0 };
    cuentas.set(k, c);
    return c;
  };
  // Solo cuenta la falta de quien SIGUE en el grupo (regla 82).
  for (const f of faltas.data) if (inscritosDe.get(f.class_id as string)?.has(f.user_id as string)) toca(f.class_id as string, f.session_date as string).faltan++;
  for (const j of multis.data) toca(j.class_id as string, j.session_date as string).multis++;

  const grupos: GrupoCal[] = filas.map((g) => {
    const k = kind.get(g.kind as string);
    return {
      id: g.id as string,
      nombre: g.name as string,
      kind: g.kind as string,
      kindLabel: (k?.label as string | undefined) ?? (g.kind as string),
      llevaPlan: k?.lleva_plan === true,
      esMulti: g.is_multi === true,
      horario: horarioDeFila(g),
      profesorIds: staffDe.get(g.id as string) ?? [],
    };
  });
  const staff = (staffRes.data ?? []) as Fila[];

  const eventos = armaCalendario({
    desde,
    hasta,
    grupos,
    sesiones: sesiones.data.map((s): SesionCal => ({
      id: s.id as string,
      classId: (s.class_id as string | null) ?? null,
      userId: (s.user_id as string | null) ?? null,
      fecha: s.session_date as string,
      inicio: (s.start_time as string | null) ?? null,
      titulo: (s.title as string | null) ?? '',
      profesorId: (s.teacher_id as string | null) ?? null,
      duracionMin: typeof s.duration_min === 'number' ? s.duration_min : null,
    })),
    sinClase: ((sinClaseRes.data ?? []) as Fila[]).map((d) => ({ classId: d.class_id as string, fecha: d.session_date as string, motivo: (d.reason as string | null) ?? null })),
    profesores: new Map(staff.map((s) => [s.id as string, s.name as string])),
    alumnos: new Map(perfiles.data.map((p) => [p.id as string, (p.email as string) ?? ''])),
    cuentas,
    inscritos: new Map([...inscritosDe].map(([k, v]) => [k, v.size])),
    examen: (convRes.data?.fecha_examen as string | null | undefined) ?? null,
  });

  return {
    success: true as const,
    datos: {
      desde,
      hasta,
      hoy: ahoraEnZona(Date.now()).fecha,
      eventos,
      grupos: grupos.map((g) => ({ id: g.id, nombre: g.nombre, kind: g.kind, color: colorDe(g), esMulti: g.esMulti })),
      tipos: kinds.map((k) => ({ id: k.id as string, label: k.label as string })),
      profesores: staff.filter((s) => s.active !== false).map((s) => ({ id: s.id as string, nombre: s.name as string })),
    },
  };
}

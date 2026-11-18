'use server';

/**
 * EL CUADRANTE DE TEORÍA (regla 131).
 *
 * Cada clase que el horario de un grupo de teoría pone en un día sale vacía;
 * quien lleva la academia apunta UN profesor y los temas de esa clase, con
 * antelación o después, y lo cambia cuando quiere. Se guarda en
 * `theory_sessions` (`docs/sql/teoria-cuadrante.sql`): una fila por grupo y
 * fecha, con RLS y CERO políticas, así que solo la clave de servicio — y cada
 * acción acota por academia dentro de la consulta (reglas 34 y 65).
 *
 * Los días «sin clase» son los de siempre (`class_days_off`): no salen aquí.
 * La lógica vive en `app/lib/teoria.ts` (regla 21).
 */

import { supabaseAdmin } from './core';
import { requireAdmin } from '../lib/auth';
import { daClase } from '../lib/personal';
import { ahoraEnZona, esFecha, sumaDias, diaSemanaDe } from '../lib/asistencia';
import { lunesDe } from '../lib/sesiones';
import { paginaCompleta, type ResultadoPagina } from '../lib/pagination';
import { fallo } from '../lib/fallos';
import {
  clasesDeTeoria, normalizaTemas, normalizaNotaTeoria,
  type GrupoTeoria, type AsignacionTeoria, type ClaseTeoria,
} from '../lib/teoria';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
type Fila = Record<string, unknown>;

const aGrupo = (g: Fila): GrupoTeoria => ({
  id: g.id as string,
  nombre: g.name as string,
  weekdays: ((g.weekdays as number[] | null) ?? []).map(Number),
  inicio: typeof g.start_time === 'string' ? g.start_time.slice(0, 5) : null,
  fin: typeof g.end_time === 'string' ? g.end_time.slice(0, 5) : null,
});

const aAsignacion = (r: Fila): AsignacionTeoria => ({
  classId: r.class_id as string,
  fecha: r.session_date as string,
  profesorId: (r.teacher_id as string | null) ?? null,
  temas: normalizaTemas(r.topics),
  nota: (r.note as string | null) ?? null,
});

/** Los grupos de teoría de la academia con días de clase (los que salen en el cuadrante). */
async function gruposDeTeoria(org: string): Promise<{ data: GrupoTeoria[]; error: string | null }> {
  const { data, error } = await supabaseAdmin.from('class_groups')
    .select('id, name, weekdays, start_time, end_time, is_multi')
    .eq('organization_id', org).eq('kind', 'teoria').eq('is_multi', false).order('start_time').order('name');
  if (error) return { data: [], error: fallo('gruposDeTeoria', error) };
  return { data: (data ?? []).map(aGrupo).filter((g) => g.weekdays.length > 0), error: null };
}

export type DatosTeoria = {
  lunes: string;
  hoy: string;
  grupos: GrupoTeoria[];
  profesores: { id: string; nombre: string }[];
  /** Las clases de la semana, con lo apuntado. */
  clases: ClaseTeoria[];
  /** Los días «sin clase» de la semana, por si hay que explicarlo. */
  sinClase: { classId: string; fecha: string; motivo: string | null }[];
  /** El temario: número y título. */
  temario: { numero: number; titulo: string }[];
  /** TODO lo apuntado en la academia con algún tema, para el avance de cada grupo. */
  historico: AsignacionTeoria[];
};

/** La semana (de lunes a domingo) del cuadrante de teoría, con quién da qué y el avance de cada grupo. */
export async function getTeoria(params: { lunes: string }): Promise<
  { success: true; datos: DatosTeoria } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const lunes = params?.lunes;
  if (!org) return { success: false as const, error: 'No hay una academia seleccionada.' };
  if (!esFecha(lunes) || lunesDe(lunes) !== lunes) return { success: false as const, error: 'Datos no válidos.' };
  const domingo = sumaDias(lunes, 6);

  const grupos = await gruposDeTeoria(org);
  if (grupos.error) return { success: false as const, error: grupos.error };
  const ids = grupos.data.map((g) => g.id);

  const [prof, off, temas, hist] = await Promise.all([
    supabaseAdmin.from('academy_staff').select('id, name, role').eq('organization_id', org).eq('active', true).order('name'),
    ids.length
      ? supabaseAdmin.from('class_days_off').select('class_id, session_date, reason')
          .eq('organization_id', org).in('class_id', ids).gte('session_date', lunes).lte('session_date', domingo)
      : Promise.resolve({ data: [] as Fila[], error: null }),
    supabaseAdmin.from('subjects').select('topic_number, title').order('topic_number'),
    paginaCompleta<Fila>((d, h) => supabaseAdmin.from('theory_sessions')
      .select('class_id, session_date, teacher_id, topics, note').eq('organization_id', org)
      .order('session_date').order('class_id').range(d, h) as unknown as Promise<ResultadoPagina<Fila>>),
  ]);
  if (prof.error) return { success: false as const, error: fallo('getTeoria', prof.error) };
  if (off.error) return { success: false as const, error: fallo('getTeoria', off.error) };
  if (temas.error) return { success: false as const, error: fallo('getTeoria', temas.error) };
  if (hist.error) return { success: false as const, error: hist.error };

  const historico = hist.data.map(aAsignacion);
  const sinClase = (off.data ?? []).map((d) => ({ classId: d.class_id as string, fecha: d.session_date as string, motivo: (d.reason as string | null) ?? null }));
  return {
    success: true as const,
    datos: {
      lunes,
      hoy: ahoraEnZona(Date.now()).fecha,
      grupos: grupos.data,
      profesores: (prof.data ?? []).filter((p) => daClase(p.role as string | null)).map((p) => ({ id: p.id as string, nombre: p.name as string })),
      clases: clasesDeTeoria({
        grupos: grupos.data,
        asignaciones: historico.filter((a) => a.fecha >= lunes && a.fecha <= domingo),
        sinClase, desde: lunes, hasta: domingo,
      }),
      sinClase,
      temario: (temas.data ?? []).map((t) => ({ numero: Number(t.topic_number), titulo: t.title as string })),
      historico: historico.filter((a) => a.temas.length > 0),
    },
  };
}

/**
 * Apunta (o cambia) quién da una clase y qué temas. Sin profesor, sin temas y
 * sin nota, la clase vuelve a estar sin asignar (se borra la fila).
 */
export async function saveClaseTeoria(params: {
  classId: string;
  fecha: string;
  profesorId: string | null;
  temas: number[];
  nota?: string | null;
}): Promise<{ success: true; borrada: boolean } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const { classId, fecha } = params ?? ({} as typeof params);
  if (!org || !esUuid(classId) || !esFecha(fecha)) return { success: false as const, error: 'Datos no válidos.' };
  const profesorId = params.profesorId ?? null;
  if (profesorId !== null && !esUuid(profesorId)) return { success: false as const, error: 'Datos no válidos.' };
  const temas = normalizaTemas(params.temas);
  const nota = normalizaNotaTeoria(params.nota);

  const { data: g } = await supabaseAdmin.from('class_groups').select('id, kind, weekdays')
    .eq('organization_id', org).eq('id', classId).maybeSingle();
  if (!g || g.kind !== 'teoria') return { success: false as const, error: 'Ese grupo no es de teoría de tu academia.' };
  if (!((g.weekdays as number[] | null) ?? []).includes(diaSemanaDe(fecha))) {
    return { success: false as const, error: 'Ese grupo no tiene clase ese día.' };
  }

  if (profesorId) {
    const { data: p } = await supabaseAdmin.from('academy_staff').select('id, role, active')
      .eq('organization_id', org).eq('id', profesorId).maybeSingle();
    if (!p) return { success: false as const, error: 'Ese profesor no es de tu academia.' };
    if (!daClase(p.role as string | null)) return { success: false as const, error: 'Esa persona es del equipo, pero no da clase.' };
  }

  if (!profesorId && temas.length === 0 && !nota) {
    const { error } = await supabaseAdmin.from('theory_sessions').delete()
      .eq('organization_id', org).eq('class_id', classId).eq('session_date', fecha);
    return error ? { success: false as const, error: fallo('saveClaseTeoria', error) } : { success: true as const, borrada: true };
  }

  const { error } = await supabaseAdmin.from('theory_sessions').upsert({
    organization_id: org, class_id: classId, session_date: fecha,
    teacher_id: profesorId, topics: temas, note: nota,
    created_by: auth.user.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'class_id,session_date' });
  return error ? { success: false as const, error: fallo('saveClaseTeoria', error) } : { success: true as const, borrada: false };
}

/**
 * Copia lo apuntado de una semana a otra (mismo grupo, mismo día de la
 * semana). No pisa lo que ya hay en la semana de destino. Se copia el
 * profesor y los temas; la nota no, porque es de ese día.
 */
export async function copiarSemanaTeoria(params: { desde: string; a: string }): Promise<
  { success: true; creadas: number; omitidas: number } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const { desde, a } = params ?? ({} as typeof params);
  if (!org || !esFecha(desde) || !esFecha(a) || lunesDe(desde) !== desde || lunesDe(a) !== a || desde === a) {
    return { success: false as const, error: 'Datos no válidos.' };
  }
  const grupos = await gruposDeTeoria(org);
  if (grupos.error) return { success: false as const, error: grupos.error };
  const dias = new Map(grupos.data.map((g) => [g.id, g.weekdays]));

  const [origen, destino] = await Promise.all([
    supabaseAdmin.from('theory_sessions').select('class_id, session_date, teacher_id, topics')
      .eq('organization_id', org).gte('session_date', desde).lte('session_date', sumaDias(desde, 6)),
    supabaseAdmin.from('theory_sessions').select('class_id, session_date')
      .eq('organization_id', org).gte('session_date', a).lte('session_date', sumaDias(a, 6)),
  ]);
  if (origen.error) return { success: false as const, error: fallo('copiarSemanaTeoria', origen.error) };
  if (destino.error) return { success: false as const, error: fallo('copiarSemanaTeoria', destino.error) };

  const hay = new Set((destino.data ?? []).map((d) => `${d.class_id}|${d.session_date}`));
  const filas: Fila[] = [];
  let omitidas = 0;
  for (const o of origen.data ?? []) {
    const fecha = sumaDias(a, diaSemanaDe(o.session_date as string) - 1);
    if (hay.has(`${o.class_id}|${fecha}`) || !dias.get(o.class_id as string)?.includes(diaSemanaDe(fecha))) { omitidas += 1; continue; }
    filas.push({
      organization_id: org, class_id: o.class_id, session_date: fecha,
      teacher_id: o.teacher_id, topics: o.topics, created_by: auth.user.id,
    });
  }
  if (filas.length) {
    const { error } = await supabaseAdmin.from('theory_sessions').upsert(filas, { onConflict: 'class_id,session_date', ignoreDuplicates: true });
    if (error) return { success: false as const, error: fallo('copiarSemanaTeoria', error) };
  }
  return { success: true as const, creadas: filas.length, omitidas };
}

'use server';

/**
 * LAS FORMACIONES EXTRAS Y EL CUADRANTE DE TEORÍA (regla 142).
 *
 * Una formación extra (el Curso OSINT y otras) es una fila de `extra_events`
 * (`docs/sql/teoria-extras.sql`: RLS y CERO políticas, así que solo la clave de
 * servicio, y cada acción acota por academia dentro de la consulta: reglas 34 y
 * 65). El calendario las lee (`getCalendario`) y el cuadrante las pone arriba de
 * su día. El cuadrante en sí no guarda nada: `getCuadranteTeoria` lo deriva del
 * calendario de la semana.
 */

import { supabaseAdmin } from './core';
import { requireAdmin } from '../lib/auth';
import { daClase } from '../lib/personal';
import { esFecha, sumaDias } from '../lib/asistencia';
import { lunesDe } from '../lib/sesiones';
import { paginaCompleta, type ResultadoPagina } from '../lib/pagination';
import { fallo } from '../lib/fallos';
import { normalizaTemas, partesDeTema, type AsignacionTeoria } from '../lib/teoria';
import { normalizaTituloExtra, normalizaNotaExtra, normalizaAudiencia, horasDeExtra } from '../lib/extras';
import { armaCuadranteTeoria, type CuadranteTeoria } from '../lib/cuadrante-teoria';
import { getCalendario } from './calendario';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
type Fila = Record<string, unknown>;

/** Crea o cambia una formación extra. Sin `id`, crea. */
export async function saveExtra(params: {
  id?: string | null;
  fecha: string;
  inicio?: string | null;
  fin?: string | null;
  titulo: string;
  profesorIds?: string[];
  audiencia?: string;
  nota?: string | null;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: 'No hay una academia seleccionada.' };
  const p = params ?? ({} as typeof params);
  if (!esFecha(p.fecha)) return { success: false as const, error: 'Pon una fecha.' };
  const titulo = normalizaTituloExtra(p.titulo);
  if (!titulo) return { success: false as const, error: 'Pon un título (al menos dos letras).' };
  const horas = horasDeExtra(p.inicio, p.fin);
  if (horas.error) return { success: false as const, error: horas.error };
  const id = p.id ?? null;
  if (id !== null && !esUuid(id)) return { success: false as const, error: 'Datos no válidos.' };

  // Hasta dos profesores, de esta academia y que den clase (regla 130).
  const profesores = [...new Set(Array.isArray(p.profesorIds) ? p.profesorIds.filter(esUuid) : [])].slice(0, 2);
  for (const quien of profesores) {
    const { data: s } = await supabaseAdmin.from('academy_staff').select('id, role').eq('organization_id', org).eq('id', quien).maybeSingle();
    if (!s) return { success: false as const, error: 'Ese profesor no es de tu academia.' };
    if (!daClase(s.role as string | null)) return { success: false as const, error: 'Esa persona es del equipo, pero no da clase.' };
  }

  const fila = {
    organization_id: org, event_date: p.fecha, start_time: horas.inicio, end_time: horas.fin, title: titulo,
    teacher_id: profesores[0] ?? null, teacher2_id: profesores[1] ?? null,
    audience: normalizaAudiencia(p.audiencia), note: normalizaNotaExtra(p.nota), updated_at: new Date().toISOString(),
  };
  if (id) {
    const { data, error } = await supabaseAdmin.from('extra_events').update(fila).eq('organization_id', org).eq('id', id).select('id');
    if (error) return { success: false as const, error: fallo('saveExtra', error) };
    if (!data?.length) return { success: false as const, error: 'Esa formación no existe o no es de tu academia.' };
    return { success: true as const, id };
  }
  const { data, error } = await supabaseAdmin.from('extra_events').insert({ ...fila, created_by: auth.user.id }).select('id').single();
  if (error || !data) return { success: false as const, error: fallo('saveExtra', error ?? { message: 'sin fila' }) };
  return { success: true as const, id: data.id as string };
}

export async function deleteExtra(id: string): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org || !esUuid(id)) return { success: false as const, error: 'Datos no válidos.' };
  const { error } = await supabaseAdmin.from('extra_events').delete().eq('organization_id', org).eq('id', id);
  return error ? { success: false as const, error: fallo('deleteExtra', error) } : { success: true as const };
}

/**
 * El cuadrante de la semana que empieza en `lunes` (regla 142): las clases de
 * teoría con su tema, nota y profesor, y las formaciones extras. Lo deriva del
 * calendario de esa semana; lo único que pide aparte son las partes (I)/(II),
 * que dependen de TODO lo apuntado al grupo, no solo de esa semana.
 */
export async function getCuadranteTeoria(params: { lunes: string }): Promise<
  { success: true; cuadrante: CuadranteTeoria } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const lunes = params?.lunes;
  if (!org) return { success: false as const, error: 'No hay una academia seleccionada.' };
  if (!esFecha(lunes) || lunesDe(lunes) !== lunes) return { success: false as const, error: 'Datos no válidos.' };

  const [cal, hist, grupos] = await Promise.all([
    getCalendario({ desde: lunes, hasta: sumaDias(lunes, 6) }),
    paginaCompleta<Fila>((d, h) => supabaseAdmin.from('theory_sessions').select('class_id, session_date, topics')
      .eq('organization_id', org).order('session_date').order('class_id').range(d, h) as unknown as Promise<ResultadoPagina<Fila>>),
    supabaseAdmin.from('class_groups').select('id, weekdays, start_time, name').eq('organization_id', org).eq('kind', 'teoria').eq('is_multi', false),
  ]);
  if (!cal.success) return { success: false as const, error: cal.error };
  if (hist.error) return { success: false as const, error: hist.error };
  if (grupos.error) return { success: false as const, error: fallo('getCuadranteTeoria', grupos.error) };

  const asignaciones: AsignacionTeoria[] = hist.data.map((r) => ({
    classId: r.class_id as string, fecha: r.session_date as string, profesorId: null, temas: normalizaTemas(r.topics), nota: null,
  }));
  // Los colores siguen el orden de la imagen: por primer día de clase, luego por hora.
  const ordenGrupos = (grupos.data ?? [])
    .map((g) => ({ id: g.id as string, dia: ((g.weekdays as number[] | null) ?? [9])[0], hora: (g.start_time as string | null) ?? '', nombre: g.name as string }))
    .sort((a, b) => a.dia - b.dia || a.hora.localeCompare(b.hora) || a.nombre.localeCompare(b.nombre, 'es'))
    .map((g) => g.id);

  return {
    success: true as const,
    cuadrante: armaCuadranteTeoria({ lunes, eventos: cal.datos.eventos, partes: partesDeTema(asignaciones), ordenGrupos }),
  };
}

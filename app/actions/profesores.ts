'use server';

/**
 * LO QUE DA CADA PROFESOR (regla 100): el profesor habitual de cada clase de
 * física y los temas de teoría de cada uno, con cómo van los alumnos en ellos.
 *
 * `staff_activities` y `staff_subjects` tienen RLS y CERO políticas
 * (`docs/sql/profesores-clases-y-temas.sql`): todo con la clave de servicio,
 * detrás de `requireAdmin` y acotado a la academia DENTRO de cada consulta
 * (reglas 34, 65 y 75). Los recuentos por tema los hace la base de datos
 * (`panel_academia_por_tema`, regla 91): no se traen las respuestas.
 *
 * La lógica (reconocer la clase, leer «1-10, 14», el resumen) vive en
 * `app/lib/profesores.ts`, pura y con tests (regla 21).
 */

import { supabaseAdmin } from './core';
import { requireAdmin } from '../lib/auth';
import {
  agrupaHabituales, claveActividad, normalizaActividad, leeListaTemas,
  type ClaseHabitual,
} from '../lib/profesores';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** Cuántos profesores habituales puede tener una clase, como mucho. */
const MAX_HABITUALES = 6;

// ═════════════════════════════════════════════════════════════════════════
// FÍSICA: EL PROFESOR HABITUAL DE CADA CLASE
// ═════════════════════════════════════════════════════════════════════════

/** Las clases de física y sus profesores habituales, en orden. */
export async function getClasesHabituales(): Promise<
  { success: true; clases: ClaseHabitual[] } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: true as const, clases: [] };
  const { data, error } = await supabaseAdmin.from('staff_activities').select('activity, staff_id, priority').eq('organization_id', org);
  if (error) return { success: false as const, error: error.message };
  return {
    success: true as const,
    clases: agrupaHabituales((data ?? []).map((r) => ({ actividad: r.activity as string, profesorId: r.staff_id as string, prioridad: Number(r.priority) }))),
  };
}

/**
 * Pone los profesores habituales de una clase, en orden (el primero, el
 * preferido). Sin ninguno, la clase deja de tener habitual. Si ya existía con
 * otra forma de escribirla («f.m+rdl» y «F.M + RDL»), se respeta la que había.
 */
export async function setClaseHabitual(params: { actividad: string; profesorIds: string[] }): Promise<
  { success: true } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const actividad = normalizaActividad(params?.actividad);
  const ids = Array.isArray(params?.profesorIds) ? [...new Set(params.profesorIds)] : null;
  if (!org || !actividad || !ids || ids.length > MAX_HABITUALES || !ids.every(esUuid)) {
    return { success: false as const, error: 'Escribe la clase (como «Boxeo» o «FLK») y elige sus profesores.' };
  }
  if (ids.length) {
    const { data: profes } = await supabaseAdmin.from('academy_staff').select('id').eq('organization_id', org).in('id', ids);
    if ((profes ?? []).length !== ids.length) return { success: false as const, error: 'Algún profesor no es de tu academia.' };
  }

  // La misma clase escrita de otra forma es la misma clase.
  const { data: actuales, error: e0 } = await supabaseAdmin.from('staff_activities').select('activity').eq('organization_id', org);
  if (e0) return { success: false as const, error: e0.message };
  const existente = [...new Set((actuales ?? []).map((a) => a.activity as string))].find((a) => claveActividad(a) === claveActividad(actividad));
  const nombre = existente ?? actividad;

  const { error: e1 } = await supabaseAdmin.from('staff_activities').delete().eq('organization_id', org).eq('activity', nombre);
  if (e1) return { success: false as const, error: e1.message };
  if (!ids.length) return { success: true as const };
  const { error } = await supabaseAdmin.from('staff_activities').insert(
    ids.map((staffId, i) => ({ organization_id: org, activity: nombre, staff_id: staffId, priority: i + 1 })),
  );
  return error ? { success: false as const, error: error.message } : { success: true as const };
}

// ═════════════════════════════════════════════════════════════════════════
// TEORÍA: LOS TEMAS DE CADA PROFESOR Y CÓMO VAN SUS ALUMNOS
// ═════════════════════════════════════════════════════════════════════════

export type TemaDeProfesores = {
  subjectId: number;
  numero: number;
  titulo: string;
  bloque: string | null;
  /** Los profesores que lo dan. */
  profesorIds: string[];
  /** De los alumnos de la academia: cuántos han respondido algo y cómo. */
  alumnos: number;
  contestadas: number;
  aciertos: number;
  blancos: number;
};

/** Los temas del temario, quién da cada uno y cómo van los alumnos de la academia en ellos. */
export async function getTemasProfesores(): Promise<
  { success: true; temas: TemaDeProfesores[] } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: true as const, temas: [] };

  const [temasRes, bloquesRes, asignadosRes, sociosRes] = await Promise.all([
    supabaseAdmin.from('subjects').select('id, title, topic_number, block_id').order('topic_number'),
    supabaseAdmin.from('blocks').select('id, name'),
    supabaseAdmin.from('staff_subjects').select('staff_id, subject_id').eq('organization_id', org),
    supabaseAdmin.from('academy_members').select('user_id').eq('academy_id', org),
  ]);
  if (temasRes.error) return { success: false as const, error: temasRes.error.message };
  if (asignadosRes.error) return { success: false as const, error: asignadosRes.error.message };

  // Los alumnos de la academia (los admin no cuentan: no estudian).
  const ids = (sociosRes.data ?? []).map((s) => s.user_id as string);
  const { data: perfiles } = ids.length
    ? await supabaseAdmin.from('profiles').select('id, role').in('id', ids)
    : { data: [] as { id: string; role: string | null }[] };
  const alumnos = (perfiles ?? []).filter((p) => p.role !== 'admin' && p.role !== 'superadmin').map((p) => p.id as string);
  const { data: porTema, error: e2 } = alumnos.length
    ? await supabaseAdmin.rpc('panel_academia_por_tema', { p_user_ids: alumnos })
    : { data: [], error: null };
  if (e2) return { success: false as const, error: e2.message };

  const bloque = new Map((bloquesRes.data ?? []).map((b) => [b.id as number, b.name as string]));
  const datos = new Map(((porTema ?? []) as { subject_id: number; alumnos: number; contestadas: number; aciertos: number; blancos: number }[])
    .map((x) => [Number(x.subject_id), x]));
  const quien = new Map<number, string[]>();
  for (const a of asignadosRes.data ?? []) quien.set(a.subject_id as number, [...(quien.get(a.subject_id as number) ?? []), a.staff_id as string]);

  return {
    success: true as const,
    temas: (temasRes.data ?? [])
      .filter((t) => t.topic_number !== null)
      .map((t) => {
        const d = datos.get(t.id as number);
        return {
          subjectId: t.id as number,
          numero: Number(t.topic_number),
          titulo: t.title as string,
          bloque: bloque.get(t.block_id as number) ?? null,
          profesorIds: quien.get(t.id as number) ?? [],
          alumnos: Number(d?.alumnos ?? 0),
          contestadas: Number(d?.contestadas ?? 0),
          aciertos: Number(d?.aciertos ?? 0),
          blancos: Number(d?.blancos ?? 0),
        };
      }),
  };
}

/** Los temas de un profesor, escritos como «1-10, 14, 17, 18». Vacío, ninguno. */
export async function setTemasProfesor(params: { profesorId: string; temas: string }): Promise<
  { success: true; temas: number[] } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const { profesorId } = params ?? ({} as typeof params);
  if (!org || !esUuid(profesorId)) return { success: false as const, error: 'Datos no válidos.' };
  const lista = leeListaTemas(params?.temas);
  if (!lista.ok) return { success: false as const, error: lista.error };

  const { data: profe } = await supabaseAdmin.from('academy_staff').select('id').eq('id', profesorId).eq('organization_id', org).maybeSingle();
  if (!profe) return { success: false as const, error: 'Ese profesor no es de tu academia.' };

  const { data: temas, error: e0 } = lista.temas.length
    ? await supabaseAdmin.from('subjects').select('id, topic_number').in('topic_number', lista.temas)
    : { data: [] as { id: number; topic_number: number }[], error: null };
  if (e0) return { success: false as const, error: e0.message };
  const encontrados = new Set((temas ?? []).map((t) => Number(t.topic_number)));
  const faltan = lista.temas.filter((n) => !encontrados.has(n));
  if (faltan.length) return { success: false as const, error: `No existe el tema ${faltan.join(', ')} en el temario.` };

  const { error: e1 } = await supabaseAdmin.from('staff_subjects').delete().eq('organization_id', org).eq('staff_id', profesorId);
  if (e1) return { success: false as const, error: e1.message };
  if (temas?.length) {
    const { error } = await supabaseAdmin.from('staff_subjects').insert(
      temas.map((t) => ({ organization_id: org, staff_id: profesorId, subject_id: t.id as number })),
    );
    if (error) return { success: false as const, error: error.message };
  }
  return { success: true as const, temas: lista.temas };
}

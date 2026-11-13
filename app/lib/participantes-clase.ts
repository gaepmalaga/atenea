import 'server-only';
import { supabaseAdmin } from '../actions/core';
import { paginaCompleta } from './pagination';
import { fallo } from './fallos';

/**
 * QUIÉNES SON LOS ALUMNOS DE UNA CLASE (reglas 65 y 118): compartido entre los
 * exámenes de teoría (`examenes-clase`) y los de psicotécnicos (`psico-clase`).
 */

/** Los alumnos de UNA academia: miembros que no son admin (regla 65). */
export async function alumnosDe(organizationId: string): Promise<{ data: { id: string; email: string | null; nombre: string | null }[]; error: string | null }> {
  const miembros = await paginaCompleta<{ user_id: string }>(async (d, h) => await
    supabaseAdmin.from('academy_members').select('user_id').eq('academy_id', organizationId).order('user_id').range(d, h));
  if (miembros.error) return { data: [], error: miembros.error };
  const ids = miembros.data.map((m) => m.user_id);
  const out: { id: string; email: string | null; nombre: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabaseAdmin.from('profiles').select('id, email, role').in('id', ids.slice(i, i + 200));
    if (error) return { data: [], error: fallo('alumnosDe', error) };
    for (const p of data ?? []) if (p.role !== 'admin' && p.role !== 'superadmin') out.push({ id: p.id as string, email: (p.email as string) ?? null, nombre: null });
  }
  // El nombre de verdad (regla 114), aparte: si las columnas aún no existen, sale el del correo.
  for (let i = 0; i < out.length; i += 200) {
    const trozo = out.slice(i, i + 200);
    const { data, error } = await supabaseAdmin.from('profiles').select('id, full_name').in('id', trozo.map((a) => a.id));
    if (error) { fallo('alumnosDe', error); break; }
    const nombres = new Map((data ?? []).map((p) => [p.id as string, (p.full_name as string) ?? null]));
    for (const a of trozo) a.nombre = nombres.get(a.id) ?? null;
  }
  return { data: out, error: null };
}

/** Quiénes son de una aplicación: los de sus grupos, o toda la academia si no lleva ninguno. */
export async function participantesDe(organizationId: string, classIds: string[]): Promise<{ data: { id: string; email: string | null; nombre: string | null }[]; error: string | null }> {
  const alumnos = await alumnosDe(organizationId);
  if (alumnos.error || classIds.length === 0) return alumnos;
  const miembros = await paginaCompleta<{ user_id: string }>(async (d, h) => await
    supabaseAdmin.from('class_members').select('user_id').in('class_id', classIds).order('user_id').range(d, h));
  if (miembros.error) return { data: [], error: miembros.error };
  const suyos = new Set(miembros.data.map((m) => m.user_id));
  return { data: alumnos.data.filter((a) => suyos.has(a.id)), error: null };
}


/** Los grupos de un alumno en una academia. */
export async function misGrupos(organizationId: string, userId: string): Promise<{ data: string[]; error: string | null }> {
  const { data, error } = await supabaseAdmin
    .from('class_members').select('class_id, class_groups!inner(organization_id)')
    .eq('user_id', userId).eq('class_groups.organization_id', organizationId).limit(500);
  if (error) return { data: [], error: fallo('misGrupos', error) };
  return { data: (data ?? []).map((r) => r.class_id as string), error: null };
}


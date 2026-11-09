'use server';

/**
 * ASISTENCIA (regla 82): el alumno avisa de las clases a las que va a faltar,
 * y la academia ve los huecos de cada clase.
 *
 * `class_absences` tiene RLS y CERO políticas (`docs/sql/asistencia.sql`): solo
 * la toca la clave de servicio. Por eso cada acción del alumno filtra SIEMPRE
 * por su propio id y comprueba que es miembro del grupo y que el grupo es de
 * su academia — con la clave de servicio, nada más que este código lo impide
 * (regla 34). Las del admin van detrás de `requireAdmin` y acotadas a su
 * academia (regla 65).
 *
 * Lo que se decide (qué fechas son sesiones, hasta cuándo se puede avisar,
 * cuántas plazas quedan) vive en `app/lib/asistencia.ts`, puro y con tests.
 */

import { supabaseAdmin } from './core';
import { requireUser, requireAdmin } from '../lib/auth';
import {
  ahoraEnZona, proximasSesiones, sePuedeAvisar, cuentaSesion, horarioDeFila, horarioEnTexto,
  etiquetaFecha, esFecha, sumaDias, DIAS_VISIBLES, type CuentaSesion,
} from '../lib/asistencia';

const COLUMNAS_GRUPO = 'id, name, organization_id, weekdays, start_time, end_time, capacity';

export type SesionAlumno = {
  fecha: string;
  etiqueta: string;
  hora: string | null;
  /** Ha avisado de que falta. */
  falta: boolean;
  /** Todavía puede cambiarlo (la clase no ha empezado). */
  editable: boolean;
};

export type ClaseAlumno = {
  classId: string;
  nombre: string;
  horario: string | null;
  sesiones: SesionAlumno[];
};

/** Las clases del alumno en las próximas semanas, con las faltas que ha avisado. */
export async function getMisClases(): Promise<
  { success: true; clases: ClaseAlumno[] } | { success: false; error: string }
> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const organizationId = auth.user.organizationId;
  if (!organizationId) return { success: true as const, clases: [] };

  const { data: miembros, error } = await supabaseAdmin
    .from('class_members')
    .select(`class_id, class_groups!inner(${COLUMNAS_GRUPO})`)
    .eq('user_id', auth.user.id)
    .eq('class_groups.organization_id', organizationId);
  if (error) return { success: false as const, error: error.message };

  const ahora = ahoraEnZona(Date.now());
  const grupos = (miembros ?? [])
    .map((m) => m.class_groups as unknown as Record<string, unknown>)
    .filter(Boolean);
  const ids = grupos.map((g) => g.id as string);

  const { data: faltas } = ids.length
    ? await supabaseAdmin
        .from('class_absences')
        .select('class_id, session_date')
        .eq('user_id', auth.user.id)
        .in('class_id', ids)
        .gte('session_date', ahora.fecha)
    : { data: [] as { class_id: string; session_date: string }[] };
  const avisadas = new Set((faltas ?? []).map((f) => `${f.class_id}|${f.session_date}`));

  const clases: ClaseAlumno[] = grupos
    .map((g) => {
      const h = horarioDeFila(g);
      return {
        classId: g.id as string,
        nombre: g.name as string,
        horario: horarioEnTexto(h),
        sesiones: proximasSesiones(h, ahora).map((fecha) => ({
          fecha,
          etiqueta: etiquetaFecha(fecha),
          hora: h.startTime,
          falta: avisadas.has(`${g.id}|${fecha}`),
          editable: sePuedeAvisar(h, fecha, ahora),
        })),
      };
    })
    .filter((c) => c.sesiones.length > 0)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return { success: true as const, clases };
}

/**
 * Avisa de que falta a una sesión (`falta: true`) o lo retira (`false`).
 *
 * Todo se comprueba aquí, no en la pantalla: que el grupo es de su academia,
 * que es miembro, que la fecha es un día de clase de ese grupo y que la clase
 * no ha empezado.
 */
export async function setMiFalta(params: { classId: string; fecha: string; falta: boolean }) {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const organizationId = auth.user.organizationId;
  const { classId, fecha, falta } = params ?? ({} as typeof params);
  if (!organizationId || !classId || !esFecha(fecha)) return { success: false as const, error: 'Datos no válidos.' };

  const [{ data: grupo }, { data: miembro }] = await Promise.all([
    supabaseAdmin.from('class_groups').select(COLUMNAS_GRUPO).eq('id', classId).eq('organization_id', organizationId).maybeSingle(),
    supabaseAdmin.from('class_members').select('user_id').eq('class_id', classId).eq('user_id', auth.user.id).maybeSingle(),
  ]);
  if (!grupo || !miembro) return { success: false as const, error: 'No eres de ese grupo.' };

  if (!sePuedeAvisar(horarioDeFila(grupo as Record<string, unknown>), fecha, ahoraEnZona(Date.now()))) {
    return { success: false as const, error: 'Esa clase ya ha empezado o no es un día de clase de tu grupo.' };
  }

  const { error } = falta
    ? await supabaseAdmin
        .from('class_absences')
        .upsert({ class_id: classId, user_id: auth.user.id, session_date: fecha }, { onConflict: 'class_id,user_id,session_date', ignoreDuplicates: true })
    : await supabaseAdmin
        .from('class_absences')
        .delete()
        .eq('class_id', classId)
        .eq('user_id', auth.user.id)
        .eq('session_date', fecha);
  return { success: !error, error: error?.message };
}

export type SesionAcademia = CuentaSesion & {
  classId: string;
  nombre: string;
  hora: string | null;
  /** Los correos de quien ha avisado de que falta. */
  quienesFaltan: string[];
};

export type DiaAcademia = { fecha: string; etiqueta: string; sesiones: SesionAcademia[] };

/**
 * Los próximos días con clase de la academia, sesión a sesión: cuántos van,
 * cuántos faltan y cuántas plazas quedan. Es la pantalla a la que se va cuando
 * un alumno pide cambiarse de clase.
 */
export async function getAsistenciaAcademia(): Promise<
  { success: true; dias: DiaAcademia[]; gruposSinHorario: string[] } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const organizationId = auth.user.organizationId;
  if (!organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };

  const { data: grupos, error } = await supabaseAdmin
    .from('class_groups')
    .select(COLUMNAS_GRUPO)
    .eq('organization_id', organizationId)
    .order('name');
  if (error) return { success: false as const, error: error.message };

  const ahora = ahoraEnZona(Date.now());
  const ids = (grupos ?? []).map((g) => g.id as string);
  const [miembrosRes, faltasRes, multisRes] = ids.length
    ? await Promise.all([
        supabaseAdmin.from('class_members').select('class_id, user_id').in('class_id', ids),
        supabaseAdmin
          .from('class_absences')
          .select('class_id, user_id, session_date')
          .in('class_id', ids)
          .gte('session_date', ahora.fecha)
          .lte('session_date', sumaDias(ahora.fecha, DIAS_VISIBLES)),
        // Los multis apuntados a la sesión de este grupo ocupan plaza (regla 96).
        supabaseAdmin
          .from('class_session_joins')
          .select('class_id, session_date')
          .in('class_id', ids)
          .gte('session_date', ahora.fecha)
          .lte('session_date', sumaDias(ahora.fecha, DIAS_VISIBLES)),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const miembros = (miembrosRes.data ?? []) as { class_id: string; user_id: string }[];
  const faltas = (faltasRes.data ?? []) as { class_id: string; user_id: string; session_date: string }[];

  const multisPorSesion = new Map<string, number>();
  for (const j of (multisRes.data ?? []) as { class_id: string; session_date: string }[]) {
    const k = `${j.class_id}|${j.session_date}`;
    multisPorSesion.set(k, (multisPorSesion.get(k) ?? 0) + 1);
  }

  const usuarios = [...new Set(faltas.map((f) => f.user_id))];
  const { data: perfiles } = usuarios.length
    ? await supabaseAdmin.from('profiles').select('id, email').in('id', usuarios)
    : { data: [] as { id: string; email: string | null }[] };
  const correo = new Map((perfiles ?? []).map((p) => [p.id as string, (p.email as string) ?? '—']));

  const inscritos = new Map<string, number>();
  for (const m of miembros) inscritos.set(m.class_id, (inscritos.get(m.class_id) ?? 0) + 1);
  // Solo cuenta la falta de quien SIGUE en el grupo: si lo sacaron después de
  // avisar, su aviso ya no libera ninguna plaza.
  const enGrupo = new Set(miembros.map((m) => `${m.class_id}|${m.user_id}`));
  const faltasPorSesion = new Map<string, string[]>();
  for (const f of faltas) {
    if (!enGrupo.has(`${f.class_id}|${f.user_id}`)) continue;
    const k = `${f.class_id}|${f.session_date}`;
    faltasPorSesion.set(k, [...(faltasPorSesion.get(k) ?? []), correo.get(f.user_id) ?? '—']);
  }

  const porDia = new Map<string, SesionAcademia[]>();
  const gruposSinHorario: string[] = [];
  for (const g of grupos ?? []) {
    const h = horarioDeFila(g as Record<string, unknown>);
    const fechas = proximasSesiones(h, ahora);
    if (!h.weekdays?.length) { gruposSinHorario.push(g.name as string); continue; }
    for (const fecha of fechas) {
      const quienes = (faltasPorSesion.get(`${g.id}|${fecha}`) ?? []).sort();
      porDia.set(fecha, [
        ...(porDia.get(fecha) ?? []),
        {
          classId: g.id as string,
          nombre: g.name as string,
          hora: h.startTime,
          quienesFaltan: quienes,
          ...cuentaSesion(h.capacity, inscritos.get(g.id as string) ?? 0, quienes.length, multisPorSesion.get(`${g.id}|${fecha}`) ?? 0),
        },
      ]);
    }
  }

  const dias: DiaAcademia[] = [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, sesiones]) => ({
      fecha,
      etiqueta: etiquetaFecha(fecha),
      sesiones: sesiones.sort((a, b) => (a.hora ?? '99').localeCompare(b.hora ?? '99') || a.nombre.localeCompare(b.nombre, 'es')),
    }));

  return { success: true as const, dias, gruposSinHorario };
}

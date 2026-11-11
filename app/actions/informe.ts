'use server'
import { supabaseAdmin } from './core';
import { requireAdmin } from '../lib/auth';
import { fallo } from '../lib/fallos';
import { paginaCompleta, type ResultadoPagina } from '../lib/pagination';
import { ahoraEnZona } from '../lib/asistencia';
import { nombreVisible } from '../lib/perfil-alumno';
import {
  construyeInforme, lunesDe, semanaPorDefecto, sumaDias,
  type AlumnoInforme, type FilaSemana, type InformeSemanal,
} from '../lib/informe-semanal';

/** Cuántas semanas hacia atrás se le piden a la base de datos: la del informe, cuatro para la media y una de margen. */
const SEMANAS = 7;

type FilaRpc = {
  user_id: string; semana: string; contestadas: number; aciertos: number;
  blancos: number; dias_activos: number; simulacros: number; ultima: string | null;
};

/**
 * EL INFORME SEMANAL DE LA ACADEMIA (regla 116).
 *
 * Solo alumnos (los admin no salen: no hay que llamarlos) y solo los de la
 * academia de la sesión (regla 65). Las cuentas por semana las hace la base de
 * datos (`panel_actividad_semanal`); aquí llegan los totales y se comparan.
 *
 * `semana` es cualquier día `AAAA-MM-DD` de la semana que se quiere ver; sin
 * ella, la que toca por defecto (`semanaPorDefecto`). Solo se puede mirar la
 * actual o la anterior: más atrás no hay con qué calcular la media.
 */
export async function getInformeSemanal(input?: unknown): Promise<
  | { success: true; informe: InformeSemanal; semanas: { actual: string; anterior: string } }
  | { success: false; error: string; faltaGuion?: boolean }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const organizationId = auth.user.organizationId;
  if (!organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };

  const hoy = ahoraEnZona(Date.now()).fecha;
  const actual = lunesDe(hoy), anterior = sumaDias(actual, -7);
  const pedida = (input as { semana?: unknown } | undefined)?.semana;
  const semana = typeof pedida === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(pedida) && [actual, anterior].includes(lunesDe(pedida))
    ? lunesDe(pedida)
    : semanaPorDefecto(hoy);

  const miembros = await paginaCompleta<{ user_id: string }>(async (d, h) => await
    supabaseAdmin.from('academy_members').select('user_id').eq('academy_id', organizationId).order('user_id').range(d, h));
  if (miembros.error) return { success: false as const, error: miembros.error };
  const idsMiembros = miembros.data.map((m) => m.user_id);

  // Los perfiles, de 200 en 200 (los ids van en la URL). Solo alumnos.
  const perfiles: { id: string; email: string | null; created_at: string | null }[] = [];
  for (let i = 0; i < idsMiembros.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from('profiles').select('id, email, role, created_at').in('id', idsMiembros.slice(i, i + 200));
    if (error) return { success: false as const, error: fallo('getInformeSemanal', error) };
    for (const p of data ?? []) {
      if (p.role !== 'admin' && p.role !== 'superadmin') perfiles.push({ id: p.id as string, email: (p.email as string) ?? null, created_at: (p.created_at as string) ?? null });
    }
  }
  const ids = perfiles.map((p) => p.id);
  if (!ids.length) {
    return { success: true as const, informe: construyeInforme({ hoy, semana, alumnos: [], filas: [] }), semanas: { actual, anterior } };
  }

  // El nombre de verdad (regla 114), aparte: si las columnas aún no existen, sale el deducido del correo.
  const nombres = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabaseAdmin.from('profiles').select('id, full_name').in('id', ids.slice(i, i + 200));
    if (error) { fallo('getInformeSemanal', error); break; }
    for (const p of data ?? []) if (p.full_name) nombres.set(p.id as string, p.full_name as string);
  }

  const [actividad, faltas] = await Promise.all([
    paginaCompleta<FilaRpc>(
      (d, h) =>
        supabaseAdmin
          .rpc('panel_actividad_semanal', { p_user_ids: ids, p_semanas: SEMANAS })
          .order('user_id').order('semana')
          .range(d, h) as unknown as Promise<ResultadoPagina<FilaRpc>>,
    ),
    paginaCompleta<{ user_id: string }>(async (d, h) => await
      supabaseAdmin
        .from('class_absences')
        .select('user_id, class_groups!inner(organization_id)')
        .eq('class_groups.organization_id', organizationId)
        .gte('session_date', sumaDias(hoy, -14))
        .lte('session_date', hoy)
        .order('user_id').order('session_date')
        .range(d, h) as unknown as ResultadoPagina<{ user_id: string }>),
  ]);
  if (actividad.error) {
    // Lo más probable: falta ejecutar el guion. Se dice, en vez de «no se ha podido».
    return { success: false as const, error: 'El informe necesita una función de la base de datos que todavía no está: falta ejecutar docs/sql/informe-semanal.sql.', faltaGuion: true };
  }

  const faltasPorAlumno = new Map<string, number>();
  // Si las faltas no se pueden leer, el informe sale igual sin esa señal.
  if (!faltas.error) for (const f of faltas.data) faltasPorAlumno.set(f.user_id, (faltasPorAlumno.get(f.user_id) ?? 0) + 1);

  const alumnos: AlumnoInforme[] = perfiles.map((p) => ({
    id: p.id,
    email: p.email,
    nombre: nombreVisible(nombres.get(p.id), p.email) || 'Alumno',
    alta: p.created_at,
    faltas14: faltasPorAlumno.get(p.id) ?? 0,
  }));
  const filas: FilaSemana[] = actividad.data.map((f) => ({
    userId: f.user_id, semana: String(f.semana).slice(0, 10), contestadas: f.contestadas, aciertos: f.aciertos,
    blancos: f.blancos, diasActivos: f.dias_activos, simulacros: f.simulacros, ultima: f.ultima,
  }));

  return { success: true as const, informe: construyeInforme({ hoy, semana, alumnos, filas }), semanas: { actual, anterior } };
}

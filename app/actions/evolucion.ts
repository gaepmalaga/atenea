'use server'

import { supabaseAdmin } from './core';
import { requireUser } from '../lib/auth';
import { requireModule } from '../lib/module-guard';
import { createSupabaseServerClient } from '../lib/supabase/server';
import { paginaCompleta } from '../lib/pagination';
import { QUESTION_STATUS, filtroBancoPorAcademia } from '../lib/questions';
import {
  computeQuestionStates,
  dominadasHasta,
  fechaLocalISO,
  resumeCajonesPorTema,
  type IntentoPregunta,
  type ResumenTema,
} from '../lib/question-scheduler';
import {
  resumeBanco,
  desgloseConContexto,
  fechaInicio,
  actividadDiaria,
  rangoCurva,
  type ResumenBanco,
  type Desglose,
  type DiaActividad,
} from '../lib/evolucion';
import { resumeSimulacros, type ResumenSimulacros } from '../lib/simulacros';

/**
 * "MI EVOLUCIÓN" (regla 77) — sustituye a "Estadísticas". La historia
 * completa del alumno en una sola pantalla: el mapa de su temario, el
 * desglose de cómo le va con contexto, la curva de progreso día a día, la
 * racha de actividad y si aprobaría. Nada disperso entre Inicio, Fallos,
 * Estadísticas y Mi Perfil.
 */

/** Mismo tope que el planificador P10 y "Mi perfil": de sobra para un alumno real. */
const MAX_INTENTOS_EVOLUCION = 30_000;

export type PuntoCurva = { fecha: string; dominadas: number };

export type MiEvolucion = {
  /** ISO del primer intento, o `null` si aún no ha contestado nada (regla 8). */
  fechaInicio: string | null;
  diasEnOposicion: number | null;
  racha: number;
  mapaTemas: ResumenTema[];
  resumenBanco: ResumenBanco;
  desglose: Desglose;
  curva: PuntoCurva[];
  /** Cuántos días de la curva ya estaban cacheados: 0 = primer cálculo entero. */
  diasDesdeCache: number;
  actividad: DiaActividad[];
  simulacros: ResumenSimulacros;
};

/** Fin del día LOCAL (`YYYY-MM-DD`) en milisegundos — construido por componentes,
 *  nunca por `Date.parse` de una cadena sin zona (regla 54/74: eso depende de
 *  en qué huso corra el proceso, no del alumno). */
function finDeDiaLocalMs(fechaISO: string): number {
  const [y, m, d] = fechaISO.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

/**
 * La curva diaria, cacheando el pasado en `curva_progreso` (regla 77).
 *
 * Un día YA PASADO no cambia nunca: se calcula una vez y se guarda para
 * siempre. Solo HOY se recalcula en cada visita. Si la tabla todavía no
 * existe (`docs/sql/curva-progreso.sql` sin ejecutar), se degrada con
 * gracia: se calcula todo al vuelo y no se guarda nada — la pantalla
 * funciona igual, solo que sin la caché.
 */
async function curvaConCache(
  db: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  intentos: IntentoPregunta[],
  inicioISO: string | null,
): Promise<{ curva: PuntoCurva[]; diasDesdeCache: number }> {
  const fechas = rangoCurva(inicioISO);
  const hoyISO = fechas[fechas.length - 1];

  const cacheRes = await db
    .from('curva_progreso')
    .select('fecha, dominadas')
    .eq('user_id', userId)
    .gte('fecha', fechas[0])
    .lte('fecha', hoyISO);

  const tablaExiste = !cacheRes.error;
  const cacheMap = new Map<string, number>();
  if (tablaExiste) {
    for (const fila of (cacheRes.data ?? []) as { fecha: string; dominadas: number }[]) {
      cacheMap.set(fila.fecha, fila.dominadas);
    }
  }

  const curva: PuntoCurva[] = [];
  const nuevasFilas: { user_id: string; fecha: string; dominadas: number }[] = [];
  let diasDesdeCache = 0;

  for (const f of fechas) {
    if (f === hoyISO) {
      // HOY nunca se cachea: puede cambiar en cualquier momento del día.
      curva.push({ fecha: f, dominadas: dominadasHasta(intentos, Date.now()) });
      continue;
    }
    if (cacheMap.has(f)) {
      curva.push({ fecha: f, dominadas: cacheMap.get(f)! });
      diasDesdeCache++;
      continue;
    }
    const valor = dominadasHasta(intentos, finDeDiaLocalMs(f));
    curva.push({ fecha: f, dominadas: valor });
    if (tablaExiste) nuevasFilas.push({ user_id: userId, fecha: f, dominadas: valor });
  }

  if (tablaExiste && nuevasFilas.length > 0) {
    const { error } = await db.from('curva_progreso').upsert(nuevasFilas, { onConflict: 'user_id,fecha' });
    // No se lanza: perder la caché de un día es barato (se recalcula la
    // próxima vez), y no puede tumbar la pantalla que sí tiene los datos.
    if (error) console.error('curva_progreso (cache):', error.message);
  }

  return { curva, diasDesdeCache };
}

export async function getMiEvolucion(): Promise<
  { success: true; data: MiEvolucion } | { success: false; error: string }
> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const modulo = await requireModule('stats');
  if (!modulo.ok) return { success: false as const, error: modulo.error };

  const userId = auth.user.id;
  const organizationId = auth.user.organizationId;

  // El banco disponible (global + privado de la academia) y a qué tema
  // pertenece cada pregunta — mismo patrón que `getMisCajones`.
  const [bancoRes, temasRes] = await Promise.all([
    supabaseAdmin
      .from('question_bank')
      .select('id, subject_id')
      .eq('status', QUESTION_STATUS.ACTIVE)
      .or(filtroBancoPorAcademia(organizationId)),
    supabaseAdmin.from('subjects').select('id, title'),
  ]);
  if (bancoRes.error) return { success: false as const, error: bancoRes.error.message };

  const tituloPorSubject = new Map<number, string>();
  for (const s of (temasRes.data ?? []) as { id: number; title: string }[]) tituloPorSubject.set(s.id, s.title);

  const preguntasPorTema = new Map<string, string>();
  for (const q of (bancoRes.data ?? []) as { id: string; subject_id: number | null }[]) {
    preguntasPorTema.set(q.id, q.subject_id != null ? tituloPorSubject.get(q.subject_id) ?? 'Sin tema' : 'Sin tema');
  }
  const totalBanco = preguntasPorTema.size;

  // Las respuestas del propio alumno van con SU SESIÓN (regla 34), paginadas
  // por encima del tope de PostgREST (regla 74).
  const db = await createSupabaseServerClient();
  const { data: intentos } = await paginaCompleta<IntentoPregunta>(
    (desde, hasta) =>
      db
        .from('question_attempts')
        .select('question_id, is_correct, error_type, selected_index, response_time_ms, option_changes, first_touch_ms, created_at, exam_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .range(desde, hasta) as unknown as Promise<{ data: IntentoPregunta[] | null; error: { message: string } | null }>,
    { maxFilas: MAX_INTENTOS_EVOLUCION },
  );

  const states = computeQuestionStates(intentos);
  const mapaTemas = resumeCajonesPorTema(states, preguntasPorTema);
  const resumen = resumeBanco(states, totalBanco);
  const desglose = desgloseConContexto(states, preguntasPorTema);
  const inicio = fechaInicio(intentos);
  const actividad = actividadDiaria(intentos);

  const diasEnOposicion = inicio
    ? Math.max(1, Math.floor((Date.now() - Date.parse(inicio)) / 86_400_000) + 1)
    : null;

  // La racha: días seguidos con actividad, contando hoy o ayer como ancla
  // (día de gracia) — misma cuenta que ya usa Inicio.
  const hoyISO = fechaLocalISO(Date.now());
  const diasConActividad = new Set(actividad.map((a) => a.fecha));
  let racha = 0;
  if (diasConActividad.size > 0) {
    let cursor = diasConActividad.has(hoyISO) ? Date.now() : Date.now() - 86_400_000;
    while (diasConActividad.has(fechaLocalISO(cursor))) {
      racha++;
      cursor -= 86_400_000;
    }
  }

  const { curva, diasDesdeCache } = await curvaConCache(db, userId, intentos, inicio);

  // ¿Aprobaría? — mismos simulacros que ya cuenta `resumeSimulacros`, sobre
  // el mismo `intentos` (que ya trae `exam_id`, sin consulta aparte).
  const simulacros = resumeSimulacros(intentos);

  return {
    success: true as const,
    data: {
      fechaInicio: inicio,
      diasEnOposicion,
      racha,
      mapaTemas,
      resumenBanco: resumen,
      desglose,
      curva,
      diasDesdeCache,
      actividad,
      simulacros,
    },
  };
}

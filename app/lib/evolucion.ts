/**
 * "MI EVOLUCIÓN" (regla 77) — la historia completa del alumno en una sola
 * pantalla, no cifras sueltas repartidas entre Inicio, Estadísticas y Mi
 * Perfil. Sustituye a "Estadísticas": mismo hueco en el menú, contenido
 * consolidado.
 *
 * Módulo puro (regla 21): toda la aritmética que ve el alumno vive aquí, sin
 * Supabase ni React, para poder testearla sin levantar nada.
 */

import type { QuestionState } from './question-scheduler';
import { fechaLocalISO } from './question-scheduler';

// ============================================================
// EL BANCO ENTERO — resumen agregado (fusionado con el mapa de temas)
// ============================================================

export type ResumenBanco = {
  /** Preguntas activas disponibles — banco global + el privado de la academia. */
  total: number;
  dominadas: number;
  /** Caja "consolidando": a 1-2 aciertos de darse por dominada. */
  enCamino: number;
  /** Tocadas alguna vez, pero ni consolidando ni dominadas. */
  vistasSinAsentar: number;
  /** Nunca contestadas ni dejadas en blanco. */
  sinTocar: number;
};

export function resumeBanco(states: Map<string, QuestionState>, total: number): ResumenBanco {
  let dominadas = 0;
  let enCamino = 0;
  for (const s of states.values()) {
    if (s.cajon === 'dominada') dominadas++;
    else if (s.cajon === 'consolidando') enCamino++;
  }
  const vistas = states.size;
  const vistasSinAsentar = Math.max(0, vistas - dominadas - enCamino);
  const sinTocar = Math.max(0, total - vistas);
  return { total, dominadas, enCamino, vistasSinAsentar, sinTocar };
}

// ============================================================
// EL DESGLOSE, CON CONTEXTO — no cifras frías sueltas
// ============================================================

export type TemaQueResiste = { topic: string; veces: number };

export type Desglose = {
  dominadas: number;
  enCamino: number;
  /** Cajón "atascada" (regla 55/60): más repeticiones no ayudan aquí. */
  seResisten: number;
  /** El tema con más atascadas, para decir POR QUÉ, no solo CUÁNTAS. `null` si `seResisten` es 0. */
  temaQueMasResiste: TemaQueResiste | null;
  /** La ha visto pero SOLO la ha dejado en blanco: la evita. */
  evitas: number;
};

/**
 * `preguntasPorTema` mapea questionId -> título del tema (mismo mapa que usa
 * `resumeCajonesPorTema`), para poder decir de qué tema son las atascadas sin
 * una consulta aparte.
 */
export function desgloseConContexto(
  states: Map<string, QuestionState>,
  preguntasPorTema: Map<string, string>,
): Desglose {
  let dominadas = 0;
  let enCamino = 0;
  let seResisten = 0;
  let evitas = 0;
  const porTema = new Map<string, number>();

  for (const [id, s] of states) {
    if (s.cajon === 'dominada') dominadas++;
    else if (s.cajon === 'consolidando') enCamino++;

    if (s.cajon === 'atascada') {
      seResisten++;
      const t = (preguntasPorTema.get(id) ?? 'Sin tema').trim() || 'Sin tema';
      porTema.set(t, (porTema.get(t) ?? 0) + 1);
    }

    if (s.soloBlancos) evitas++;
  }

  let temaQueMasResiste: TemaQueResiste | null = null;
  for (const [topic, veces] of porTema) {
    if (!temaQueMasResiste || veces > temaQueMasResiste.veces) temaQueMasResiste = { topic, veces };
  }

  return { dominadas, enCamino, seResisten, temaQueMasResiste, evitas };
}

// ============================================================
// CUÁNDO EMPEZÓ, Y CUÁNTO ESTUDIA CADA DÍA
// ============================================================

/** El ISO del primer intento, o `null` si no ha contestado nunca (regla 8). */
export function fechaInicio(intentos: { created_at?: string | null }[]): string | null {
  let min: number | null = null;
  for (const i of intentos) {
    const ms = i.created_at ? Date.parse(i.created_at) : NaN;
    if (Number.isFinite(ms) && (min === null || ms < min)) min = ms;
  }
  return min === null ? null : new Date(min).toISOString();
}

export type DiaActividad = { fecha: string; respuestas: number };

/**
 * Cuántas respuestas hay cada día — la racha diaria, estilo calendario de
 * contribuciones. Cuenta TODO intento (contestado o en blanco): es "cuánto
 * estudiaste", no solo "cuánto acertaste".
 */
export function actividadDiaria(intentos: { created_at?: string | null }[]): DiaActividad[] {
  const porDia = new Map<string, number>();
  for (const i of intentos) {
    const ms = i.created_at ? Date.parse(i.created_at) : NaN;
    if (!Number.isFinite(ms)) continue;
    const f = fechaLocalISO(ms);
    porDia.set(f, (porDia.get(f) ?? 0) + 1);
  }
  return [...porDia.entries()]
    .map(([fecha, respuestas]) => ({ fecha, respuestas }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ============================================================
// LA VENTANA DE LA CURVA — cuántos días atrás, como mucho
// ============================================================

/**
 * Un alumno con meses de antigüedad no necesita ver el primer día: cuesta
 * calcular cada punto nuevo (regla 77), así que se recorta la ventana en vez
 * de dejar que crezca sin límite. 60 días de sobra para contar la historia
 * sin que la primera visita —la que no tiene NADA cacheado todavía— tenga
 * que calcular un año entero de golpe.
 */
export const MAX_DIAS_CURVA = 60;

/** Medianoche LOCAL de una fecha `YYYY-MM-DD`, en milisegundos. */
function medianocheLocal(fechaISO: string): number {
  const [y, m, d] = fechaISO.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/**
 * Las fechas (`YYYY-MM-DD`, LOCAL) desde el inicio —recortado a
 * `MAX_DIAS_CURVA`— hasta hoy, ambas incluidas. Sin intentos todavía, solo
 * hoy.
 *
 * Los "días desde el inicio" se cuentan por CALENDARIO —medianoche a
 * medianoche—, nunca por milisegundos exactos entre dos marcas de tiempo
 * (regla 54/74): un alumno que empezó a las 22:00 y consulta esto a las 09:00
 * del día siguiente lleva UN día, no cero, aunque no hayan pasado 24 horas.
 */
export function rangoCurva(inicioISO: string | null, ahora: Date = new Date()): string[] {
  const hoyStr = fechaLocalISO(ahora.getTime());
  if (!inicioISO) return [hoyStr];

  const inicioStr = fechaLocalISO(Date.parse(inicioISO));
  const hoyMedianoche = medianocheLocal(hoyStr);
  const diasDesdeInicio = Math.round((hoyMedianoche - medianocheLocal(inicioStr)) / 86_400_000);
  const dias = Math.min(Math.max(0, diasDesdeInicio), MAX_DIAS_CURVA - 1);

  const fechas: string[] = [];
  for (let d = dias; d >= 0; d--) fechas.push(fechaLocalISO(hoyMedianoche - d * 86_400_000));
  return fechas;
}

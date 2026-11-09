/**
 * LO QUE TOCA HOY, derivado del motor (regla 94). Módulo PURO: sin imports de
 * servidor, se prueba sin Supabase.
 *
 * El Inicio ya no repite cifras que viven en «Mi evolución» (regla 63): dice
 * qué hacer hoy. Esto calcula las tres cosas que salen del histórico del
 * alumno; la clase y la física de hoy salen de sus propias acciones.
 */
import { estaVencida, type QuestionState } from './question-scheduler';

/**
 * Cuántos fallos hacen falta en un tema para decir que ahí es donde más se
 * falla. Con menos, es ruido: dos fallos sueltos no son una laguna.
 */
export const MIN_FALLOS_TEMA = 3;

/** Lo mismo que propone `getRecuentoEntrenamiento`: entre 1 y 25. */
export const MAX_PROPUESTA = 25;

export type EntrenoDeHoy = {
  /** Las que tocan hoy (nuevas + repaso vencido), con el tope de 25. 0 si no hay banco. */
  propuestas: number;
  disponibles: number;
  /**
   * Falladas cuyo repaso ya venció. NO es «alguna vez fallada»: una pregunta
   * que fallaste y ya acertaste después ha salido de este grupo (cajón
   * `aprendiendo` o superior). Solo cuentan `recaida` y `atascada`.
   */
  porRepasar: number;
  /** El tema con más preguntas en recaída o atascadas; `null` si ninguno llega al mínimo. */
  temaConMasFallos: { tema: string; fallos: number } | null;
};

const esFallo = (s: QuestionState) => s.cajon === 'recaida' || s.cajon === 'atascada';

export function entrenoDeHoy(
  states: Map<string, QuestionState>,
  temaPorPregunta: Map<string, string>,
  ahora: Date = new Date(),
): EntrenoDeHoy {
  const disponibles = temaPorPregunta.size;
  if (disponibles === 0) return { propuestas: 0, disponibles: 0, porRepasar: 0, temaConMasFallos: null };

  let tocan = 0;
  let porRepasar = 0;
  const fallosPorTema = new Map<string, number>();

  for (const [id, tema] of temaPorPregunta) {
    const s = states.get(id);
    if (!s || s.box === 0 || estaVencida(s, ahora)) tocan++;
    if (!s || !esFallo(s)) continue;
    if (estaVencida(s, ahora)) porRepasar++;
    const t = tema.trim() || 'Sin tema';
    fallosPorTema.set(t, (fallosPorTema.get(t) ?? 0) + 1);
  }

  let mejor: { tema: string; fallos: number } | null = null;
  for (const [tema, fallos] of fallosPorTema) {
    if (fallos < MIN_FALLOS_TEMA) continue;
    if (!mejor || fallos > mejor.fallos || (fallos === mejor.fallos && tema.localeCompare(mejor.tema, 'es') < 0)) {
      mejor = { tema, fallos };
    }
  }

  // Si no toca nada (todo en su intervalo de descanso), un repaso corto de 8.
  const propuestas = Math.max(1, Math.min(MAX_PROPUESTA, Math.min(tocan || 8, disponibles)));
  return { propuestas, disponibles, porRepasar, temaConMasFallos: mejor };
}

// ============================================================
// LA CLASE Y LA FÍSICA DE HOY
// ============================================================

/** Lo mínimo que hace falta de una clase (`ClaseAlumno` de `getMisClases`). */
type ClaseMin = { classId: string; nombre: string; sesiones: { fecha: string; hora: string | null; falta: boolean; sinClase?: boolean }[] };

export type ClaseDeHoy = { classId: string; nombre: string; hora: string | null; falta: boolean };

/**
 * La primera clase que el alumno tiene HOY, o `null`. `getMisClases` ya deja
 * fuera las que han terminado hoy, así que lo que sale aquí es lo que aún
 * está por venir o en curso. Con varias, la más temprana (sin hora, al final).
 */
export function claseDeHoy(clases: ClaseMin[], hoy: string): ClaseDeHoy | null {
  const deHoy = clases.flatMap((c) =>
    c.sesiones.filter((s) => s.fecha === hoy && !s.sinClase).map((s) => ({ classId: c.classId, nombre: c.nombre, hora: s.hora, falta: s.falta })),
  );
  if (deHoy.length === 0) return null;
  return deHoy.sort((a, b) => (a.hora ?? '99:99').localeCompare(b.hora ?? '99:99'))[0];
}

type SesionMin = { id: string; fecha: string; kind: string; title: string; durationMin: number | null; position: number };
type ApunteMin = { sessionId: string; status: 'hecha' | 'no_hecha' };

export type FisicaDeHoy = { id: string; titulo: string; tipo: string; minutos: number | null; hecha: boolean };

/**
 * La sesión de física de hoy, o `null`. Un día de `descanso` no es una tarea:
 * no se muestra. Con varias sesiones el mismo día, la primera por posición.
 * `hecha` es lo que el propio alumno ha apuntado.
 */
export function fisicaDeHoy(sesiones: SesionMin[], apuntes: ApunteMin[], hoy: string): FisicaDeHoy | null {
  const s = sesiones
    .filter((x) => x.fecha === hoy && x.kind !== 'descanso')
    .sort((a, b) => a.position - b.position)[0];
  if (!s) return null;
  return {
    id: s.id,
    titulo: s.title,
    tipo: s.kind,
    minutos: s.durationMin,
    hecha: apuntes.some((a) => a.sessionId === s.id && a.status === 'hecha'),
  };
}

/** Lo mínimo de una clase de física (`ClaseFisica`, regla 97). */
type ClaseFisicaMin = {
  grupo: string; fecha: string; hora: string | null; sinClase: boolean; motivo: string | null; falta: boolean;
  profesor: string | null; sesion: { title: string } | null;
};

export type ClaseFisicaDeHoy = {
  grupo: string; hora: string | null; titulo: string | null; profesor: string | null;
  sinClase: boolean; motivo: string | null; falta: boolean;
};

/**
 * La clase de física de HOY (la de su grupo, o a la que se apuntó como
 * multi), o `null`. La que hay va antes que una quitada; entre varias, la más
 * temprana. Un día «sin clase» también se dice: el alumno iba a ir.
 */
export function claseFisicaDeHoy(clases: ClaseFisicaMin[], hoy: string): ClaseFisicaDeHoy | null {
  const c = clases
    .filter((x) => x.fecha === hoy)
    .sort((a, b) => Number(a.sinClase) - Number(b.sinClase) || (a.hora ?? '99:99').localeCompare(b.hora ?? '99:99'))[0];
  if (!c) return null;
  return { grupo: c.grupo, hora: c.hora, titulo: c.sesion?.title ?? null, profesor: c.profesor, sinClase: c.sinClase, motivo: c.motivo, falta: c.falta };
}

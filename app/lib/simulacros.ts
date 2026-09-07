/**
 * ¿APROBARÍA? — la media de los simulacros, con la nota de la convocatoria.
 *
 * Es lo que más obsesiona a un opositor y no se enseñaba en ninguna parte. Un
 * simulacro se agrupa por `question_attempts.exam_id` (lo pone `saveExamResults`,
 * el mismo id en todas sus filas). El entrenamiento NO tiene `exam_id`: cada
 * respuesta va suelta y aquí no cuenta.
 *
 * Módulo puro (regla 21): la nota sale de `scoreExam`, la misma función que la
 * pantalla de resultados, así que la media y el resultado individual no pueden
 * divergir.
 */

import { scoreExam } from './scoring';
import { isBlankAnswer } from './exam-results';

export type IntentoSimulacro = {
  exam_id?: string | null;
  is_correct?: boolean | null;
  selected_index?: number | null;
  created_at?: string | null;
};

export type Simulacro = {
  examId: string;
  /** ISO de la respuesta más tardía del examen, o `null`. */
  fecha: string | null;
  total: number;
  aciertos: number;
  fallos: number;
  blancos: number;
  /** 0-10, fórmula del BOE (`scoreExam`). */
  nota: number;
  aprobado: boolean;
};

export type ResumenSimulacros = {
  /** Más reciente primero. */
  simulacros: Simulacro[];
  /** `null` = no ha hecho ninguno (regla 8). */
  media: number | null;
  mejor: number | null;
  /** Últimos 3 vs 3 anteriores. `null` si hay menos de 4. */
  tendencia: 'sube' | 'baja' | 'estable' | null;
};

/** Reproduce el reparto acierto/fallo/blanco como preguntas para `scoreExam`. */
function notaDe(aciertos: number, fallos: number, blancos: number): { nota: number; aprobado: boolean } {
  const sinteticas = [
    ...Array<{ userAnswer?: string | null; correctOptionId: string }>(aciertos).fill({ userAnswer: 'a', correctOptionId: 'a' }),
    ...Array<{ userAnswer?: string | null; correctOptionId: string }>(fallos).fill({ userAnswer: 'a', correctOptionId: 'b' }),
    ...Array<{ userAnswer?: string | null; correctOptionId: string }>(blancos).fill({ userAnswer: null, correctOptionId: 'a' }),
  ];
  const s = scoreExam(sinteticas);
  return { nota: s.score, aprobado: s.passed };
}

const media = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;

export function resumeSimulacros(rows: IntentoSimulacro[]): ResumenSimulacros {
  const porExamen = new Map<string, IntentoSimulacro[]>();
  for (const r of rows) {
    const id = r.exam_id?.trim();
    if (!id) continue;
    const lista = porExamen.get(id);
    if (lista) lista.push(r);
    else porExamen.set(id, [r]);
  }

  const simulacros: Simulacro[] = [];
  for (const [examId, intentos] of porExamen) {
    let aciertos = 0, fallos = 0, blancos = 0;
    for (const it of intentos) {
      if (isBlankAnswer(it.selected_index)) blancos++;
      else if (it.is_correct) aciertos++;
      else fallos++;
    }
    const { nota, aprobado } = notaDe(aciertos, fallos, blancos);
    const fecha = intentos
      .map((i) => i.created_at ?? null)
      .filter((x): x is string => !!x)
      .sort()
      .pop() ?? null;
    simulacros.push({ examId, fecha, total: intentos.length, aciertos, fallos, blancos, nota, aprobado });
  }

  simulacros.sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''));

  if (simulacros.length === 0) {
    return { simulacros: [], media: null, mejor: null, tendencia: null };
  }

  const notas = simulacros.map((s) => s.nota);
  const mediaNota = Math.round(media(notas) * 100) / 100;
  const mejor = Math.max(...notas);

  let tendencia: ResumenSimulacros['tendencia'] = null;
  if (simulacros.length >= 4) {
    const recientes = media(notas.slice(0, 3));
    const previos = media(notas.slice(3, 6));
    const dif = recientes - previos;
    tendencia = dif > 0.3 ? 'sube' : dif < -0.3 ? 'baja' : 'estable';
  }

  return { simulacros, media: mediaNota, mejor, tendencia };
}

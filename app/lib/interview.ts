/**
 * Entrevista personal: turnos, transcripcion e informe final.
 *
 * El modulo tenia todo el peso puesto en presionar al aspirante y nada en
 * devolverle algo: no se guardaba transcripcion ni se generaba informe, asi que
 * la sesion terminaba y el alumno se quedaba igual que empezo.
 */

export type InterviewSpeaker = 'inspector' | 'candidato';

export type InterviewTurn = {
  speaker: InterviewSpeaker;
  text: string;
};

/** Turnos que viajan al modelo en cada intercambio. */
export const MAX_CONTEXT_TURNS = 8;
/** Recorte por turno. */
export const MAX_TURN_CHARS = 800;
/** Minimo de respuestas del aspirante para que un informe signifique algo. */
export const MIN_TURNS_FOR_REPORT = 3;

export type InterviewReport = {
  /** 0-100. Impresion global del desempenio. */
  score: number;
  veredicto: string;
  fortalezas: string[];
  /** Contradicciones o puntos flojos detectados en el discurso. */
  contradicciones: string[];
  /** Que trabajar antes de la entrevista real. */
  recomendaciones: string[];
};

function clean(text: unknown): string {
  return typeof text === 'string' ? text.trim() : '';
}

/** Solo los turnos del aspirante: son los que se evaluan. */
export function candidateTurns(history: InterviewTurn[]): InterviewTurn[] {
  return history.filter((t) => t.speaker === 'candidato' && clean(t.text));
}

/** ¿Hay conversacion suficiente para que un informe diga algo? */
export function canEvaluate(history: InterviewTurn[]): boolean {
  return candidateTurns(history).length >= MIN_TURNS_FOR_REPORT;
}

/** Recorta el historial a lo que se manda al modelo en cada turno. */
export function trimContext(history: InterviewTurn[]): InterviewTurn[] {
  return history
    .filter((t) => clean(t.text))
    .slice(-MAX_CONTEXT_TURNS)
    .map((t) => ({ speaker: t.speaker, text: clean(t.text).slice(0, MAX_TURN_CHARS) }));
}

/** Transcripcion legible, para el prompt y para mostrarsela al alumno. */
export function formatTranscript(history: InterviewTurn[]): string {
  return history
    .filter((t) => clean(t.text))
    .map((t) => `${t.speaker === 'inspector' ? 'INSPECTOR' : 'ASPIRANTE'}: ${clean(t.text)}`)
    .join('\n');
}

/** Da forma al informe que devuelve el modelo, con valores por defecto sensatos. */
export function normalizeReport(data: unknown): InterviewReport | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(clean).filter(Boolean).slice(0, 6) : [];

  const rawScore = Number(d.score);
  const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 0;

  const veredicto = clean(d.veredicto);
  const fortalezas = list(d.fortalezas);
  const contradicciones = list(d.contradicciones);
  const recomendaciones = list(d.recomendaciones);

  // Un informe sin nada que decir no es un informe.
  if (!veredicto && !fortalezas.length && !recomendaciones.length) return null;

  return { score, veredicto, fortalezas, contradicciones, recomendaciones };
}

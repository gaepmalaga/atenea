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

// ============================================================
// QUE SALE DEL SISTEMA HACIA EL MODELO
// ============================================================

/**
 * Perfil del aspirante tal y como viaja a Gemini.
 *
 * Antes se mandaba `JSON.stringify(biodata)`: la fila ENTERA de la base de
 * datos, en cada turno de la entrevista. Eso incluia el `user_id`, las columnas
 * internas (`id`, `created_at`) y, sobre todo, `legal_issues` — el texto libre
 * donde el aspirante escribe sus antecedentes, con un "sinceridad absoluta
 * obligatoria" encima del campo.
 *
 * Lo que sale del sistema es ahora una decision explicita y auditable, no lo que
 * pasara a estar en la tabla.
 */
export type InterviewProfile = {
  entorno?: string;
  estudios?: string;
  experiencia?: string;
  aficiones?: string;
  motivacion?: string;
  fortalezas_debilidades?: string;
  temores?: string;
  /** Derivado, NUNCA el texto: ver `summarizeLegalIssues`. */
  incidencias_legales: string;
};

/** Fila de `profiles_biodata` en crudo. */
export type BiodataRow = Record<string, unknown>;

/**
 * Campos narrativos que el tribunal real pregunta y que el simulador necesita
 * para poder repreguntar. Nombre en la BD -> nombre en el prompt.
 */
const NARRATIVE_FIELDS: [string, keyof InterviewProfile][] = [
  ['family_background', 'entorno'],
  ['studies_motivation', 'estudios'],
  ['work_history', 'experiencia'],
  ['leisure_activities', 'aficiones'],
  ['police_motivation', 'motivacion'],
  ['strengths_weaknesses', 'fortalezas_debilidades'],
  ['fears_concerns', 'temores'],
];

/** Recorte por campo: el aspirante escribe en un textarea sin limite. */
export const MAX_PROFILE_FIELD_CHARS = 600;

/**
 * Los antecedentes NO salen en texto.
 *
 * El simulador necesita saber si hay algo que preguntar, no *qué* es. Un
 * antecedente penal es de las cosas mas sensibles que guarda esta aplicacion, y
 * mandarlo entero a un tercero en cada turno no hace falta para simular una
 * entrevista: basta con que el inspector sepa que tiene que sacar el tema.
 */
export function summarizeLegalIssues(value: unknown): string {
  const texto = clean(value);
  if (!texto) return 'sin declarar';
  // "no", "ninguno", "nada", "ninguna incidencia"...
  if (/^(no|ninguno|ninguna|nada|n\/a|negativo)\b/i.test(texto)) return 'declara no tener';
  return 'declara incidencias: pregunta por ellas, el aspirante las conoce';
}

/** Construye lo que se manda al modelo a partir de la fila de la BD. */
export function buildInterviewProfile(row: BiodataRow | null | undefined): InterviewProfile {
  const out: InterviewProfile = {
    incidencias_legales: summarizeLegalIssues(row?.legal_issues),
  };
  if (!row) return out;

  for (const [column, key] of NARRATIVE_FIELDS) {
    const texto = clean(row[column]);
    if (texto) out[key] = texto.slice(0, MAX_PROFILE_FIELD_CHARS);
  }
  return out;
}

/** ¿Hay algo con lo que trabajar, o el aspirante no ha rellenado nada? */
export function hasProfileContent(profile: InterviewProfile): boolean {
  return Object.entries(profile).some(([k, v]) => k !== 'incidencias_legales' && !!v);
}

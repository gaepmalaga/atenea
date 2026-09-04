/**
 * Lectura y validacion de lo que devuelve el modelo.
 *
 * Modulo puro: sin red y sin SDK, para poder testear el parseo y las reglas de
 * validacion con casos reales de salida mal formada.
 *
 * El codigo anterior hacia `JSON.parse(cleanAIResponse(text))` y daba por buena
 * cualquier estructura que parseara. Una pregunta con `correctIndex: 5` o con
 * dos opciones se guardaba igual, y el alumno acababa estudiando una respuesta
 * equivocada.
 */

import { OPTION_IDS } from './questions.ts';

// ============================================================
// PARSEO
// ============================================================

/** Quita las vallas de markdown (```json ... ```) que a veces envuelven la salida. */
function stripFences(text: string): string {
  return text.replace(/```(?:json)?/gi, '').trim();
}

/**
 * Localiza el primer objeto o array JSON completo del texto.
 *
 * Escanea contando llaves PERO respetando las cadenas y los escapes. El codigo
 * anterior usaba `indexOf('{')` + `lastIndexOf('}')`, que se lleva por delante
 * cualquier `}` que aparezca dentro de una cadena de texto — y en un temario
 * juridico aparecen.
 */
function sliceBalanced(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start === -1) return null;

  const open = text[start];
  const close = open === '{' ? '}' : ']';

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

/** Ultimo recurso: quita comas colgantes antes de un cierre. */
function dropTrailingCommas(json: string): string {
  return json.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Convierte la salida del modelo en un objeto.
 *
 * Prueba primero un `JSON.parse` directo: con el modo JSON del modelo la
 * respuesta ya es JSON valido y NINGUNA heuristica llega a ejecutarse, asi que
 * el contenido no se toca. Las pasadas siguientes solo actuan si hace falta.
 */
export function parseAIJson<T = unknown>(text: string): T | null {
  if (!text?.trim()) return null;

  const candidates: string[] = [];
  const raw = text.trim();
  candidates.push(raw);

  const unfenced = stripFences(raw);
  if (unfenced !== raw) candidates.push(unfenced);

  const balanced = sliceBalanced(unfenced);
  if (balanced) {
    candidates.push(balanced);
    candidates.push(dropTrailingCommas(balanced));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // siguiente estrategia
    }
  }
  return null;
}

// ============================================================
// VALIDACION DE PREGUNTAS
// ============================================================

export type ValidatedQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export type Validation<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

/** Cuantas opciones tiene una pregunta del CNP. */
export const REQUIRED_OPTIONS = OPTION_IDS.length;

const MIN_QUESTION_CHARS = 15;
const MIN_OPTION_CHARS = 1;

/**
 * Quita las marcas de Markdown que el modelo cuela en el texto.
 *
 * La IA escribe `**correcta**` para poner una palabra en negrita, pero un
 * enunciado de test es texto plano: la pantalla lo pintaba tal cual y el alumno
 * veia los asteriscos. Afectaba a 5 de las 67 preguntas del banco.
 *
 * Se limpia AL GUARDAR y no al mostrar, a proposito: menos superficie donde
 * equivocarse —el enunciado se pinta en cuatro sitios distintos— y el banco
 * queda con texto plano, que es lo que un enunciado debe ser.
 */
export function stripMarkdown(texto: string): string {
  return texto
    // **negrita** y __negrita__
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    // *cursiva* y _cursiva_, sin tocar un asterisco suelto ni los guiones
    // bajos de, por ejemplo, `error_type`.
    .replace(/(^|[\s(¿¡"'])\*(\S(?:.*?\S)?)\*(?=[\s).,;:!?"']|$)/g, '$1$2')
    .replace(/(^|[\s(¿¡"'])_(\S(?:.*?\S)?)_(?=[\s).,;:!?"']|$)/g, '$1$2')
    // `codigo`
    .replace(/`(.+?)`/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function normalize(s: unknown): string {
  return typeof s === 'string' ? stripMarkdown(s.trim()) : '';
}

/**
 * Comprueba que una pregunta generada es utilizable ANTES de guardarla.
 *
 * Cada regla corresponde a una forma real de fallar del modelo. Si algo no
 * cuadra se descarta la pregunta: es preferible generar otra que servir una
 * pregunta con la respuesta mal marcada.
 */
export function validateGeneratedQuestion(data: unknown): Validation<ValidatedQuestion> {
  if (!data || typeof data !== 'object') return { ok: false, reason: 'La respuesta no es un objeto.' };

  const d = data as Record<string, unknown>;

  const question = normalize(d.question ?? d.question_text);
  if (question.length < MIN_QUESTION_CHARS) {
    return { ok: false, reason: `Enunciado vacío o demasiado corto (${question.length} caracteres).` };
  }

  if (!Array.isArray(d.options)) return { ok: false, reason: 'Faltan las opciones.' };
  if (d.options.length !== REQUIRED_OPTIONS) {
    return { ok: false, reason: `Se esperaban ${REQUIRED_OPTIONS} opciones y llegaron ${d.options.length}.` };
  }

  const options = d.options.map(normalize);
  if (options.some((o) => o.length < MIN_OPTION_CHARS)) {
    return { ok: false, reason: 'Alguna opción viene vacía.' };
  }

  // Dos opciones idénticas dejan la pregunta sin respuesta única.
  const distintas = new Set(options.map((o) => o.toLowerCase()));
  if (distintas.size !== options.length) {
    return { ok: false, reason: 'Hay opciones repetidas.' };
  }

  // EL fallo peligroso: un índice fuera de rango se colapsaba en 'c' y el
  // alumno estudiaba una respuesta equivocada sin que nada avisara.
  const correctIndex = Number(d.correctIndex ?? d.correct_index);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= REQUIRED_OPTIONS) {
    return { ok: false, reason: `correctIndex fuera de rango: ${String(d.correctIndex ?? d.correct_index)}.` };
  }

  return {
    ok: true,
    value: {
      question,
      options,
      correctIndex,
      explanation: normalize(d.explanation),
    },
  };
}

// ============================================================
// VALIDACION DE FLASHCARDS
// ============================================================

export type ValidatedFlashcard = { front: string; back: string };

const MIN_CARD_CHARS = 3;

export function validateFlashcard(data: unknown): Validation<ValidatedFlashcard> {
  if (!data || typeof data !== 'object') return { ok: false, reason: 'La respuesta no es un objeto.' };

  const d = data as Record<string, unknown>;
  const front = normalize(d.front);
  const back = normalize(d.back);

  if (front.length < MIN_CARD_CHARS) return { ok: false, reason: 'El anverso viene vacío.' };
  if (back.length < MIN_CARD_CHARS) return { ok: false, reason: 'El reverso viene vacío.' };
  if (front.toLowerCase() === back.toLowerCase()) {
    return { ok: false, reason: 'Anverso y reverso son iguales.' };
  }

  return { ok: true, value: { front, back } };
}

// ============================================================
// VENTANA DE CONTEXTO
// ============================================================

/**
 * Toma un trozo aleatorio del documento para alimentar al modelo.
 *
 * `generateFlashcard` usaba siempre `substring(0, 2500)`: los mismos 2500
 * primeros caracteres del mismo documento, una y otra vez. Repasar un tema
 * producia tarjetas practicamente identicas.
 */
export function randomContextWindow(
  fullText: string,
  maxChars: number,
  random: () => number = Math.random
): string {
  const text = fullText ?? '';
  if (text.length <= maxChars) return text;
  const start = Math.floor(random() * (text.length - maxChars));
  return text.substring(start, start + maxChars);
}

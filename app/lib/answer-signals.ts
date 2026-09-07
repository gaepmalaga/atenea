/**
 * LO QUE SE APRENDE DEL ALUMNO SIN PREGUNTARLE NADA.
 *
 * POR QUÉ EXISTE
 * La plataforma llegó a pedirle al alumno DOS cosas más por cada pregunta: la
 * marca de confianza (¿lo tenías?) y el diagnóstico del fallo (¿olvido, laguna,
 * trampa o lectura?), este último obligatorio para poder avanzar. Con 50
 * preguntas eso son hasta 100 toques extra: la fricción se come el
 * entrenamiento, y un alumno que quiere terminar acaba pulsando lo mismo
 * siempre — con lo que el dato, además de caro, es falso.
 *
 * Y no hacía falta preguntarlo: **ya medimos cómo respondió**. Desde la fase
 * 2.3 cada fila de `question_attempts` guarda `response_time_ms` y
 * `option_changes` (cambios REALES de opción, no pulsaciones). De ahí salen las
 * dos señales que el método necesita:
 *
 *   · FIRMEZA — cómo de resuelto contestó. Sustituye a la marca de confianza.
 *   · TIPO DE FALLO — la misma taxonomía de siempre, deducida.
 *
 * Módulo PURO (regla 21). NO escribe nada y NO necesita columnas nuevas: se
 * deriva al LEER, igual que los cajones (`question-scheduler.ts`). Por eso
 * funciona también sobre todo el histórico.
 *
 * Un dato que falta NO es un cero (reglas 8 y 16): sin tiempo medido, la
 * firmeza es «normal», no «titubeante».
 */

// ============================================================
// FIRMEZA
// ============================================================

/** Cómo de resuelto se contestó. Deducido, nunca preguntado. */
export const FIRMEZA = {
  /** Cambió de opción varias veces, o tardó muchísimo. */
  TITUBEANTE: 0,
  /** Ni una cosa ni la otra, o no hay dato. */
  NORMAL: 1,
  /** A la primera y dentro del ritmo de examen. */
  FIRME: 2,
} as const;

export type Firmeza = (typeof FIRMEZA)[keyof typeof FIRMEZA];

export const FIRMEZA_LABEL: Record<Firmeza, string> = {
  0: 'Titubeaste',
  1: 'Normal',
  2: 'Firme',
};

/**
 * Ritmo de la convocatoria: 100 preguntas en 50 minutos son 30 s por pregunta
 * (`CNP_SCORING.secondsPerQuestion`). Por debajo de 20 s se contestó con
 * holgura; por encima de 45 s se estuvo peleando con ella.
 */
export const MS_FIRME = 20_000;
export const MS_TITUBEA = 45_000;
/** Dos cambios de opción ya no es dudar: es no tenerlo. */
export const CAMBIOS_TITUBEA = 2;
/** Por debajo de esto no da tiempo ni a leer el enunciado: se contestó a bulto. */
export const MS_SIN_LEER = 8_000;

/**
 * Las dos señales, con los nombres de la TABLA (`question_attempts`).
 *
 * En snake_case a propósito: quien las lee es el planificador, que recorre
 * filas tal y como salen de la base de datos. Traducirlas a camelCase aquí
 * obligaría a un mapeo por intento sobre veinte mil filas para no ganar nada
 * (regla 6: la traducción ocurre en UN sitio, `toResultRow`, y es al ESCRIBIR).
 */
export type SeñalesRespuesta = {
  response_time_ms?: number | null;
  option_changes?: number | null;
};

/** Milisegundos utilizables, o `null` si no hay dato (0 no es un tiempo). */
function ms(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Cambios de opción utilizables, o `null`. Aquí 0 SÍ es un dato: no cambió. */
function cambios(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/**
 * Cómo de resuelto contestó, a partir del tiempo y de los cambios de opción.
 *
 * Mide CÓMO respondió, no lo que creía saber — y a propósito no mira si acertó:
 * la firmeza tiene que poder cruzarse con el acierto después (un «firme» que
 * falla es el error caro; un «titubeante» que acierta es suerte que no se
 * repetirá).
 */
export function inferFirmeza(s: SeñalesRespuesta): Firmeza {
  const t = ms(s?.response_time_ms);
  const c = cambios(s?.option_changes);

  if ((c !== null && c >= CAMBIOS_TITUBEA) || (t !== null && t > MS_TITUBEA)) {
    return FIRMEZA.TITUBEANTE;
  }
  // Firme exige las DOS cosas: sin cambios y con tiempo medido y holgado. Sin
  // tiempo no se puede afirmar que fue firme, así que se queda en normal.
  if (c === 0 && t !== null && t <= MS_FIRME) return FIRMEZA.FIRME;
  return FIRMEZA.NORMAL;
}

// ============================================================
// TIPO DE FALLO
// ============================================================

/**
 * La misma taxonomía que se le pedía al alumno (`ERROR_TYPES` en `stats.ts`),
 * ahora deducida:
 *
 *   olvido              lo tenía aprendido y se le fue
 *   trampa              dudó entre opciones y la pregunta le llevó donde quería
 *   fallo_procesamiento contestó sin llegar a leer el enunciado
 *   desconocimiento     no lo sabía
 *
 * EL ORDEN NO ES NEGOCIABLE. El historial manda sobre la señal: si la tenía en
 * la caja 3 o más, fallarla es un olvido aunque además dudara. Y dudar manda
 * sobre la velocidad: quien cambió de opción SÍ leyó el enunciado, así que no
 * puede ser un fallo de lectura.
 *
 * `boxPrevio` es la caja ANTES de este fallo. Sin él (0), no se puede hablar de
 * olvido.
 */
export function inferErrorType(s: SeñalesRespuesta & { boxPrevio?: number }): string {
  const t = ms(s?.response_time_ms);
  const c = cambios(s?.option_changes);
  const box = Number(s?.boxPrevio);

  if (Number.isFinite(box) && box >= 3) return 'olvido';
  if (c !== null && c >= 1) return 'trampa';
  if (t !== null && t < MS_SIN_LEER) return 'fallo_procesamiento';
  return 'desconocimiento';
}

/**
 * El tipo de fallo de un intento: el que diagnosticó el alumno si lo hay, y si
 * no el deducido.
 *
 * Las filas anteriores al 7 sep 2026 traen `error_type` escrito a mano (el
 * diagnóstico era obligatorio); las de después vienen a `null` y se deducen. No
 * se pierde el histórico ni hay que migrarlo.
 */
export function errorTypeDe(
  intento: SeñalesRespuesta & { error_type?: string | null; boxPrevio?: number },
): string {
  const explicito = typeof intento?.error_type === 'string' ? intento.error_type.trim() : '';
  return explicito || inferErrorType(intento);
}

// ============================================================
// CUÁNDO SÍ MERECE LA PENA PREGUNTAR
// ============================================================

/**
 * LA REGLA: se pregunta solo lo que NO se puede deducir **y** que además cambia
 * lo que el sistema va a hacer. Y nunca bloquea.
 *
 * La firmeza no se pregunta jamás: se deduce, y se acierta. El tipo de fallo
 * también se deduce, pero la deducción se equivoca a veces — y hay fallos en los
 * que equivocarse sale caro:
 *
 *   · Fallar algo que YA tenías aprendido (caja ≥ 3). Si fue un despiste, la
 *     pregunta no debería caer a la caja 1 y volver mañana; si es que se te ha
 *     ido de verdad, sí. La deducción no distingue eso de forma fiable, y el
 *     alumno lo sabe al instante.
 *   · Una pregunta ATASCADA. Ahí ya sabemos que repetirla no funciona: lo que
 *     falta es saber POR QUÉ, para decidir si toca releer el artículo o si es
 *     que la pregunta está mal redactada.
 *
 * En el resto —material nuevo o en aprendizaje— fallar es lo normal y el motivo
 * no cambia nada: vuelve pronto igual. Ahí no se pregunta nada.
 *
 * Con un banco medianamente asentado esto sale a razón de 1 de cada 10 fallos,
 * no 10 de 10.
 */
export const CAJONES_QUE_PREGUNTAN: readonly string[] = [
  'consolidando',
  'dominada',
  'atascada',
];

export function mereceLaPenaPreguntar(cajon: string | null | undefined): boolean {
  return CAJONES_QUE_PREGUNTAN.includes((cajon ?? '').trim());
}

/**
 * Cómo se le cuenta al alumno lo que el sistema ha deducido, para que solo
 * tenga que corregirlo si no acierta.
 *
 * Se dice EL PORQUÉ («contestaste en 4 segundos»), no solo la etiqueta: sin el
 * motivo, corregir una conjetura que no se entiende es adivinar otra vez.
 */
export const FALLO_DEDUCIDO: Record<string, { label: string; porque: string }> = {
  olvido: { label: 'Un olvido', porque: 'esta ya la tenías' },
  trampa: { label: 'Te llevó al huerto', porque: 'cambiaste de opción' },
  fallo_procesamiento: { label: 'Un despiste', porque: 'contestaste muy rápido' },
  desconocimiento: { label: 'Una laguna', porque: 'no la tenías vista' },
};

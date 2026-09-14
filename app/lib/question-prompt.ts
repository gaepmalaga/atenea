import { SchemaType, type Schema } from '@google/generative-ai';
import { DIFFICULTY_BRIEF, type DifficultyLevel } from './questions.ts';

/**
 * EL PROMPT QUE ESCRIBE UNA PREGUNTA DE TEST.
 *
 * Vive aquí y no dentro de `actions/exams.ts` por el mismo motivo que el del
 * chat (regla 32): un fichero `'use server'` no se puede importar desde un
 * script ni desde un test, así que el prompt que de verdad genera las
 * preguntas del banco solo se ejecutaba en producción, donde nadie lo lee.
 *
 * Y ahora hay un segundo consumidor —el script de siembra masiva
 * (`npm run sembrar`)— que sin esto tendría que copiarlo. Dos copias de un
 * prompt son dos prompts: el día que se afine uno, el otro sigue generando
 * preguntas con las reglas viejas y nadie se entera hasta que un alumno
 * estudia el resultado.
 */

/** El trozo de temario del que sale la pregunta. */
export type ContextoPregunta = {
  /** El texto: un artículo suelto, o una ventana del documento entero. */
  texto: string;
  /**
   * De qué artículo sale. `null` cuando el contexto es una ventana del
   * documento (unos apuntes no tienen artículos), y entonces NO se le pide al
   * modelo que cite una referencia: inventársela es peor que no tenerla.
   */
  legal_reference: string | null;
};

/**
 * ESTILO SACADO DE LOS 5 EXÁMENES OFICIALES REALES (regla 72/75), NO DE SU
 * CONTENIDO.
 *
 * Analizado a mano sobre el texto indexado de los temas 46-50 (regla 75: esos
 * temas están vetados como FUENTE de generación — esto no es una excepción,
 * es una lectura hecha una vez por una persona, no algo que el modelo repita
 * por pregunta). Tres patrones que se repiten en el examen real y que el
 * banco propio no imitaba:
 *
 *   1. La pregunta pide un dato PRECISO (un plazo, quién hace qué, cómo se
 *      clasifica algo dentro de la norma) en vez de "¿qué dice el artículo
 *      X?" en abstracto — «¿cuánto tiempo hay para declarar...?», «¿quién
 *      aprueba y quién ratifica...?».
 *   2. Los distractores son VECINOS plausibles del dato correcto, no
 *      absurdos: si la respuesta es un plazo de 10 días, las otras dos
 *      opciones son también plazos razonables de un trámite parecido (72
 *      horas, 7 días) — nunca "30 años" al lado de "10 días".
 *   3. Algunas preguntas no piden el dato literal, piden dónde ENCAJA dentro
 *      de la norma (¿es un derecho fundamental o un principio rector?, ¿es
 *      un requisito o no lo es?) — miden si el alumno entiende la estructura,
 *      no solo si memorizó una frase.
 */
const ESTILO_EXAMEN_REAL = `
      ESTILO (de cómo pregunta el examen real, NUNCA de qué dice):
      - Pide un dato preciso y verificable (un plazo, un sujeto, una cifra, una
        clasificación), no "¿qué dice el artículo X?" en genérico.
      - Los distractores son plazos, cifras o conceptos VECINOS y plausibles
        del dato correcto — nunca opciones absurdas o evidentemente falsas.
      - Cuando el texto lo permite, considera una pregunta de ENCAJE: no "qué
        dice" sino "dónde se clasifica" o "quién es el competente".
      IMPORTANTE: esto es SOLO una guía de FORMA. El HECHO legal —el número,
      el plazo, el artículo, la excepción— sale EXCLUSIVAMENTE del TEXTO de
      abajo. No emplees ningún dato, cifra o artículo que no esté en ese
      texto, aunque te suene de un examen real: una norma citada hace años
      puede haber cambiado desde entonces.`;

export function buildQuestionPrompt(
  contexto: ContextoPregunta,
  nivel: DifficultyLevel,
): string {
  // El formato lo impone `responseSchema` en el modelo, no el prompt: por eso
  // aquí solo van las instrucciones pedagógicas.
  return `
      ACTÚA COMO: Tribunal Calificador de Policía Nacional.
      TAREA: Redactar UNA pregunta de test basada en este texto legal.
      TEXTO: """${contexto.texto}"""

      REGLAS:
      1. Exactamente 3 opciones, y solo UNA correcta.
      2. Dificultad: ${DIFFICULTY_BRIEF[nivel]}
      3. Las tres opciones deben ser distintas y plausibles.
      4. 'correctIndex' es la posición de la opción correcta: 0, 1 o 2.
      5. 'explanation' hace DOS cosas, las dos obligatorias: primero justifica
         POR QUÉ la correcta lo es, citando el texto; después, en una frase
         por cada una, dice POR QUÉ cada una de las OTRAS DOS opciones está
         mal — qué dato cambian, confunden o inventan. No basta con justificar
         solo la correcta: un alumno que falla necesita saber por qué la
         opción que marcó él en concreto no vale, no solo cuál era la buena.
      ${contexto.legal_reference
        ? `6. El texto es el ${contexto.legal_reference}. Cítalo en 'explanation'.`
        : ''}
      ${ESTILO_EXAMEN_REAL}
    `;
}

/**
 * LA FORMA QUE TIENE QUE DEVOLVER EL MODELO.
 *
 * Con `responseSchema` el formato lo impone el SDK, no el prompt: se acabaron
 * las vallas de markdown, el texto de cortesía por delante y las comas
 * colgantes que el parser tenía que limpiar a base de expresiones regulares
 * (regla 10).
 *
 * Vive aquí junto al prompt por lo mismo que él: `actions/core.ts` construye
 * los clientes al importarse, así que un script no puede tocarlo. Y el esquema
 * y el prompt tienen que cambiar a la vez — separarlos es cómo el prompt acabó
 * pidiendo unos campos y la UI leyendo otros (regla 17).
 */
export const QUESTION_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    question: { type: SchemaType.STRING },
    options: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      minItems: 3,
      maxItems: 3,
    },
    // El índice sigue validándose en el servidor: el esquema fija el tipo,
    // no el rango.
    correctIndex: { type: SchemaType.INTEGER },
    explanation: { type: SchemaType.STRING },
  },
  required: ['question', 'options', 'correctIndex', 'explanation'],
};

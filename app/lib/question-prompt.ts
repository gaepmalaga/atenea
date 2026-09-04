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
      5. 'explanation' justifica la respuesta citando el texto.
      ${contexto.legal_reference
        ? `6. El texto es el ${contexto.legal_reference}. Cítalo en 'explanation'.`
        : ''}
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

/**
 * El prompt con el que se escriben las fichas, y el esquema que se le impone
 * al modelo.
 *
 * POR QUÉ VIVE AQUÍ Y NO DENTRO DE LA SERVER ACTION
 * Es la regla 32 aplicada a las fichas, igual que ya se hizo con el prompt del
 * chat y con el de las preguntas: un fichero `'use server'` no se puede
 * importar desde un guion ni desde un test, así que un prompt encerrado ahí
 * solo se ejecuta en producción, que es donde nadie lo lee. El del chat estuvo
 * meses escribiendo disparates con todos los tests en verde.
 *
 * El esquema va en el MISMO fichero a propósito: los dos tienen que cambiar a
 * la vez. Separarlos es exactamente cómo el prompt acabó pidiendo unos campos
 * y la interfaz leyendo otros.
 */

/** Lo que se le exige al modelo. El formato lo impone el SDK, no el prompt. */
export const FLASHCARD_SCHEMA = {
  type: 'OBJECT',
  properties: {
    front: { type: 'STRING' },
    back: { type: 'STRING' },
  },
  required: ['front', 'back'],
} as const;

/**
 * El prompt.
 *
 * Sobre el original solo se añade lo que hacía falta ahora que las fichas van
 * a un BANCO COMPARTIDO y no a un alumno concreto:
 *
 *  - **Que no se repitan.** Antes cada tarjeta se generaba suelta y para una
 *    persona, así que dos casi idénticas no molestaban a nadie. En un banco
 *    sembrado de golpe sí: se le pasan los anversos ya escritos del tema para
 *    que no vuelva sobre lo mismo. La huella (`flashcardHash`) frena las
 *    literales; esto frena las parecidas, que la huella no ve.
 *  - **Que el reverso se sostenga solo.** Una ficha del banco la va a leer
 *    alguien que no ha visto el fragmento del que salió.
 */
export function buildFlashcardPrompt(fragmento: string, anversosYaEscritos: string[] = []): string {
  const evitar = anversosYaEscritos.length
    ? `\nYA HAY FICHAS DE ESTE TEMA SOBRE ESTO. No vuelvas sobre ninguna:\n${anversosYaEscritos
        .slice(0, 25)
        .map((f) => `  · ${f}`)
        .join('\n')}\n`
    : '';

  return `Escribe UNA ficha de estudio a partir de este fragmento del temario de
oposición a Policía Nacional.

  · El ANVERSO es una pregunta breve o un concepto. Nada de "¿Qué dice el
    fragmento?": quien la lea no tiene el fragmento delante.
  · El REVERSO es el dato exacto, y se sostiene solo. Si es un plazo, un número
    o un órgano, va literal.
  · No repitas el anverso dentro del reverso.
  · Nada de "según el texto" ni "el fragmento indica": la ficha se lee suelta,
    meses después.
${evitar}
FRAGMENTO:
"""${fragmento}"""`;
}

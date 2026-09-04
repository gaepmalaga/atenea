/**
 * La huella que evita preguntas duplicadas en el banco.
 *
 * `question_bank.question_hash` tiene una restriccion UNICA, y todos los
 * caminos que escriben una pregunta —la generacion en vivo, la siembra en lote
 * y ahora el alta a mano— tienen que calcularla EXACTAMENTE IGUAL. Si dos
 * caminos usan formulas distintas, la misma pregunta entra dos veces y el
 * alumno se la encuentra repetida en el mismo examen.
 *
 * Estaba copiada dos veces dentro de `actions/exams.ts`. Vive aqui porque es
 * logica pura (regla 21) y porque asi hay un solo sitio donde puede cambiar.
 *
 * NO se toca la formula: cambiarla dejaria huerfanas las huellas ya guardadas
 * y todo el banco existente pasaria a ser "nuevo".
 *
 * Usa `node:crypto`, asi que solo la importan el servidor y los tests. Un
 * componente de cliente que la importara reventaria el build, que es la
 * proteccion que se busca.
 */

import crypto from 'crypto';

/**
 * Huella de una pregunta dentro de su tema.
 *
 * El enunciado entra ya normalizado (`validateGeneratedQuestion` recorta y
 * quita el Markdown): dos preguntas que solo se diferencien en un `**` son la
 * misma pregunta.
 */
export function questionHash(subjectId: number, question: string, correctIndex: number): string {
  const payload = JSON.stringify({
    s: subjectId,
    q: question.trim(),
    c: correctIndex,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * La huella de una ficha del banco.
 *
 * Vive en el MISMO sitio que la de las preguntas y por el mismo motivo
 * (regla 27): en cuanto hay más de un camino de escritura, dos huellas
 * calculadas distinto meten la misma ficha dos veces y el alumno se la
 * encuentra repetida. Hoy el camino es uno —el guion de siembra— y justo por
 * eso conviene fijarlo antes de que sean dos.
 *
 * Entra el TEMA además del anverso porque la misma pregunta ("¿Cuál es el
 * plazo?") es una ficha legítimamente distinta en dos temas distintos.
 */
export function flashcardHash(topic: string, front: string, back: string): string {
  return crypto.createHash('sha256')
    .update(`${topic.trim().toLowerCase()}|${front.trim().toLowerCase()}|${back.trim().toLowerCase()}`)
    .digest('hex');
}

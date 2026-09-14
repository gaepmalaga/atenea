/**
 * PARES DE PREGUNTAS QUE SE CONFUNDEN ENTRE SÍ — DESCUBIERTO DE LOS DATOS.
 *
 * La pieza del diseño de Opus que sobrevivió a la vuelta de «motor
 * adaptativo v2» (regla 73): un grafo de confusión que la plataforma INFIERE
 * SOLA, sin que nadie etiquete nada — cumple la premisa del dueño de que los
 * admins no van a meter etiquetas por pregunta.
 *
 * LA SEÑAL, HONESTA SOBRE SUS LÍMITES
 * El diseño original hablaba de «quienes fallan A marcan SIEMPRE el mismo
 * señuelo que en B» — eso necesitaría saber que la opción 1 de A y la opción
 * 1 de B representan la MISMA idea falsa, y eso no se puede saber sin
 * etiquetar el significado de cada distractor (justo lo que se descartó).
 *
 * Lo que SÍ se puede medir sin etiquetar nada: si los alumnos que fallan A
 * fallan B MÁS A MENUDO de lo que el azar explicaría — co-fallo por encima
 * del esperado (`lift`). No dice POR QUÉ se confunden, pero señala DÓNDE
 * mirar: dos preguntas con co-fallo alto suelen ser la misma distinción mal
 * explicada en el banco, o directamente casi duplicadas (regla 35: un
 * patrón que aparece en muchos intentos es más fiable que mirar una
 * pregunta suelta).
 *
 * Módulo PURO (regla 21). Compara SOLO dentro del mismo tema — cruzar el
 * banco entero sería O(preguntas²) y casi toda esa comparación no
 * significaría nada (dos preguntas de temas distintos que ambas les cuestan
 * a los mismos alumnos flojos no son una confusión, son dos preguntas
 * difíciles).
 */

export type IntentoParaConfusion = {
  questionId: string;
  userId: string;
  isCorrect: boolean;
  topic: string;
};

export type ParConfuso = {
  a: string;
  b: string;
  topic: string;
  /** Alumnos que han respondido a las DOS preguntas. */
  n: number;
  /** De esos, cuántos han fallado las DOS. */
  fallanAmbas: number;
  /** `fallanAmbas / n`. */
  tasaCoFallo: number;
  /**
   * `tasaCoFallo` dividido entre lo que se esperaría si las dos preguntas
   * fallaran de forma INDEPENDIENTE (`tasaFalloA * tasaFalloB`). Un `lift`
   * de 2 significa que fallan juntas el doble de lo que el azar explicaría.
   */
  lift: number;
};

/**
 * Sin al menos esto de alumnos que hayan respondido a las DOS preguntas, un
 * co-fallo es ruido con forma de señal — el mismo riesgo que ya advertía el
 * diseño descartado sobre las etiquetas manuales, aplicado aquí a la
 * muestra estadística.
 */
export const MIN_ENCUESTADOS = 8;
/** Con menos de dos co-fallos reales, un `lift` alto es una casualidad. */
export const MIN_COFALLOS = 2;
/** Fallan juntas al menos un 50% más de lo que el azar explicaría. */
export const MIN_LIFT = 1.5;

/** Una respuesta por (alumno, pregunta): si algún intento la falló, cuenta como fallo. */
function resumePorAlumno(
  intentos: IntentoParaConfusion[],
): Map<string, Map<string, { correcta: boolean; topic: string }>> {
  const porAlumno = new Map<string, Map<string, { correcta: boolean; topic: string }>>();
  for (const it of intentos ?? []) {
    if (!it?.userId || !it?.questionId) continue;
    let respuestas = porAlumno.get(it.userId);
    if (!respuestas) {
      respuestas = new Map();
      porAlumno.set(it.userId, respuestas);
    }
    const previa = respuestas.get(it.questionId);
    // Si algún intento la falló, se cuenta como fallada: un acierto posterior
    // no borra que la creencia falsa estuvo ahí en algún momento.
    respuestas.set(it.questionId, {
      correcta: previa ? previa.correcta && it.isCorrect : it.isCorrect,
      topic: it.topic ?? previa?.topic ?? '',
    });
  }
  return porAlumno;
}

export function detectaConfusion(
  intentos: IntentoParaConfusion[],
  opciones?: { minEncuestados?: number; minLift?: number; minCofallos?: number },
): ParConfuso[] {
  const minN = opciones?.minEncuestados ?? MIN_ENCUESTADOS;
  const minLift = opciones?.minLift ?? MIN_LIFT;
  const minCofallos = opciones?.minCofallos ?? MIN_COFALLOS;

  const porAlumno = resumePorAlumno(intentos);

  // Fallo global por pregunta, para el `lift`.
  const totalPorPregunta = new Map<string, number>();
  const fallosPorPregunta = new Map<string, number>();
  for (const respuestas of porAlumno.values()) {
    for (const [qId, r] of respuestas) {
      totalPorPregunta.set(qId, (totalPorPregunta.get(qId) ?? 0) + 1);
      if (!r.correcta) fallosPorPregunta.set(qId, (fallosPorPregunta.get(qId) ?? 0) + 1);
    }
  }
  const tasaFallo = (qId: string): number => {
    const t = totalPorPregunta.get(qId) ?? 0;
    return t > 0 ? (fallosPorPregunta.get(qId) ?? 0) / t : 0;
  };

  // Co-ocurrencia por par, SOLO dentro del mismo tema.
  const coN = new Map<string, number>();
  const coFallo = new Map<string, number>();
  const temaDelPar = new Map<string, string>();

  for (const respuestas of porAlumno.values()) {
    // Agrupadas por tema: comparar solo dentro de cada grupo.
    const porTema = new Map<string, string[]>();
    for (const [qId, r] of respuestas) {
      const lista = porTema.get(r.topic) ?? [];
      lista.push(qId);
      porTema.set(r.topic, lista);
    }
    for (const [topic, ids] of porTema) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const [a, b] = ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]];
          const key = `${a}|${b}`;
          coN.set(key, (coN.get(key) ?? 0) + 1);
          temaDelPar.set(key, topic);
          const rA = respuestas.get(a)!;
          const rB = respuestas.get(b)!;
          if (!rA.correcta && !rB.correcta) {
            coFallo.set(key, (coFallo.get(key) ?? 0) + 1);
          }
        }
      }
    }
  }

  const pares: ParConfuso[] = [];
  for (const [key, n] of coN) {
    if (n < minN) continue;
    const fallanAmbas = coFallo.get(key) ?? 0;
    if (fallanAmbas < minCofallos) continue;

    const [a, b] = key.split('|');
    const esperado = tasaFallo(a) * tasaFallo(b);
    if (esperado <= 0) continue; // sin fallo esperado no se puede calcular un lift que signifique algo

    const tasaCoFallo = fallanAmbas / n;
    const lift = tasaCoFallo / esperado;
    if (lift < minLift) continue;

    pares.push({
      a,
      b,
      topic: temaDelPar.get(key) ?? '',
      n,
      fallanAmbas,
      tasaCoFallo: Math.round(tasaCoFallo * 100) / 100,
      lift: Math.round(lift * 100) / 100,
    });
  }

  // Los más llamativos primero.
  return pares.sort((x, y) => y.lift - x.lift || y.n - x.n);
}

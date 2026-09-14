/**
 * DE QUÉ TEMA SALE CADA PREGUNTA DE UN EXAMEN OFICIAL REAL.
 *
 * Los 5 PDF de exámenes reales (2021-2025, regla 72) están «resueltos y
 * desarrollados»: cada pregunta viene ya etiquetada por el propio documento
 * con «Tema N · Título», la respuesta correcta marcada con «✔» y una
 * explicación bajo «POR QUÉ». No hace falta IA para extraer esto — es un
 * patrón de texto consistente, comprobado contra los 5 documentos reales
 * (497 de 500 preguntas lo llevan; las que faltan son variación de OCR, no
 * un fallo del patrón).
 *
 * Módulo PURO (regla 21): el texto ya está indexado
 * (`documents.full_text`), así que esto solo lo recorre.
 */

/**
 * Cuenta cuántas preguntas de un examen real caen en cada tema, a partir del
 * texto completo del documento.
 *
 * Devuelve un array con un número de tema por cada mención encontrada —no un
 * Set ni un mapa— porque una pregunta por tema es justo lo que hay que poder
 * sumar entre varios exámenes después.
 */
export function extraeTemasDeExamenReal(fullText: string): number[] {
  if (!fullText) return [];
  const encontrados = fullText.matchAll(/Tema\s+(\d{1,2})\s*·/g);
  const temas: number[] = [];
  for (const m of encontrados) {
    const n = Number(m[1]);
    if (Number.isInteger(n) && n >= 1 && n <= 45) temas.push(n);
  }
  return temas;
}

/** Cuenta ocurrencias por tema, de una o varias listas (una por examen). */
export function cuentaPorTema(...listasDeTemas: number[][]): Record<number, number> {
  const cuenta: Record<number, number> = {};
  for (const lista of listasDeTemas) {
    for (const tema of lista) {
      cuenta[tema] = (cuenta[tema] ?? 0) + 1;
    }
  }
  return cuenta;
}

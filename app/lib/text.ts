/**
 * Utilidades de texto puras (sin dependencias de red ni de entorno).
 * Extraidas de app/actions/core.ts para poder testearlas de forma aislada.
 */

// NOTA: `cleanAIResponse` se retiro en la fase 3. Era un apanio de expresiones
// regulares que corrompia el contenido en los casos limite (una coma seguida de
// `}` dentro de una cadena, o una llave dentro de un texto legal). Lo sustituye
// `parseAIJson` en app/lib/ai-output.ts, que parsea de verdad y respeta las
// cadenas; y los modelos van en modo JSON, asi que casi nunca hace falta.

/**
 * Normaliza el texto crudo extraido de un PDF legal.
 *
 * NOTA: el original en core.ts incluia `.replace(/[]/g, '')`. Una clase de
 * caracteres vacia en JavaScript no casa con NADA, asi que esa linea siempre
 * fue un no-op silencioso (probablemente se intentaba limpiar caracteres de
 * control). Aqui se replica el comportamiento actual a proposito: limpiarlos
 * de verdad es un cambio funcional y esta planificado en la Fase 3.
 */
export function cleanLegalText(raw: string): string {
  return raw
    .replace(/%[0-9A-F]{2}/g, (match) => {
      try {
        return decodeURIComponent(match);
      } catch {
        return match;
      }
    })
    .replace(/----------------Page \(\d+\) Break----------------/g, '\n')
    .replace(/\n\s*\d+\s*\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const CHUNK_MAX_CHARS = 1000;
export const CHUNK_OVERLAP_CHARS = 200;

/**
 * Parte un parrafo demasiado largo en trozos que quepan en `limit`.
 *
 * Primero por frases (los textos legales estan llenos de puntos), y si una
 * frase sigue sin caber, corte duro. Nunca devuelve trozos vacios.
 */
function splitLongParagraph(paragraph: string, limit: number): string[] {
  if (paragraph.length <= limit) return [paragraph];

  // Se conserva el signo de puntuacion al final de cada frase.
  const sentences = paragraph.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) ?? [paragraph];
  const out: string[] = [];
  let current = '';

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;

    if (sentence.length > limit) {
      // Frase mas larga que el limite: corte duro.
      if (current) { out.push(current); current = ''; }
      for (let i = 0; i < sentence.length; i += limit) {
        out.push(sentence.slice(i, i + limit));
      }
      continue;
    }

    if (!current) current = sentence;
    else if (current.length + 1 + sentence.length <= limit) current += ' ' + sentence;
    else { out.push(current); current = sentence; }
  }

  if (current) out.push(current);
  return out;
}

/** Divide el texto en unidades que ya caben en `limit`, respetando parrafos. */
function toSegments(text: string, limit: number): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => splitLongParagraph(p, limit));
}

/**
 * Trocea un texto en fragmentos aptos para embeddings, respetando parrafos y
 * solapando el final del fragmento anterior para no perder contexto.
 *
 * Garantias (el algoritmo anterior no cumplia ninguna, ver PLAN 2.6):
 *  - Nunca devuelve fragmentos vacios. Antes, si el texto empezaba por un
 *    parrafo largo, el primer fragmento era '' y `embedContent('')` fallaba:
 *    el documento quedaba indexado a medias sin avisar al administrador.
 *  - Ningun fragmento supera `maxChars`. Antes un articulo largo sin lineas en
 *    blanco producia un fragmento unico gigante.
 *  - El solape se toma del CONTENIDO del fragmento anterior, no del fragmento
 *    ya solapado. Antes el solape se acumulaba y los tamanios crecian.
 */
export function chunkLegalText(
  cleanText: string,
  maxChars: number = CHUNK_MAX_CHARS,
  overlap: number = CHUNK_OVERLAP_CHARS
): string[] {
  const text = (cleanText ?? '').trim();
  if (!text) return [];

  const safeOverlap = Math.max(0, Math.min(overlap, Math.floor(maxChars / 2)));
  // Presupuesto de contenido NUEVO por fragmento: lo que sobra tras reservar
  // sitio para el solape Y para el salto de linea que lo separa. Sin contar ese
  // separador, el fragmento se pasaba del maximo por un caracter.
  const separator = safeOverlap > 0 ? 1 : 0;
  const budget = Math.max(1, maxChars - safeOverlap - separator);

  const segments = toSegments(text, budget);

  const packed: string[] = [];
  let current = '';
  for (const segment of segments) {
    if (!current) current = segment;
    else if (current.length + 2 + segment.length <= budget) current += '\n\n' + segment;
    else { packed.push(current); current = segment; }
  }
  if (current) packed.push(current);

  if (safeOverlap === 0) return packed;

  return packed.map((chunk, i) =>
    i === 0 ? chunk : packed[i - 1].slice(-safeOverlap) + '\n' + chunk
  );
}

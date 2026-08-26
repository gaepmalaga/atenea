/**
 * Utilidades de texto puras (sin dependencias de red ni de entorno).
 * Extraidas de app/actions/core.ts para poder testearlas de forma aislada.
 */

/**
 * Extrae el objeto JSON de una respuesta de la IA que puede venir envuelta
 * en vallas de markdown (```json ... ```) o con texto por delante/detras.
 */
export function cleanAIResponse(text: string): string {
  if (!text) return '{}';
  let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    clean = clean.substring(firstBrace, lastBrace + 1);
  }
  return clean.replace(/,\s*\]/g, ']').replace(/,\s*\}/g, '}');
}

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
 * Trocea un texto en fragmentos aptos para embeddings, respetando parrafos
 * y solapando el final del fragmento anterior para no perder contexto.
 *
 * Replica exacta del algoritmo actual de `uploadTopicPDF`, aislado para poder
 * caracterizarlo con tests antes de corregirlo (ver PLAN, Fase 3).
 */
export function chunkLegalText(
  cleanText: string,
  maxChars: number = CHUNK_MAX_CHARS,
  overlap: number = CHUNK_OVERLAP_CHARS
): string[] {
  const paragraphs = cleanText.split(/\n\s*\n/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const p of paragraphs) {
    if (currentChunk.length + p.length > maxChars) {
      chunks.push(currentChunk);
      currentChunk = currentChunk.slice(-overlap) + '\n' + p;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + p;
    }
  }
  if (currentChunk) chunks.push(currentChunk);

  return chunks;
}

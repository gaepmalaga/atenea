/**
 * Lo que el panel enseña de un documento ya indexado.
 *
 * POR QUE EXISTE ESTE FICHERO
 * Hasta ahora subias un PDF y no habia forma de comprobar QUE habia entendido
 * la plataforma: solo un contador de fragmentos. Ese es el origen real de la
 * desconfianza con la ingesta, y se cura enseñandolo.
 *
 * La logica vive aqui y no dentro de la accion porque `actions/core.ts`
 * construye clientes al importarse y nada de lo que cuelgue de el se puede
 * testear (regla 21).
 */

/**
 * Un fragmento tal y como se lee para enseñarlo.
 *
 * SIN `embedding` A PROPOSITO: son 3.072 numeros por fragmento, y un documento
 * como la Constitucion tiene 232. Traerlos al navegador serian varios megas
 * para pintar texto.
 */
export type DocumentChunkRow = {
  id: number;
  /** «Artículo 37», «Disposición adicional primera»… o `null` si no es texto legal. */
  reference: string | null;
  content_chunk: string;
};

/** Los fragmentos que salen de una misma referencia, seguidos. */
export type ReferenceGroup = {
  reference: string | null;
  chunks: DocumentChunkRow[];
};

/**
 * Agrupa los fragmentos por la referencia de la que salen.
 *
 * Agrupa CONSECUTIVOS, no todos los que compartan referencia. En un documento
 * bien troceado los fragmentos de un articulo van seguidos, asi que las dos
 * cosas coinciden; si no coinciden es que algo esta fuera de sitio, y el visor
 * debe enseñarlo en vez de disimularlo juntandolo todo.
 */
export function groupChunksByReference(chunks: DocumentChunkRow[]): ReferenceGroup[] {
  const grupos: ReferenceGroup[] = [];

  for (const chunk of chunks) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.reference === chunk.reference) ultimo.chunks.push(chunk);
    else grupos.push({ reference: chunk.reference, chunks: [chunk] });
  }

  return grupos;
}

/** El resumen de arriba del visor. */
export type ChunkSummary = {
  total: number;
  conReferencia: number;
  referenciasDistintas: number;
  caracteres: number;
  /** El fragmento mas largo. Si supera el maximo, el troceado tiene un fallo. */
  maxCaracteres: number;
};

/**
 * Cuatro numeros que dicen de un vistazo si la ingesta fue bien.
 *
 * `conReferencia` es el que mas importa: un texto legal con 0 referencias
 * significa que no se detecto su estructura y que se troceo a ciegas. En unos
 * apuntes, en cambio, 0 es lo normal — por eso el visor enseña el numero y no
 * un semaforo que mentiria en uno de los dos casos.
 */
export function summarizeChunks(chunks: DocumentChunkRow[]): ChunkSummary {
  const referencias = new Set<string>();
  let caracteres = 0;
  let maxCaracteres = 0;

  for (const c of chunks) {
    const referencia = c.reference?.trim();
    if (referencia) referencias.add(referencia);
    caracteres += c.content_chunk.length;
    if (c.content_chunk.length > maxCaracteres) maxCaracteres = c.content_chunk.length;
  }

  return {
    total: chunks.length,
    conReferencia: chunks.filter((c) => c.reference?.trim()).length,
    referenciasDistintas: referencias.size,
    caracteres,
    maxCaracteres,
  };
}

'use server';

import { supabaseAdmin as supabase, chatModel, embeddingModel } from './core';

/**
 * Tipado para los fragmentos recuperados de la base de datos
 */
type Chunk = {
  id?: string;
  filename: string;
  content_chunk: string;
  similarity?: number;
};

type AskAteneaResult =
  | { success: true; answer: string; sources: Chunk[] }
  | { success: false; error: string };

/**
 * Evita enviar información redundante al modelo de IA
 */
function dedupeChunks(chunks: Chunk[]) {
  const seen = new Set<string>();
  const out: Chunk[] = [];
  for (const c of chunks) {
    const key = `${c.filename}::${c.content_chunk.substring(0, 50)}`; // Llave basada en contenido parcial
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

export async function askAtenea(query: string): Promise<AskAteneaResult> {
  try {
    // 1. Limpieza y validación de entrada
    const safeQuery = query.trim().slice(0, 1000);
    if (!safeQuery) return { success: false, error: 'Consulta vacía.' };

    // 2. Generación de embedding para búsqueda semántica
    const embeddingResult = await embeddingModel.embedContent(safeQuery);

    // 3. Recuperación de conocimiento desde Supabase (RPC match_document_chunks)
    const { data, error: rpcError } = await supabase.rpc('match_document_chunks', {
      query_embedding: embeddingResult.embedding.values,
      match_threshold: 0.45, // Equilibrio entre precisión y cantidad
      match_count: 8,
    });

    if (rpcError) {
      console.error('RPC Error:', rpcError);
      return { success: false, error: 'Error en la conexión con la base de datos legislativa.' };
    }

    const rawChunks = (Array.isArray(data) ? data : []) as Chunk[];

    if (!rawChunks.length) {
      return {
        success: true,
        answer: '⚠️ **SIN REFERENCIAS OFICIALES**.\n\nNo he localizado fragmentos en el temario cargado que respondan con exactitud a su consulta. Por protocolo de seguridad, no puedo generar una respuesta basada en especulaciones.',
        sources: [],
      };
    }

    // 4. Refinado de contexto: Deduplicación y orden por relevancia
    const cleanChunks = dedupeChunks(rawChunks).sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));

    // 5. Construcción del contexto numerado para que la IA pueda CITAR
    const contextWithCitations = cleanChunks
      .slice(0, 6) // Usamos los 6 mejores para no saturar la memoria (context window)
      .map((c, idx) => `[FUENTE ${idx + 1}]: ${c.filename}\nCONTENIDO: ${c.content_chunk}`)
      .join('\n\n---\n\n');

    // 6. System Prompt de Nivel Élite
    const prompt = `
ACTÚA COMO: ATENEA (Sistema de Inteligencia para Oposiciones de Policía Nacional).
TONO: Militar, directo, analítico y pedagógico.

TU MISIÓN: Responder a la consulta del aspirante utilizando EXCLUSIVAMENTE el CONTEXTO OFICIAL proporcionado abajo.

CONTEXTO OFICIAL:
"""
${contextWithCitations}
"""

NORMAS DE RESPUESTA (CRÍTICAS):
1. Si la información no está en el contexto, di: "No consta en el temario oficial aportado."
2. CITAS OBLIGATORIAS: Al final de cada párrafo o dato clave, añade la cita de la fuente utilizada, ej: [1], [2].
3. ESTRUCTURA:
   - Definición técnica al inicio.
   - Listas con viñetas (*) para desglosar características.
   - TABLA Markdown para cualquier comparación o clasificación.
4. CIERRE OBLIGATORIO:
   **🎯 FOCO EXAMEN (Cuidado con la trampa)**
   - Desglosa de 2 a 4 "trampas" típicas (plazos que cambian, conceptos similares que confunden, o excepciones legales).

CONSULTA DEL ASPIRANTE:
"${safeQuery}"
`.trim();

    // 7. Generación de la respuesta
    const result = await chatModel.generateContent(prompt);
    const answer = result.response.text()?.trim() || 'Error en la generación de respuesta.';

    return { 
      success: true, 
      answer, 
      sources: cleanChunks.slice(0, 6) 
    };

  } catch (e) {
    console.error('Fallo en askAtenea:', e);
    return { success: false, error: 'Fallo crítico en el motor de inteligencia.' };
  }
}
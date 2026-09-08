'use server'
import { supabaseAdmin as supabase, getSubjectIdByName } from './core';
import { requireUser } from '../lib/auth';
import { numeroDeArticulo } from '../lib/chat';

/**
 * LEER EL ARTÍCULO — la intervención de verdad para una pregunta atascada.
 *
 * Cuando el alumno falla la misma pregunta 4+ veces (o cae siempre en el mismo
 * distractor), repetirla en tests no funciona (técnica 10 de
 * `METODO-APRENDIZAJE.md`). Hay que ir A LA FUENTE. La plataforma ya sabe de qué
 * artículo sale la pregunta (`question_bank.legal_reference`) y tiene su texto
 * troceado en `document_chunks` (desde P1b, un fragmento = un artículo). Esto
 * los une.
 *
 * Contenido compartido de solo lectura: clave de servicio + `requireUser`
 * (regla 34), como `getStudentSyllabus`. `document_chunks` y `documents` tienen
 * RLS y cero políticas.
 */

export type ArticuloTemario = {
  /** La referencia tal y como está en el fragmento: «Artículo 25». */
  reference: string;
  texto: string;
  /** De qué documento sale, para citarlo. */
  documento: string;
};

export async function getArticulo(params: {
  topic: string;
  legalReference: string | null;
}): Promise<
  { success: true; articulo: ArticuloTemario | null } | { success: false; error: string }
> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const topic = (params.topic ?? '').trim();
  const target = numeroDeArticulo(params.legalReference);
  // Sin número de artículo no hay nada que buscar: la referencia es de unos
  // apuntes (sin articulado) o no consta. No es un error.
  if (!topic || target === null) return { success: true as const, articulo: null };

  let subjectId: number;
  try {
    subjectId = await getSubjectIdByName(topic);
  } catch {
    return { success: true as const, articulo: null };
  }

  const { data, error } = await supabase
    .from('document_chunks')
    .select('reference, content_chunk, documents!inner(filename, subject_id)')
    .eq('documents.subject_id', subjectId)
    .not('reference', 'is', null);

  if (error) {
    console.error('getArticulo:', error.message);
    return { success: false as const, error: error.message };
  }

  type Fila = { reference: string | null; content_chunk: string | null; documents: { filename: string | null } | { filename: string | null }[] | null };
  const filas = (data as unknown as Fila[] | null) ?? [];

  // El fragmento cuyo número de artículo coincide. `numeroDeArticulo` lee tanto
  // «Artículo 25» como «Artículo veinticinco» (regla 30), así que se compara el
  // NÚMERO ya leído, no el texto.
  const fila = filas.find((f) => numeroDeArticulo(f.reference) === target);
  if (!fila?.content_chunk || fila.content_chunk.trim().length < 20) {
    return { success: true as const, articulo: null };
  }

  const doc = Array.isArray(fila.documents) ? fila.documents[0] : fila.documents;
  return {
    success: true as const,
    articulo: {
      reference: fila.reference ?? params.legalReference ?? '',
      texto: fila.content_chunk.trim(),
      documento: doc?.filename ?? '',
    },
  };
}

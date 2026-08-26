'use server'
import PDFParser from 'pdf2json';
import { supabaseAdmin as supabase, embeddingModel } from './core';
import { cleanLegalText, chunkLegalText } from '../lib/text';
import { requireAdmin, requireUser } from '../lib/auth';
import { checkQuota } from '../lib/rate-limit';
import { isQuestionStatus, type QuestionStatus } from '../lib/questions';
import type { ActivityRow } from '../lib/stats';

// --- TIPOS DEL TEMARIO ---
// Reflejan la forma que devuelve el `select` anidado de Supabase.

type DocumentRow = { id: string; filename: string; uploaded_at: string };
type SubjectRow = { id: number; topic_number: number; title: string; documents?: DocumentRow[] | null };
type BlockRow = { id: number; name: string; subjects: SubjectRow[] };

/** Mensaje de error legible, sin depender de que lo lanzado sea un Error. */
function errorMessage(e: unknown, fallback = 'Error desconocido'): string {
  return e instanceof Error ? e.message : fallback;
}

// --- GESTIÓN DE TEMARIO OFICIAL ---

export async function getOfficialSyllabus() {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  try {
    // CORRECCIÓN AQUÍ: Cambiado 'created_at' por 'uploaded_at'
    const { data, error } = await supabase
      .from('blocks')
      .select(`
        id, name,
        subjects ( 
            id, topic_number, title, 
            documents ( id, filename, uploaded_at ) 
        )
      `)
      .order('id', { ascending: true });

    if (error) throw error;

    const syllabus = (data as unknown as BlockRow[]).map((block) => ({
      id: block.id,
      name: block.name,
      subjects: [...block.subjects]
        .sort((a, b) => a.topic_number - b.topic_number)
        .map((sub) => ({
          id: sub.id,
          number: sub.topic_number,
          title: sub.title,
          documents: sub.documents || [],
          docCount: sub.documents ? sub.documents.length : 0 
        }))
    }));

    return { success: true as const, syllabus };
  } catch (e) {
    // El detalle se queda en el servidor: devolverlo filtraba la estructura de la BD.
    console.error("Error fetching syllabus:", e);
    return { success: false as const, error: 'No se pudo cargar el temario.' };
  }
}

export async function deleteDocument(documentId: string) {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };

    try {
        const { error } = await supabase.from('documents').delete().eq('id', documentId);
        if (error) throw error;
        return { success: true };
    } catch (e) {
        return { success: false, error: errorMessage(e) };
    }
}

export async function uploadTopicPDF(formData: FormData) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  // Un PDF de temario son decenas de embeddings, uno por fragmento.
  const quota = await checkQuota(auth.user.id, 'index');
  if (!quota.ok) return { success: false, error: quota.error };

  try {
    const file = formData.get('file') as File;
    const subjectIdStr = formData.get('subjectId') as string;

    if (!file || !subjectIdStr) throw new Error("Faltan datos.");
    const subjectId = parseInt(subjectIdStr);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const text = await new Promise<string>((resolve, reject) => {
      // pdf2json no expone tipos para este constructor de dos argumentos.
      const PdfParserCtor = PDFParser as unknown as new (ctx: null, verbosity: number) => {
        on(event: string, cb: (payload?: { parserError?: unknown }) => void): void;
        getRawTextContent(): string;
        parseBuffer(buffer: Buffer): void;
      };
      const pdfParser = new PdfParserCtor(null, 1);
      pdfParser.on("pdfParser_dataError", (err) => reject(err?.parserError ?? err));
      pdfParser.on("pdfParser_dataReady", () => {
        const raw = pdfParser.getRawTextContent();
        resolve(raw);
      });
      pdfParser.parseBuffer(buffer);
    });

    const cleanText = cleanLegalText(text);
    if (cleanText.length < 100) throw new Error("PDF vacío o ilegible.");
    const filename = file.name.replace('.pdf', '').replace(/_/g, ' ');

    const { data: docData, error: docError } = await supabase
        .from('documents')
        .insert({
            subject_id: subjectId,
            filename: filename,
            full_text: cleanText,
            uploaded_at: new Date().toISOString()
        })
        .select()
        .single();

    if (docError) throw docError;
    const documentId = docData.id;

    const chunksToIndex = chunkLegalText(cleanText);

    if (chunksToIndex.length === 0) throw new Error("El PDF no ha producido ningún fragmento indexable.");

    const BATCH_SIZE = 5;
    let processedChunks = 0;
    const failures: string[] = [];

    for (let i = 0; i < chunksToIndex.length; i += BATCH_SIZE) {
        const batch = chunksToIndex.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (chunkContent, j) => {
            const position = i + j + 1;
            try {
                const embResult = await embeddingModel.embedContent(chunkContent);
                const vector = embResult.embedding.values;

                if (!vector || vector.length === 0) throw new Error("La IA devolvió un vector vacío");

                const { error } = await supabase.from('document_chunks').insert({
                    document_id: documentId,
                    content_chunk: chunkContent,
                    embedding: vector
                });

                if (error) throw error;
                processedChunks++;

            } catch (err) {
                // Antes esto solo iba a `console.error`: el administrador veía
                // "✅ Indexado" aunque la mitad del temario no se hubiera
                // guardado, y el fallo solo salía a la luz cuando el chat no
                // encontraba el artículo.
                const msg = err instanceof Error ? err.message : String(err);
                failures.push(`#${position}: ${msg}`);
                console.error(`❌ Fragmento ${position}/${chunksToIndex.length}:`, msg);
            }
        }));
    }

    if (processedChunks === 0) {
        throw new Error(`No se pudo guardar ningún fragmento. Primer error: ${failures[0] ?? 'desconocido'}`);
    }

    const total = chunksToIndex.length;
    const complete = processedChunks === total;

    return {
        success: true,
        // `complete` permite a la UI distinguir un indexado íntegro de uno
        // parcial, en vez de pintar el mismo ✅ para los dos casos.
        complete,
        indexed: processedChunks,
        total,
        failures: failures.slice(0, 5),
        message: complete
            ? `Indexado completo: ${total} fragmentos.`
            : `Indexado PARCIAL: ${processedChunks} de ${total} fragmentos. ${total - processedChunks} han fallado.`
    };

  } catch (e) {
    console.error("Error en uploadTopicPDF:", e);
    return { success: false, error: errorMessage(e) };
  }
}

export async function deleteTopic(topicNameOrId: string) {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };
    const { data } = await supabase.from('subjects').select('id').ilike('title', `%${topicNameOrId}%`).single();
    if (data) {
        await supabase.from('documents').delete().eq('subject_id', data.id);
    }
    return { success: true };
}

// Función para obtener la lista simple de temas (usada por el alumno)
export async function getStudentTopics() {
    const auth = await requireUser();
    if (!auth.ok) return { success: false, topics: [] as string[], error: auth.error };

    try {
        const { data, error } = await supabase
            .from('blocks')
            .select(`subjects ( title, documents (count) )`);

        if (error || !data) return { success: true, topics: [] };

        const topics: string[] = [];
        type TopicRow = { subjects: { title: string; documents: { count: number }[] | null }[] };
        (data as unknown as TopicRow[]).forEach((block) => {
            block.subjects.forEach((sub) => {
                if (sub.documents && sub.documents[0] && sub.documents[0].count > 0) {
                    topics.push(sub.title);
                }
            });
        });
        
        return { success: true, topics: topics.sort() };
    } catch (e) {
        return { success: false, topics: [] as string[], error: errorMessage(e) };
    }
}

export async function getAdminUsersList() {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false as const, error: auth.error };

    const { data } = await supabase.from('profiles').select('*');
    return { success: true as const, users: data || [] };
}

export async function getGlobalActivity() {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false as const, error: auth.error };

    // El enunciado NO esta en la tabla: se trae por join, igual que en
    // `getUserStats`. Antes se pedia `select('*')` y el panel pintaba
    // `log.question_text` sin que existiera, asi que siempre decia "Pregunta
    // sin texto". El join resuelve porque la FK question_id -> question_bank
    // quedo declarada en la fase 2.8.
    const { data, error } = await supabase
      .from('question_attempts')
      .select('*, question:question_bank(question_text)')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('getGlobalActivity:', error.message);
      return { success: false as const, error: 'No se pudo cargar la actividad.' };
    }

    // Se aplana a la clave que espera la UI, como hace `getUserStats`.
    const activity: ActivityRow[] = (data ?? []).map((fila) => {
      const { question, ...resto } = fila as Record<string, unknown> & {
        question?: { question_text?: string | null } | null;
      };
      return { ...resto, question_text: question?.question_text ?? null } as ActivityRow;
    });

    return { success: true as const, activity };
}

// --- GESTIÓN DEL BANCO (VISOR OPTIMIZADO) ---

export async function getAdminQuestionBank(params: {
  subjectId?: number;
  search?: string;
  page?: number;
  limit?: number;
  /**
   * Estado a mostrar, o 'all' para todos. Por defecto 'all': antes filtraba
   * 'active' en duro, asi que un admin sembraba 500 preguntas y veia una lista
   * vacia, sin ninguna forma de llegar a las pendientes desde esta pantalla.
   */
  status?: QuestionStatus | 'all';
}) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  try {
    const { subjectId, search, page = 1, limit = 20, status = 'all' } = params;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('question_bank')
      .select('*, subjects(id, title, topic_number)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (isQuestionStatus(status)) {
      query = query.eq('status', status);
    }

    if (subjectId) {
      query = query.eq('subject_id', subjectId);
    }

    if (search && search.length > 2) {
      query = query.ilike('question_text', `%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return {
      success: true as const,
      data: data || [],
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit),
      status
    };

  } catch (e) {
    return { success: false as const, error: errorMessage(e) };
  }
}
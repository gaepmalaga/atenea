'use server'
import PDFParser from 'pdf2json';
import { supabaseAdmin as supabase, embeddingModel } from './core';
import { cleanLegalText, chunkLegalText } from '../lib/text';
import { requireAdmin, requireUser } from '../lib/auth';
import { QUESTION_STATUS, isQuestionStatus, type QuestionStatus } from '../lib/questions';

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

    const syllabus = data.map((block: any) => ({
      id: block.id,
      name: block.name,
      subjects: block.subjects
        .sort((a: any, b: any) => a.topic_number - b.topic_number)
        .map((sub: any) => ({
          id: sub.id,
          number: sub.topic_number,
          title: sub.title,
          documents: sub.documents || [],
          docCount: sub.documents ? sub.documents.length : 0 
        }))
    }));

    return { success: true as const, syllabus };
  } catch (e: any) {
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
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function uploadTopicPDF(formData: FormData) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  try {
    const file = formData.get('file') as File;
    const subjectIdStr = formData.get('subjectId') as string;

    if (!file || !subjectIdStr) throw new Error("Faltan datos.");
    const subjectId = parseInt(subjectIdStr);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const text = await new Promise<string>((resolve, reject) => {
      const pdfParser = new (PDFParser as any)(null, 1);
      pdfParser.on("pdfParser_dataError", (err: any) => reject(err.parserError));
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

    const BATCH_SIZE = 5;
    let processedChunks = 0;
    
    for (let i = 0; i < chunksToIndex.length; i += BATCH_SIZE) {
        const batch = chunksToIndex.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (chunkContent) => {
            try {
                const embResult = await embeddingModel.embedContent(chunkContent);
                const vector = embResult.embedding.values;

                if (!vector || vector.length === 0) throw new Error("Vector vacío generado por IA");

                const { error } = await supabase.from('document_chunks').insert({
                    document_id: documentId,
                    content_chunk: chunkContent,
                    embedding: vector 
                });

                if (error) throw error; 
                processedChunks++;

            } catch (err: any) { 
                console.error("❌ ERROR AL INSERTAR CHUNK:", err.message); 
            }
        }));
    }

    if (processedChunks === 0) {
        throw new Error("No se pudo guardar ningún fragmento. Revisa los logs de consola.");
    }

    return { success: true, message: `✅ Indexado Híbrido: ${processedChunks}/${chunksToIndex.length} fragmentos procesados.` };

  } catch (e: any) {
    console.error("Error en uploadTopicPDF:", e);
    return { success: false, error: e.message };
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
        data.forEach((block: any) => {
            block.subjects.forEach((sub: any) => {
                if (sub.documents && sub.documents[0] && sub.documents[0].count > 0) {
                    topics.push(sub.title);
                }
            });
        });
        
        return { success: true, topics: topics.sort() };
    } catch (e: any) {
        return { success: false, topics: [] as string[], error: e.message };
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

    const { data } = await supabase.from('test_results').select('*').order('created_at', {ascending:false}).limit(20);
    return { success: true as const, activity: data || [] };
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

  } catch (e: any) {
    return { success: false as const, error: e.message as string };
  }
}
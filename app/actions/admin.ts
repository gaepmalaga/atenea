'use server'
import PDFParser from 'pdf2json';
import { supabaseAdmin as supabase, embeddingModel } from './core';
import { cleanLegalText, chunkDocument, type LegalChunk } from '../lib/text';
import type { DocumentChunkRow } from '../lib/documents';
import { requireAdmin, requireUser } from '../lib/auth';
import { checkQuota } from '../lib/rate-limit';
import { isQuestionStatus, type QuestionStatus } from '../lib/questions';
import type { ActivityRow } from '../lib/stats';

// --- TIPOS DEL TEMARIO ---
// Reflejan la forma que devuelve el `select` anidado de Supabase.

export type DocumentRow = {
  id: string;
  filename: string;
  uploaded_at: string;
  /** indexado | parcial | fallido | pendiente. Ver docs/sql/P1-ingesta-fiable.sql. */
  index_status: string;
  chunk_count: number;
};
export type SubjectRow = { id: number; topic_number: number; title: string; documents?: DocumentRow[] | null };
type BlockRow = { id: number; name: string; subjects: SubjectRow[] };

/**
 * El temario tal y como lo SIRVE `getOfficialSyllabus`, que no es la forma de
 * la tabla: `topic_number` sale como `number` y se anade `docCount`.
 */
export type SyllabusSubject = {
  id: number;
  number: number;
  title: string;
  documents: DocumentRow[];
  docCount: number;
};

export type SyllabusBlock = { id: number; name: string; subjects: SyllabusSubject[] };

/**
 * Un usuario en el panel de administracion.
 *
 * `total_tests` y `win_rate` NO estan en `profiles`: se calculan al vuelo en
 * `getAdminUsersList`.
 */
export type AdminUser = {
  id: string;
  email: string | null;
  role: string | null;
  created_at: string | null;
  total_tests: number;
  /** `null` si aun no ha respondido ninguna pregunta. */
  win_rate: number | null;
};

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
            documents ( id, filename, uploaded_at, index_status, chunk_count ) 
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
    // Trocear ANTES de guardar nada. Si el texto no produce fragmentos, no hay
    // documento que guardar: un documento sin indexar es un tema mudo para el
    // chat, y hasta hoy no habia forma de distinguirlo de uno sano.
    const fragmentos = chunkDocument(cleanText);
    if (fragmentos.length === 0) throw new Error("El PDF no ha producido ningún fragmento indexable.");

    const { data: docData, error: docError } = await supabase
        .from('documents')
        .insert({
            subject_id: subjectId,
            filename: filename,
            full_text: cleanText,
            uploaded_at: new Date().toISOString(),
            index_status: 'pendiente',
            chunk_count: 0,
        })
        .select()
        .single();

    if (docError) throw docError;
    const documentId = docData.id;

    const { indexed, total, failures } = await indexarFragmentos(documentId, fragmentos);

    // Ni un documento huerfano. Antes la fila se insertaba y, si el indexado
    // fallaba entero, se lanzaba el error PERO el documento se quedaba: aparecia
    // en la lista del panel como cualquier otro y el chat no encontraba nada de
    // ese tema. Es exactamente lo que le paso al TEMA 9 (108.233 caracteres, 0
    // fragmentos, meses ahi sin que nadie lo supiera).
    if (indexed === 0) {
        await supabase.from('documents').delete().eq('id', documentId);
        throw new Error(
            `No se pudo indexar ningún fragmento, así que el documento no se ha guardado. ` +
            `Primer error: ${failures[0] ?? 'desconocido'}`
        );
    }

    const estado = estadoDeIndexado(indexed, total);

    // El estado se GUARDA, no solo se devuelve. El aviso de "indexado parcial"
    // existia desde la fase 2.6, pero solo se veia en el momento de subir: al
    // cerrar la pestania no quedaba rastro.
    const { error: updateError } = await supabase
        .from('documents')
        .update({
            index_status: estado,
            chunk_count: indexed,
            indexed_at: new Date().toISOString(),
        })
        .eq('id', documentId);

    if (updateError) console.error('uploadTopicPDF (estado):', updateError.message);

    const conReferencia = fragmentos.filter((f) => f.reference !== null).length;

    return {
        success: true,
        complete: estado === 'indexado',
        indexed,
        total,
        failures: failures.slice(0, 5),
        // Cuantos fragmentos saben de que articulo salen. Es lo que separa un
        // texto legal troceado por su estructura de unos apuntes troceados por
        // longitud, y conviene que el administrador lo vea.
        withReference: conReferencia,
        message: estado === 'indexado'
            ? `Indexado completo: ${total} fragmentos${conReferencia ? `, ${conReferencia} con referencia legal` : ''}.`
            : `Indexado PARCIAL: ${indexed} de ${total} fragmentos. ${total - indexed} han fallado.`
    };

  } catch (e) {
    console.error("Error en uploadTopicPDF:", e);
    return { success: false, error: errorMessage(e) };
  }
}

/** El estado que le corresponde a un documento segun como fue su indexado. */
function estadoDeIndexado(indexed: number, total: number): 'indexado' | 'parcial' | 'fallido' {
  if (indexed === 0) return 'fallido';
  return indexed === total ? 'indexado' : 'parcial';
}

/**
 * Calcula los embeddings de unos fragmentos y los guarda en `document_chunks`.
 *
 * Separada de `uploadTopicPDF` porque la necesitan dos caminos: subir un
 * documento nuevo y reindexar uno existente. Antes estaba en linea y reindexar
 * habria supuesto duplicarla.
 *
 * No lanza: devuelve el recuento. Un fragmento que falla no debe tumbar los
 * otros ochenta.
 */
async function indexarFragmentos(
  documentId: string,
  fragmentos: LegalChunk[]
): Promise<{ indexed: number; total: number; failures: string[] }> {
  const BATCH_SIZE = 5;
  let indexed = 0;
  const failures: string[] = [];

  for (let i = 0; i < fragmentos.length; i += BATCH_SIZE) {
    const lote = fragmentos.slice(i, i + BATCH_SIZE);

    // Los embeddings, en paralelo. Cada uno guarda su posicion: si falla el
    // tercero, los otros cuatro no se corren de sitio.
    const calculados = await Promise.all(lote.map(async (fragmento, j) => {
      const posicion = i + j + 1;
      try {
        const emb = await embeddingModel.embedContent(fragmento.text);
        const vector = emb.embedding.values;

        if (!vector || vector.length === 0) throw new Error("La IA devolvió un vector vacío");

        return {
          posicion,
          fila: {
            document_id: documentId,
            content_chunk: fragmento.text,
            // De que articulo sale. `null` en textos sin estructura legal.
            reference: fragmento.reference,
            embedding: vector,
          },
        };
      } catch (err) {
        // Antes esto solo iba a `console.error`: el administrador veia
        // "✅ Indexado" aunque la mitad del temario no se hubiera guardado.
        const msg = errorMessage(err);
        failures.push(`#${posicion}: ${msg}`);
        console.error(`❌ Fragmento ${posicion}/${fragmentos.length}:`, msg);
        return null;
      }
    }));

    const listos = calculados.filter((c): c is NonNullable<typeof c> => c !== null);
    if (listos.length === 0) continue;

    // SE INSERTAN JUNTOS Y EN ORDEN.
    //
    // `document_chunks.id` sale de una secuencia, asi que el orden de insercion
    // es el UNICO rastro que queda del orden del documento: no hay columna de
    // posicion. Con un insert por fragmento lanzado en paralelo, los cinco del
    // lote se pisaban y el orden dentro de cada grupo salia al azar. Da igual
    // para el chat —recupera por similitud— pero no para el visor, que se
    // supone que enseña el documento tal y como entro.
    const { error } = await supabase
      .from('document_chunks')
      .insert(listos.map((c) => c.fila));

    if (!error) {
      indexed += listos.length;
      continue;
    }

    // El lote entero ha fallado: PostgREST rechaza la insercion completa si una
    // sola fila no le cuadra. Se reintenta una a una para no perder cuatro
    // fragmentos buenos por culpa de uno malo.
    console.error(`❌ Lote ${i / BATCH_SIZE + 1} completo:`, error.message);
    for (const { fila, posicion } of listos) {
      const { error: errorFila } = await supabase.from('document_chunks').insert(fila);
      if (errorFila) {
        failures.push(`#${posicion}: ${errorFila.message}`);
        console.error(`❌ Fragmento ${posicion}/${fragmentos.length}:`, errorFila.message);
      } else {
        indexed++;
      }
    }
  }

  return { indexed, total: fragmentos.length, failures };
}

/**
 * Vuelve a indexar un documento ya subido, sin tener que borrarlo y volver a
 * subir el PDF.
 *
 * Hace falta porque hasta ahora, si el indexado fallaba, la unica salida era
 * esa. Y porque los documentos anteriores a este cambio se trocearon con el
 * algoritmo viejo: reindexarlos es la forma de que ganen la estructura legal.
 */
export async function reindexDocument(documentId: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!documentId) return { success: false as const, error: 'Falta el id del documento.' };

  const quota = await checkQuota(auth.user.id, 'index');
  if (!quota.ok) return { success: false as const, error: quota.error };

  try {
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, full_text')
      .eq('id', documentId)
      .single();

    if (docError || !doc) throw new Error('No se encuentra el documento.');

    // Se vuelve a limpiar el texto, no se trocea tal cual. Los documentos
    // subidos antes de P1a llevan guardado el texto CRUDO del PDF: renglones
    // cortados al ancho de la pagina, con «Artículo» partido en dos lineas.
    // Sin este paso, reindexarlos repite el troceado malo sobre el mismo texto
    // malo y la estructura legal sigue sin detectarse. Sobre un texto ya limpio
    // —lo que guarda hoy `uploadTopicPDF`— no cambia nada.
    const texto = cleanLegalText((doc.full_text as string) ?? '');
    const fragmentos = chunkDocument(texto);
    if (fragmentos.length === 0) throw new Error('El texto guardado no produce ningún fragmento.');

    // Fuera los fragmentos viejos ANTES de calcular los nuevos: si no, un
    // reindexado deja el doble y el chat recupera cada articulo dos veces.
    const { error: deleteError } = await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);

    if (deleteError) throw deleteError;

    const { indexed, total, failures } = await indexarFragmentos(documentId, fragmentos);
    const estado = estadoDeIndexado(indexed, total);

    await supabase
      .from('documents')
      .update({
        index_status: estado,
        chunk_count: indexed,
        indexed_at: indexed > 0 ? new Date().toISOString() : null,
      })
      .eq('id', documentId);

    return {
      success: true as const,
      status: estado,
      indexed,
      total,
      withReference: fragmentos.filter((f) => f.reference !== null).length,
      failures: failures.slice(0, 5),
    };

  } catch (e) {
    console.error('reindexDocument:', e);
    return { success: false as const, error: errorMessage(e) };
  }
}/**
 * Los fragmentos de un documento, para enseñarlos en el panel.
 *
 * Hasta ahora el administrador solo veia un contador. Podia subir un PDF, leer
 * «177 fragmentos» y no tener ni idea de si la plataforma habia entendido el
 * texto o lo habia picado a ciegas.
 *
 * NO SE PIDE `embedding`. Son 3.072 numeros por fragmento: la Constitucion
 * mandaria varios megas al navegador para pintar texto.
 *
 * Se ordena por `id` porque es lo unico que conserva el orden del documento:
 * la tabla no tiene columna de posicion y el id sale de una secuencia. Por eso
 * `indexarFragmentos` inserta cada lote de una vez y en orden.
 */
export async function getDocumentChunks(documentId: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!documentId) return { success: false as const, error: 'Falta el id del documento.' };

  const { data, error } = await supabase
    .from('document_chunks')
    .select('id, reference, content_chunk')
    .eq('document_id', documentId)
    .order('id', { ascending: true });

  if (error) {
    console.error('getDocumentChunks:', error.message);
    return { success: false as const, error: error.message };
  }

  return { success: true as const, chunks: (data ?? []) as DocumentChunkRow[] };
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

/**
 * Los temas que tienen temario cargado, CON SU ID.
 *
 * `getStudentTopics` devuelve solo los titulos, que valia mientras el unico
 * consumidor los pasaba por nombre. El chat necesita el id para poder decir
 * "de este tema", y resolver un titulo a id es una consulta mas y una fuente
 * de desajustes (regla 7: guardar el numero donde se espera el titulo, o al
 * reves, es como se pierden los datos).
 */
export async function getStudentSubjects() {
    const auth = await requireUser();
    if (!auth.ok) return { success: false as const, subjects: [] as { id: number; title: string }[], error: auth.error };

    const { data, error } = await supabase
        .from('subjects')
        .select('id, title, topic_number, documents(count)')
        .order('topic_number', { ascending: true });

    if (error) {
        console.error('getStudentSubjects:', error.message);
        return { success: false as const, subjects: [] as { id: number; title: string }[], error: error.message };
    }

    type FilaTema = { id: number; title: string; documents: { count: number }[] | null };

    // Solo los que tienen documentos: un tema vacio en el desplegable es una
    // promesa que la plataforma no puede cumplir.
    const subjects = ((data as unknown as FilaTema[]) ?? [])
        .filter((s) => (s.documents?.[0]?.count ?? 0) > 0)
        .map((s) => ({ id: s.id, title: s.title }));

    return { success: true as const, subjects };
}

/** Cuantos intentos se agregan para las estadisticas del panel de usuarios. */
const MAX_INTENTOS_AGREGADOS = 10_000;

/**
 * Los usuarios con sus estadisticas, para el panel de administracion.
 *
 * `profiles` solo guarda id, email, role y created_at: NO guarda `total_tests`
 * ni `win_rate`. La tabla del panel los pintaba igualmente y siempre salia
 * "0" y "0%" para todo el mundo — con el estado tipado como `any[]`, nadie
 * podia enterarse.
 *
 * Se agregan aqui en vez de desnormalizarlos en `profiles`: no hay que
 * mantener contadores al dia ni migrar nada. Si el volumen crece por encima
 * del tope, toca pasarlo a una vista agregada en SQL.
 */
export async function getAdminUsersList() {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false as const, error: auth.error };

    const { data: perfiles, error } = await supabase
      .from('profiles')
      .select('id, email, role, created_at');

    if (error) {
      console.error('getAdminUsersList:', error.message);
      return { success: false as const, error: 'No se pudo cargar la lista de usuarios.' };
    }

    // Solo dos columnas: es una tabla que crece y no hace falta traer mas.
    const { data: intentos } = await supabase
      .from('question_attempts')
      .select('user_id, is_correct')
      .limit(MAX_INTENTOS_AGREGADOS);

    const porUsuario = new Map<string, { total: number; aciertos: number }>();
    for (const intento of intentos ?? []) {
      if (!intento.user_id) continue;
      const acc = porUsuario.get(intento.user_id) ?? { total: 0, aciertos: 0 };
      acc.total++;
      if (intento.is_correct) acc.aciertos++;
      porUsuario.set(intento.user_id, acc);
    }

    const users: AdminUser[] = (perfiles ?? []).map((p) => {
      const acc = porUsuario.get(p.id);
      return {
        id: p.id,
        email: p.email ?? null,
        role: p.role ?? null,
        created_at: p.created_at ?? null,
        total_tests: acc?.total ?? 0,
        // `null` y no 0 cuando no ha hecho ninguno: sin datos no es lo mismo
        // que 0 % de aciertos (regla 8).
        win_rate: acc && acc.total > 0 ? Math.round((acc.aciertos / acc.total) * 100) : null,
      };
    });

    return { success: true as const, users };
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
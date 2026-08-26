'use server'
import crypto from 'crypto';
import { supabaseAdmin as supabase, questionModel, getSubjectIdByName } from './core';
import { parseAIJson, validateGeneratedQuestion, randomContextWindow } from '../lib/ai-output';
import { requireAdmin, requireUser } from '../lib/auth';
import { checkQuota } from '../lib/rate-limit';
import { QUESTION_STATUS, indexToOptionId, shuffle, type QuestionStatus } from '../lib/questions';
import { toResultRow, type AnswerMetrics, type ExamResultPayload } from '../lib/exam-results';

// ==========================================
// 1. GENERADOR DE PREGUNTAS (MOTOR IA)
// ==========================================

/** Lo que devuelve el generador de preguntas antes de tocar la base de datos. */
type GeneratedQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  document_id: string;
  filename: string;
};

/** Fila de `question_bank` recien insertada o recuperada. */
type SavedQuestion = { id: string; subject_id: number; status: string } | null;

// Helper interno. NO se exporta como Server Action: era un endpoint publico
// que llamaba a Gemini sin ninguna comprobacion. Sus dos consumidores
// (`generateAndSaveCandidate` y `seedQuestionBank`) ya validan la sesion.
async function generateTestQuestion(subjectId: number) {
  try {
    if (!subjectId) return { success: false, error: "ID de tema inválido." };

    // 1. Obtener documento aleatorio del tema
    const { data: docs, error: docError } = await supabase
      .from('documents')
      .select('id, filename, full_text') 
      .eq('subject_id', subjectId);

    if (docError || !docs || docs.length === 0) {
        return { success: false, error: "Tema vacío o error de DB." };
    }

    const selectedDoc = docs[Math.floor(Math.random() * docs.length)];
    const fullText = selectedDoc.full_text || "";

    if (fullText.length < 50) return { success: false, error: "Documento con texto insuficiente." };

    const contextSlice = randomContextWindow(fullText, 12000);

    // El formato lo impone `responseSchema` en el modelo, no el prompt: por eso
    // aquí solo van las instrucciones pedagógicas.
    const prompt = `
      ACTÚA COMO: Tribunal Calificador de Policía Nacional.
      TAREA: Redactar UNA pregunta de test basada en este texto legal.
      TEXTO: """${contextSlice}"""

      REGLAS:
      1. Exactamente 3 opciones, y solo UNA correcta.
      2. Dificultad Media/Alta: detalles, plazos, excepciones.
      3. Las tres opciones deben ser distintas y plausibles.
      4. 'correctIndex' es la posición de la opción correcta: 0, 1 o 2.
      5. 'explanation' justifica la respuesta citando el texto.
    `;

    const result = await questionModel.generateContent(prompt);
    const parsed = parseAIJson(result.response.text());
    if (!parsed) return { success: false, error: "La IA no devolvió un JSON legible." };

    // Se valida ANTES de devolver nada. Antes bastaba con que hubiera enunciado
    // y tres opciones: una pregunta con `correctIndex: 5` se guardaba igual y la
    // respuesta buena pasaba a ser "c" en silencio.
    const check = validateGeneratedQuestion(parsed);
    if (!check.ok) {
      console.error("Pregunta descartada:", check.reason);
      return { success: false, error: `Pregunta descartada: ${check.reason}` };
    }

    return {
      success: true,
      data: {
        ...check.value,
        document_id: selectedDoc.id,
        filename: selectedDoc.filename
      }
    };

  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido';
    console.error("❌ Error generación:", msg);
    return { success: false, error: msg };
  }
}

// ==========================================
// 2. GENERACIÓN "EN VIVO" (FALLBACK)
// ==========================================
// Esta es la función que te faltaba y causaba el error

/** Da forma de UI a una pregunta recien generada, con o sin fila en la BD. */
function toUiQuestion(qData: GeneratedQuestion, saved: SavedQuestion) {
  return {
    ...qData,
    id: saved?.id ?? null,
    subject_id: saved?.subject_id ?? null,
    status: saved?.status ?? 'unsaved',
    options: qData.options.map((text, i) => ({ id: indexToOptionId(i), text })),
    correctOptionId: indexToOptionId(qData.correctIndex),
  };
}

export async function generateAndSaveCandidate(topicNameOrId: string | number) {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const quota = await checkQuota(auth.user.id, 'question');
  if (!quota.ok) return { success: false as const, error: quota.error };

  try {
    // A. Resolver ID
    let subjectId: number;
    if (typeof topicNameOrId === 'number') {
        subjectId = topicNameOrId;
    } else {
        subjectId = await getSubjectIdByName(topicNameOrId.toString());
    }

    // B. Generar Pregunta
    const genResult = await generateTestQuestion(subjectId);
    // Se construye la respuesta de error en vez de reenviar `genResult`: aquel
    // no traía `id`, así que el tipo de retorno era una unión que la UI no podía
    // consumir sin comprobaciones.
    if (!genResult.success || !genResult.data) {
      return { success: false as const, error: genResult.error ?? 'No se pudo generar la pregunta.' };
    }

    const qData = genResult.data;
    
    // C. Calcular Hash (Evitar duplicados)
    const payload = JSON.stringify({ 
        s: subjectId, 
        q: qData.question.trim(), 
        c: qData.correctIndex 
    });
    const qHash = crypto.createHash('sha256').update(payload).digest('hex');

    // D. Guardar en el banco como candidata.
    //
    // `ignoreDuplicates` es imprescindible: con un upsert normal, volver a
    // generar una pregunta que ya existia REESCRIBIA su fila, incluido el
    // estado. Una pregunta ya aprobada volvia a 'candidate' (saliendo del banco
    // de los alumnos) y una descartada resucitaba en la cola de moderacion.
    const { data: inserted, error } = await supabase
      .from('question_bank')
      .upsert({
          subject_id: subjectId,
          document_id: qData.document_id,
          question_text: qData.question,
          options: qData.options,
          correct_index: qData.correctIndex,
          explanation: qData.explanation,
          question_hash: qHash,
          status: QUESTION_STATUS.CANDIDATE,
          origin: 'live_ai',
          created_at: new Date().toISOString()
      }, { onConflict: 'question_hash', ignoreDuplicates: true })
      .select()
      .maybeSingle();

    if (error) {
       console.error("Error guardando candidate:", error.message);
       return { success: true as const, data: toUiQuestion(qData, null) };
    }

    // Si era duplicada no se ha insertado nada: recuperamos la fila existente
    // para que la pregunta llegue a la UI con su id real. Antes se devolvia
    // `id: null` y esa pregunta no se podia votar ni reportar, y se guardaba en
    // test_results sin referencia.
    let saved = inserted;
    if (!saved) {
      const { data: existing } = await supabase
        .from('question_bank')
        .select()
        .eq('question_hash', qHash)
        .maybeSingle();
      saved = existing;
    }

    // Una pregunta ya descartada en moderacion no debe volver a servirse.
    if (saved?.status === QUESTION_STATUS.DISABLED) {
      return { success: false as const, error: 'La pregunta generada ya fue descartada.' };
    }

    return { success: true as const, data: toUiQuestion(qData, saved) };
  } catch (e) {
      return { success: false as const, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

// ==========================================
// 3. SEED (GENERACIÓN MASIVA)
// ==========================================

/** Maximo de preguntas por lote. Cada una es una llamada de pago a Gemini. */
const MAX_SEED_COUNT = 200;

async function runWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function runner() {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx]);
    }
  }
  const runners = Array.from({ length: concurrency }, () => runner());
  await Promise.all(runners);
  return results;
}

export async function seedQuestionBank(params: {
  subjectId: number;
  topic: string;
  count: number;
  concurrency?: number;
  /**
   * Publicar directamente en el banco (estado 'active') en vez de mandarlo a
   * moderacion. Por defecto si: sembrar es un acto deliberado del admin sobre
   * su propio temario. La UI lo expone como interruptor para que quien quiera
   * revisar antes pueda hacerlo.
   */
  autoApprove?: boolean;
}) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  // Sembrar es de admin, pero es lo que mas cuesta por llamada: hasta
  // MAX_SEED_COUNT preguntas de una tacada.
  const seedQuota = await checkQuota(auth.user.id, 'seed');
  if (!seedQuota.ok) return { success: false as const, error: seedQuota.error };

  const { subjectId, concurrency = 2, autoApprove = true } = params;
  const status: QuestionStatus = autoApprove ? QUESTION_STATUS.ACTIVE : QUESTION_STATUS.CANDIDATE;
  if (!subjectId) return { success: false as const, error: "Falta ID de tema" };

  // Tope duro: `count` venia del cliente sin limite y cada unidad es una
  // llamada de pago a Gemini.
  const count = Math.min(Math.max(1, Math.floor(params.count) || 0), MAX_SEED_COUNT);

  console.log(`🚀 Generando ${count} preguntas para Subject ${subjectId}...`);

  const worker = async () => {
    for (let i = 0; i < 3; i++) {
        const res = await generateTestQuestion(subjectId);
        if (res.success && res.data) return { ok: true, data: res.data };
        await new Promise(r => setTimeout(r, 500));
    }
    return { ok: false };
  };

  const tasks = Array.from({ length: count }, (_, i) => i);
  const results = await runWithConcurrency(tasks, concurrency, worker);

  let inserted = 0;
  let duplicated = 0;
  let failed = 0;

  for (const r of results) {
    if (!r.ok || !r.data) { failed++; continue; }

    const d = r.data as GeneratedQuestion;
    const payload = JSON.stringify({ s: subjectId, q: d.question.trim(), c: d.correctIndex });
    const qHash = crypto.createHash('sha256').update(payload).digest('hex');

    // `ignoreDuplicates`: resembrar un tema no debe tocar las filas que ya
    // existen. Con un upsert normal, una pregunta descartada en moderacion
    // volvia al banco y una editada a mano perdia las correcciones.
    const { data, error } = await supabase
      .from('question_bank')
      .upsert({
          subject_id: subjectId,
          document_id: d.document_id,
          question_text: d.question,
          options: d.options,
          correct_index: d.correctIndex,
          explanation: d.explanation,
          question_hash: qHash,
          status,
          origin: 'bank_seed',
          created_at: new Date().toISOString()
      }, { onConflict: 'question_hash', ignoreDuplicates: true })
      .select('id');

    if (error) failed++;
    else if (data && data.length > 0) inserted++;
    else duplicated++;
  }

  // Se devuelve el desglose completo: antes solo se informaba de `inserted` y
  // un lote que fallara entero se veia igual que uno duplicado.
  return { success: true as const, inserted, duplicated, failed, requested: count, status };
}

// ==========================================
// 4. CONSULTA Y RESULTADOS
// ==========================================

export async function getQuestionsFromBank(params: {
  subjectIds?: number[];
  topic?: string;
  limit: number;
  userId?: string;
  /**
   * PENDIENTE (ver PLAN, Fase 4): la UI ya envía la dificultad elegida por el
   * alumno, pero `question_bank` no tiene todavía columna de dificultad, así
   * que el filtro NO se aplica. Se acepta el parámetro para que el contrato
   * sea explícito en vez de fallar en tiempo de compilación.
   */
  difficulty?: number;
}) {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };

  let ids = params.subjectIds || [];
  if (params.topic && ids.length === 0) {
      const id = await getSubjectIdByName(params.topic);
      ids = [id];
  }
  
  if (ids.length === 0) return { success: false as const, error: "Sin temas" };

  const { data, error } = await supabase
    .from('question_bank')
    .select('*')
    .in('subject_id', ids)
    .eq('status', QUESTION_STATUS.ACTIVE) 
    .limit(params.limit * 3); 

  if (error) return { success: false as const, error: error.message };

  const shuffled = shuffle(data || []).slice(0, params.limit);
  return { success: true as const, data: shuffled };
}

/**
 * Guarda UNA respuesta del modo entrenamiento y devuelve el id de la fila.
 *
 * El id es lo que permite que etiquetar el fallo despues ACTUALICE esta fila en
 * vez de insertar otra. Antes se insertaba dos veces por cada fallo etiquetado
 * (una al responder y otra al diagnosticar), asi que cada error contaba doble
 * en el porcentaje de acierto de por vida.
 */
export async function saveTestResult(
  topicOrId: string | number,
  questionId: string | null,
  isCorrect: boolean,
  metrics?: Partial<AnswerMetrics>
): Promise<{ success: boolean; id: string | null }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, id: null };

  try {
    const subjectId = typeof topicOrId === 'number'
      ? topicOrId
      : await getSubjectIdByName(topicOrId.toString());

    // El mapeo camelCase -> columnas ocurre en un solo sitio (lib/exam-results),
    // compartido con el guardado en bloque del examen. Aqui se armaba a mano y
    // por eso los nombres pudieron divergir entre los dos caminos.
    const row = toResultRow({ questionId, subjectId, isCorrect, ...metrics });

    const { data, error } = await supabase
      .from('test_results')
      .insert({ ...row, user_id: auth.user.id, created_at: new Date().toISOString() })
      .select('id')
      .single();

    if (error) {
      console.error('saveTestResult:', error.message);
      return { success: false, id: null };
    }
    return { success: true, id: data?.id ?? null };
  } catch (e) {
    console.error('saveTestResult:', e instanceof Error ? e.message : e);
    return { success: false, id: null };
  }
}

/**
 * Anade la taxonomia del fallo a una respuesta ya guardada.
 *
 * Es un UPDATE sobre la fila que devolvio `saveTestResult`, no una insercion
 * nueva. Solo toca `error_type`: el tiempo y los cambios de opcion son los de la
 * respuesta, no los de la pantalla de diagnostico, y no deben reescribirse.
 */
export async function setResultErrorType(
  resultId: string,
  errorType: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  if (!resultId) return { success: false, error: 'Falta el id del resultado.' };

  // El filtro por user_id impide etiquetar el resultado de otro usuario aunque
  // se conozca su id.
  const { error } = await supabase
    .from('test_results')
    .update({ error_type: errorType })
    .eq('id', resultId)
    .eq('user_id', auth.user.id);

  if (error) console.error('setResultErrorType:', error.message);
  return { success: !error, error: error?.message };
}

export async function saveExamResults(results: ExamResultPayload[]) {
    const auth = await requireUser();
    if (!auth.ok) return { success: false };
    if (!results.length) return { success: false };

    // El parametro era `any[]`: la UI enviaba `response_time_ms` / `option_changes`
    // y aqui se leia `r.time` / `r.changes`, asi que las dos metricas de
    // comportamiento se guardaban a 0 en TODOS los examenes sin que nada fallara.
    const rows = results.map((r) => ({
        ...toResultRow(r),
        user_id: auth.user.id,
        created_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from('test_results').insert(rows);

    if (error) console.error('saveExamResults:', error.message);
    return { success: !error };
}

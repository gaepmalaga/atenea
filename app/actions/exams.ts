'use server'
import crypto from 'crypto';
import { supabaseAdmin as supabase, chatModel, cleanAIResponse, getSubjectIdByName } from './core';
import { requireAdmin, requireUser } from '../lib/auth';

// ==========================================
// 1. GENERADOR DE PREGUNTAS (MOTOR IA)
// ==========================================

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

    // Recortar contexto (Ventana de 12k caracteres)
    const maxChars = 12000;
    const start = Math.floor(Math.random() * Math.max(0, fullText.length - maxChars));
    const contextSlice = fullText.substring(start, start + maxChars);

    // 2. Prompt Estricto
    const prompt = `
      ACTÚA COMO: Tribunal Calificador de Policía Nacional.
      TAREA: Redactar UNA pregunta de test basada en este texto legal.
      TEXTO: """${contextSlice}"""
      
      REGLAS:
      1. Salida JSON estricta.
      2. 3 Opciones (a, b, c). Solo 1 correcta.
      3. Dificultad Media/Alta (detalles, plazos, excepciones).
      
      FORMATO JSON:
      { 
        "question": "Enunciado...", 
        "options": ["Opción A...", "Opción B...", "Opción C..."], 
        "correctIndex": 0, 
        "explanation": "Justificación..." 
      }
      Nota: 'correctIndex' debe ser 0 para A, 1 para B, 2 para C.
    `;

    const result = await chatModel.generateContent(prompt);
    const jsonString = cleanAIResponse(result.response.text());
    
    let jsonData;
    try { jsonData = JSON.parse(jsonString); } 
    catch (e) { return { success: false, error: "Error parseando respuesta IA." }; }

    // Validación
    if (!jsonData.question || !Array.isArray(jsonData.options) || jsonData.options.length !== 3) {
        return { success: false, error: "Estructura JSON incorrecta." };
    }

    return {
      success: true,
      data: {
        ...jsonData,
        document_id: selectedDoc.id, 
        filename: selectedDoc.filename
      }
    };

  } catch (e: any) {
    console.error("❌ Error generación:", e.message);
    return { success: false, error: e.message };
  }
}

// ==========================================
// 2. GENERACIÓN "EN VIVO" (FALLBACK)
// ==========================================
// Esta es la función que te faltaba y causaba el error

export async function generateAndSaveCandidate(topicNameOrId: string | number) {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };

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
    if (!genResult.success || !genResult.data) return genResult;

    const qData = genResult.data;
    
    // C. Calcular Hash (Evitar duplicados)
    const payload = JSON.stringify({ 
        s: subjectId, 
        q: qData.question.trim(), 
        c: qData.correctIndex 
    });
    const qHash = crypto.createHash('sha256').update(payload).digest('hex');

    // D. Guardar en BD como 'candidate'
    const { data: saved, error } = await supabase
      .from('question_bank')
      .upsert({
          subject_id: subjectId,
          document_id: qData.document_id,
          question_text: qData.question,
          options: qData.options,
          correct_index: qData.correctIndex,
          explanation: qData.explanation,
          question_hash: qHash,
          status: 'candidate', // Se guarda para moderación futura
          origin: 'live_ai',   // Marcada como generada en vivo
          created_at: new Date().toISOString()
      }, { onConflict: 'question_hash' })
      .select()
      .single();

    if (error) {
       console.error("Error guardando candidate:", error.message);
       // Si falla el guardado (ej: duplicada), devolvemos la generada sin ID
       return { success: true, data: { ...qData, id: null, status: 'unsaved' } };
    }

    // E. Retorno compatible con UI
    return {
      success: true,
      data: {
        ...qData,
        id: saved.id,
        subject_id: saved.subject_id,
        status: saved.status,
        // Adaptamos el formato para que el frontend lo entienda si espera objetos
        options: qData.options.map((text:string, i:number) => ({
            id: i===0?'a':i===1?'b':'c',
            text
        })),
        correctOptionId: qData.correctIndex===0?'a':qData.correctIndex===1?'b':'c'
      }
    };
  } catch (e: any) {
      return { success: false, error: e.message };
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
  subjectId: number; topic: string; count: number; concurrency?: number;
}) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const { subjectId, concurrency = 2 } = params;
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
  for (const r of results) {
    if (!r.ok || !r.data) continue;
    
    const d: any = r.data;
    const payload = JSON.stringify({ s: subjectId, q: d.question.trim(), c: d.correctIndex });
    const qHash = crypto.createHash('sha256').update(payload).digest('hex');

    const { error } = await supabase.from('question_bank').upsert({
        subject_id: subjectId,
        document_id: d.document_id,
        question_text: d.question,
        options: d.options,
        correct_index: d.correctIndex,
        explanation: d.explanation,
        question_hash: qHash,
        status: 'candidate', // En seed masivo, asumimos activas (o cambiar a candidate si prefieres moderar todo)
        origin: 'bank_seed',
        created_at: new Date().toISOString()
    }, { onConflict: 'question_hash' });

    if (!error) inserted++;
  }

  return { success: true as const, inserted, requested: count };
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
    .eq('status', 'active') 
    .limit(params.limit * 3); 

  if (error) return { success: false as const, error: error.message };

  const shuffled = (data || []).sort(() => Math.random() - 0.5).slice(0, params.limit);
  return { success: true as const, data: shuffled };
}

export async function saveTestResult(
  topicOrId: string | number, questionId: string | null, isCorrect: boolean, vipData?: any
) {
  const auth = await requireUser();
  if (!auth.ok) return { success: false };

  try {
    const userId = auth.user.id;

    let subjectId: number;
    if (typeof topicOrId === 'number') subjectId = topicOrId;
    else subjectId = await getSubjectIdByName(topicOrId.toString());

    const payload: any = {
        user_id: userId,
        question_id: questionId,
        subject_id: subjectId, // Ahora sí guardamos el subject_id
        is_correct: isCorrect,
        created_at: new Date().toISOString()
    };

    if (vipData) {
        if (vipData.timeMs) payload.response_time_ms = vipData.timeMs;
        if (vipData.changes) payload.option_changes = vipData.changes;
        if (vipData.errorType) payload.error_type = vipData.errorType;
    } else if (typeof vipData === 'string') {
        payload.error_type = vipData; // Legacy support
    }

    const { error } = await supabase.from('test_results').insert(payload);
    return { success: !error };
  } catch (e) { return { success: false }; }
}

export async function saveExamResults(results: any[]) {
    const auth = await requireUser();
    if (!auth.ok) return { success: false };
    if (!results.length) return { success: false };

    const userId = auth.user.id;
    
    const rows = await Promise.all(results.map(async (r) => {
        let sid = r.subject_id;
        // Si no viene ID, lo buscamos por nombre
        if (!sid && r.topic) sid = await getSubjectIdByName(r.topic);
        
        return {
            user_id: userId,
            subject_id: sid || 1, 
            question_id: r.question_id,
            is_correct: r.is_correct,
            
            // --- MÉTRICAS ATENEA MIND ---
            response_time_ms: r.time || 0,        // Dimensión 1: Velocidad
            option_changes: r.changes || 0,       // Dimensión 2: Titubeo (¡AHORA SÍ!)
            // ----------------------------
            
            error_type: r.error_type,
            created_at: new Date().toISOString()
        };
    }));

    const { error } = await supabase.from('test_results').insert(rows);
    
    if (error) console.error("Error guardando resultados:", error);
    return { success: !error };
}
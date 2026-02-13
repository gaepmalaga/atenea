'use server'

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import PDFParser from 'pdf2json';
import crypto from 'crypto';

// ==========================================
//  0. CONFIGURACIÓN Y SEGURIDAD BLINDADA
// ==========================================

// 1. Lectura de variables (Nombres consistentes)
const API_KEY = process.env.GEMINI_API_KEY;
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SB_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 2. Verificación de seguridad
if (!API_KEY || !SB_URL || !SB_SERVICE_KEY || !SB_ANON_KEY) {
  throw new Error("❌ ERROR CRÍTICO: Faltan claves en .env (API_KEY, URL, SERVICE_KEY, ANON_KEY)");
}

// 3. Inicialización de IA
const genAI = new GoogleGenerativeAI(API_KEY);
// Usamos gemini-2.5-flash para todo (rápido y barato)
const chatModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const smartModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const embeddingModel = genAI.getGenerativeModel({ model: "models/gemini-embedding-001" });

// 4. Inicialización de Clientes Supabase

// A) Cliente ADMIN (Service Role): Poder total.
const supabaseAdmin = createClient(SB_URL, SB_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
// Alias 'supabase' para compatibilidad con tu código existente
const supabase = supabaseAdmin; 

// B) Cliente ANON (Anon Key): Respeta RLS (para votos/reportes desde servidor actuando como usuario)
const supabaseAnon = createClient(SB_URL, SB_ANON_KEY);

// ==========================================
//  1. UTILIDADES INTERNAS ROBUSTAS
// ==========================================

/**
 * Limpia respuestas de la IA para asegurar que el JSON sea válido.
 * 1. Quita Markdown.
 * 2. Extrae solo el bloque JSON.
 * 3. ELIMINA COMAS SOBRANTES (Trailing Commas) que rompen JSON.parse.
 */
function cleanAIResponse(text: string): string {
  if (!text) return "{}";
  
  // 1. Eliminar bloques de código Markdown
  let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
  
  // 2. Buscar el primer '{' y el último '}'
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1) {
      clean = clean.substring(firstBrace, lastBrace + 1);
  }

  // 3. CIRUGÍA: Eliminar comas traicioneras al final de arrays y objetos
  // Reemplaza ",]" por "]" y ",}" por "}"
  clean = clean.replace(/,\s*\]/g, ']').replace(/,\s*\}/g, '}');
  
  return clean;
}

/**
 * Verifica el rol del usuario para proteger acciones administrativas.
 */
export async function getUserRole(userId: string) {
  try {
    if (!userId) return 'student';
    const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).single();
    if (error || !data) return 'student'; // Fallback seguro
    return data.role || 'student';
  } catch {
    return 'student';
  }
}

// ==========================================
//  2. MÓDULO DE PERFILADO Y BIODATA (FASE 4)
// ==========================================

/**
 * Recupera el expediente C.I.B. del usuario.
 */
export async function getBiodata(userId: string) {
    try {
        if (!userId) throw new Error("ID de usuario inválido");
        const { data, error } = await supabase.from('profiles_biodata').select('*').eq('user_id', userId).single();
        
        // Si no hay datos, no es un error técnico, es que está vacío. Devolvemos null data pero success true.
        if (error && error.code !== 'PGRST116') { // PGRST116 es 'row not found'
             console.error("Error fetching biodata:", error);
             return { success: false, error: error.message };
        }
        
        return { success: true, data: data || null };
    } catch (e: any) { 
        return { success: false, error: e.message }; 
    }
}

/**
 * Guarda o actualiza el expediente C.I.B.
 */
export async function saveBiodata(userId: string, formData: any) {
    try {
        if (!userId) throw new Error("Usuario no autenticado");
        
        // Upsert garantiza que si ya existe se actualiza, si no se crea
        const { error } = await supabase.from('profiles_biodata').upsert({
            user_id: userId,
            ...formData,
            updated_at: new Date().toISOString()
        });

        if (error) throw error;
        return { success: true };
    } catch (e: any) { 
        console.error("Error saving biodata:", e);
        return { success: false, error: e.message }; 
    }
}

/**
 * Obtiene el perfil psicológico (16PF/NEO-PI-R simulado).
 * Si no existe, lo inicializa con valores neutros.
 */
export async function getPsychProfile(userId: string) {
    try {
        let { data, error } = await supabase.from('profiles_psych').select('*').eq('user_id', userId).single();
        
        if (!data) {
            // Inicialización Lazy: Creamos el perfil la primera vez que se consulta
            const newProfile = { user_id: userId }; 
            const { data: created, error: createError } = await supabase.from('profiles_psych').insert(newProfile).select().single();
            if (createError) throw createError;
            data = created;
        }
        
        return { success: true, data };
    } catch (e: any) { 
        return { success: false, error: e.message }; 
    }
}

// ==========================================
//  3. SIMULADOR DE ENTREVISTA (VOICE BRAIN)
// ==========================================

/**
 * ANALISTA PSICOLÓGICO (NUEVO):
 * Lee el biodata y genera instrucciones de ataque para el Inspector.
 */
async function generateInspectorReport(biodata: any) {
    if (!biodata) return "EL CANDIDATO NO TIENE DATOS. ACÚSALE DE FALTA DE INTERÉS.";

    // Extraemos el perfil numérico si existe, o ponemos defaults
    const psych = biodata.psych_profile || { sincerity: 5, stability: 5, normativity: 5, leadership: 5 };

    const prompt = `
        ACTÚA COMO: Psicólogo Forense del Tribunal de Selección.
        OBJETIVO: Analizar el perfil del opositor y dar instrucciones de presión al entrevistador.

        DATOS DEL CANDIDATO (C.I.B.):
        - Familia: ${biodata.family_background || 'No especificado'}
        - Motivación: ${biodata.police_motivation || 'No especificado'}
        - Trayectoria: ${biodata.work_history || 'No especificado'}
        - Legalidad: ${biodata.legal_issues || 'Limpio'}

        RESULTADOS DEL TEST PSICOTÉCNICO (ESCALA 0-10):
        - SINCERIDAD: ${psych.sincerity}/10  (Si es < 4: MENTIROSO/MANIPULADOR. Si es > 9: DESEABILIDAD SOCIAL ALTA).
        - ESTABILIDAD EMOCIONAL: ${psych.stability}/10 (Si es < 5: INSEGURO/ANSIOSO).
        - NORMATIVIDAD: ${psych.normativity}/10 (Si es < 5: REBELDE/ANTISOCIAL).
        - LIDERAZGO: ${psych.leadership}/10 (Si es < 4: SUMISO. Si es > 8: DOMINANTE).

        GENERA UN REPORTE TÁCTICO BREVE (Instrucciones para el Inspector):
        1. Cruza los datos del texto con el test. (Ej: Dice que es tranquilo, pero Estabilidad es 2 -> ATACA LA CONTRADICCIÓN).
        2. Si Sinceridad es baja, asume que todo lo que ha escrito es mentira y presiónalo.
        3. Si Normatividad es baja y tiene multas, destrúyelo por ahí.
        4. Dame 3 preguntas trampa específicas basadas en sus puntos débiles numéricos.
    `;

    try {
        const result = await smartModel.generateContent(prompt);
        return result.response.text();
    } catch (e) {
        return "Error generando perfil. Presiona sobre sus contradicciones generales.";
    }
}

/**
 * El Cerebro del Inspector. Procesa el audio (texto) del usuario y genera una respuesta hablada.
 * Tiene acceso al Biodata para detectar contradicciones.
 */
export async function processInterviewTurn(userId: string, history: {role: string, text: string}[], userAudioText: string) {
    try {
        if (!userAudioText.trim()) return { success: false, error: "Audio vacío" };

        // 1. Recuperar Biodata
        const { data: biodata } = await supabase.from('profiles_biodata').select('*').eq('user_id', userId).single();
        
        // 2. GENERAR ESTRATEGIA DE ATAQUE (Solo si es el inicio o no tenemos estrategia aún)
        // Para no gastar tokens a lo tonto, solo generamos el informe psicológico completo al principio.
        // En un turno normal, el Inspector improvisa sobre la marcha.
        
        let inspectorStrategy = "Mantén la presión. Busca contradicciones.";
        if (history.length < 2 && biodata) {
             // Si estamos empezando, leemos al opositor
             inspectorStrategy = await generateInspectorReport(biodata);
        }

        const profileContext = biodata ? JSON.stringify(biodata) : "SIN DATOS.";

        // 3. PROMPT DEL INSPECTOR (NIVEL REALISTA)
        const systemPrompt = `
            ACTÚA COMO: Inspector Jefe del Tribunal (CNP).
            SITUACIÓN: Entrevista Oficial. Estás cara a cara. Tienes el poder absoluto.

            TUS DOCUMENTOS:
            1. EL BIODATA: ${profileContext}
            2. INFORME DEL PSICÓLOGO (TUS ÓRDENES): 
               ${inspectorStrategy}

            OBJETIVO:
            Evaluar idoneidad. No eres su amigo. Eres su juez.
            Usa el "INFORME DEL PSICÓLOGO" para atacar. Si dice que es inmaduro, trátalo como a un niño. Si dice que miente, acósalo.

            REGLAS DE ORO:
            1. **Insultos = EXPULSIÓN:** Si el opositor te falta al respeto ("cabrón", "hijo de puta", etc.), responde ÚNICAMENTE: "Se acabó. Salga de mi despacho. NO APTO." y termina.
            2. **Presión:** Si responde con dudas, ataca. "¿Está seguro?", "¿Me lo pregunta a mí?".
            3. **Brevad:** Tus respuestas deben ser CORTAS y HABLADAS (máximo 2 frases). Estás hablando, no escribiendo.

            HISTORIAL RECIENTE:
            ${history.slice(-6).map(h => `${h.role === 'user' ? 'OPOSITOR' : 'INSPECTOR'}: ${h.text}`).join('\n')}

            EL OPOSITOR DICE:
            "${userAudioText}"

            TU RESPUESTA (Voz autoritaria):
        `;

        const result = await chatModel.generateContent(systemPrompt);
        const aiResponse = result.response.text();

        return { success: true, response: aiResponse };
    } catch (e: any) { 
        console.error("Error Interview Brain:", e);
        return { success: false, error: e.message, response: "No le he entendido. Repita." }; 
    }
}

// ==========================================
//  4. CHAT CON ATENEA (RAG LEGISLATIVO)
// ==========================================

export async function askAtenea(query: string) {
  if (!query || query.length < 3) return { success: false, error: "Consulta demasiado corta." };

  try {
    // 1. Vectorización de la consulta
    const embeddingResult = await embeddingModel.embedContent(query);
    
    // 2. Búsqueda Semántica en Supabase (pgvector)
    const { data: chunks, error } = await supabase.rpc('match_documents', {
      query_embedding: embeddingResult.embedding.values, 
      match_threshold: 0.5, // Umbral estricto para evitar alucinaciones
      match_count: 6        // Recuperamos suficiente contexto
    });

    if (error || !chunks || chunks.length === 0) {
      return { 
          success: true, 
          answer: "He consultado la base de datos legislativa y no encuentro una referencia exacta para tu consulta. Por favor, especifica más el artículo o la ley a la que te refieres.", 
          sources: [] 
      };
    }

    // 3. Preparación del Contexto
    const context = chunks.map((c: any) => `[FUENTE: ${c.article_ref}]\n${c.content}`).join("\n\n");
    
    // 4. Generación de Respuesta
    const prompt = `
      Eres Atenea, la IA instructora de la Academia de Policía.
      Responde a la pregunta del alumno basándote ÚNICA y EXCLUSIVAMENTE en el siguiente contexto legislativo oficial.
      
      CONTEXTO OFICIAL:
      ${context}
      
      PREGUNTA DEL ALUMNO: "${query}"
      
      REGLAS:
      1. Cita siempre el artículo o ley de referencia.
      2. Si el contexto no tiene la respuesta, dilo. No inventes.
      3. Sé técnica, precisa y jurídica.
    `;

    const result = await chatModel.generateContent(prompt);
    return { success: true, answer: result.response.text(), sources: chunks };
  } catch (e: any) { return { success: false, error: "Error en el sistema de consulta: " + e.message }; }
}


// ==========================================
//  5. MOTOR DE TEST ADVERSARIO (FASE 2)
//  + SEED DE QUESTION_BANK (BATCH)
// ==========================================

type GeneratedQ = {
  question: string;
  options: { id: 'a' | 'b' | 'c'; text: string }[];
  correctOptionId: 'a' | 'b' | 'c';
  explanation: string;
  source_refs?: any;
};

function normalizeText(s: string): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function correctIndexFromId(id: 'a' | 'b' | 'c'): number {
  return id === 'a' ? 0 : id === 'b' ? 1 : 2;
}

function computeQuestionHash(subjectId: number, questionText: string, options: string[], correctIndex: number): string {
  const payload = JSON.stringify({
    subjectId,
    q: normalizeText(questionText),
    o: options.map(normalizeText),
    c: correctIndex,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runner() {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx], idx);
    }
  }

  const runners = Array.from({ length: Math.max(1, concurrency) }, () => runner());
  await Promise.all(runners);
  return results;
}


export async function getQuestionsFromBank(params: {
  topic: string;
  difficulty?: number; // 1..3
  limit: number;
}) {
  const { topic, difficulty = 2, limit } = params;

  if (!topic || !limit || limit < 1) {
    return { success: false, error: 'Parámetros inválidos.' };
  }

  const { data, error } = await supabase
    .from('question_bank')
    .select('id, subject_id, topic, difficulty, question_text, options, correct_index, explanation')
    .eq('topic', topic)
    .eq('status', 'active')
    .gte('difficulty', Math.max(1, Math.min(3, difficulty)) - 1) // un pelín flexible
    .lte('difficulty', Math.max(1, Math.min(3, difficulty)) + 1)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { success: false, error: error.message };
  return { success: true, data: data || [] };
}


/**
 * Genera UNA pregunta tipo test (CNP): 3 opciones (A/B/C), 1 correcta, explicación.
 * Está anclada a texto indexado (RAG) usando article_ref como filtro por topic.
 */
export async function generateTestQuestion(topic: string) {
  try {
    if (!topic) return { success: false, error: "Tema no especificado." };

    // 1) RAG: buscar contenido relacionado (pool amplio para variedad)
    const { data: chunks } = await supabase
      .from('documents')
      .select('content, article_ref')
      .ilike('article_ref', `%${topic}%`)
      .limit(40);

    if (!chunks || chunks.length === 0) {
      return { success: false, error: "No hay contenido indexado para este tema." };
    }

    const selectedChunk = chunks[Math.floor(Math.random() * chunks.length)];

    // 2) Prompt alineado a examen CNP (3 opciones)
    const prompt = `
Actúa como TRIBUNAL CALIFICADOR de Policía Nacional (tipo test).
Genera UNA pregunta de dificultad media/alta basada en el tenor literal del texto.

TEXTO BASE (LEY / ARTÍCULO):
"${selectedChunk.article_ref}"
${selectedChunk.content}

REGLAS:
- 3 opciones (A, B, C). SOLO UNA correcta.
- Estilo examen: literalidad, excepciones, competencias, plazos, conceptos.
- Las incorrectas deben ser plausibles, pero claramente incorrectas según el texto.
- Evita ambigüedad.

OUTPUT JSON OBLIGATORIO (SIN TEXTO EXTRA):
{
  "question": "Enunciado...",
  "options": [
    {"id":"a","text":"Opción A"},
    {"id":"b","text":"Opción B"},
    {"id":"c","text":"Opción C"}
  ],
  "correctOptionId": "a|b|c",
  "explanation": "Explicación breve citando el artículo/idea del texto y por qué las otras son falsas."
}
`;

    const result = await chatModel.generateContent(prompt);
    const rawText = cleanAIResponse(result.response.text());

    let jsonData: GeneratedQ;
    try {
      jsonData = JSON.parse(rawText);

      if (
        !jsonData.question ||
        !Array.isArray(jsonData.options) ||
        jsonData.options.length !== 3 ||
        !jsonData.correctOptionId ||
        !jsonData.explanation
      ) {
        throw new Error("Estructura JSON inválida");
      }

      const ids = jsonData.options.map(o => o?.id);
      if (!ids.includes('a') || !ids.includes('b') || !ids.includes('c')) {
        throw new Error("IDs de opciones inválidos");
      }

      if (!['a', 'b', 'c'].includes(jsonData.correctOptionId)) {
        throw new Error("correctOptionId inválido");
      }
    } catch (e) {
      console.error("Fallo generación JSON:", rawText);
      return { success: false, error: "Error interno generando la pregunta. Reintentar." };
    }

    return {
      success: true,
      data: {
        ...jsonData,
        source_refs: [{ article_ref: selectedChunk.article_ref }],
      }
    };
  } catch (e: any) {
    return { success: false, error: "Error motor de test: " + e.message };
  }
}

async function generateOneWithRetries(topic: string, retries: number) {
  for (let attempt = 1; attempt <= Math.max(1, retries); attempt++) {
    const q = await generateTestQuestion(topic);
    if (q.success && q.data?.question && Array.isArray(q.data.options) && q.data.options.length === 3) {
      return { ok: true as const, data: q.data as GeneratedQ };
    }
  }
  return { ok: false as const, error: `No se pudo generar JSON válido (${topic})` };
}

/**
 * Genera preguntas en lote y las guarda en public.question_bank con:
 * - dedupe por question_hash (sha256)
 * - concurrency controlada
 * - retries por pregunta
 */
export async function seedQuestionBank(params: {
  subjectId: number;
  topic: string;
  count: number;
  difficulty?: number;   // default 2
  concurrency?: number;  // default 2
  retries?: number;      // default 3
}) {
  const {
    subjectId,
    topic,
    count,
    difficulty = 2,
    concurrency = 2,
    retries = 3,
  } = params;

  if (!subjectId || !topic || !count || count < 1) {
    return { success: false, error: "Parámetros inválidos." };
  }

  const tasks = Array.from({ length: count }, (_, i) => i);

  const genResults = await runWithConcurrency(tasks, concurrency, async () => {
    return generateOneWithRetries(topic, retries);
  });

  let generatedOk = 0;
  let inserted = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const g of genResults) {
    if (!g.ok) {
      failed++;
      if (errors.length < 10) errors.push(g.error);
      continue;
    }

    generatedOk++;

    const d = g.data;
    const optionsTexts = d.options.map(o => o.text);
    const correctIndex = correctIndexFromId(d.correctOptionId);
    const question_hash = computeQuestionHash(subjectId, d.question, optionsTexts, correctIndex);

    const row = {
      subject_id: subjectId,
      topic,
      difficulty,
      question_text: d.question,
      options: optionsTexts,        // jsonb array de strings
      correct_index: correctIndex,  // 0..2
      explanation: d.explanation,
      source_refs: d.source_refs ?? null,
      question_hash,
      status: 'candidate',
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('question_bank')
      .upsert(row, { onConflict: 'question_hash' });

    if (error) {
      failed++;
      if (errors.length < 10) errors.push(error.message);
    } else {
      inserted++;
    }
  }

  return {
    success: true,
    topic,
    subjectId,
    requested: count,
    generatedOk,
    inserted,
    failed,
    errors,
  };
}



export async function saveTestResult(
  userId: string,
  topic: string,
  question: string,
  isCorrect: boolean,
  errorType: string | null
) {
  try {
    if (!userId) throw new Error("Usuario anónimo");

    const subject_id = await getSubjectIdByName(topic);

    await supabase.from('test_results').insert({
      user_id: userId,
      subject_id, // 👈 NUEVO
      topic,      // lo dejamos por compatibilidad
      question_text: question,
      is_correct: isCorrect,
      error_type: errorType
    });

    return { success: true };
  } catch (e) {
    console.error("Error guardando resultado:", e);
    return { success: false };
  }
}

export async function voteQuestion(params: {
  questionId: string;
  userId: string;
  vote: 1 | -1;
}) {
  const { questionId, userId, vote } = params;

  if (!questionId || !userId || ![1, -1].includes(vote)) {
    return { success: false, error: 'Parámetros inválidos.' };
  }

  // upsert para permitir cambiar voto
  const { error } = await supabaseAnon
    .from('question_votes')
    .upsert(
      { question_id: questionId, user_id: userId, vote },
      { onConflict: 'question_id,user_id' }
    );

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function reportQuestion(params: {
  questionId: string;
  userId: string;
  reportType:
    | 'wrong_correct_answer'
    | 'ambiguous_question'
    | 'bad_explanation'
    | 'out_of_syllabus'
    | 'bad_options'
    | 'typo_or_format'
    | 'source_mismatch'
    | 'other';
  message: string;
}) {
  const { questionId, userId, reportType, message } = params;

  if (!questionId || !userId || !reportType || !message?.trim()) {
    return { success: false, error: 'Parámetros inválidos.' };
  }

  const { error } = await supabaseAnon
    .from('question_reports')
    .insert({
      question_id: questionId,
      user_id: userId,
      report_type: reportType,
      message: message.trim(),
      status: 'open',
    });

  if (error) return { success: false, error: error.message };
  return { success: true };
}


/**
 * Guardado masivo para modo Examen (Simulacro).
 */
export async function saveExamResults(userId: string, results: any[]) {
  try {
      if (!userId || results.length === 0) return { success: false };
      
      const rows = results.map(r => ({
          user_id: userId, 
          topic: r.topic, 
          question_text: r.question_text, 
          is_correct: r.is_correct, 
          error_type: r.is_correct ? null : 'fallo_examen_simulacro'
      }));
      
      await supabase.from('test_results').insert(rows);
      return { success: true };
  } catch (e) { return { success: false }; }
}

// ==========================================
//  6. FLASHCARDS (SISTEMA SRS & FSRS)
// ==========================================

export async function generateFlashcard(userId: string, topic: string) {
  try {
    // 1. SRS: Buscar tarjetas vencidas (Repaso Espaciado)
    const { data: due } = await supabase.from('flashcard_progress')
        .select('*')
        .eq('user_id', userId)
        .eq('topic', topic)
        .lte('next_review', new Date().toISOString())
        .limit(1);

    if (due && due.length > 0) {
        return { success: true, data: { ...due[0], db_id: due[0].id, isReview: true } };
    }

    // 2. Generación Nueva (Si no hay repaso pendiente)
    const { data: chunks } = await supabase.from('documents')
        .select('content').ilike('article_ref', `%${topic}%`).limit(30);
    
    if (!chunks || chunks.length === 0) return { success: false, error: "Tema vacío o no encontrado." };

    const randomContext = chunks.sort(() => Math.random() - 0.5)[0].content.substring(0, 1500);
    
    const prompt = `
      Genera una Flashcard para memorización de datos puros.
      CONTEXTO: ${randomContext}
      OUTPUT JSON: { "front": "Pregunta corta (Dato, Fecha, Plazo)", "back": "Respuesta exacta" }
    `;
    
    const result = await chatModel.generateContent(prompt);
    const jsonData = JSON.parse(cleanAIResponse(result.response.text()));
    
    return { success: true, data: { ...jsonData, topic, isReview: false } };
  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function saveFlashcardProgress(userId: string, cardData: any, rating: 'fail' | 'hard' | 'easy') {
  try {
    // Algoritmo SRS Simplificado (Cajas de Leitner adaptadas)
    let newBox = cardData.box || 1;
    let days = 0;

    if (rating === 'fail') {
        newBox = 1; // Reinicio radical
        days = 1;   // Repaso mañana obligatoriamente
    } else if (rating === 'hard') {
        days = 3;   // Repaso cercano, mantengo caja
    } else { // easy
        newBox = Math.min(newBox + 1, 5); // Subimos de nivel
        // Intervalos exponenciales: 1, 3, 7, 15, 30 días
        days = newBox === 2 ? 3 : newBox === 3 ? 7 : newBox === 4 ? 15 : 30;
    }

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + days);

    const payload = {
        user_id: userId,
        topic: cardData.topic,
        front: cardData.front,
        back: cardData.back,
        box: newBox,
        next_review: nextDate
    };

    if (cardData.db_id) {
        await supabase.from('flashcard_progress').update(payload).eq('id', cardData.db_id);
    } else {
        await supabase.from('flashcard_progress').insert(payload);
    }

    // Registrar actividad para las gráficas
// Registrar resultado de flashcard (NO en test_results)
const subject_id = subjectIdFromTopic(cardData.topic);

const grade =
  rating === 'fail' ? 'again' :
  rating === 'hard' ? 'hard' :
  'easy';

await supabase.from('flashcard_results').insert({
  user_id: userId,
  subject_id,
  topic: cardData.topic,
  front: cardData.front,
  back: cardData.back,
  grade,
  box_before: cardData.box ?? 1,
  box_after: newBox,
  next_review: nextDate
});


    return { success: true };
  } catch (e: any) { return { success: false, error: e.message }; }
}

// ==========================================
//  7. GESTIÓN Y ADMIN (DASHBOARD)
// ==========================================

export async function getStudentTopics() {
    try {
        const { data } = await supabase.from('documents').select('article_ref');
        if (!data) return { success: true, topics: [] };
        
        // Extraer nombres de tema únicos (ej. "TEMA 1 - ..." -> "TEMA 1")
        const counts: any = {};
        data.forEach((d:any) => {
            if (d.article_ref) {
                const topicName = d.article_ref.split(' - ')[0];
                counts[topicName] = 1;
            }
        });
        return { success: true, topics: Object.keys(counts).sort() };
    } catch (e) { return { success: false, error: "Error al cargar temario." }; }
}

export async function getUserStats(userId: string) {
  try {
      // Obtenemos los últimos 100 resultados para estadísticas de tendencia
      const { data } = await supabase.from('test_results')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!data || data.length === 0) {
          return { success: true, stats: { total: 0, winRate: 0, lastItems: [] } };
      }
      
      const correct = data.filter(r => r.is_correct).length;
      
      return { 
          success: true, 
          stats: { 
              total: data.length, 
              winRate: Math.round((correct/data.length)*100), 
              lastItems: data.slice(0, 5) // Solo devolvemos los 5 últimos para el feed visual
          } 
      };
  } catch (e) { return { success: false, error: "Error al calcular estadísticas." }; }
}

// --- FUNCIONES ADMIN (UPLOAD, DELETE, ETC.) ---

export async function uploadTopicPDF(adminId: string, formData: FormData) {
  try {
    const role = await getUserRole(adminId);
    if (role !== 'admin') throw new Error("Acceso denegado: Se requieren permisos de Administrador.");

    const file = formData.get('file') as File;
    if (!file) throw new Error("No se ha recibido ningún archivo.");

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Extracción de texto con pdf2json
    const text = await new Promise<string>((resolve, reject) => {
      const pdfParser = new (PDFParser as any)(null, 1);
      pdfParser.on("pdfParser_dataError", (err: any) => reject(err.parserError));
      pdfParser.on("pdfParser_dataReady", () => {
        const raw = pdfParser.getRawTextContent(); 
        try { resolve(decodeURIComponent(raw)); } catch (e) { resolve(raw); }
      });
      pdfParser.parseBuffer(buffer);
    });

    const sourceName = file.name.replace('.pdf', '').replace(/_/g, ' ').toUpperCase();
    // Limpieza de cabeceras/pies de página típicos de BOE/Temarios
    const cleanText = text
        .replace(/----------------Page \(\d+\) Break----------------/g, '')
        .replace(/\.{4,}/g, ' ')
        .replace(/\d+\s*$/gm, '')
        .replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Chunking por párrafos (Estrategia simple pero efectiva para legal)
    const paragraphs = cleanText.split(/\n\s*\n/);
    let currentChunk = "", part = 1, savedCount = 0;

    for (const p of paragraphs) {
        const c = p.trim();
        if (!c) continue;
        
        // Acumular hasta ~2000 caracteres para contexto suficiente
        if (currentChunk.length + c.length > 2000) {
            const emb = await embeddingModel.embedContent(currentChunk);
            await supabase.from('documents').insert({ 
                content: currentChunk, 
                embedding: emb.embedding.values, 
                article_ref: `${sourceName} - Parte ${part++}` 
            });
            savedCount++;
            currentChunk = c;
        } else { 
            currentChunk += "\n\n" + c; 
        }
    }
    // Guardar remanente
    if (currentChunk) {
         const emb = await embeddingModel.embedContent(currentChunk);
         await supabase.from('documents').insert({ 
            content: currentChunk, 
            embedding: emb.embedding.values, 
            article_ref: `${sourceName} - Parte ${part}` 
        });
        savedCount++;
    }

    return { success: true, message: `Procesado correctamente: ${sourceName} (${savedCount} fragmentos generados).` };

  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function deleteTopic(adminId: string, topicName: string) {
    try {
        const role = await getUserRole(adminId);
        if (role !== 'admin') throw new Error("Acceso denegado");
        
        // Borrado por coincidencia de nombre en article_ref
        const { error } = await supabase.from('documents').delete().ilike('article_ref', `${topicName}%`);
        if (error) throw error;
        
        return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
}

// En app/actions.ts
export async function getTopicsList(adminId: string) {
    try {
        const role = await getUserRole(adminId);
        if (role !== 'admin') throw new Error("Acceso denegado");
        
        const { data } = await supabase.from('documents').select('article_ref');
        const counts: any = {};
        data?.forEach((d:any) => {
            const name = d.article_ref.split(' - ')[0];
            counts[name] = (counts[name]||0)+1;
        });
        
        // Devolvemos success:true y error:null para consistencia
        return { success: true, topics: Object.entries(counts).map(([name, count]) => ({ name, count })), error: null };
    } catch (e: any) { 
        // Devolvemos success:false y el mensaje de error
        return { success: false, topics: [], error: e.message }; 
    }
}

// Stubs para funciones administrativas menores (Health Check, etc.)
export async function getAdminUsersList(adminId: string) { 
    if ((await getUserRole(adminId)) !== 'admin') return {success: false, error: "Unauthorized"};
    const { data } = await supabase.from('profiles').select('*'); 
    return { success: true, users: data || [] }; 
}
export async function getGlobalActivity(adminId: string) { 
    if ((await getUserRole(adminId)) !== 'admin') return {success: false, error: "Unauthorized"};
    const { data } = await supabase.from('test_results').select('*').order('created_at', {ascending: false}).limit(20);
    return { success: true, activity: data || [] }; 
}
export async function checkDatabaseHealth(adminId: string) { 
    if ((await getUserRole(adminId)) !== 'admin') return {success: false, error: "Unauthorized"};
    const { count } = await supabase.from('documents').select('*', { count: 'exact', head: true });
    return { success: true, total: count || 0 }; 
}

// --- MÓDULO FÍSICO (OPERATOR TRAINING) ---

export async function getPhysicalProfile(userId: string) {
    const { data } = await supabase.from('profiles_physical').select('*').eq('user_id', userId).single();
    return { success: true, data };
}

export async function savePhysicalProfile(userId: string, data: any) {
    const { error } = await supabase.from('profiles_physical').upsert({ user_id: userId, ...data });
    return { success: !error, error: error?.message };
}

// ==========================================
//  GENERADOR DE PLAN TÁCTICO (ENTRENADOR IA)
// ==========================================

export async function generateWeeklyPlan(userId: string, profile: any) {
    try {
        if (!profile || !profile.baseline_metrics) {
            throw new Error("Faltan datos de las pruebas físicas para generar el plan.");
        }

        // 1. CÁLCULO DE VARIABLES FISIOLÓGICAS
        const currentYear = new Date().getFullYear();
        const age = profile.birth_year ? currentYear - profile.birth_year : 25;
        
        // 2. ESTRATEGIA DE FUERZA (DOMINADAS)
        const pullupScore = Number(profile.baseline_metrics.pullups_score) || 0;
        const pullupMethod = profile.baseline_metrics.pullups_method || 'reps';
        
        let pullupStrategy = "";
        if (pullupScore < 1 || pullupMethod === 'suspension') {
            pullupStrategy = "ESTRATEGIA DE EMERGENCIA (Fase 0): El opositor NO hace dominadas. Prioridad: Fase excéntrica (bajadas lentas 5s), isométricos en barra y trabajo de gomas. NO mandar dominadas estrictas.";
        } else if (pullupScore < 10) {
            pullupStrategy = `ACUMULACIÓN (Fase 1): Hace ${pullupScore} reps. Prioridad: Ganar volumen (series largas, bandas elásticas de ayuda).`;
        } else {
            pullupStrategy = `INTENSIDAD (Fase 2): Hace ${pullupScore} reps. Prioridad: Lastre y fuerza máxima.`;
        }

        // 3. ESTRATEGIA DE CARRERA (VAM - COOPER)
        const cooperDist = Number(profile.baseline_metrics.cooper_distance) || 2000;
        const vamEstimada = (cooperDist / 12 / 60 * 1000).toFixed(1); // m/min aprox para referencia interna

        // 4. LOGÍSTICA (NUEVO: DÍAS Y EQUIPAMIENTO)
        const daysAvailable = profile.availability || 5;
        const equipmentText = profile.equipment === 'gym' 
            ? "ACCESO TOTAL: Gimnasio comercial (Pesas, poleas, prensa, mancuernas)." 
            : "ACCESO LIMITADO: Calistenia / Parque (Barra dominadas, suelo, peso corporal).";

// 5. PROMPT "ENTRENADOR TÁCTICO CNP"
        const prompt = `
            ACTÚA COMO: Preparador Físico de Élite para Policía Nacional (CNP).
            
            PERFIL LOGÍSTICO (RESTRICCIONES ESTRICTAS):
            - Días de Entreno: ${daysAvailable} DÍAS a la semana. (Genera exactamente esta cantidad de sesiones).
            - Equipamiento: ${equipmentText} (Adapta los ejercicios a esto).
            
            PERFIL ATLÉTICO:
            - Edad: ${age} años. Género: ${profile.gender}. Peso: ${profile.weight}kg.
            - Nivel Fuerza: ${pullupStrategy}
            - Nivel Resistencia: Cooper ${cooperDist}m (VAM baja/media).
            - Agilidad: ${profile.baseline_metrics.agility_time || '?'}s.

            OBJETIVO:
            Generar el MICROCICLO DE LA SEMANA 1 en formato JSON PURO. 
            El plan debe mejorar el 1.000m (velocidad/resistencia) y las Dominadas/Suspensión.

            IMPORTANTE:
            - NO escribas introducción ni conclusión ("Aquí tienes el plan...").
            - Devuelve SOLO el objeto JSON.

            ESTRUCTURA JSON OBLIGATORIA:
            {
                "week_focus": "Objetivo principal del microciclo (Ej: Fuerza base y Rodaje)",
                "days": [
                    {
                        "day": "Lunes", 
                        "type": "Fuerza", 
                        "title": "Tren Superior",
                        "exercises": [
                            { 
                                "name": "Nombre ejercicio", 
                                "sets": "4", 
                                "reps": "8-10", 
                                "rest": "90s", 
                                "target": "Instrucción técnica breve", 
                                "metric_type": "reps_weight" 
                            }
                        ]
                    }
                    // ... Genera hasta completar los ${daysAvailable} días.
                ]
            }
        `;

        // Llamada a la IA (Usando el modelo chatModel o smartModel configurado con gemini-2.5-flash)
        const result = await smartModel.generateContent(prompt);
        const planRaw = cleanAIResponse(result.response.text());
        const plan = JSON.parse(planRaw);
        
        // Guardar en Base de Datos
        const { data: insertedData, error } = await supabase.from('training_plans').insert({
            user_id: userId,
            week_start: new Date().toISOString(),
            plan_data: plan,
            status: 'active'
        }).select().single();

        if (error) throw error;

        return { success: true, plan: insertedData };

    } catch (e: any) { 
        console.error("Error generando plan físico:", e);
        return { success: false, error: e.message || "Error al generar el entrenamiento." }; 
    }
}

// --- AÑADIR AL FINAL DE ACTIONS.TS ---

export async function getActiveTrainingPlan(userId: string) {
    try {
        // Buscamos el plan más reciente que esté activo
        const { data, error } = await supabase
            .from('training_plans')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error) return { success: false, plan: null };
        return { success: true, plan: data };
    } catch (e) {
        return { success: false, plan: null };
    }
}

// --- AÑADIR AL FINAL DE ACTIONS.TS ---

export async function completeTrainingDay(userId: string, planId: string, dayIndex: number, logData: any) {
    try {
        // 1. Obtenemos el plan actual de la BD
        const { data: planRow, error: fetchError } = await supabase
            .from('training_plans')
            .select('plan_data')
            .eq('id', planId)
            .single();
            
        if (fetchError || !planRow) throw new Error("Plan no encontrado");

        // 2. Modificamos el JSON (Marcamos el día como completed)
        const updatedPlanData = { ...planRow.plan_data };
        if (updatedPlanData.days && updatedPlanData.days[dayIndex]) {
            updatedPlanData.days[dayIndex].isCompleted = true;
            // Opcional: Guardar el log dentro del día para historial
            updatedPlanData.days[dayIndex].log = logData; 
        }

        // 3. Guardamos el JSON actualizado en la BD
        const { error: updateError } = await supabase
            .from('training_plans')
            .update({ plan_data: updatedPlanData })
            .eq('id', planId);

        if (updateError) throw updateError;

        return { success: true };
    } catch (e: any) {
        console.error("Error completando sesión:", e);
        return { success: false, error: e.message };
    }
}

export async function saveFlashcardResult(
  userId: string,
  topic: string,
  front: string,
  back: string,
  grade: 'again' | 'hard' | 'good' | 'easy',
  boxBefore?: number,
  boxAfter?: number,
  nextReview?: string
) {
  const subject_id = await getSubjectIdByName(topic);

  const { error } = await supabase.from('flashcard_results').insert({
    user_id: userId,
    subject_id: subjectId,
    topic,
    front,
    back,
    grade,
    box_before: boxBefore ?? null,
    box_after: boxAfter ?? null,
    next_review: nextReview ?? null,
  });

  if (error) {
    console.error('saveFlashcardResult error:', error);
    throw error;
  }

  return { success: true };
}

// --- AÑADIR O SUSTITUIR EN ACTIONS.TS ---

/**
 * Helper para mapear Topics (texto) a IDs numéricos (subjects).
 * Lo hacemos simple basado en tus datos actuales.
 */
async function getSubjectIdByName(topicName: string): Promise<number | null> {
  // Normalización básica
  const search = topicName.trim().toUpperCase();
  
  // Mapeo rápido basado en tu tabla (puedes ampliarlo)
  if (search.includes("CONSTITUCION")) return 1;
  if (search.includes("TEMA 40")) return 2;
  
  // Fallback: búsqueda en DB
  const { data } = await supabase
    .from('subjects')
    .select('id')
    .ilike('title', `%${topicName}%`) // Busca coincidencia parcial
    .limit(1)
    .single();
    
  return data ? data.id : 3; // 3 = 'Otros' por defecto
}

/**
 * NUEVA FUNCIÓN CORE: Genera IA -> Guarda 'Candidate' -> Devuelve
 */
export async function generateAndSaveCandidate(topic: string) {
  // 1. Generar la pregunta (usamos la lógica que ya tenías)
  const genResult = await generateTestQuestion(topic);
  
  if (!genResult.success || !genResult.data) {
    return genResult; // Devuelve el error tal cual
  }

  const qData = genResult.data;
  
  // 2. Calcular Hash para evitar duplicados exactos
  const subjectId = await getSubjectIdByName(topic);
  const correctIndex = qData.correctOptionId === 'a' ? 0 : qData.correctOptionId === 'b' ? 1 : 2;
  const optionsTexts = qData.options.map(o => o.text);
  
  // Recalculamos hash (usando tu función interna si es exportada, o una copia local aquí)
  // NOTA: Asegúrate de que computeQuestionHash esté accesible o cópiala dentro de esta función.
  const payload = JSON.stringify({
    subjectId,
    q: qData.question.trim().toLowerCase().replace(/\s+/g, ' '),
    o: optionsTexts.map(t => t.trim().toLowerCase().replace(/\s+/g, ' ')),
    c: correctIndex,
  });
  const questionHash = crypto.createHash('sha256').update(payload).digest('hex');

  // 3. Guardar en DB como CANDIDATE
  // Intentamos guardar. Si ya existe el hash, devolvemos la existente.
  const row = {
    subject_id: subjectId,
    topic: topic,
    difficulty: 2, // Default medio
    question_text: qData.question,
    options: optionsTexts,
    correct_index: correctIndex,
    explanation: qData.explanation,
    source_refs: qData.source_refs || null,
    question_hash: questionHash,
    status: 'candidate', // <--- CLAVE: Nace como candidata
    origin: 'live_ai',   // <--- CLAVE: Origen IA en vivo
    created_at: new Date().toISOString()
  };

  const { data: saved, error } = await supabase
    .from('question_bank')
    .upsert(row, { onConflict: 'question_hash' })
    .select()
    .single();

  if (error) {
    console.error("Error guardando candidate:", error);
    // Fallback: devolvemos la generada aunque no se guardara (mejor que fallar)
    return { success: true, data: { ...qData, id: null, status: 'unsaved' } };
  }

  // 4. Devolver estructura compatible con el Frontend
  return {
    success: true,
    data: {
      ...qData,
      id: saved.id, // ¡AHORA SÍ TIENE ID!
      subject_id: saved.subject_id,
      status: saved.status
    }
  };
}

// ==========================================
//  8. MODERACIÓN Y GESTIÓN DE BANCO (NUEVO)
// ==========================================

/**
 * Obtiene la cola de trabajo para el administrador:
 * 1. Preguntas "candidate" (generadas por IA esperando revisión).
 * 2. Reportes "open" (quejas de usuarios).
 */
export async function getModerationQueue(adminId: string) {
  try {
    const role = await getUserRole(adminId);
    if (role !== 'admin') throw new Error("Acceso denegado");

    // 1. Traer Candidatos (Limitado a 50 para no saturar UI)
    const { data: candidates, error: errCand } = await supabase
      .from('question_bank')
      .select('*')
      .eq('status', 'candidate')
      .order('created_at', { ascending: false })
      .limit(50);

    if (errCand) throw errCand;

    // 2. Traer Reportes Abiertos + Datos de la Pregunta asociada
    // NOTA: Esto requiere que exista Foreign Key en question_reports.question_id -> question_bank.id
    const { data: reports, error: errRep } = await supabase
      .from('question_reports')
      .select('*, question:question_bank(*)') // <--- Traemos TODO para poder editarlo 
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (errRep) throw errRep;

    return { 
        success: true, 
        data: { 
            candidates: candidates || [], 
            reports: reports || [] 
        } 
    };

  } catch (e: any) {
    console.error("Error fetching moderation queue:", e);
    return { success: false, error: e.message };
  }
}

/**
 * Aprueba una pregunta candidata -> Pasa a 'active'.
 * Ahora los alumnos podrán verla en sus tests.
 */
export async function approveQuestion(adminId: string, questionId: string) {
  try {
    const role = await getUserRole(adminId);
    if (role !== 'admin') throw new Error("Acceso denegado");

    const { error } = await supabase
      .from('question_bank')
      .update({ status: 'active' }) // <--- ¡A LA VIDA PÚBLICA!
      .eq('id', questionId);

    if (error) throw error;
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Desactiva una pregunta (ya sea desde candidato o por un reporte).
 * Pasa a 'disabled'. No se borra para mantener integridad referencial.
 */
export async function disableQuestion(adminId: string, questionId: string) {
  try {
    const role = await getUserRole(adminId);
    if (role !== 'admin') throw new Error("Acceso denegado");

    const { error } = await supabase
      .from('question_bank')
      .update({ status: 'disabled' })
      .eq('id', questionId);

    if (error) throw error;
    
    // Opcional: Si venía de un reporte, marcar los reportes asociados como resueltos (closed)
    // para limpiar la cola.
    await supabase
        .from('question_reports')
        .update({ status: 'resolved', admin_notes: 'Pregunta desactivada tras revisión.' })
        .eq('question_id', questionId)
        .eq('status', 'open');

    return { success: true };

  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Marca un reporte como resuelto sin borrar la pregunta (ej: era un reporte falso).
 */
export async function resolveReport(adminId: string, reportId: string) {
    try {
        const role = await getUserRole(adminId);
        if (role !== 'admin') throw new Error("Acceso denegado");
    
        const { error } = await supabase
          .from('question_reports')
          .update({ status: 'dismissed' })
          .eq('id', reportId);
    
        if (error) throw error;
        return { success: true };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
}

/**
 * Permite al Admin editar una pregunta (texto, opciones, explicación)
 * antes de aprobarla o incluso si ya está activa.
 */
export async function updateQuestion(adminId: string, questionId: string, data: {
  question_text: string;
  options: string[];
  correct_index: number;
  explanation: string;
}) {
  try {
    const role = await getUserRole(adminId);
    if (role !== 'admin') throw new Error("Acceso denegado");

    const { error } = await supabase
      .from('question_bank')
      .update({
        question_text: data.question_text,
        options: data.options,
        correct_index: data.correct_index,
        explanation: data.explanation,
        updated_at: new Date().toISOString()
      })
      .eq('id', questionId);

    if (error) throw error;
    return { success: true };

  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
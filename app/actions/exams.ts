'use server'
import { supabaseAdmin as supabase, questionModel, getSubjectIdByName, getSubjectNameById } from './core';
import { questionHash } from '../lib/question-hash';
import { parseAIJson, validateGeneratedQuestion, randomContextWindow } from '../lib/ai-output';
import { requireAdmin, requireUser } from '../lib/auth';
import { registraGasto } from '../lib/ai-usage';
import { checkQuota } from '../lib/rate-limit';
import { requireModule } from '../lib/module-guard';
import {
  QUESTION_STATUS,
  QUESTION_ORIGIN,
  indexToOptionId,
  shuffle,
  toDifficultyLevel,
  DIFFICULTY_DEFAULT,
  type QuestionStatus,
  type DifficultyLevel,
  type BankRow,
} from '../lib/questions';
import { toResultRow, type AnswerMetrics, type ExamResultPayload } from '../lib/exam-results';
import { buildQuestionPrompt } from '../lib/question-prompt';

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
  /** Articulo del que sale. `null` si el contexto no lo sabia (P3.7). */
  legal_reference: string | null;
};

/** El trozo de temario con el que se va a redactar la pregunta, y de donde sale. */
type ContextoGeneracion = {
  texto: string;
  document_id: string;
  filename: string;
  legal_reference: string | null;
};

/** Fila de `document_chunks` con su documento resuelto por join. */
type FilaFragmento = {
  content_chunk: string | null;
  reference: string | null;
  document_id: string;
  documents: { id: string; filename: string | null } | null;
};

/**
 * Elige con que texto se redacta la pregunta.
 *
 * Antes se tomaba SIEMPRE una ventana aleatoria de 12.000 caracteres de
 * `documents.full_text`, y el corte caia donde caia: una pregunta podia nacer
 * de un trozo que empieza a mitad del articulo 11 y acaba a mitad del 12.
 *
 * Ahora se prefiere un FRAGMENTO, que desde P1b es un articulo y desde P1f trae
 * su referencia de verdad. Dos cosas mejoran a la vez:
 *
 *   · la pregunta se redacta sobre una unidad con sentido propio;
 *   · se puede guardar DE QUE ARTICULO sale, que es lo que le dice al alumno
 *     que releer (P3.7).
 *
 * El respaldo sobre `full_text` se queda, y no es decorativo: unos apuntes no
 * tienen articulos —el tema 40 tiene 40 fragmentos y cero referencias— y un
 * tema recien subido puede no estar indexado todavia. Sin el respaldo, esos
 * temas se quedarian sin poder generar ni una pregunta.
 */
async function elegirContexto(subjectId: number): Promise<ContextoGeneracion | null> {
  // 1. Preferente: un fragmento al azar, de los que traen articulo.
  //
  // Se cuenta primero y se salta a una posicion al azar en vez de traerse los
  // 229 fragmentos del tema para elegir uno: la Constitucion son ~200 KB de
  // texto por cada pregunta generada, y la siembra genera hasta 200 seguidas.
  const { count } = await supabase
    .from('document_chunks')
    .select('id, documents!inner(subject_id)', { count: 'exact', head: true })
    .eq('documents.subject_id', subjectId)
    .not('reference', 'is', null);

  if (count && count > 0) {
    const salto = Math.floor(Math.random() * count);
    const { data } = await supabase
      .from('document_chunks')
      .select('content_chunk, reference, document_id, documents!inner(id, filename, subject_id)')
      .eq('documents.subject_id', subjectId)
      .not('reference', 'is', null)
      .range(salto, salto);

    const fila = (data as unknown as FilaFragmento[] | null)?.[0];
    if (fila?.content_chunk && fila.content_chunk.length >= 50) {
      return {
        texto: fila.content_chunk,
        document_id: fila.document_id,
        filename: fila.documents?.filename ?? '',
        legal_reference: fila.reference,
      };
    }
  }

  // 2. Respaldo: la ventana aleatoria de siempre sobre el documento entero.
  const { data: docs, error } = await supabase
    .from('documents')
    .select('id, filename, full_text')
    .eq('subject_id', subjectId);

  if (error || !docs || docs.length === 0) return null;

  const elegido = docs[Math.floor(Math.random() * docs.length)];
  const fullText = elegido.full_text || '';
  if (fullText.length < 50) return null;

  return {
    texto: randomContextWindow(fullText, 12000),
    document_id: elegido.id,
    filename: elegido.filename,
    // Sin fragmento no hay articulo que guardar, y adivinarlo seria peor que
    // no tenerlo: P1f ya costo una tanda de referencias falsas.
    legal_reference: null,
  };
}

/** Fila de `question_bank` recien insertada o recuperada. */
type SavedQuestion = { id: string; subject_id: number; status: string } | null;

// Helper interno. NO se exporta como Server Action: era un endpoint publico
// que llamaba a Gemini sin ninguna comprobacion. Sus dos consumidores
// (`generateAndSaveCandidate` y `seedQuestionBank`) ya validan la sesion.
/**
 * Genera UNA pregunta con la dificultad pedida.
 *
 * `nivel` no es decorativo: viaja al prompt y se guarda en la fila. Antes el
 * prompt decia siempre "Dificultad Media/Alta" y la columna se quedaba con su
 * valor por defecto, asi que las tres opciones de la interfaz daban lo mismo.
 */
/**
 * `quienGenera` no es decorativo: sin el id, el registro de gasto no puede
 * decir A QUIEN cargarle la llamada, y un contador de gasto sin dueño solo
 * sirve para saber el total — no para ver que un alumno concreto se ha
 * disparado, que es justo lo que hay que poder ver.
 */
async function generateTestQuestion(
  subjectId: number,
  nivel: DifficultyLevel = DIFFICULTY_DEFAULT,
  quienGenera = 'desconocido',
) {
  try {
    if (!subjectId) return { success: false, error: "ID de tema inválido." };

    // 1. Elegir el trozo de temario: un articulo si lo hay, si no una ventana.
    const contexto = await elegirContexto(subjectId);
    if (!contexto) return { success: false, error: "Tema vacío o sin texto suficiente." };

    // El prompt vive en `lib/`, no aquí: es la regla 32 aplicada al generador
    // de preguntas. Un fichero `'use server'` no se puede importar desde un
    // script ni desde un test, así que este prompt solo corría en producción.
    // Y el script de siembra masiva lo necesita: sin sacarlo, habría dos.
    const result = await questionModel.generateContent(buildQuestionPrompt(contexto, nivel));
    registraGasto({ ruta: 'pregunta', userId: quienGenera, uso: result.response.usageMetadata, detalle: `tema=${subjectId}` });
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
        document_id: contexto.document_id,
        filename: contexto.filename,
        legal_reference: contexto.legal_reference,
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

/**
 * Genera UNA pregunta con la IA y la guarda como candidata.
 *
 * SOLO ADMINISTRACION, y eso es un cambio deliberado.
 *
 * Antes la llamaba el alumno: cuando el banco no tenia suficientes preguntas
 * de los temas elegidos, la pantalla del examen pedia a Gemini las que
 * faltaban, en paralelo y sin avisar de nada. Tres problemas, y el del dinero
 * era el menor:
 *
 *   1. El gasto lo decidia quien no lo paga. Un alumno que abriera un examen
 *      de 100 preguntas sobre un tema vacio disparaba 100 llamadas de pago.
 *   2. Se estudiaba con preguntas SIN REVISAR. Una candidata no ha pasado por
 *      moderacion; el `validateGeneratedQuestion` filtra lo que esta roto, no
 *      lo que esta mal. El alumno no distinguia unas de otras.
 *   3. Cada alumno recibia preguntas distintas para el mismo tema, asi que
 *      "el 40% falla esta pregunta" (el panel de academia) dejaba de
 *      significar nada.
 *
 * El banco lo llena el administrador, con `npm run sembrar` o desde el panel.
 * Si un tema se queda corto, la pantalla del examen lo DICE en vez de gastar.
 */
export async function generateAndSaveCandidate(topicNameOrId: string | number, difficulty?: number) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const modulo = await requireModule('test');
  if (!modulo.ok) return { success: false as const, error: modulo.error };

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
    // `toDifficultyLevel` normaliza lo que llegue: es un endpoint publico.
    const nivel = toDifficultyLevel(difficulty);
    const genResult = await generateTestQuestion(subjectId, nivel, auth.user.id);
    // Se construye la respuesta de error en vez de reenviar `genResult`: aquel
    // no traía `id`, así que el tipo de retorno era una unión que la UI no podía
    // consumir sin comprobaciones.
    if (!genResult.success || !genResult.data) {
      return { success: false as const, error: genResult.error ?? 'No se pudo generar la pregunta.' };
    }

    const qData = genResult.data;
    
    // C. Calcular Hash (Evitar duplicados)
    // La formula vive en `lib/question-hash`: la comparten los tres caminos
    // que escriben en el banco (vivo, siembra y alta a mano) y tienen que
    // calcularla igual, o la misma pregunta entra dos veces.
    const qHash = questionHash(subjectId, qData.question, qData.correctIndex);

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
          difficulty_level: nivel,
          legal_reference: qData.legal_reference,
          status: QUESTION_STATUS.CANDIDATE,
          origin: QUESTION_ORIGIN.LIVE_AI,
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
  /** 1 facil, 2 media, 3 alta. Por defecto media, que es el valor de la columna. */
  difficulty?: number;
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

  const nivel = toDifficultyLevel(params.difficulty);

  const worker = async () => {
    for (let i = 0; i < 3; i++) {
        const res = await generateTestQuestion(subjectId, nivel, auth.user.id);
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
    const qHash = questionHash(subjectId, d.question, d.correctIndex);

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
          difficulty_level: nivel,
          legal_reference: d.legal_reference,
          status,
          origin: QUESTION_ORIGIN.BANK_SEED,
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
   * 1 facil, 2 media, 3 alta. Se aplica de forma PREFERENTE, no excluyente:
   * ver abajo.
   */
  difficulty?: number;
}) {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const modulo = await requireModule('test');
  if (!modulo.ok) return { success: false as const, error: modulo.error };

  let ids = params.subjectIds || [];
  if (params.topic && ids.length === 0) {
      const id = await getSubjectIdByName(params.topic);
      ids = [id];
  }
  
  if (ids.length === 0) return { success: false as const, error: "Sin temas" };

  // La dificultad es PREFERENTE, no excluyente, y es una decision deliberada:
  // hoy las 55 preguntas del banco tienen el nivel 2 por defecto, asi que un
  // filtro estricto dejaria "facil" y "dificil" con CERO preguntas. El modulo
  // caeria en generar el examen entero con IA — lento y de pago, justo lo que
  // la fase 2.1 arreglo. Se sirven primero las del nivel pedido y se completa
  // con el resto solo si no llegan.
  const consulta = () =>
    supabase
      .from('question_bank')
      .select('*')
      .in('subject_id', ids)
      .eq('status', QUESTION_STATUS.ACTIVE);

  const nivel = params.difficulty ? toDifficultyLevel(params.difficulty) : null;

  let elegidas: BankRow[] = [];
  if (nivel) {
    const preferentes = await consulta()
      .eq('difficulty_level', nivel)
      .limit(params.limit * 3);
    if (preferentes.error) return { success: false as const, error: preferentes.error.message };
    elegidas = shuffle(preferentes.data ?? []).slice(0, params.limit);
  }

  if (elegidas.length < params.limit) {
    const resto = await consulta().limit(params.limit * 3);
    if (resto.error) return { success: false as const, error: resto.error.message };

    // Sin el Set se repetirian las que ya entraron por el nivel pedido.
    const yaEstan = new Set(elegidas.map((q) => q.id));
    const relleno = shuffle((resto.data ?? []).filter((q: BankRow) => !yaEstan.has(q.id)));
    elegidas = [...elegidas, ...relleno.slice(0, params.limit - elegidas.length)];
  }

  return { success: true as const, data: elegidas };
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
  // `selectedIndex` viaja con las metricas y no como parametro suelto para no
  // volver a tener dos firmas que puedan divergir (regla 6). Es opcional: en
  // entrenamiento nunca hay blancos, pero saber QUE distractor eligio el
  // alumno es lo que permite detectar una opcion mal redactada.
  metrics?: Partial<AnswerMetrics> & { selectedIndex?: number | null }
): Promise<{ success: boolean; id: string | null }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, id: null };

  try {
    // `question_attempts` guarda el TITULO del tema, no su id. Si entran por
    // id hay que resolverlo: guardar el numero dejaria un `topic` que ninguna
    // consulta posterior encuentra.
    const topic = typeof topicOrId === 'number'
      ? await getSubjectNameById(topicOrId)
      : topicOrId.toString();

    // El mapeo camelCase -> columnas ocurre en un solo sitio (lib/exam-results),
    // compartido con el guardado en bloque del examen. Aqui se armaba a mano y
    // por eso los nombres pudieron divergir entre los dos caminos.
    const row = toResultRow({ questionId, topic, isCorrect, ...metrics });

    const { data, error } = await supabase
      .from('question_attempts')
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
    .from('question_attempts')
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

    const { error } = await supabase.from('question_attempts').insert(rows);

    if (error) console.error('saveExamResults:', error.message);
    return { success: !error };
}

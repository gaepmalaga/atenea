'use server'

import { supabaseAdmin } from './core';
import { requireAdmin, requireUser } from '../lib/auth';
import {
  QUESTION_STATUS,
  QUESTION_ORIGIN,
  toDifficultyLevel,
  type ModerationCandidate,
  type ModerationQueue,
  type ModerationReport,
} from '../lib/questions';
import { validateGeneratedQuestion } from '../lib/ai-output';
import { questionHash } from '../lib/question-hash';
import { MAX_IMPORT } from '../lib/question-import';
import { registraAccion } from '../lib/admin-audit';
import { createSupabaseServerClient } from '../lib/supabase/server';

/**
 * Resultado uniforme de las acciones de moderación.
 * Antes cada acción devolvía `{ success: true }` a ciegas: los errores de la
 * base de datos se descartaban y la UI daba por buena una escritura fallida.
 */
type ModerationResult = { success: boolean; error?: string };

export async function voteQuestion(params: { questionId: string; vote: 1 | -1 }): Promise<ModerationResult> {
    const auth = await requireUser();
    if (!auth.ok) return { success: false, error: auth.error };
    const db = await createSupabaseServerClient();

    const { error } = await db.from('question_votes').upsert(
        { question_id: params.questionId, user_id: auth.user.id, vote: params.vote },
        { onConflict: 'question_id,user_id' }
    );
    return { success: !error, error: error?.message };
}

export async function reportQuestion(params: { questionId: string; reportType: string; message: string }): Promise<ModerationResult> {
    const auth = await requireUser();
    if (!auth.ok) return { success: false, error: auth.error };
    const db = await createSupabaseServerClient();

    const { error } = await db.from('question_reports').insert({
        question_id: params.questionId,
        user_id: auth.user.id,
        report_type: params.reportType,
        message: params.message
    });
    return { success: !error, error: error?.message };
}

export async function getModerationQueue() {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false as const, error: auth.error };

    // El titulo del tema se trae por join: `question_bank` guarda `subject_id`.
    // Sin esto el panel pintaba `q.topic` y siempre salia vacio.
    const { data: cand } = await supabaseAdmin
      .from('question_bank')
      .select('*, subject:subjects(title)')
      .eq('status', QUESTION_STATUS.CANDIDATE)
      .limit(50);

    // El join resuelve porque la FK question_reports.question_id -> question_bank
    // esta declarada. Si no lo estuviera, PostgREST devolveria error y la cola
    // saldria vacia.
    const { data: rep } = await supabaseAdmin
      .from('question_reports')
      .select('*, question:question_bank(*)')
      .eq('status', 'open');

    /** Aplana `subject.title` a `topic`, que es lo que pinta la interfaz. */
    const conTema = (fila: unknown): ModerationCandidate => {
      const { subject, ...resto } = (fila ?? {}) as Record<string, unknown> & {
        subject?: { title?: string | null } | null;
      };
      return { ...resto, topic: subject?.title ?? null } as ModerationCandidate;
    };

    const data: ModerationQueue = {
      candidates: (cand ?? []).map(conTema),
      reports: ((rep ?? []) as unknown as ModerationReport[]).map((r) => ({
        ...r,
        question: r.question ? conTema(r.question) : null,
      })),
    };
    return { success: true as const, data };
}

export async function approveQuestion(questionId: string): Promise<ModerationResult> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };

    const { error } = await supabaseAdmin.from('question_bank').update({ status: QUESTION_STATUS.ACTIVE }).eq('id', questionId);
    return { success: !error, error: error?.message };
}

/**
 * Aprueba varias preguntas de una vez.
 *
 * La generacion en vivo alimenta la cola de candidatas de forma continua:
 * aprobarlas de una en una no da abasto.
 */
export async function approveQuestions(questionIds: string[]): Promise<ModerationResult & { approved?: number }> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };
    if (!questionIds.length) return { success: true, approved: 0 };

    const { data, error } = await supabaseAdmin
        .from('question_bank')
        .update({ status: QUESTION_STATUS.ACTIVE })
        .in('id', questionIds)
        .eq('status', QUESTION_STATUS.CANDIDATE)  // nunca resucita una descartada
        .select('id');

    if (!error && data?.length) {
        registraAccion({ actorId: auth.user.id, action: 'approve_questions', detail: { cantidad: data.length } });
    }
    return { success: !error, error: error?.message, approved: data?.length ?? 0 };
}

export async function disableQuestion(questionId: string): Promise<ModerationResult> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };

    const { error } = await supabaseAdmin.from('question_bank').update({ status: QUESTION_STATUS.DISABLED }).eq('id', questionId);
    if (!error) registraAccion({ actorId: auth.user.id, action: 'disable_question', target: questionId });
    return { success: !error, error: error?.message };
}

/**
 * Descarta TODAS las preguntas del banco de una vez.
 *
 * No es un DELETE: pasa cada fila a `disabled`, igual que `disableQuestion`
 * (regla 3). `question_attempts`, `question_notes`, `question_reports` y
 * `question_votes` referencian `question_bank.id`; borrar la fila de verdad
 * rompería el historial de examenes de todos los alumnos que hubieran
 * respondido esa pregunta. `disabled` no se sirve ni se resucita al resembrar,
 * asi que el efecto para el alumno es el mismo que un vaciado real.
 *
 * `neq` deja fuera lo que ya estaba `disabled`: no cuenta como afectada una
 * fila que ya lo estaba.
 */
export async function discardAllQuestions(): Promise<ModerationResult & { discarded?: number }> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };

    const { data, error } = await supabaseAdmin
        .from('question_bank')
        .update({ status: QUESTION_STATUS.DISABLED })
        .neq('status', QUESTION_STATUS.DISABLED)
        .select('id');

    if (!error) {
        registraAccion({ actorId: auth.user.id, action: 'discard_all_candidates', detail: { cantidad: data?.length ?? 0 } });
    }
    return { success: !error, error: error?.message, discarded: data?.length ?? 0 };
}

export async function resolveReport(reportId: string): Promise<ModerationResult> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };

    const { error } = await supabaseAdmin.from('question_reports').update({ status: 'dismissed' }).eq('id', reportId);
    if (!error) registraAccion({ actorId: auth.user.id, action: 'resolve_report', target: reportId });
    return { success: !error, error: error?.message };
}

/**
 * Edita una pregunta del banco desde el panel de administracion.
 *
 * El parametro era `any` y lo que llegaba se escribia tal cual. Una Server
 * Action es un endpoint publico, asi que se valida con la MISMA funcion que la
 * salida del modelo: una edicion a mano puede dejar un `correct_index` fuera de
 * rango igual de bien que la IA, y el efecto es identico — el alumno estudia un
 * dato falso sin que nada avise (regla 10). Tambien cubre opciones repetidas,
 * vacias, y enunciados en blanco.
 */
export async function updateQuestion(questionId: string, data: unknown): Promise<ModerationResult> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };
    if (!questionId) return { success: false, error: 'Falta el id de la pregunta.' };

    const check = validateGeneratedQuestion(data);
    if (!check.ok) return { success: false, error: `Edición rechazada: ${check.reason}` };

    // Se escriben los valores YA normalizados, no los de entrada: es lo que
    // recorta espacios y deja el indice como numero.
    const { error } = await supabaseAdmin.from('question_bank').update({
        question_text: check.value.question,
        options: check.value.options,
        correct_index: check.value.correctIndex,
        explanation: check.value.explanation,
    }).eq('id', questionId);
    return { success: !error, error: error?.message };
}


// ==========================================
// ALTA MANUAL DE PREGUNTAS  (P2)
// ==========================================
//
// Hasta ahora solo se podian EDITAR preguntas que ya existian: para tener una
// pregunta concreta habia que generar varias con IA y reescribir la que mas se
// acercara. Esto es lo que permite a una academia cargar su propio banco sin
// depender del modelo.

/**
 * Lo que llega del formulario o del importador.
 *
 * Se declara aqui como `unknown` y se comprueba campo a campo: una Server
 * Action es un endpoint HTTP publico, asi que la validacion del navegador no
 * cuenta (regla 16).
 */
type AltaManual = {
  subjectId: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: number;
};

/** Fila lista para `question_bank`, ya validada y con su huella. */
type FilaNueva = {
  subject_id: number;
  question_text: string;
  options: string[];
  correct_index: number;
  explanation: string;
  question_hash: string;
  difficulty_level: number;
  status: string;
  origin: string;
  created_at: string;
};

/**
 * Comprueba una pregunta suelta y la deja en forma de fila.
 *
 * Reutiliza `validateGeneratedQuestion`, la misma que filtra la salida del
 * modelo: opciones repetidas o vacias, enunciado demasiado corto y —lo que de
 * verdad importa— un `correctIndex` fuera de rango. Una persona escribiendo en
 * un Excel se equivoca igual que la IA, y lo que le pasa al alumno es identico:
 * estudia un dato falso y nada avisa (regla 10).
 *
 * Las preguntas escritas a mano entran como `active`: si las escribe un
 * administrador sobre su propio temario, mandarlas a su propia cola de
 * moderacion no aporta nada. Se pueden descartar desde el banco como cualquier
 * otra.
 */
function aFilaNueva(entrada: unknown, subjectId: number): { ok: true; fila: FilaNueva } | { ok: false; motivo: string } {
  const check = validateGeneratedQuestion(entrada);
  if (!check.ok) return { ok: false, motivo: check.reason };

  const d = (entrada ?? {}) as Record<string, unknown>;
  const nivel = toDifficultyLevel(d.difficulty ?? d.difficulty_level);

  return {
    ok: true,
    fila: {
      subject_id: subjectId,
      // Se guardan los valores YA normalizados (recortados y sin Markdown),
      // no los de entrada.
      question_text: check.value.question,
      options: check.value.options,
      correct_index: check.value.correctIndex,
      explanation: check.value.explanation,
      question_hash: questionHash(subjectId, check.value.question, check.value.correctIndex),
      difficulty_level: nivel,
      status: QUESTION_STATUS.ACTIVE,
      origin: QUESTION_ORIGIN.MANUAL,
      created_at: new Date().toISOString(),
    },
  };
}

/** El tema tiene que existir: `question_bank.subject_id` es clave ajena de `subjects`. */
async function temaExiste(subjectId: number): Promise<boolean> {
  const { data } = await supabaseAdmin.from('subjects').select('id').eq('id', subjectId).maybeSingle();
  return !!data;
}

export async function createManualQuestion(
  input: unknown
): Promise<ModerationResult & { id?: string; duplicada?: boolean }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const d = (input ?? {}) as Partial<AltaManual>;
  const subjectId = Number(d.subjectId);
  if (!Number.isInteger(subjectId) || subjectId <= 0) {
    return { success: false, error: 'Falta el tema al que pertenece la pregunta.' };
  }
  if (!(await temaExiste(subjectId))) {
    return { success: false, error: 'Ese tema no existe.' };
  }

  const preparada = aFilaNueva(input, subjectId);
  if (!preparada.ok) return { success: false, error: preparada.motivo };

  // `ignoreDuplicates`, igual que en los otros dos caminos de escritura: si la
  // pregunta ya estaba, NO se reescribe su fila. Sin esto, escribir a mano una
  // pregunta que ya existia devolveria una descartada al banco o sacaria de el
  // a una aprobada (regla 3).
  const { data, error } = await supabaseAdmin
    .from('question_bank')
    .upsert(preparada.fila, { onConflict: 'question_hash', ignoreDuplicates: true })
    .select('id')
    .maybeSingle();

  if (error) return { success: false, error: error.message };

  if (!data) {
    // No se inserto nada: el hash ya existia. Se dice cual es, y en que estado,
    // porque "ya existe pero esta descartada" y "ya existe y esta en el banco"
    // piden cosas distintas de quien la estaba escribiendo.
    const { data: existente } = await supabaseAdmin
      .from('question_bank')
      .select('id, status')
      .eq('question_hash', preparada.fila.question_hash)
      .maybeSingle();

    const estado = existente?.status === QUESTION_STATUS.DISABLED
      ? ' Esta descartada: se puede recuperar editandola desde el banco.'
      : '';
    return {
      success: false,
      duplicada: true,
      id: existente?.id,
      error: `Esa pregunta ya existe en este tema.${estado}`,
    };
  }

  return { success: true, id: data.id };
}

/**
 * Alta en lote desde una hoja de calculo.
 *
 * El CSV se lee en el navegador (`app/lib/question-import.ts`) y lo que viaja
 * son preguntas ya troceadas. Aqui se vuelven a validar TODAS: que el
 * navegador las haya mirado no significa nada para un endpoint publico.
 *
 * Devuelve el desglose entero —insertadas, duplicadas y rechazadas con su
 * motivo— y no un simple `success`. Un importador que dice "listo" despues de
 * tragarse treinta filas es exactamente como se acaba con un banco incompleto
 * sin enterarse.
 */
export async function importManualQuestions(
  input: unknown
): Promise<
  ModerationResult & {
    insertadas?: number;
    duplicadas?: number;
    rechazadas?: { indice: number; motivo: string }[];
  }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const d = (input ?? {}) as { subjectId?: unknown; questions?: unknown };
  const subjectId = Number(d.subjectId);
  if (!Number.isInteger(subjectId) || subjectId <= 0) {
    return { success: false, error: 'Falta el tema al que pertenecen las preguntas.' };
  }
  if (!Array.isArray(d.questions) || d.questions.length === 0) {
    return { success: false, error: 'No llego ninguna pregunta.' };
  }
  if (d.questions.length > MAX_IMPORT) {
    return { success: false, error: `Se importan como maximo ${MAX_IMPORT} preguntas de una vez.` };
  }
  if (!(await temaExiste(subjectId))) {
    return { success: false, error: 'Ese tema no existe.' };
  }

  const rechazadas: { indice: number; motivo: string }[] = [];
  const filas: FilaNueva[] = [];
  const huellas = new Set<string>();
  let repetidasEnElFichero = 0;

  d.questions.forEach((q, i) => {
    const preparada = aFilaNueva(q, subjectId);
    if (!preparada.ok) {
      rechazadas.push({ indice: i, motivo: preparada.motivo });
      return;
    }
    // Dos filas iguales dentro del mismo envio chocarian contra la restriccion
    // unica y el fallo saldria como un error de base de datos en vez de como
    // lo que es: una fila repetida en el fichero.
    if (huellas.has(preparada.fila.question_hash)) {
      repetidasEnElFichero++;
      return;
    }
    huellas.add(preparada.fila.question_hash);
    filas.push(preparada.fila);
  });

  if (filas.length === 0) {
    return { success: false, error: 'Ninguna fila era utilizable.', insertadas: 0, duplicadas: repetidasEnElFichero, rechazadas };
  }

  const { data: insertadas, error } = await supabaseAdmin
    .from('question_bank')
    .upsert(filas, { onConflict: 'question_hash', ignoreDuplicates: true })
    .select('id');

  if (error) return { success: false, error: error.message, rechazadas };

  const nInsertadas = insertadas?.length ?? 0;
  return {
    success: true,
    insertadas: nInsertadas,
    // Las que ya estaban en el banco, mas las repetidas dentro del propio
    // fichero: para quien importa las dos cosas son "esta ya la tenia".
    duplicadas: filas.length - nInsertadas + repetidasEnElFichero,
    rechazadas,
  };
}

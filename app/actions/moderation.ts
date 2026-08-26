'use server'

import { supabaseAdmin } from './core';
import { requireAdmin, requireUser } from '../lib/auth';
import {
  QUESTION_STATUS,
  type ModerationCandidate,
  type ModerationQueue,
  type ModerationReport,
} from '../lib/questions';
import { validateGeneratedQuestion } from '../lib/ai-output';

/**
 * Resultado uniforme de las acciones de moderación.
 * Antes cada acción devolvía `{ success: true }` a ciegas: los errores de la
 * base de datos se descartaban y la UI daba por buena una escritura fallida.
 */
type ModerationResult = { success: boolean; error?: string };

export async function voteQuestion(params: { questionId: string; vote: 1 | -1 }): Promise<ModerationResult> {
    const auth = await requireUser();
    if (!auth.ok) return { success: false, error: auth.error };

    const { error } = await supabaseAdmin.from('question_votes').upsert(
        { question_id: params.questionId, user_id: auth.user.id, vote: params.vote },
        { onConflict: 'question_id,user_id' }
    );
    return { success: !error, error: error?.message };
}

export async function reportQuestion(params: { questionId: string; reportType: string; message: string }): Promise<ModerationResult> {
    const auth = await requireUser();
    if (!auth.ok) return { success: false, error: auth.error };

    const { error } = await supabaseAdmin.from('question_reports').insert({
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

    return { success: !error, error: error?.message, approved: data?.length ?? 0 };
}

export async function disableQuestion(questionId: string): Promise<ModerationResult> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };

    const { error } = await supabaseAdmin.from('question_bank').update({ status: QUESTION_STATUS.DISABLED }).eq('id', questionId);
    return { success: !error, error: error?.message };
}

export async function resolveReport(reportId: string): Promise<ModerationResult> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };

    const { error } = await supabaseAdmin.from('question_reports').update({ status: 'dismissed' }).eq('id', reportId);
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

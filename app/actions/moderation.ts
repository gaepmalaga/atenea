'use server'

import { supabaseAdmin } from './core';
import { requireAdmin, requireUser } from '../lib/auth';

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

    const { data: cand } = await supabaseAdmin.from('question_bank').select('*').eq('status', 'candidate').limit(50);
    const { data: rep } = await supabaseAdmin.from('question_reports').select('*, question:question_bank(*)').eq('status', 'open');
    return { success: true as const, data: { candidates: cand || [], reports: rep || [] } };
}

export async function approveQuestion(questionId: string): Promise<ModerationResult> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };

    const { error } = await supabaseAdmin.from('question_bank').update({ status: 'active' }).eq('id', questionId);
    return { success: !error, error: error?.message };
}

export async function disableQuestion(questionId: string): Promise<ModerationResult> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };

    const { error } = await supabaseAdmin.from('question_bank').update({ status: 'disabled' }).eq('id', questionId);
    return { success: !error, error: error?.message };
}

export async function resolveReport(reportId: string): Promise<ModerationResult> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };

    const { error } = await supabaseAdmin.from('question_reports').update({ status: 'dismissed' }).eq('id', reportId);
    return { success: !error, error: error?.message };
}

export async function updateQuestion(questionId: string, data: any): Promise<ModerationResult> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };

    const { error } = await supabaseAdmin.from('question_bank').update({
        question_text: data.question_text,
        options: data.options,
        correct_index: data.correct_index,
        explanation: data.explanation
    }).eq('id', questionId);
    return { success: !error, error: error?.message };
}

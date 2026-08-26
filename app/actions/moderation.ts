'use server'
// Corregido: Importamos las herramientas de core y getUserRole de user
import { supabaseAnon, supabaseAdmin } from './core';
import { getUserRole } from './user';

/**
 * Resultado uniforme de las acciones de moderación.
 * Antes cada acción devolvía `{ success: true }` a ciegas: los errores de la
 * base de datos se descartaban y la UI daba por buena una escritura fallida.
 */
type ModerationResult = { success: boolean; error?: string };

const DENIED: ModerationResult = { success: false, error: 'Acceso denegado.' };

async function requireAdmin(adminId: string): Promise<boolean> {
  return (await getUserRole(adminId)) === 'admin';
}

export async function voteQuestion(params: { questionId: string; userId: string; vote: 1 | -1 }): Promise<ModerationResult> {
    const { error } = await supabaseAnon.from('question_votes').upsert(
        { question_id: params.questionId, user_id: params.userId, vote: params.vote },
        { onConflict: 'question_id,user_id' }
    );
    return { success: !error, error: error?.message };
}

export async function reportQuestion(params: { questionId: string; userId: string; reportType: string; message: string }): Promise<ModerationResult> {
    const { error } = await supabaseAnon.from('question_reports').insert({
        question_id: params.questionId, user_id: params.userId, report_type: params.reportType, message: params.message
    });
    return { success: !error, error: error?.message };
}

export async function getModerationQueue(adminId: string) {
    if (!(await requireAdmin(adminId))) return { success: false as const, error: 'Acceso denegado.' };
    const { data: cand } = await supabaseAdmin.from('question_bank').select('*').eq('status', 'candidate').limit(50);
    const { data: rep } = await supabaseAdmin.from('question_reports').select('*, question:question_bank(*)').eq('status', 'open');
    return { success: true as const, data: { candidates: cand || [], reports: rep || [] } };
}

export async function approveQuestion(adminId: string, questionId: string): Promise<ModerationResult> {
    if (!(await requireAdmin(adminId))) return DENIED;
    const { error } = await supabaseAdmin.from('question_bank').update({ status: 'active' }).eq('id', questionId);
    return { success: !error, error: error?.message };
}

export async function disableQuestion(adminId: string, questionId: string): Promise<ModerationResult> {
    if (!(await requireAdmin(adminId))) return DENIED;
    const { error } = await supabaseAdmin.from('question_bank').update({ status: 'disabled' }).eq('id', questionId);
    return { success: !error, error: error?.message };
}

export async function resolveReport(adminId: string, reportId: string): Promise<ModerationResult> {
    if (!(await requireAdmin(adminId))) return DENIED;
    const { error } = await supabaseAdmin.from('question_reports').update({ status: 'dismissed' }).eq('id', reportId);
    return { success: !error, error: error?.message };
}

export async function updateQuestion(adminId: string, questionId: string, data: any): Promise<ModerationResult> {
    if (!(await requireAdmin(adminId))) return DENIED;
    const { error } = await supabaseAdmin.from('question_bank').update({
        question_text: data.question_text,
        options: data.options,
        correct_index: data.correct_index,
        explanation: data.explanation
    }).eq('id', questionId);
    return { success: !error, error: error?.message };
}

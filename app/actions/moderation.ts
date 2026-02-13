'use server'
// Corregido: Importamos las herramientas de core y getUserRole de user
import { supabaseAnon, supabaseAdmin } from './core';
import { getUserRole } from './user';

export async function voteQuestion(params: { questionId: string; userId: string; vote: 1 | -1 }) {
    await supabaseAnon.from('question_votes').upsert(
        { question_id: params.questionId, user_id: params.userId, vote: params.vote },
        { onConflict: 'question_id,user_id' }
    );
    return { success: true };
}

export async function reportQuestion(params: { questionId: string; userId: string; reportType: string; message: string }) {
    await supabaseAnon.from('question_reports').insert({
        question_id: params.questionId, user_id: params.userId, report_type: params.reportType, message: params.message
    });
    return { success: true };
}

export async function getModerationQueue(adminId: string) {
    if ((await getUserRole(adminId)) !== 'admin') return { success: false };
    const { data: cand } = await supabaseAdmin.from('question_bank').select('*').eq('status', 'candidate').limit(50);
    const { data: rep } = await supabaseAdmin.from('question_reports').select('*, question:question_bank(*)').eq('status', 'open');
    return { success: true, data: { candidates: cand || [], reports: rep || [] } };
}

export async function approveQuestion(adminId: string, questionId: string) {
    if ((await getUserRole(adminId)) !== 'admin') return { success: false };
    await supabaseAdmin.from('question_bank').update({ status: 'active' }).eq('id', questionId);
    return { success: true };
}

export async function disableQuestion(adminId: string, questionId: string) {
    if ((await getUserRole(adminId)) !== 'admin') return { success: false };
    await supabaseAdmin.from('question_bank').update({ status: 'disabled' }).eq('id', questionId);
    return { success: true };
}

export async function resolveReport(adminId: string, reportId: string) {
    if ((await getUserRole(adminId)) !== 'admin') return { success: false };
    await supabaseAdmin.from('question_reports').update({ status: 'dismissed' }).eq('id', reportId);
    return { success: true };
}

export async function updateQuestion(adminId: string, questionId: string, data: any) {
    if ((await getUserRole(adminId)) !== 'admin') return { success: false };
    await supabaseAdmin.from('question_bank').update({
        question_text: data.question_text,
        options: data.options,
        correct_index: data.correct_index,
        explanation: data.explanation
    }).eq('id', questionId);
    return { success: true };
}
'use server'
import { supabaseAdmin as supabase, smartModel, cleanAIResponse } from './core';
import { requireUser } from '../lib/auth';

export async function generateWeeklyPlan(profile: any) {
    const auth = await requireUser();
    if (!auth.ok) return { success: false, error: auth.error };
    const userId = auth.user.id;

    try {
        if (!profile || !profile.baseline_metrics) throw new Error("Faltan datos físicos.");
        
        // --- LÓGICA COMPLEJA RESTAURADA ---
        const pullupScore = Number(profile.baseline_metrics.pullups_score) || 0;
        let pullupStrategy = "";
        if (pullupScore < 1) pullupStrategy = "Fase 0: Excéntricas y Gomas.";
        else if (pullupScore < 10) pullupStrategy = "Fase 1: Volumen y series largas.";
        else pullupStrategy = "Fase 2: Lastre y Fuerza Máxima.";

        const daysAvailable = profile.availability || 5;
        const equipmentText = profile.equipment === 'gym' ? "Gimnasio Comercial" : "Parque/Calistenia";
        const currentYear = new Date().getFullYear();
        const age = profile.birth_year ? currentYear - profile.birth_year : 25;

        const prompt = `
            ACTÚA COMO: Preparador Físico CNP.
            PERFIL: ${JSON.stringify(profile)}
            EDAD: ${age}
            LOGÍSTICA: ${daysAvailable} días/sem. Equipo: ${equipmentText}.
            NIVEL FUERZA: ${pullupStrategy}.
            
            OBJETIVO: Plan semanal (Semana 1) JSON PURO.
            ESTRUCTURA: { "week_focus": "...", "days": [{ "day": "Lunes", "type": "Fuerza", "exercises": [...] }] }
        `;
        const result = await smartModel.generateContent(prompt);
        const plan = JSON.parse(cleanAIResponse(result.response.text()));

        const { data: inserted } = await supabase.from('training_plans').insert({
            user_id: userId,
            week_start: new Date().toISOString(),
            plan_data: plan,
            status: 'active'
        }).select().single();
        return { success: true, plan: inserted };
    } catch (e: any) { return { success: false, error: e.message }; }
}

export async function getActiveTrainingPlan() {
    const auth = await requireUser();
    if (!auth.ok) return { success: false as const, error: auth.error, plan: null };
    const userId = auth.user.id;

    const { data } = await supabase.from('training_plans').select('*').eq('user_id', userId).eq('status', 'active').order('created_at', {ascending:false}).limit(1).single();
    return { success: true as const, plan: data };
}

export async function completeTrainingDay(
    planId: string, dayIndex: number, logData: any
): Promise<{ success: boolean; error?: string }> {
    const auth = await requireUser();
    if (!auth.ok) return { success: false, error: auth.error };
    const userId = auth.user.id;

    // Nota: el filtro por user_id evita que un usuario marque como completado
    // el plan de otro (antes `userId` se recibía y se ignoraba).
    const { data: plan, error: readError } = await supabase
        .from('training_plans')
        .select('plan_data')
        .eq('id', planId)
        .eq('user_id', userId)
        .single();

    if (readError) return { success: false, error: readError.message };
    if (!plan) return { success: false, error: 'Plan no encontrado.' };

    const updated = { ...plan.plan_data };
    if (!updated.days?.[dayIndex]) return { success: false, error: 'Día inexistente en el plan.' };

    // PENDIENTE (ver PLAN, Fase 4): `logData` (series, repeticiones, sensaciones)
    // sigue sin persistirse en una tabla propia; hoy solo se guarda la marca de
    // completado dentro del JSON del plan.
    updated.days[dayIndex].isCompleted = true;

    const { error } = await supabase.from('training_plans').update({ plan_data: updated }).eq('id', planId);
    return { success: !error, error: error?.message };
}

export async function getPhysicalProfile() {
    const auth = await requireUser();
    if (!auth.ok) return { success: false as const, error: auth.error, data: null };

    const { data } = await supabase.from('profiles_physical').select('*').eq('user_id', auth.user.id).single();
    return { success: true as const, data };
}

/** Campos que el cliente puede escribir en `profiles_physical`. */
const PHYSICAL_FIELDS = [
    'height', 'weight', 'birth_year', 'gender',
    'availability', 'equipment', 'injuries', 'baseline_metrics',
] as const;

export async function savePhysicalProfile(data: any) {
    const auth = await requireUser();
    if (!auth.ok) return { success: false, error: auth.error };

    // Lista blanca: antes se hacia `upsert({ user_id, ...data })`, y como el
    // objeto del cliente se expandia DESPUES de la clave, un `user_id` propio
    // sobrescribia el del servidor y permitia escribir en la fila de otro.
    const payload: Record<string, unknown> = { user_id: auth.user.id };
    for (const field of PHYSICAL_FIELDS) {
        if (data?.[field] !== undefined) payload[field] = data[field];
    }

    const { error } = await supabase.from('profiles_physical').upsert(payload);
    return { success: !error, error: error?.message };
}
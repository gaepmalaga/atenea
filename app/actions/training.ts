'use server'
import { supabaseAdmin as supabase, smartModel, cleanAIResponse } from './core';

export async function generateWeeklyPlan(userId: string, profile: any) {
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

export async function getActiveTrainingPlan(userId: string) {
    const { data } = await supabase.from('training_plans').select('*').eq('user_id', userId).eq('status', 'active').order('created_at', {ascending:false}).limit(1).single();
    return { success: true, plan: data };
}

export async function completeTrainingDay(userId: string, planId: string, dayIndex: number, logData: any) {
    const { data: plan } = await supabase.from('training_plans').select('plan_data').eq('id', planId).single();
    if (plan) {
        const updated = { ...plan.plan_data };
        if (updated.days[dayIndex]) updated.days[dayIndex].isCompleted = true;
        await supabase.from('training_plans').update({ plan_data: updated }).eq('id', planId);
    }
    return { success: true };
}

export async function getPhysicalProfile(userId: string) {
    const { data } = await supabase.from('profiles_physical').select('*').eq('user_id', userId).single();
    return { success: true, data };
}

export async function savePhysicalProfile(userId: string, data: any) {
    const { error } = await supabase.from('profiles_physical').upsert({ user_id: userId, ...data });
    return { success: !error, error: error?.message };
}
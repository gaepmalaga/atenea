'use server'
import { supabaseAdmin as supabase, planModel } from './core';
import { parseAIJson } from '../lib/ai-output';
import { requireUser } from '../lib/auth';

/** Perfil fisico tal y como lo guarda `savePhysicalProfile`. */
export type PhysicalProfileInput = {
    height?: number | null;
    weight?: number | null;
    birth_year?: number | null;
    gender?: string | null;
    availability?: number | null;
    equipment?: string | null;
    injuries?: string | null;
    baseline_metrics?: Record<string, number | string | null> | null;
};

/** Lo que el alumno anota al terminar un dia de entrenamiento. */
export type TrainingDayLog = Record<string, unknown>;

function errorMessage(e: unknown, fallback = 'Error desconocido'): string {
    return e instanceof Error ? e.message : fallback;
}

export async function generateWeeklyPlan(profile: PhysicalProfileInput) {
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
        const result = await planModel.generateContent(prompt);
        const plan = parseAIJson<{ week_focus?: string; days?: unknown[] }>(result.response.text());
        if (!plan?.days?.length) throw new Error('La IA no devolvió un plan utilizable.');

        const { data: inserted } = await supabase.from('training_plans').insert({
            user_id: userId,
            week_start: new Date().toISOString(),
            plan_data: plan,
            status: 'active'
        }).select().single();
        return { success: true, plan: inserted };
    } catch (e) { return { success: false, error: errorMessage(e) }; }
}

export async function getActiveTrainingPlan() {
    const auth = await requireUser();
    if (!auth.ok) return { success: false as const, error: auth.error, plan: null };
    const userId = auth.user.id;

    const { data } = await supabase.from('training_plans').select('*').eq('user_id', userId).eq('status', 'active').order('created_at', {ascending:false}).limit(1).single();
    return { success: true as const, plan: data };
}

export async function completeTrainingDay(
    planId: string, dayIndex: number, logData: TrainingDayLog
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

    // El log (series, repeticiones, sensaciones) se guarda dentro del JSON del
    // plan. Antes se recibía y se descartaba: el alumno lo anotaba y desaparecía
    // al recargar. Una tabla propia para poder consultar la progresión entre
    // semanas sigue siendo la fase 4.
    updated.days[dayIndex] = {
        ...updated.days[dayIndex],
        isCompleted: true,
        log: logData ?? null,
        completed_at: new Date().toISOString(),
    };

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

export async function savePhysicalProfile(data: PhysicalProfileInput) {
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
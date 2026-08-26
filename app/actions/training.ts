'use server'
import { supabaseAdmin as supabase, planModel } from './core';
import { parseAIJson } from '../lib/ai-output';
import { requireUser } from '../lib/auth';
import {
    normalizeProfileInput,
    normalizeMetrics,
    readMaxPullups,
    type PhysicalProfile,
} from '../lib/physical';
import { normalizePlan, PLAN_SHAPE, type WeeklyPlan } from '../lib/training-plan';

/** Lo que el alumno anota al terminar un dia de entrenamiento. */
export type TrainingDayLog = Record<string, unknown>;

function errorMessage(e: unknown, fallback = 'Error desconocido'): string {
    return e instanceof Error ? e.message : fallback;
}

export async function generateWeeklyPlan(profile: PhysicalProfile) {
    const auth = await requireUser();
    if (!auth.ok) return { success: false, error: auth.error };
    const userId = auth.user.id;

    try {
        if (!profile || !profile.baseline_metrics) throw new Error("Faltan datos físicos.");
        
        // --- LÓGICA COMPLEJA RESTAURADA ---
        // `?? 0` y no `|| 0`: son distintos solo si el alumno tiene 0 dominadas,
        // que es precisamente el caso que decide la Fase 0 del plan.
        const pullupScore = readMaxPullups(profile) ?? 0;
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
            ESTRUCTURA: ${PLAN_SHAPE}
        `;
        const result = await planModel.generateContent(prompt);
        // Se valida ANTES de guardar (regla 10): un dia sin ejercicios o sin
        // titulo tumbaba el panel, y ya estaba escrito en la BD.
        const plan = normalizePlan(parseAIJson(result.response.text()));
        if (!plan) throw new Error('La IA no devolvió un plan utilizable.');

        const { data: inserted, error } = await supabase.from('training_plans').insert({
            user_id: userId,
            week_start: new Date().toISOString(),
            plan_data: plan,
            status: 'active'
        }).select().single();
        // Sin esto, un fallo al insertar devolvia `success: true` con `plan: null`
        // y el entrenador se quedaba en blanco sin decir por que.
        if (error || !inserted) throw new Error(error?.message || 'No se pudo guardar el plan.');
        return { success: true, plan: { id: inserted.id as string, plan_data: plan } };
    } catch (e) { return { success: false, error: errorMessage(e) }; }
}

export type StoredPlan = { id: string; plan_data: WeeklyPlan | null };

export async function getActiveTrainingPlan(): Promise<
    { success: false; error: string; plan: null } | { success: true; plan: StoredPlan | null }
> {
    const auth = await requireUser();
    if (!auth.ok) return { success: false, error: auth.error, plan: null };
    const userId = auth.user.id;

    const { data } = await supabase.from('training_plans').select('*').eq('user_id', userId).eq('status', 'active').order('created_at', {ascending:false}).limit(1).single();
    if (!data) return { success: true, plan: null };

    // El plan guardado se normaliza al leerlo, no solo al escribirlo: en la BD
    // hay filas anteriores a esta fase, generadas sin `title` y sin garantia de
    // que `exercises` sea un array.
    return { success: true, plan: { id: data.id, plan_data: normalizePlan(data.plan_data) } };
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

    const updated = normalizePlan(plan.plan_data);
    if (!updated?.days?.[dayIndex]) return { success: false, error: 'Día inexistente en el plan.' };

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

export async function savePhysicalProfile(data: PhysicalProfile) {
    const auth = await requireUser();
    if (!auth.ok) return { success: false, error: auth.error };

    // Normalizar AQUI, no solo en el formulario: una Server Action es un
    // endpoint publico, asi que lo que llega puede no haber pasado por la UI.
    // Los `<input type="number">` devuelven cadenas: sin esto, a columnas
    // numericas les llegaba `"180"` o `""` y el upsert fallaba entero.
    const raw = (data ?? {}) as Record<string, unknown>;
    const clean: Record<string, unknown> = { ...normalizeProfileInput(raw) };
    if (raw.baseline_metrics && typeof raw.baseline_metrics === 'object') {
        clean.baseline_metrics = normalizeMetrics(raw.baseline_metrics as Record<string, unknown>);
    }

    // Lista blanca: antes se hacia `upsert({ user_id, ...data })`, y como el
    // objeto del cliente se expandia DESPUES de la clave, un `user_id` propio
    // sobrescribia el del servidor y permitia escribir en la fila de otro.
    const payload: Record<string, unknown> = { user_id: auth.user.id };
    for (const field of PHYSICAL_FIELDS) {
        if (clean[field] !== undefined) payload[field] = clean[field];
    }

    const { error } = await supabase.from('profiles_physical').upsert(payload);
    return { success: !error, error: error?.message };
}
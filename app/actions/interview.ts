'use server'
import { supabaseAdmin as supabase, chatModel, smartModel } from './core';
import { requireUser } from '../lib/auth';

export async function getBiodata() {
    const auth = await requireUser();
    if (!auth.ok) return { success: false as const, error: auth.error, data: null };

    const { data } = await supabase.from('profiles_biodata').select('*').eq('user_id', auth.user.id).single();
    return { success: true as const, data: data || null };
}

/** Campos que el cliente puede escribir en `profiles_biodata`. */
const BIODATA_FIELDS = [
    'family_background', 'studies_motivation', 'work_history', 'leisure_activities',
    'police_motivation', 'fears_concerns', 'strengths_weaknesses', 'legal_issues',
    'psych_answers', 'psych_profile',
] as const;

export async function saveBiodata(formData: any) {
    const auth = await requireUser();
    if (!auth.ok) return { success: false, error: auth.error };

    // Lista blanca: antes se hacia `upsert({ user_id, ...formData })` y el
    // objeto del cliente se expandia DESPUES de la clave, asi que un `user_id`
    // propio sobrescribia el del servidor. Ademas la UI reenviaba columnas de
    // la BD (`id`, `created_at`) que no le corresponde tocar.
    const payload: Record<string, unknown> = { user_id: auth.user.id };
    for (const field of BIODATA_FIELDS) {
        if (formData?.[field] !== undefined) payload[field] = formData[field];
    }

    const { error } = await supabase.from('profiles_biodata').upsert(payload);
    return { success: !error, error: error?.message ?? null };
}

export async function getPsychProfile() {
    const auth = await requireUser();
    if (!auth.ok) return { success: false as const, error: auth.error, data: null };

    let { data } = await supabase.from('profiles_psych').select('*').eq('user_id', auth.user.id).single();
    if (!data) {
        const { data: created } = await supabase.from('profiles_psych').insert({ user_id: auth.user.id }).select().single();
        data = created;
    }
    return { success: true as const, data };
}

// --- LOGICA COMPLEX RESTAURADA ---
async function generateInspectorReport(biodata: any) {
    if (!biodata) return "EL CANDIDATO NO TIENE DATOS. ACÚSALE DE FALTA DE INTERÉS.";
    const psych = biodata.psych_profile || { sincerity: 5, stability: 5, normativity: 5, leadership: 5 };

    const prompt = `
        ACTÚA COMO: Psicólogo Forense del Tribunal.
        DATOS: ${JSON.stringify(biodata)}
        PSICOTÉCNICO: Sinceridad ${psych.sincerity}, Estabilidad ${psych.stability}.
        
        GENERA INSTRUCCIONES DE PRESIÓN:
        1. Cruza datos.
        2. Si Sinceridad < 4: Asume que miente.
        3. Dame 3 preguntas trampa.
    `;
    const result = await smartModel.generateContent(prompt);
    return result.response.text();
}

export async function processInterviewTurn(history: {role: string, text: string}[], userAudioText: string) {
    const auth = await requireUser();
    if (!auth.ok) return { success: false, error: auth.error };

    try {
        const { data: biodata } = await supabase.from('profiles_biodata').select('*').eq('user_id', auth.user.id).single();
        
        let inspectorStrategy = "Mantén la presión.";
        if (history.length < 2 && biodata) {
             inspectorStrategy = await generateInspectorReport(biodata);
        }

        const profileContext = biodata ? JSON.stringify(biodata) : "SIN DATOS.";
        
        const systemPrompt = `
            ACTÚA COMO: Inspector Jefe del Tribunal (CNP).
            SITUACIÓN: Entrevista Oficial.
            BIODATA CANDIDATO: ${profileContext}
            ESTRATEGIA PSICOLÓGICA: ${inspectorStrategy}
            
            OBJETIVO: Presionar, buscar contradicciones.
            REGLAS: Respuestas CORTAS y HABLADAS.
            
            HISTORIAL: ${history.slice(-4).map(h => h.text).join(' | ')}
            CANDIDATO DICE: "${userAudioText}"
        `;
        const result = await chatModel.generateContent(systemPrompt);
        return { success: true, response: result.response.text() };
    } catch (e: any) { return { success: false, error: e.message }; }
}
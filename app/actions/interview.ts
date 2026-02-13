'use server'
import { supabaseAdmin as supabase, chatModel, smartModel } from './core';

export async function getBiodata(userId: string) {
    const { data } = await supabase.from('profiles_biodata').select('*').eq('user_id', userId).single();
    return { success: true, data: data || null };
}

export async function saveBiodata(userId: string, formData: any) {
    await supabase.from('profiles_biodata').upsert({ user_id: userId, ...formData });
    return { success: true, error: null };
}

export async function getPsychProfile(userId: string) {
    let { data } = await supabase.from('profiles_psych').select('*').eq('user_id', userId).single();
    if (!data) {
        const { data: created } = await supabase.from('profiles_psych').insert({ user_id: userId }).select().single();
        data = created;
    }
    return { success: true, data };
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

export async function processInterviewTurn(userId: string, history: {role: string, text: string}[], userAudioText: string) {
    try {
        const { data: biodata } = await supabase.from('profiles_biodata').select('*').eq('user_id', userId).single();
        
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
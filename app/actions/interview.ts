'use server'
import { supabaseAdmin as supabase, chatModel, smartModel, reportModel } from './core';
import { parseAIJson } from '../lib/ai-output';
import {
  canEvaluate,
  formatTranscript,
  normalizeReport,
  trimContext,
  buildInterviewProfile,
  hasProfileContent,
  MIN_TURNS_FOR_REPORT,
  type InterviewTurn,
  type InterviewProfile,
} from '../lib/interview';
import { requireUser } from '../lib/auth';
import { checkQuota } from '../lib/rate-limit';

export async function getBiodata() {
    const auth = await requireUser();
    if (!auth.ok) return { success: false as const, error: auth.error, data: null };

    const { data } = await supabase.from('profiles_biodata').select('*').eq('user_id', auth.user.id).single();
    return { success: true as const, data: data || null };
}

/** Perfil psicometrico calculado por el cuestionario del alumno. */
export type PsychProfile = {
    sincerity: number;
    stability: number;
    normativity: number;
    leadership: number;
};

/** Biodata tal y como la escribe `saveBiodata`. Todo opcional: se rellena a trozos. */
export type BiodataInput = {
    family_background?: string;
    studies_motivation?: string;
    work_history?: string;
    leisure_activities?: string;
    police_motivation?: string;
    fears_concerns?: string;
    strengths_weaknesses?: string;
    legal_issues?: string;
    psych_answers?: Record<string, number>;
    psych_profile?: PsychProfile;
};

/** Campos que el cliente puede escribir en `profiles_biodata`. */
const BIODATA_FIELDS = [
    'family_background', 'studies_motivation', 'work_history', 'leisure_activities',
    'police_motivation', 'fears_concerns', 'strengths_weaknesses', 'legal_issues',
    'psych_answers', 'psych_profile',
] as const;

export async function saveBiodata(formData: BiodataInput) {
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

/** Instrucciones de presion para el inspector, a partir del perfil del aspirante. */
async function generateInspectorReport(promptProfile: InterviewProfile, psych: PsychProfile) {
    if (!hasProfileContent(promptProfile)) return "EL CANDIDATO NO TIENE DATOS. ACÚSALE DE FALTA DE INTERÉS.";

    const prompt = `
        ACTÚA COMO: Psicólogo Forense del Tribunal.
        DATOS: ${JSON.stringify(promptProfile)}
        PSICOTÉCNICO: Sinceridad ${psych.sincerity}, Estabilidad ${psych.stability}.
        
        GENERA INSTRUCCIONES DE PRESIÓN:
        1. Cruza datos.
        2. Si Sinceridad < 4: Asume que miente.
        3. Dame 3 preguntas trampa.
    `;
    const result = await smartModel.generateContent(prompt);
    return result.response.text();
}

export async function processInterviewTurn(history: InterviewTurn[], userAudioText: string) {
    const auth = await requireUser();
    if (!auth.ok) return { success: false as const, error: auth.error };

    // La entrevista es por voz: un turno por respuesta, y el primero gasta dos
    // llamadas (informe del inspector + respuesta).
    const quota = await checkQuota(auth.user.id, 'interview');
    if (!quota.ok) return { success: false as const, error: quota.error };

    try {
        const { data: biodata } = await supabase.from('profiles_biodata').select('*').eq('user_id', auth.user.id).single();

        // El nombre lo dice a proposito: `biodata` es la fila y NO sale de aqui;
        // `promptProfile` es lo unico que viaja al modelo. Ver
        // `buildInterviewProfile`: los antecedentes van resumidos, nunca en texto.
        const promptProfile = buildInterviewProfile(biodata);
        const psych: PsychProfile = biodata?.psych_profile ?? { sincerity: 5, stability: 5, normativity: 5, leadership: 5 };

        let inspectorStrategy = "Mantén la presión.";
        if (history.length < 2 && hasProfileContent(promptProfile)) {
             inspectorStrategy = await generateInspectorReport(promptProfile, psych);
        }

        const profileContext = hasProfileContent(promptProfile) ? JSON.stringify(promptProfile) : "SIN DATOS.";
        const contexto = formatTranscript(trimContext(history));

        const systemPrompt = `
            ACTÚA COMO: Inspector Jefe del Tribunal (CNP).
            SITUACIÓN: Entrevista Oficial.
            BIODATA CANDIDATO: ${profileContext}
            ESTRATEGIA PSICOLÓGICA: ${inspectorStrategy}

            OBJETIVO: Presionar, buscar contradicciones.
            REGLAS: Respuestas CORTAS y HABLADAS.

            TRANSCRIPCIÓN HASTA AHORA:
            ${contexto || '(la entrevista acaba de empezar)'}

            CANDIDATO DICE: "${userAudioText}"
        `;
        const result = await chatModel.generateContent(systemPrompt);
        return { success: true as const, response: result.response.text() };
    } catch (e) {
        return { success: false as const, error: e instanceof Error ? e.message : 'Error desconocido' };
    }
}

/**
 * Informe final de la entrevista.
 *
 * Es lo que le faltaba al modulo: se presionaba al aspirante durante toda la
 * sesion y al terminar no quedaba nada. Aqui se le devuelve una lectura de su
 * propio desempenio.
 */
export async function evaluateInterview(history: InterviewTurn[]) {
    const auth = await requireUser();
    if (!auth.ok) return { success: false as const, error: auth.error };

    // La cuota se comprueba DESPUES de `canEvaluate`: una entrevista demasiado
    // corta se rechaza sin llamar al modelo, asi que no debe gastar cuota.
    if (!canEvaluate(history)) {
        return {
            success: false as const,
            error: `Hacen falta al menos ${MIN_TURNS_FOR_REPORT} respuestas para que el informe diga algo.`,
        };
    }

    const quota = await checkQuota(auth.user.id, 'report');
    if (!quota.ok) return { success: false as const, error: quota.error };

    try {
        const transcripcion = formatTranscript(history);

        const prompt = `
            ACTÚA COMO: Psicólogo del Tribunal Calificador del CNP.
            TAREA: Evaluar el desempeño del aspirante en esta entrevista personal.

            TRANSCRIPCIÓN:
            """
            ${transcripcion}
            """

            CRITERIOS:
            - Coherencia del discurso y contradicciones entre respuestas.
            - Motivación: ¿es concreta y creíble, o son frases hechas?
            - Autoconocimiento y reconocimiento de límites.
            - Manejo de la presión: evasivas, respuestas vacías, nerviosismo.

            NORMAS:
            - Evalúa SOLO lo que aparece en la transcripción. Nada de suponer.
            - 'score' de 0 a 100.
            - Sé concreto: cita lo que dijo el aspirante en vez de generalizar.
            - Si no detectas contradicciones, devuelve una lista vacía. No las inventes.
            - Las recomendaciones son accionables: qué preparar antes de la entrevista real.
        `;

        const result = await reportModel.generateContent(prompt);
        const report = normalizeReport(parseAIJson(result.response.text()));
        if (!report) return { success: false as const, error: 'El informe no se pudo generar. Inténtalo otra vez.' };

        return { success: true as const, report, transcript: transcripcion };
    } catch (e) {
        console.error('evaluateInterview:', e);
        return { success: false as const, error: 'Fallo al generar el informe.' };
    }
}

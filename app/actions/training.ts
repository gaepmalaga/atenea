'use server'
import { planModel } from './core';
import { parseAIJson } from '../lib/ai-output';
import { requireUser } from '../lib/auth';
import { requireModule } from '../lib/module-guard';
import { requireTrainingSwitch, leeTrainingSwitches } from '../lib/training-switch-guard';
import { checkQuota } from '../lib/rate-limit';
import { createSupabaseServerClient } from '../lib/supabase/server';
import {
    normalizeProfileInput,
    normalizeMetrics,
    readMaxPullups,
    buildCoachProfile,
    type PhysicalProfile,
} from '../lib/physical';
import {
    normalizePlan,
    summarizeWeek,
    progressionBrief,
    buildManualPlan,
    lunesDeSemana,
    PLAN_SHAPE,
    type WeeklyPlan,
    type TrainingDayLog,
    type Exercise,
} from '../lib/training-plan';
import { requireAdmin } from '../lib/auth';
import { supabaseAdmin } from './core';
import { registraAccion } from '../lib/admin-audit';

// `TrainingDayLog` NO se reexporta desde aqui. Este modulo es 'use server' y
// Next exige que solo exporte funciones async: el bundler convertia el
// `export type { TrainingDayLog }` en una referencia de verdad y el servidor
// reventaba al evaluar el modulo con
//   ReferenceError: TrainingDayLog is not defined
// Quien necesite el tipo lo importa de '@/app/lib/training-plan'.

function errorMessage(e: unknown, fallback = 'Error desconocido'): string {
    return e instanceof Error ? e.message : fallback;
}

/**
 * Parte del prompt que describe al alumno. La comparten la semana 1 y las
 * siguientes: tenerla en dos sitios es como el plan acabo pidiendo unos campos
 * y la UI leyendo otros.
 */
function athleteBrief(profile: PhysicalProfile): string {
    const pullupScore = readMaxPullups(profile) ?? 0;
    let pullupStrategy = "";
    if (pullupScore < 1) pullupStrategy = "Fase 0: Excéntricas y Gomas.";
    else if (pullupScore < 10) pullupStrategy = "Fase 1: Volumen y series largas.";
    else pullupStrategy = "Fase 2: Lastre y Fuerza Máxima.";

    const daysAvailable = profile.availability || 5;
    const equipmentText = profile.equipment === 'gym' ? "Gimnasio Comercial" : "Parque/Calistenia";

    // Lista blanca, no la fila entera: la fila trae `user_id` y las columnas
    // internas, y `injuries` es informacion de salud. El plan necesita las
    // medidas y las marcas, no de quien son.
    return `PERFIL: ${JSON.stringify(buildCoachProfile(profile))}
            LOGÍSTICA: ${daysAvailable} días/sem. Equipo: ${equipmentText}.
            NIVEL FUERZA: ${pullupStrategy}.`;
}

export async function generateWeeklyPlan(profile: PhysicalProfile) {
    const auth = await requireUser();
    if (!auth.ok) return { success: false, error: auth.error };
    const db = await createSupabaseServerClient();
    const userId = auth.user.id;

    const modulo = await requireModule('training');
    if (!modulo.ok) return { success: false, error: modulo.error };

    // El interruptor de «plan con IA», aparte del módulo. Va ANTES de la cuota y
    // de Gemini, igual que `requireModule`: apagarlo tiene que evitar la llamada
    // de pago, no solo esconder el botón.
    const permiteIA = await requireTrainingSwitch('ai');
    if (!permiteIA.ok) return { success: false, error: permiteIA.error };

    const quota = await checkQuota(userId, 'plan');
    if (!quota.ok) return { success: false, error: quota.error };

    try {
        if (!profile || !profile.baseline_metrics) throw new Error("Faltan datos físicos.");

        const prompt = `
            ACTÚA COMO: Preparador Físico CNP.
            ${athleteBrief(profile)}

            OBJETIVO: Plan semanal (Semana 1) JSON PURO.
            ESTRUCTURA: ${PLAN_SHAPE}
        `;
        const result = await planModel.generateContent(prompt);
        // Se valida ANTES de guardar (regla 10): un dia sin ejercicios o sin
        // titulo tumbaba el panel, y ya estaba escrito en la BD.
        const plan = normalizePlan(parseAIJson(result.response.text()));
        if (!plan) throw new Error('La IA no devolvió un plan utilizable.');

        const { data: inserted, error } = await db.from('training_plans').insert({
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

export type StoredPlan = {
    id: string;
    plan_data: WeeklyPlan | null;
    /** De dónde sale (P7): el plan propio del alumno, o el de su grupo de físicas. */
    origen: 'individual' | 'grupo';
};

export async function getActiveTrainingPlan(): Promise<
    { success: false; error: string; plan: null } | { success: true; plan: StoredPlan | null }
> {
    const auth = await requireUser();
    if (!auth.ok) return { success: false, error: auth.error, plan: null };
    const db = await createSupabaseServerClient();
    const userId = auth.user.id;

    const { data } = await db.from('training_plans').select('*').eq('user_id', userId).eq('status', 'active').order('created_at', {ascending:false}).limit(1).single();

    // EL PLAN INDIVIDUAL MANDA SOBRE EL DE GRUPO (P7). Si el alumno tiene uno
    // propio activo, es el que ve. Si no, se busca el de su grupo de físicas.
    // El plan guardado se normaliza al leerlo, no solo al escribirlo: hay filas
    // anteriores a esta fase, sin `title` ni garantia de que `exercises` sea un
    // array.
    if (data) {
        return { success: true, plan: { id: data.id, plan_data: normalizePlan(data.plan_data), origen: 'individual' } };
    }

    // Si la academia ha apagado el plan de grupo, el alumno no lo hereda.
    const switches = await leeTrainingSwitches();
    if (!switches.group) return { success: true, plan: null };

    // El grupo y su membresía son de administración (RLS sin políticas de
    // miembro), así que se leen con la clave de servicio filtrando por el
    // propio usuario — igual que `auth.ts` con `memberships` (regla 34).
    //
    // «Grupo que lleva plan» ya no es `kind === 'fisicas'` a pelo (P8): sale de
    // `group_kinds.lleva_plan`, que el admin edita.
    const { data: kindsConPlan } = await supabaseAdmin
        .from('group_kinds')
        .select('id')
        .eq('lleva_plan', true);
    const idsKind = (kindsConPlan ?? []).map((k) => k.id as string);
    if (!idsKind.length) return { success: true, plan: null };

    const { data: susGrupos } = await supabaseAdmin
        .from('class_members')
        .select('class_id, class_groups!inner(kind)')
        .eq('user_id', userId)
        .in('class_groups.kind', idsKind);

    const idsFisicas = (susGrupos ?? []).map((m) => m.class_id as string);
    if (idsFisicas.length) {
        // P9: varias semanas por grupo. El alumno ve la de esta semana — el
        // `week_start` más reciente que no pase del lunes de hoy. Una semana
        // futura preparada por adelantado no se le enseña todavía.
        const lunesHoy = lunesDeSemana();
        const { data: gtp } = await supabaseAdmin
            .from('group_training_plans')
            .select('class_id, plan_data, week_start')
            .in('class_id', idsFisicas)
            .lte('week_start', lunesHoy)
            .order('week_start', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (gtp?.plan_data) {
            return {
                success: true,
                plan: { id: `grupo:${gtp.class_id}`, plan_data: normalizePlan(gtp.plan_data), origen: 'grupo' },
            };
        }
    }

    return { success: true, plan: null };
}

export async function completeTrainingDay(
    planId: string, dayIndex: number, logData: TrainingDayLog
): Promise<{ success: boolean; error?: string }> {
    const auth = await requireUser();
    if (!auth.ok) return { success: false, error: auth.error };
    const db = await createSupabaseServerClient();
    const userId = auth.user.id;

    // Un plan de grupo (P7) es COMPARTIDO: no se pueden marcar días encima —
    // eso reescribiría el plan de todos los del grupo. Para llevar el registro,
    // la academia le pone al alumno un plan individual (que manda sobre el de
    // grupo). El id `grupo:` es la señal.
    if (planId.startsWith('grupo:')) {
        return { success: false, error: 'Este es el plan de tu grupo. Pídele a la academia un plan individual para ir marcando los días.' };
    }

    // Nota: el filtro por user_id evita que un usuario marque como completado
    // el plan de otro (antes `userId` se recibía y se ignoraba).
    const { data: plan, error: readError } = await db
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

    const { error } = await db.from('training_plans').update({ plan_data: updated }).eq('id', planId);
    return { success: !error, error: error?.message };
}

/**
 * Genera la semana siguiente a partir de lo que el alumno registro en la actual.
 *
 * Era un `alert("Procesando tus metricas...")` que no hacia nada. No hace falta
 * tabla nueva: el registro de cada dia vive dentro del JSON del plan, que es
 * donde lo deja `completeTrainingDay`.
 */
export async function generateNextWeek() {
    const auth = await requireUser();
    if (!auth.ok) return { success: false as const, error: auth.error, plan: null };
    const db = await createSupabaseServerClient();
    const userId = auth.user.id;

    const modulo = await requireModule('training');
    if (!modulo.ok) return { success: false as const, error: modulo.error, plan: null };

    const permiteIA = await requireTrainingSwitch('ai');
    if (!permiteIA.ok) return { success: false as const, error: permiteIA.error, plan: null };

    const quota = await checkQuota(userId, 'plan');
    if (!quota.ok) return { success: false as const, error: quota.error, plan: null };

    try {
        const { data: current, error: readError } = await db
            .from('training_plans')
            .select('id, plan_data')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (readError) throw new Error(readError.message);
        if (!current) throw new Error('No hay ningún plan activo del que partir.');

        const { data: profile } = await db
            .from('profiles_physical').select('*').eq('user_id', userId).single();
        if (!profile) throw new Error('Faltan los datos físicos.');

        // Se normaliza al leer: la semana que se resume puede ser anterior a la
        // fase 2.7 y no traer las garantias de forma.
        const previous = normalizePlan(current.plan_data);
        const summary = summarizeWeek(previous);

        // Cuantas semanas lleva ya, para numerar la nueva.
        const { count } = await db
            .from('training_plans')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId);
        const weekNumber = (count ?? 1) + 1;

        const prompt = `
            ACTÚA COMO: Preparador Físico CNP.
            ${athleteBrief(profile as PhysicalProfile)}

            ${progressionBrief(summary)}

            OBJETIVO: Plan semanal (Semana ${weekNumber}) JSON PURO, continuando el anterior.
            ESTRUCTURA: ${PLAN_SHAPE}
        `;
        const result = await planModel.generateContent(prompt);
        const plan = normalizePlan(parseAIJson(result.response.text()));
        if (!plan) throw new Error('La IA no devolvió un plan utilizable.');

        // Primero se cierra la semana anterior: si el insert fallara despues,
        // el alumno se queda sin plan activo, que se ve. Al reves quedarian dos
        // activos y `getActiveTrainingPlan` elegiria uno en silencio.
        const { error: closeError } = await db
            .from('training_plans')
            .update({ status: 'completed' })
            .eq('id', current.id)
            .eq('user_id', userId);
        if (closeError) throw new Error(closeError.message);

        const { data: inserted, error } = await db.from('training_plans').insert({
            user_id: userId,
            week_start: new Date().toISOString(),
            plan_data: plan,
            status: 'active',
        }).select().single();
        if (error || !inserted) throw new Error(error?.message || 'No se pudo guardar el plan.');

        return { success: true as const, plan: { id: inserted.id as string, plan_data: plan } };
    } catch (e) {
        return { success: false as const, error: errorMessage(e), plan: null };
    }
}

export async function getPhysicalProfile() {
    const auth = await requireUser();
    if (!auth.ok) return { success: false as const, error: auth.error, data: null };
    const db = await createSupabaseServerClient();

    const { data } = await db.from('profiles_physical').select('*').eq('user_id', auth.user.id).single();
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
    const db = await createSupabaseServerClient();

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

    const { error } = await db.from('profiles_physical').upsert(payload);
    return { success: !error, error: error?.message };
}
// ============================================================
// EL ENTRENADOR REAL (SOLO ADMIN)
// ============================================================
//
// Una academia puede tener preparador físico de verdad en vez de un plan
// generado por IA. El entrenador es OTRO PRODUCTOR del mismo `WeeklyPlan`: la
// pantalla del alumno (`TrainingDashboard`, `ActiveSession`) no cambia una
// línea, porque lo que lee es la misma forma, venga de donde venga.
//
// Va con `requireAdmin` y no con un rol "entrenador" propio: con una sola
// academia el admin es quien la dirige, y un rol que no separa a nadie es
// ceremonia (regla 31, la misma decisión que ya se tomó con "superadmin").
// Si algún día hay varias personas dando planes, se resuelve dando de alta
// más admins — no hace falta un rol nuevo para eso.

/** El plan activo de UN alumno, para no escribir a ciegas encima de otro. */
export async function getStudentActivePlan(studentId: string) {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false as const, error: auth.error };
    if (!studentId) return { success: false as const, error: 'Falta el alumno.' };

    const { data } = await supabaseAdmin
        .from('training_plans')
        .select('id, week_start, plan_data')
        .eq('user_id', studentId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!data) return { success: true as const, plan: null };
    return {
        success: true as const,
        plan: { id: data.id as string, weekStart: data.week_start as string | null, plan: normalizePlan(data.plan_data) },
    };
}

/**
 * Guarda el plan que ha escrito el entrenador para un alumno.
 *
 * Se valida con `normalizePlan`, LA MISMA función que valida lo que escribe
 * la IA (regla 27): un preparador se equivoca con un campo vacío igual que
 * Gemini, y el alumno se lleva el mismo problema si nadie lo comprueba.
 */
export async function saveManualTrainingPlan(params: {
    studentId: string;
    weekFocus: string;
    days: Array<{ day: string; type: string; title: string; exercises: Exercise[] }>;
}) {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false as const, error: auth.error };
    if (!params.studentId) return { success: false as const, error: 'Falta el alumno.' };

    const plan = normalizePlan(buildManualPlan({ weekFocus: params.weekFocus, days: params.days }));
    if (!plan) return { success: false as const, error: 'El plan no tiene ningún día con ejercicios.' };

    // Se cierra el plan anterior ANTES de insertar el nuevo: si el insert
    // fallara después, el alumno se queda sin plan activo, que se ve. Al
    // revés quedarían dos activos y `getActiveTrainingPlan` elegiría uno en
    // silencio (mismo orden que ya usa `generateNextWeek`).
    await supabaseAdmin
        .from('training_plans')
        .update({ status: 'completed' })
        .eq('user_id', params.studentId)
        .eq('status', 'active');

    const { error } = await supabaseAdmin.from('training_plans').insert({
        user_id: params.studentId,
        week_start: new Date().toISOString(),
        plan_data: plan,
        status: 'active',
    });

    if (!error) {
        registraAccion({ actorId: auth.user.id, action: 'save_manual_training_plan', target: params.studentId });
    }

    return { success: !error, error: error?.message };
}

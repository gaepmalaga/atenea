'use server'

import { supabaseAdmin } from './core';
import { requireAdmin, requireUser } from '../lib/auth';
import {
  QUESTION_STATUS,
  QUESTION_ORIGIN,
  toDifficultyLevel,
  DIFFICULTY_SOURCE,
  type ModerationCandidate,
  type ModerationQueue,
  type ModerationReport,
} from '../lib/questions';
import { validateGeneratedQuestion, MIN_EXPLANATION_CHARS } from '../lib/ai-output';
import { etiquetasQueFaltan, estaCompleta, instantanea, camposCambiados, hayCambios, leeInstantanea, textoFaltan, type CamposEditables } from '../lib/preguntas-edicion';
import { questionHash } from '../lib/question-hash';
import { MAX_IMPORT, MAX_REFERENCIA, limpiaReferencia } from '../lib/question-import';
import { registraAccion } from '../lib/admin-audit';
import { createSupabaseServerClient } from '../lib/supabase/server';
import { fallo } from '../lib/fallos';
import { filtroEscrituraBanco, puedeEditarBanco, UNA_SOLA_ACADEMIA } from '../lib/permisos-banco';
import { TIPO_REPORTE_VIGENCIA } from '../lib/normativa';
import { esAvisoOtroTema } from '../lib/ambito-tema';
import { TIPO_REPORTE_REVISION_IA } from '../lib/verificacion';
import { FUENTE_PREGUNTA, leeValores, propuestaVigente, cambiaAlgo, cambiosLegibles, type ValoresPregunta, type CambioLegible } from '../lib/revision';

/**
 * La marca de «revisada por un tutor» (regla 138): quién y cuándo. Se pone al
 * publicar, al editar, al aprobar un cambio propuesto y al dar una por buena
 * desde el revisor: todas son decisiones de una persona que ha leído la
 * pregunta.
 */
const revisadaPor = (user: { id: string; email: string }) => ({
    reviewed_at: new Date().toISOString(),
    reviewed_by: user.id,
    reviewed_by_email: user.email,
});

/**
 * Resultado uniforme de las acciones de moderación.
 * Antes cada acción devolvía `{ success: true }` a ciegas: los errores de la
 * base de datos se descartaban y la UI daba por buena una escritura fallida.
 */
type ModerationResult = { success: boolean; error?: string };

export async function voteQuestion(params: { questionId: string; vote: 1 | -1 }): Promise<ModerationResult> {
    const auth = await requireUser();
    if (!auth.ok) return { success: false, error: auth.error };
    const db = await createSupabaseServerClient();

    const { error } = await db.from('question_votes').upsert(
        { question_id: params.questionId, user_id: auth.user.id, vote: params.vote },
        { onConflict: 'question_id,user_id' }
    );
    return { success: !error, error: fallo('voteQuestion', error) };
}

export async function reportQuestion(params: { questionId: string; reportType: string; message: string }): Promise<ModerationResult> {
    const auth = await requireUser();
    if (!auth.ok) return { success: false, error: auth.error };
    const db = await createSupabaseServerClient();

    const { error } = await db.from('question_reports').insert({
        question_id: params.questionId,
        user_id: auth.user.id,
        report_type: params.reportType,
        message: params.message
    });
    return { success: !error, error: fallo('reportQuestion', error) };
}

export async function getModerationQueue() {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false as const, error: auth.error };

    // Las CANDIDATAS solo las produce el superadmin: generar en vivo
    // (`generateAndSaveCandidate`) y sembrar sin auto-aprobar (`seedQuestionBank`)
    // exigen `requireSuperadmin()` desde la regla 75, y las dos escriben
    // siempre en el banco GLOBAL. Un admin normal no tiene nada que moderar
    // aquí — lo suyo son los REPORTES de su propia academia, más abajo.
    //
    // El titulo del tema se trae por join: `question_bank` guarda `subject_id`.
    // Sin esto el panel pintaba `q.topic` y siempre salia vacio.
    const { data: cand } = auth.user.role === 'superadmin'
      ? await supabaseAdmin
          .from('question_bank')
          .select('*, subject:subjects(title)')
          .eq('status', QUESTION_STATUS.CANDIDATE)
          .limit(50)
      : { data: [] as unknown[] };

    // El join resuelve porque la FK question_reports.question_id -> question_bank
    // esta declarada. Si no lo estuviera, PostgREST devolveria error y la cola
    // saldria vacia.
    //
    // P11e: «los reportes del banco global te llegan a ti, siempre». Se
    // enruta por la academia de la PREGUNTA reportada, no por quién la
    // reportó: un `superadmin` ve los reportes de preguntas GLOBALES
    // (`organization_id IS NULL`) — arreglarlas beneficia a todas—; un
    // `admin` normal ve solo los de SU academia. `!inner` convierte el embed
    // en INNER JOIN, que es lo que deja filtrar por una columna de la tabla
    // embebida (`question.organization_id`).
    const baseReportes = () => supabaseAdmin
      .from('question_reports')
      .select('*, question:question_bank!inner(*)')
      .eq('status', 'open');
    const reportesDonde = (donde: (q: ReturnType<typeof baseReportes>) => ReturnType<typeof baseReportes>) => donde(baseReportes());
    // Regla 123: con UNA_SOLA_ACADEMIA, al admin de la academia le llegan
    // también los reportes de las preguntas GLOBALES —que son las 4.617—, porque
    // es quien puede arreglarlas. Dos consultas y no un `.or` sobre la tabla
    // embebida: esta forma es la que ya se sabe que funciona.
    const globales = auth.user.role === 'superadmin' || UNA_SOLA_ACADEMIA
      ? ((await reportesDonde((q) => q.is('question.organization_id', null))).data ?? [])
      : [];
    const propios = auth.user.role === 'superadmin'
      ? []
      : ((await reportesDonde((q) => q.eq('question.organization_id', auth.user.organizationId))).data ?? []);
    const rep = [...globales, ...propios];

    /** Aplana `subject.title` a `topic`, que es lo que pinta la interfaz. */
    const conTema = (fila: unknown): ModerationCandidate => {
      const { subject, ...resto } = (fila ?? {}) as Record<string, unknown> & {
        subject?: { title?: string | null } | null;
      };
      return { ...resto, topic: subject?.title ?? null } as ModerationCandidate;
    };

    const data: ModerationQueue = {
      candidates: (cand ?? []).map(conTema),
      reports: ((rep ?? []) as unknown as ModerationReport[]).map((r) => ({
        ...r,
        question: r.question ? conTema(r.question) : null,
      })),
    };
    return { success: true as const, data };
}

// Aprobar SOLO tiene sentido sobre una candidata, y solo si está completa
// (regla 135): una pregunta sin explicación o sin dificultad no se sirve a un
// alumno. Lo hace el admin sobre lo que puede tocar (`filtroEscrituraBanco`,
// regla 123, dentro de la consulta): su banco privado y, con una sola academia,
// el global. Antes era solo del superadmin porque las candidatas eran siempre
// globales; ahora también las hay en el banco privado (preguntas del examen en
// papel, y las que se redacten desde el temario de la academia).
export async function approveQuestion(questionId: string): Promise<ModerationResult> {
    if (typeof questionId !== 'string' || !questionId) return { success: false, error: 'Falta el id de la pregunta.' };
    const res = await approveQuestions([questionId]);
    if (!res.success) return { success: false, error: res.error };
    if (res.sinEtiquetas) return { success: false, error: res.motivoSinEtiquetas };
    if (res.conAvisoLey) return { success: false, error: 'Tiene un aviso de cambio en la ley sin resolver: corrígela o marca «Sigue vigente» antes de publicarla.' };
    return { success: true };
}

/**
 * Aprueba varias preguntas de una vez. Las que no están completas se dejan
 * pendientes y se cuentan aparte (`sinEtiquetas`): aprobar «todas las de la
 * página» no puede colar una sin explicación. Tampoco una con un aviso de
 * cambio en la ley abierto (`conAvisoLey`, regla 137): la ley que cita ha
 * cambiado después de escribirla y nadie ha mirado si sigue valiendo.
 */
export async function approveQuestions(questionIds: string[]): Promise<ModerationResult & { approved?: number; sinEtiquetas?: number; motivoSinEtiquetas?: string; conAvisoLey?: number }> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };
    const ids = Array.isArray(questionIds) ? [...new Set(questionIds.filter((x): x is string => typeof x === 'string' && x.length > 0))].slice(0, 500) : [];
    if (!ids.length) return { success: true, approved: 0, sinEtiquetas: 0 };

    const alcance = filtroEscrituraBanco(auth.user);
    // De 100 en 100: un `.in()` con cientos de uuid alarga la URL de más.
    const filas: { id: string; explanation: string | null; difficulty_level: number | null }[] = [];
    for (let i = 0; i < ids.length; i += 100) {
        let lectura = supabaseAdmin
            .from('question_bank')
            .select('id, explanation, difficulty_level')
            .in('id', ids.slice(i, i + 100))
            .eq('status', QUESTION_STATUS.CANDIDATE);  // nunca resucita una descartada
        if (alcance) lectura = lectura.or(alcance);
        const { data: pendientes, error: errLec } = await lectura;
        if (errLec) return { success: false, error: fallo('approveQuestions', errLec) };
        filas.push(...((pendientes ?? []) as typeof filas));
    }

    // Las que tienen un aviso de la ley abierto se quedan pendientes.
    const conAviso = new Set<string>();
    const idsLeidos = filas.map((f) => f.id);
    for (let i = 0; i < idsLeidos.length; i += 100) {
        const { data: avisos, error: errAv } = await supabaseAdmin
            .from('question_reports')
            .select('question_id')
            .in('question_id', idsLeidos.slice(i, i + 100))
            .eq('report_type', TIPO_REPORTE_VIGENCIA)
            .eq('status', 'open');
        if (errAv) return { success: false, error: fallo('approveQuestions', errAv) };
        for (const a of avisos ?? []) conAviso.add(a.question_id as string);
    }
    const conAvisoLey = filas.filter((f) => conAviso.has(f.id)).length;

    const listas = filas.filter((f) => estaCompleta(f) && !conAviso.has(f.id)).map((f) => f.id as string);
    const incompletas = filas.filter((f) => !estaCompleta(f));
    const sinEtiquetas = incompletas.length;
    // Lo que falta, dicho una vez (la primera): «Falta la explicación».
    const motivoSinEtiquetas = sinEtiquetas
        ? `${textoFaltan(etiquetasQueFaltan(incompletas[0]))}${sinEtiquetas > 1 ? ` (y otras ${sinEtiquetas - 1} igual de incompletas)` : ''}: complétala antes de publicarla.`
        : undefined;
    if (!listas.length) return { success: true, approved: 0, sinEtiquetas, motivoSinEtiquetas, conAvisoLey };

    let aprobadas = 0;
    for (let i = 0; i < listas.length; i += 100) {
        let query = supabaseAdmin
            .from('question_bank')
            .update({ status: QUESTION_STATUS.ACTIVE, ...revisadaPor(auth.user) })
            .in('id', listas.slice(i, i + 100))
            .eq('status', QUESTION_STATUS.CANDIDATE);
        if (alcance) query = query.or(alcance);
        const { data, error } = await query.select('id');
        if (error) return { success: false, error: fallo('approveQuestions', error), approved: aprobadas, sinEtiquetas, motivoSinEtiquetas, conAvisoLey };
        aprobadas += data?.length ?? 0;
    }

    if (aprobadas) {
        registraAccion({ actorId: auth.user.id, action: 'approve_questions', detail: { cantidad: aprobadas } });
    }
    return { success: true, approved: aprobadas, sinEtiquetas, motivoSinEtiquetas, conAvisoLey };
}

/**
 * «Sigue vigente» (regla 137): archiva los avisos de cambio en la ley abiertos
 * de una pregunta. También se llama al guardar una corrección hecha desde el
 * aviso: corregirla es la respuesta. Solo sobre preguntas que esta persona
 * puede editar (regla 123), comprobado aquí y no en el navegador.
 */
export async function resolverAvisosLey(questionId: string): Promise<ModerationResult & { resueltos?: number }> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };
    if (typeof questionId !== 'string' || !questionId) return { success: false, error: 'Falta el id de la pregunta.' };

    const { data: pregunta, error: errLec } = await supabaseAdmin
        .from('question_bank')
        .select('id, organization_id')
        .eq('id', questionId)
        .maybeSingle();
    if (errLec) return { success: false, error: fallo('resolverAvisosLey', errLec) };
    if (!pregunta) return { success: false, error: 'Esa pregunta no existe.' };
    if (!puedeEditarBanco(auth.user, { organization_id: (pregunta.organization_id as string | null) ?? null })) {
        return { success: false, error: 'Esa pregunta no es de tu academia.' };
    }

    const { data, error } = await supabaseAdmin
        .from('question_reports')
        .update({ status: 'dismissed' })
        .eq('question_id', questionId)
        .eq('report_type', TIPO_REPORTE_VIGENCIA)
        .eq('status', 'open')
        .select('id');
    if (error) return { success: false, error: fallo('resolverAvisosLey', error) };
    const resueltos = data?.length ?? 0;
    if (resueltos) registraAccion({ actorId: auth.user.id, action: 'resolve_vigencia', target: questionId, detail: { avisos: resueltos } });
    return { success: true, resueltos };
}

export async function disableQuestion(questionId: string): Promise<ModerationResult> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };

    let query = supabaseAdmin.from('question_bank').update({ status: QUESTION_STATUS.DISABLED }).eq('id', questionId);
    // Un admin solo puede tocar lo que `filtroEscrituraBanco` le deja: su
    // banco privado y, con UNA_SOLA_ACADEMIA (regla 123), el global; nunca el
    // de otra academia. Filtrando en el propio UPDATE, una fila que no le
    // pertenece simplemente no cambia, en vez de depender de una lectura
    // previa que alguien podría olvidar (regla 65: un `superadmin` no se filtra).
    const alcance = filtroEscrituraBanco(auth.user);
    if (alcance) query = query.or(alcance);
    const { data, error } = await query.select('id');
    if (error) return { success: false, error: fallo('disableQuestion', error) };
    if (!data || data.length === 0) return { success: false, error: 'Esa pregunta no existe o no es de tu academia.' };
    registraAccion({ actorId: auth.user.id, action: 'disable_question', target: questionId });
    return { success: true };
}

/**
 * Devuelve al banco una pregunta descartada (regla 123). Antes solo se podía
 * descartar, y deshacerlo era cosa de la base de datos.
 *
 * Solo sobre una descartada (`.eq('status', disabled)`): no convierte en
 * activa una candidata sin revisar. Con el mismo alcance que descartar.
 */
export async function reactivateQuestion(questionId: string): Promise<ModerationResult> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };
    if (!questionId) return { success: false, error: 'Falta el id de la pregunta.' };

    let query = supabaseAdmin
        .from('question_bank')
        .update({ status: QUESTION_STATUS.ACTIVE })
        .eq('id', questionId)
        .eq('status', QUESTION_STATUS.DISABLED);
    const alcance = filtroEscrituraBanco(auth.user);
    if (alcance) query = query.or(alcance);
    const { data, error } = await query.select('id');
    if (error) return { success: false, error: fallo('reactivateQuestion', error) };
    if (!data || data.length === 0) return { success: false, error: 'Esa pregunta no existe, no está descartada o no es de tu academia.' };
    registraAccion({ actorId: auth.user.id, action: 'reactivate_question', target: questionId });
    return { success: true };
}

/**
 * Descarta TODAS las preguntas del banco de una vez.
 *
 * No es un DELETE: pasa cada fila a `disabled`, igual que `disableQuestion`
 * (regla 3). `question_attempts`, `question_notes`, `question_reports` y
 * `question_votes` referencian `question_bank.id`; borrar la fila de verdad
 * rompería el historial de examenes de todos los alumnos que hubieran
 * respondido esa pregunta. `disabled` no se sirve ni se resucita al resembrar,
 * asi que el efecto para el alumno es el mismo que un vaciado real.
 *
 * `neq` deja fuera lo que ya estaba `disabled`: no cuenta como afectada una
 * fila que ya lo estaba.
 */
export async function discardAllQuestions(): Promise<ModerationResult & { discarded?: number }> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };

    let query = supabaseAdmin
        .from('question_bank')
        .update({ status: QUESTION_STATUS.DISABLED })
        .neq('status', QUESTION_STATUS.DISABLED);
    // Nunca "todo, de todas las academias": un admin normal vacía SU banco
    // privado; el superadmin, el GLOBAL. Sin este filtro, «Descartar todo»
    // desde CUALQUIER academia borraba el banco entero de la plataforma.
    query = auth.user.role === 'superadmin'
      ? query.is('organization_id', null)
      : query.eq('organization_id', auth.user.organizationId);
    const { data, error } = await query.select('id');

    if (!error) {
        registraAccion({ actorId: auth.user.id, action: 'discard_all_candidates', detail: { cantidad: data?.length ?? 0 } });
    }
    return { success: !error, error: fallo('discardAllQuestions', error), discarded: data?.length ?? 0 };
}

export async function resolveReport(reportId: string): Promise<ModerationResult> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };

    // `question_reports` no lleva `organization_id` propio (P11e): la
    // propiedad se decide por la academia de la PREGUNTA reportada, mismo
    // criterio que `getModerationQueue`. Sin esto, un admin podía resolver —
    // y así ocultar de la cola— el reporte de una pregunta que no era suya.
    if (auth.user.role !== 'superadmin') {
      const { data: rep } = await supabaseAdmin
        .from('question_reports')
        .select('question:question_bank!inner(organization_id)')
        .eq('id', reportId)
        .maybeSingle();
      // Sin reporte no hay pregunta de la que fiarse: se rechaza, no se trata como «global».
      if (!rep) return { success: false, error: 'Ese reporte no existe.' };
      const orgDeLaPregunta = (rep as unknown as { question?: { organization_id: string | null } } | null)?.question?.organization_id ?? null;
      if (!puedeEditarBanco(auth.user, { organization_id: orgDeLaPregunta })) {
        return { success: false, error: 'Ese reporte no es de tu academia.' };
      }
    }

    const { error } = await supabaseAdmin.from('question_reports').update({ status: 'dismissed' }).eq('id', reportId);
    if (!error) registraAccion({ actorId: auth.user.id, action: 'resolve_report', target: reportId });
    return { success: !error, error: fallo('resolveReport', error) };
}

/**
 * Cambia una pregunta de tema (regla 144). Lo decide un tutor, normalmente a la
 * vista de lo que sugiere el repaso «¿es de su tema?» (el aviso «no es del tema X
 * sino del tema Y»), que solo AVISA.
 *
 * - NO da la pregunta por revisada: cambiarle la etiqueta no es leerla entera.
 * - El `question_hash` no se toca: así, volver a sembrar la misma pregunta en el
 *   tema de antes no la duplica.
 * - Cierra los avisos de «otro tema» de esa pregunta (ya están atendidos); no los
 *   de «fuera del temario», que mover no resuelve.
 * - Queda en «Logs» y en «Novedades» (quién, de qué tema a cuál).
 */
export async function cambiarTemaPregunta(questionId: string, subjectId: number): Promise<ModerationResult> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };
    if (typeof questionId !== 'string' || !questionId || !Number.isInteger(subjectId)) return { success: false, error: 'Datos no válidos.' };

    const alcance = filtroEscrituraBanco(auth.user);
    let lectura = supabaseAdmin.from('question_bank').select('id, subject_id').eq('id', questionId);
    if (alcance) lectura = lectura.or(alcance);
    const { data: q, error: errLec } = await lectura.maybeSingle();
    if (errLec) return { success: false, error: fallo('cambiarTemaPregunta', errLec) };
    if (!q) return { success: false, error: 'Esa pregunta no existe o no es de tu academia.' };
    if (q.subject_id === subjectId) return { success: true };

    const { data: tema, error: errTema } = await supabaseAdmin.from('subjects').select('id, topic_number').eq('id', subjectId).maybeSingle();
    if (errTema) return { success: false, error: fallo('cambiarTemaPregunta', errTema) };
    if (!tema) return { success: false, error: 'Ese tema no existe.' };

    let query = supabaseAdmin.from('question_bank').update({ subject_id: subjectId }).eq('id', questionId);
    if (alcance) query = query.or(alcance);
    const { data: escritas, error } = await query.select('id');
    if (error) return { success: false, error: fallo('cambiarTemaPregunta', error) };
    if (!escritas?.length) return { success: false, error: 'Esa pregunta no existe o no es de tu academia.' };

    // Los avisos de «otro tema» de esta pregunta quedan atendidos.
    const { data: avisos, error: errAv } = await supabaseAdmin.from('question_reports').select('id, message')
        .eq('question_id', questionId).eq('report_type', TIPO_REPORTE_REVISION_IA).eq('status', 'open');
    if (errAv) return { success: false, error: fallo('cambiarTemaPregunta.avisos', errAv) };
    const ids = (avisos ?? []).filter((a) => esAvisoOtroTema(a.message as string | null)).map((a) => a.id as string);
    if (ids.length) {
        const { error: errCierre } = await supabaseAdmin.from('question_reports').update({ status: 'dismissed' }).in('id', ids);
        if (errCierre) return { success: false, error: fallo('cambiarTemaPregunta.cierre', errCierre) };
    }

    registraAccion({
        actorId: auth.user.id, action: 'change_question_topic', target: questionId, organizationId: auth.user.organizationId,
        detail: { de: q.subject_id, a: subjectId, tema: tema.topic_number, avisosCerrados: ids.length },
    });
    return { success: true };
}

/** Con qué se rellena la explicación para pasar la validación cuando una pendiente aún no la tiene. Nunca se guarda. */
const RELLENO_EXPLICACION = 'x'.repeat(MIN_EXPLANATION_CHARS);

type OrigenEdicion = 'banco' | 'examen_papel' | 'restaurar';

/**
 * Edita una pregunta del banco desde el panel de administracion.
 *
 * El parametro era `any` y lo que llegaba se escribia tal cual. Una Server
 * Action es un endpoint publico, asi que se valida con la MISMA funcion que la
 * salida del modelo: una edicion a mano puede dejar un `correct_index` fuera de
 * rango igual de bien que la IA, y el efecto es identico — el alumno estudia un
 * dato falso sin que nada avise (regla 10). Tambien cubre opciones repetidas,
 * vacias, y enunciados en blanco.
 *
 * Cada cambio real deja una fila en `question_edit_history` (regla 135) ANTES
 * de escribirse: si no se puede anotar, no se edita. Editar desde «Exámenes en
 * papel» sobrescribe la del banco —la ven todos los alumnos— y por eso se puede
 * ver y deshacer. Una pregunta PENDIENTE puede no tener aún explicación: se
 * guarda sin ella y sigue sin servirse hasta que la tenga.
 */
export async function updateQuestion(questionId: string, data: unknown, origen?: unknown): Promise<ModerationResult> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };
    return editaPregunta(auth.user, questionId, data, origen === 'examen_papel' ? 'examen_papel' : 'banco');
}

async function editaPregunta(
    user: { id: string; email: string; role: string; organizationId: string | null },
    questionId: string,
    data: unknown,
    origen: OrigenEdicion,
): Promise<ModerationResult> {
    if (typeof questionId !== 'string' || !questionId) return { success: false, error: 'Falta el id de la pregunta.' };

    // Mismo alcance que `disableQuestion` (`filtroEscrituraBanco`, regla 123):
    // la fila se lee ya acotada, así que una que no es suya no existe para él.
    const alcance = filtroEscrituraBanco(user);
    let lectura = supabaseAdmin
        .from('question_bank')
        .select('id, organization_id, status, question_text, options, correct_index, explanation, difficulty_level')
        .eq('id', questionId);
    if (alcance) lectura = lectura.or(alcance);
    const { data: antes, error: errLec } = await lectura.maybeSingle();
    if (errLec) return { success: false, error: fallo('updateQuestion', errLec) };
    if (!antes) return { success: false, error: 'Esa pregunta no existe o no es de tu academia.' };

    // La explicación solo puede faltar en una pendiente.
    const crudoExp = (data as { explanation?: unknown } | null)?.explanation;
    const sinExplicacion = antes.status === QUESTION_STATUS.CANDIDATE && (typeof crudoExp !== 'string' || crudoExp.trim() === '');
    const entrada = sinExplicacion && data && typeof data === 'object' ? { ...(data as object), explanation: RELLENO_EXPLICACION } : data;
    const check = validateGeneratedQuestion(entrada);
    if (!check.ok) return { success: false, error: `Edición rechazada: ${check.reason}` };

    // La dificultad es opcional: solo viaja si el preparador la ha cambiado.
    // Si viaja y no es 1, 2 o 3, se rechaza la edición entera en vez de
    // guardar el resto y tragarse el nivel (regla 10).
    const crudo = (data as { difficulty_level?: unknown } | null)?.difficulty_level;
    const cambiaNivel = crudo !== undefined && crudo !== null;
    if (cambiaNivel && ![1, 2, 3].includes(Number(crudo))) {
        return { success: false, error: 'La dificultad tiene que ser 1, 2 o 3.' };
    }

    // Se escriben los valores YA normalizados, no los de entrada: es lo que
    // recorta espacios y deja el indice como numero.
    const antesFoto = instantanea(antes);
    const despuesFoto: CamposEditables = {
        question_text: check.value.question,
        options: check.value.options,
        correct_index: check.value.correctIndex,
        explanation: sinExplicacion ? null : check.value.explanation,
        difficulty_level: cambiaNivel ? Number(crudo) : antesFoto.difficulty_level,
    };
    // Sin cambios no se escribe nada ni se ensucia el historial.
    if (!hayCambios(antesFoto, despuesFoto)) return { success: true };

    const { error: errHist } = await supabaseAdmin.from('question_edit_history').insert({
        question_id: questionId,
        organization_id: antes.organization_id ?? null,
        changed_by: user.id,
        changed_by_email: user.email,
        source: origen,
        before: antesFoto,
        after: despuesFoto,
    });
    if (errHist) return { success: false, error: fallo('updateQuestion.historial', errHist) };

    let query = supabaseAdmin.from('question_bank').update({
        question_text: despuesFoto.question_text,
        options: despuesFoto.options,
        correct_index: despuesFoto.correct_index,
        explanation: despuesFoto.explanation,
        // Quien la corrige la ha leído: queda revisada por esa persona (regla 138).
        ...revisadaPor(user),
        // Lo que pone una persona manda sobre la estimación (regla 121): por
        // eso se anota de quién es, y una reclasificación no lo pisa.
        ...(cambiaNivel ? { difficulty_level: Number(crudo), difficulty_source: DIFFICULTY_SOURCE.preparador } : {}),
    }).eq('id', questionId);
    if (alcance) query = query.or(alcance);
    const { data: filas, error } = await query.select('id');
    if (error) return { success: false, error: fallo('updateQuestion', error) };
    if (!filas || filas.length === 0) return { success: false, error: 'Esa pregunta no existe o no es de tu academia.' };
    registraAccion({
        actorId: user.id, action: 'edit_question', target: questionId,
        detail: { origen, cambios: camposCambiados(antesFoto, despuesFoto) },
    });
    return { success: true };
}

export type CambioDePregunta = {
    id: string;
    fecha: string;
    quien: string | null;
    origen: OrigenEdicion;
    cambios: string[];
    antes: CamposEditables;
};

/** Las últimas ediciones de una pregunta, de la más reciente a la más antigua. */
export async function getHistorialPregunta(questionId: string): Promise<
    { success: true; cambios: CambioDePregunta[] } | { success: false; error: string }
> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false as const, error: auth.error };
    if (typeof questionId !== 'string' || !questionId) return { success: false as const, error: 'Falta el id de la pregunta.' };

    const alcance = filtroEscrituraBanco(auth.user);
    let lectura = supabaseAdmin.from('question_bank').select('id').eq('id', questionId);
    if (alcance) lectura = lectura.or(alcance);
    const { data: suya } = await lectura.maybeSingle();
    if (!suya) return { success: false as const, error: 'Esa pregunta no existe o no es de tu academia.' };

    const { data, error } = await supabaseAdmin
        .from('question_edit_history')
        .select('id, changed_at, changed_by_email, source, before, after')
        .eq('question_id', questionId)
        .order('changed_at', { ascending: false })
        .limit(30);
    if (error) return { success: false as const, error: fallo('getHistorialPregunta', error) };

    const cambios: CambioDePregunta[] = [];
    for (const f of data ?? []) {
        const antes = leeInstantanea(f.before);
        const despues = leeInstantanea(f.after);
        if (!antes || !despues) continue;
        cambios.push({
            id: f.id as string,
            fecha: f.changed_at as string,
            quien: (f.changed_by_email as string | null) ?? null,
            origen: f.source as OrigenEdicion,
            cambios: camposCambiados(antes, despues),
            antes,
        });
    }
    return { success: true as const, cambios };
}

/**
 * Vuelve a cómo estaba una pregunta ANTES de una edición del historial. Es una
 * edición más (queda anotada como «restaurar»): deshacer también se puede
 * deshacer. La dificultad no se restaura: no se guarda de quién era.
 */
export async function restauraPregunta(historialId: string): Promise<{ success: true; campos: CamposEditables } | { success: false; error: string }> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false as const, error: auth.error };
    if (typeof historialId !== 'string' || !historialId) return { success: false as const, error: 'Falta la edición que se quiere deshacer.' };

    const { data: fila, error } = await supabaseAdmin
        .from('question_edit_history').select('question_id, before').eq('id', historialId).maybeSingle();
    if (error) return { success: false as const, error: fallo('restauraPregunta', error) };
    const antes = fila ? leeInstantanea(fila.before) : null;
    if (!fila || !antes) return { success: false as const, error: 'Esa edición no existe o no se puede deshacer.' };

    const res = await editaPregunta(auth.user, fila.question_id as string, {
        question_text: antes.question_text,
        options: antes.options,
        correct_index: antes.correct_index,
        explanation: antes.explanation ?? '',
    }, 'restaurar');
    return res.success ? { success: true as const, campos: antes } : { success: false as const, error: res.error ?? 'No se ha podido deshacer.' };
}

// ==========================================
// ALTA MANUAL DE PREGUNTAS  (P2)
// ==========================================
//
// Hasta ahora solo se podian EDITAR preguntas que ya existian: para tener una
// pregunta concreta habia que generar varias con IA y reescribir la que mas se
// acercara. Esto es lo que permite a una academia cargar su propio banco sin
// depender del modelo.

/**
 * Lo que llega del formulario o del importador.
 *
 * Se declara aqui como `unknown` y se comprueba campo a campo: una Server
 * Action es un endpoint HTTP publico, asi que la validacion del navegador no
 * cuenta (regla 16).
 */
type AltaManual = {
  subjectId: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: number;
  legalReference?: string | null;
};

/** Fila lista para `question_bank`, ya validada y con su huella. */
type FilaNueva = {
  subject_id: number;
  question_text: string;
  options: string[];
  correct_index: number;
  explanation: string;
  legal_reference: string | null;
  question_hash: string;
  difficulty_level: number;
  status: string;
  origin: string;
  fuente: string;
  created_at: string;
  organization_id: string | null;
};

/**
 * Comprueba una pregunta suelta y la deja en forma de fila.
 *
 * Reutiliza `validateGeneratedQuestion`, la misma que filtra la salida del
 * modelo: opciones repetidas o vacias, enunciado demasiado corto y —lo que de
 * verdad importa— un `correctIndex` fuera de rango. Una persona escribiendo en
 * un Excel se equivoca igual que la IA, y lo que le pasa al alumno es identico:
 * estudia un dato falso y nada avisa (regla 10).
 *
 * Las preguntas escritas a mano entran como `active`: si las escribe un
 * administrador sobre su propio temario, mandarlas a su propia cola de
 * moderacion no aporta nada. Se pueden descartar desde el banco como cualquier
 * otra.
 *
 * `organizationId` (P11c) decide a qué banco entra: `null` es el GLOBAL —solo
 * lo escribe un `superadmin`, el mismo que lo mantiene con IA (regla 65)—, y
 * el id de una academia es su banco PRIVADO, el que ningún otro admin ve ni
 * modera. Quién manda cuál lo decide `createManualQuestion` /
 * `importManualQuestions`, no esta función.
 */
function aFilaNueva(
  entrada: unknown,
  subjectId: number,
  organizationId: string | null,
): { ok: true; fila: FilaNueva } | { ok: false; motivo: string } {
  const check = validateGeneratedQuestion(entrada);
  if (!check.ok) return { ok: false, motivo: check.reason };

  const d = (entrada ?? {}) as Record<string, unknown>;
  const nivel = toDifficultyLevel(d.difficulty ?? d.difficulty_level);
  // La referencia legal es opcional, pero si llega tiene que caber: no se recorta (regla 146).
  const referencia = limpiaReferencia(d.legalReference);
  if (referencia === undefined) return { ok: false, motivo: `La referencia legal pasa de ${MAX_REFERENCIA} caracteres: pon solo la ley y el artículo.` };

  return {
    ok: true,
    fila: {
      subject_id: subjectId,
      // Se guardan los valores YA normalizados (recortados y sin Markdown),
      // no los de entrada.
      question_text: check.value.question,
      options: check.value.options,
      correct_index: check.value.correctIndex,
      explanation: check.value.explanation,
      legal_reference: referencia,
      question_hash: questionHash(subjectId, check.value.question, check.value.correctIndex, organizationId),
      difficulty_level: nivel,
      status: QUESTION_STATUS.ACTIVE,
      origin: QUESTION_ORIGIN.MANUAL,
      // La escribe un tutor a mano: es de la academia (regla 139).
      fuente: FUENTE_PREGUNTA.ACADEMIA,
      created_at: new Date().toISOString(),
      organization_id: organizationId,
    },
  };
}

/**
 * A qué banco entra lo que escribe a mano ESTE admin (P11c). Un `superadmin`
 * escribe en el GLOBAL —es el mismo que lo mantiene con IA—; cualquier otro
 * `admin` escribe en el PRIVADO de su propia academia. `requireAdmin()` ya
 * garantiza que un `admin` normal siempre tiene `organizationId` resuelto —
 * si no, ni habría pasado la guarda.
 */
function bancoDestino(user: { role: string; organizationId: string | null }): string | null {
  return user.role === 'superadmin' ? null : user.organizationId;
}

/** El tema tiene que existir: `question_bank.subject_id` es clave ajena de `subjects`. */
async function temaExiste(subjectId: number): Promise<boolean> {
  const { data } = await supabaseAdmin.from('subjects').select('id').eq('id', subjectId).maybeSingle();
  return !!data;
}

/**
 * Todos los ids de tema, para validar un CSV multi-tema sin una consulta por
 * fila. Un `subject_id` que no exista tumbaría el upsert ENTERO (clave ajena),
 * así que la fila que lo traiga se rechaza y las demás siguen.
 */
async function temasValidos(): Promise<Set<number>> {
  const { data } = await supabaseAdmin.from('subjects').select('id');
  return new Set((data ?? []).map((r) => r.id as number));
}

export async function createManualQuestion(
  input: unknown
): Promise<ModerationResult & { id?: string; duplicada?: boolean }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const d = (input ?? {}) as Partial<AltaManual>;
  const subjectId = Number(d.subjectId);
  if (!Number.isInteger(subjectId) || subjectId <= 0) {
    return { success: false, error: 'Falta el tema al que pertenece la pregunta.' };
  }
  if (!(await temaExiste(subjectId))) {
    return { success: false, error: 'Ese tema no existe.' };
  }

  const preparada = aFilaNueva(input, subjectId, bancoDestino(auth.user));
  if (!preparada.ok) return { success: false, error: preparada.motivo };

  // `ignoreDuplicates`, igual que en los otros dos caminos de escritura: si la
  // pregunta ya estaba, NO se reescribe su fila. Sin esto, escribir a mano una
  // pregunta que ya existia devolveria una descartada al banco o sacaria de el
  // a una aprobada (regla 3).
  const { data, error } = await supabaseAdmin
    .from('question_bank')
    // La escribe un admin: entra revisada por esa persona (regla 138).
    .upsert({ ...preparada.fila, ...revisadaPor(auth.user) }, { onConflict: 'question_hash', ignoreDuplicates: true })
    .select('id')
    .maybeSingle();

  if (error) return { success: false, error: fallo('createManualQuestion', error) };

  if (!data) {
    // No se inserto nada: el hash ya existia. Se dice cual es, y en que estado,
    // porque "ya existe pero esta descartada" y "ya existe y esta en el banco"
    // piden cosas distintas de quien la estaba escribiendo.
    const { data: existente } = await supabaseAdmin
      .from('question_bank')
      .select('id, status')
      .eq('question_hash', preparada.fila.question_hash)
      .maybeSingle();

    const estado = existente?.status === QUESTION_STATUS.DISABLED
      ? ' Esta descartada: se puede recuperar editandola desde el banco.'
      : '';
    return {
      success: false,
      duplicada: true,
      id: existente?.id,
      error: `Esa pregunta ya existe en este tema.${estado}`,
    };
  }

  return { success: true, id: data.id };
}

/**
 * Alta en lote desde una hoja de calculo.
 *
 * El CSV se lee en el navegador (`app/lib/question-import.ts`) y lo que viaja
 * son preguntas ya troceadas. Aqui se vuelven a validar TODAS: que el
 * navegador las haya mirado no significa nada para un endpoint publico.
 *
 * Devuelve el desglose entero —insertadas, duplicadas y rechazadas con su
 * motivo— y no un simple `success`. Un importador que dice "listo" despues de
 * tragarse treinta filas es exactamente como se acaba con un banco incompleto
 * sin enterarse.
 */
export async function importManualQuestions(
  input: unknown
): Promise<
  ModerationResult & {
    insertadas?: number;
    duplicadas?: number;
    rechazadas?: { indice: number; motivo: string }[];
  }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const d = (input ?? {}) as { subjectId?: unknown; questions?: unknown };
  const subjectId = Number(d.subjectId);
  if (!Number.isInteger(subjectId) || subjectId <= 0) {
    return { success: false, error: 'Falta el tema al que pertenecen las preguntas.' };
  }
  if (!Array.isArray(d.questions) || d.questions.length === 0) {
    return { success: false, error: 'No llego ninguna pregunta.' };
  }
  if (d.questions.length > MAX_IMPORT) {
    return { success: false, error: `Se importan como maximo ${MAX_IMPORT} preguntas de una vez.` };
  }

  // Los temas válidos, una vez. El de por defecto tiene que estar; los que
  // traigan filas sueltas (CSV multi-tema) se comprueban contra este conjunto.
  const validos = await temasValidos();
  if (!validos.has(subjectId)) {
    return { success: false, error: 'Ese tema no existe.' };
  }

  const destino = bancoDestino(auth.user);
  const rechazadas: { indice: number; motivo: string }[] = [];
  const filas: FilaNueva[] = [];
  const huellas = new Set<string>();
  let repetidasEnElFichero = 0;

  d.questions.forEach((q, i) => {
    // Cada fila puede llevar su propio tema (columna `tema` del CSV, ya
    // resuelto a id en el cliente). El servidor lo vuelve a validar — un
    // endpoint público no se fía del navegador (regla 27). Sin `subjectId`
    // propio: al tema del desplegable.
    const suyo = Number((q as { subjectId?: unknown })?.subjectId);
    const temaFila = Number.isInteger(suyo) && suyo > 0 ? suyo : subjectId;
    if (!validos.has(temaFila)) {
      rechazadas.push({ indice: i, motivo: `El tema ${temaFila} no existe.` });
      return;
    }

    const preparada = aFilaNueva(q, temaFila, destino);
    if (!preparada.ok) {
      rechazadas.push({ indice: i, motivo: preparada.motivo });
      return;
    }
    // Dos filas iguales dentro del mismo envio chocarian contra la restriccion
    // unica y el fallo saldria como un error de base de datos en vez de como
    // lo que es: una fila repetida en el fichero.
    if (huellas.has(preparada.fila.question_hash)) {
      repetidasEnElFichero++;
      return;
    }
    huellas.add(preparada.fila.question_hash);
    // Las importa un admin: entran revisadas por esa persona (regla 138).
    filas.push({ ...preparada.fila, ...revisadaPor(auth.user) });
  });

  if (filas.length === 0) {
    return { success: false, error: 'Ninguna fila era utilizable.', insertadas: 0, duplicadas: repetidasEnElFichero, rechazadas };
  }

  const { data: insertadas, error } = await supabaseAdmin
    .from('question_bank')
    .upsert(filas, { onConflict: 'question_hash', ignoreDuplicates: true })
    .select('id');

  if (error) return { success: false, error: fallo('importManualQuestions', error), rechazadas };

  const nInsertadas = insertadas?.length ?? 0;
  return {
    success: true,
    insertadas: nInsertadas,
    // Las que ya estaban en el banco, mas las repetidas dentro del propio
    // fichero: para quien importa las dos cosas son "esta ya la tenia".
    duplicadas: filas.length - nInsertadas + repetidasEnElFichero,
    rechazadas,
  };
}


/**
 * UNA PREGUNTA NUEVA ESCRITA DESDE «EXÁMENES EN PAPEL» (regla 135).
 *
 * Para el examen en papel basta el enunciado, las tres opciones y la correcta.
 * Para la plataforma hace falta más (explicación y dificultad), así que entra
 * al banco PRIVADO de la academia como PENDIENTE y SIN esas etiquetas: no se
 * sirve a ningún alumno hasta que alguien las ponga y la apruebe en «Banco
 * oficial» (`approveQuestions` no deja pasar una incompleta). La dificultad
 * entra `null`, no con el 2 de la siembra (regla 16).
 *
 * `ignoreDuplicates` como los otros caminos de escritura (regla 3): si ya
 * estaba en el banco no se reescribe, y se devuelve la que había para que el
 * examen la use en vez de fallar.
 */
export async function crearPreguntaDeExamen(input: unknown): Promise<
    | { success: true; pregunta: { id: string; enunciado: string; opciones: string[]; correcta: number; tema: string; dificultad: number | null; explicacion: string | null; pendiente: boolean }; yaExistia: boolean }
    | { success: false; error: string }
> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false as const, error: auth.error };
    const org = auth.user.organizationId;
    if (!org) return { success: false as const, error: 'No hay una academia seleccionada.' };

    const d = (input ?? {}) as { subjectId?: unknown; question?: unknown; options?: unknown; correctIndex?: unknown };
    const subjectId = Number(d.subjectId);
    if (!Number.isInteger(subjectId) || subjectId <= 0) return { success: false as const, error: 'Elige el tema de la pregunta.' };
    const { data: tema } = await supabaseAdmin.from('subjects').select('id, title').eq('id', subjectId).maybeSingle();
    if (!tema) return { success: false as const, error: 'Ese tema no existe.' };

    // La misma validación que la salida del modelo (regla 10). La explicación
    // se rellena solo para pasarla: no se guarda.
    const check = validateGeneratedQuestion({ question: d.question, options: d.options, correctIndex: d.correctIndex, explanation: RELLENO_EXPLICACION });
    if (!check.ok) return { success: false as const, error: check.reason };

    const hash = questionHash(subjectId, check.value.question, check.value.correctIndex, org);
    const { data: nueva, error } = await supabaseAdmin
        .from('question_bank')
        .upsert({
            subject_id: subjectId,
            question_text: check.value.question,
            options: check.value.options,
            correct_index: check.value.correctIndex,
            explanation: null,
            question_hash: hash,
            difficulty_level: null,
            difficulty_source: null,
            status: QUESTION_STATUS.CANDIDATE,
            origin: QUESTION_ORIGIN.MANUAL,
            // Viene de un examen en papel de la academia (regla 139).
            fuente: FUENTE_PREGUNTA.ACADEMIA,
            created_at: new Date().toISOString(),
            organization_id: org,
        }, { onConflict: 'question_hash', ignoreDuplicates: true })
        .select('id')
        .maybeSingle();
    if (error) return { success: false as const, error: fallo('crearPreguntaDeExamen', error) };

    let id = nueva?.id as string | undefined;
    let yaExistia = false;
    type FilaPrevia = { id: string; status: string; explanation: string | null; difficulty_level: number | null };
    let fila = null as FilaPrevia | null;
    if (!id) {
        const { data: previa, error: errPrevia } = await supabaseAdmin
            .from('question_bank').select('id, status, explanation, difficulty_level')
            .eq('question_hash', hash).maybeSingle();
        if (errPrevia) return { success: false as const, error: fallo('crearPreguntaDeExamen', errPrevia) };
        if (!previa) return { success: false as const, error: 'No se ha podido guardar la pregunta.' };
        if (previa.status === QUESTION_STATUS.DISABLED) {
            return { success: false as const, error: 'Esa pregunta ya existe pero está descartada: recupérala desde «Banco oficial».' };
        }
        id = previa.id as string;
        yaExistia = true;
        fila = previa as FilaPrevia;
    }
    registraAccion({ actorId: auth.user.id, action: 'create_exam_question', target: id, organizationId: org });
    return {
        success: true as const,
        yaExistia,
        pregunta: {
            id: id as string,
            enunciado: check.value.question,
            opciones: check.value.options,
            correcta: check.value.correctIndex,
            tema: tema.title as string,
            dificultad: fila?.difficulty_level ?? null,
            explicacion: fila?.explanation ?? null,
            pendiente: fila ? fila.status === QUESTION_STATUS.CANDIDATE : true,
        },
    };
}

// ---------------------------------------------------------------------------
// LA ÚLTIMA PALABRA ES DE LOS TUTORES (regla 138)
// ---------------------------------------------------------------------------

/**
 * «Revisada»: un tutor ha leído una pregunta del banco y la da por buena tal
 * cual. Solo las que están en el banco (una pendiente se PUBLICA, que también
 * la deja revisada), y no con un aviso de la ley abierto ni con un cambio
 * propuesto sin decidir: eso se resuelve antes.
 */
export async function marcarRevisada(questionId: string): Promise<ModerationResult> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };
    if (typeof questionId !== 'string' || !questionId) return { success: false, error: 'Falta el id de la pregunta.' };

    const alcance = filtroEscrituraBanco(auth.user);
    let lectura = supabaseAdmin.from('question_bank').select('id, status').eq('id', questionId);
    if (alcance) lectura = lectura.or(alcance);
    const { data: fila, error: errLec } = await lectura.maybeSingle();
    if (errLec) return { success: false, error: fallo('marcarRevisada', errLec) };
    if (!fila) return { success: false, error: 'Esa pregunta no existe o no es de tu academia.' };
    if (fila.status !== QUESTION_STATUS.ACTIVE) return { success: false, error: 'Solo se marcan las que están en el banco. Una pendiente se publica.' };

    const [{ data: avisos, error: errAv }, { data: propuestas, error: errPr }] = await Promise.all([
        supabaseAdmin.from('question_reports').select('id').eq('question_id', questionId).in('report_type', [TIPO_REPORTE_VIGENCIA, TIPO_REPORTE_REVISION_IA]).eq('status', 'open').limit(1),
        supabaseAdmin.from('question_proposals').select('id').eq('question_id', questionId).eq('status', 'pending').limit(1),
    ]);
    if (errAv || errPr) return { success: false, error: fallo('marcarRevisada', errAv ?? errPr) };
    if (avisos?.length) return { success: false, error: 'Tiene un aviso sin resolver (un cambio en la ley o una duda de la IA): míralo y resuélvelo antes.' };
    if (propuestas?.length) return { success: false, error: 'Tiene un cambio propuesto sin decidir: apruébalo o recházalo antes.' };

    let query = supabaseAdmin.from('question_bank').update(revisadaPor(auth.user)).eq('id', questionId);
    if (alcance) query = query.or(alcance);
    const { data, error } = await query.select('id');
    if (error) return { success: false, error: fallo('marcarRevisada', error) };
    if (!data?.length) return { success: false, error: 'Esa pregunta no existe o no es de tu academia.' };
    registraAccion({ actorId: auth.user.id, action: 'review_question', target: questionId, organizationId: auth.user.organizationId });
    return { success: true };
}

/** Un cambio propuesto, con la pregunta tal como está HOY y su «antes / después» legible. */
export type PropuestaParaRevisar = {
    id: string;
    questionId: string;
    origen: string;
    motivo: string;
    creada: string;
    /** Sigue valiendo: la pregunta está como cuando se propuso. */
    vigente: boolean;
    cambios: CambioLegible[];
    pregunta: {
        question_text: string;
        options: string[];
        correct_index: number;
        explanation: string | null;
        legal_reference: string | null;
        difficulty_level: number | null;
        status: string;
        tema: number | null;
    };
};

const COLUMNAS_PROPONIBLES = 'id, organization_id, status, subject_id, question_text, options, correct_index, explanation, difficulty_level, legal_reference';

type FilaProponible = {
    id: string; organization_id: string | null; status: string; subject_id: number | null;
    question_text: string; options: string[]; correct_index: number; explanation: string | null;
    difficulty_level: number | null; legal_reference: string | null;
};

const valoresDe = (f: FilaProponible): ValoresPregunta => ({
    question_text: f.question_text,
    options: Array.isArray(f.options) ? f.options : [],
    correct_index: f.correct_index,
    explanation: f.explanation ?? null,
    difficulty_level: f.difficulty_level ?? null,
    legal_reference: f.legal_reference ?? null,
});

/** El alcance de lectura por academia de una tabla con `organization_id` propio (reglas 75 y 123). */
function alcanceLecturaOrg(user: { role: string; organizationId: string | null }): string | null {
    if (user.role === 'superadmin') return null;
    return UNA_SOLA_ACADEMIA
        ? `organization_id.is.null,organization_id.eq.${user.organizationId}`
        : `organization_id.eq.${user.organizationId}`;
}

/** Los cambios propuestos que esperan a un tutor (regla 138), de los más antiguos a los más nuevos. */
export async function getPropuestas(): Promise<{ success: true; propuestas: PropuestaParaRevisar[] } | { success: false; error: string }> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false as const, error: auth.error };

    let consulta = supabaseAdmin
        .from('question_proposals')
        .select('id, question_id, source, reason, before, after, created_at, organization_id')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(200);
    const alcance = alcanceLecturaOrg(auth.user);
    if (alcance) consulta = consulta.or(alcance);
    const { data: filas, error } = await consulta;
    if (error) return { success: false as const, error: fallo('getPropuestas', error) };
    if (!filas?.length) return { success: true as const, propuestas: [] };

    const ids = [...new Set(filas.map((f) => f.question_id as string))];
    const { data: preguntas, error: errQ } = await supabaseAdmin.from('question_bank').select(COLUMNAS_PROPONIBLES + ', subjects(topic_number)').in('id', ids);
    if (errQ) return { success: false as const, error: fallo('getPropuestas', errQ) };
    const porId = new Map(((preguntas ?? []) as unknown as (FilaProponible & { subjects?: { topic_number: number } | null })[]).map((p) => [p.id, p]));

    const propuestas: PropuestaParaRevisar[] = [];
    for (const f of filas) {
        const q = porId.get(f.question_id as string);
        const antes = leeValores(f.before);
        const despues = leeValores(f.after);
        if (!q || !antes || !despues) continue;
        const actual = valoresDe(q);
        propuestas.push({
            id: f.id as string,
            questionId: q.id,
            origen: f.source as string,
            motivo: f.reason as string,
            creada: f.created_at as string,
            vigente: propuestaVigente(actual, antes, despues),
            cambios: cambiosLegibles(actual, despues),
            pregunta: {
                question_text: q.question_text, options: actual.options ?? [], correct_index: q.correct_index,
                explanation: q.explanation ?? null, legal_reference: q.legal_reference ?? null,
                difficulty_level: q.difficulty_level ?? null, status: q.status, tema: q.subjects?.topic_number ?? null,
            },
        });
    }
    return { success: true as const, propuestas };
}

/** Lee una propuesta pendiente y su pregunta, ya acotadas a lo que este tutor puede tocar. */
async function propuestaYPregunta(user: { role: string; organizationId: string | null }, proposalId: string) {
    const { data: prop, error } = await supabaseAdmin
        .from('question_proposals')
        .select('id, question_id, source, before, after, status')
        .eq('id', proposalId)
        .maybeSingle();
    if (error) return { error: fallo('propuesta', error) };
    if (!prop) return { error: 'Ese cambio propuesto no existe.' };
    if (prop.status !== 'pending') return { error: 'Ese cambio ya se decidió.' };

    const alcance = filtroEscrituraBanco(user as Parameters<typeof filtroEscrituraBanco>[0]);
    let lectura = supabaseAdmin.from('question_bank').select(COLUMNAS_PROPONIBLES).eq('id', prop.question_id as string);
    if (alcance) lectura = lectura.or(alcance);
    const { data: q, error: errQ } = await lectura.maybeSingle();
    if (errQ) return { error: fallo('propuesta', errQ) };
    if (!q) return { error: 'Esa pregunta no existe o no es de tu academia.' };
    return { prop, q: q as unknown as FilaProponible, alcance };
}

const decididaPor = (user: { id: string; email: string }, estado: 'approved' | 'rejected' | 'superseded', nota?: string | null) => ({
    status: estado,
    decided_at: new Date().toISOString(),
    decided_by: user.id,
    decided_by_email: user.email,
    decision_note: nota ?? null,
});

/**
 * Aprueba un cambio propuesto y lo aplica (regla 138). Antes comprueba que la
 * pregunta sigue como cuando se propuso: si alguien la ha tocado, la
 * propuesta se descarta en vez de pisar lo que no se ha visto. Se valida con
 * la misma regla que una edición a mano (regla 10) y deja su fila en el
 * historial ANTES de escribir (regla 135).
 */
export async function aprobarPropuesta(proposalId: string): Promise<ModerationResult> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };
    if (typeof proposalId !== 'string' || !proposalId) return { success: false, error: 'Falta el cambio propuesto.' };

    const leido = await propuestaYPregunta(auth.user, proposalId);
    if ('error' in leido) return { success: false, error: leido.error };
    const { prop, q, alcance } = leido;

    const antes = leeValores(prop.before);
    const despues = leeValores(prop.after);
    if (!antes || !despues) return { success: false, error: 'Ese cambio propuesto está mal formado.' };
    const actual = valoresDe(q);
    if (!propuestaVigente(actual, antes, despues)) {
        await supabaseAdmin.from('question_proposals').update(decididaPor(auth.user, 'superseded', 'La pregunta cambió desde que se propuso.')).eq('id', proposalId);
        return { success: false, error: 'La pregunta ha cambiado desde que se propuso este cambio: ya no vale y se ha descartado.' };
    }
    const nueva = { ...actual, ...despues };
    if (!cambiaAlgo(actual, despues)) {
        await supabaseAdmin.from('question_proposals').update(decididaPor(auth.user, 'superseded', 'No cambiaba nada.')).eq('id', proposalId);
        return { success: true };
    }

    // La misma comprobación que una edición a mano: tres opciones distintas,
    // índice en rango, enunciado y explicación (regla 10). Una pendiente puede
    // seguir sin explicación.
    const sinExplicacion = q.status === QUESTION_STATUS.CANDIDATE && !(nueva.explanation ?? '').trim();
    const check = validateGeneratedQuestion({
        question_text: nueva.question_text, options: nueva.options, correct_index: nueva.correct_index,
        explanation: sinExplicacion ? RELLENO_EXPLICACION : nueva.explanation,
    });
    if (!check.ok) return { success: false, error: `El cambio no se puede aplicar: ${check.reason}` };

    const despuesFoto = {
        question_text: check.value.question,
        options: check.value.options,
        correct_index: check.value.correctIndex,
        explanation: sinExplicacion ? null : check.value.explanation,
        difficulty_level: nueva.difficulty_level ?? null,
        legal_reference: nueva.legal_reference ?? null,
    };
    const { error: errHist } = await supabaseAdmin.from('question_edit_history').insert({
        question_id: q.id,
        organization_id: q.organization_id ?? null,
        changed_by: auth.user.id,
        changed_by_email: auth.user.email,
        source: 'banco',
        before: { ...instantanea(q), legal_reference: q.legal_reference ?? null },
        after: despuesFoto,
    });
    if (errHist) return { success: false, error: fallo('aprobarPropuesta.historial', errHist) };

    const cambiaNivel = 'difficulty_level' in despues && despues.difficulty_level !== actual.difficulty_level;
    let query = supabaseAdmin.from('question_bank').update({
        question_text: despuesFoto.question_text,
        options: despuesFoto.options,
        correct_index: despuesFoto.correct_index,
        explanation: despuesFoto.explanation,
        legal_reference: despuesFoto.legal_reference,
        // La medida es la medida; lo demás lo ha dado por bueno un tutor (regla 122).
        ...(cambiaNivel ? {
            difficulty_level: despuesFoto.difficulty_level,
            difficulty_source: prop.source === 'dificultad' ? DIFFICULTY_SOURCE.medida : DIFFICULTY_SOURCE.preparador,
        } : {}),
        // Aprobar UN cambio no es dar por buena la pregunta entera: eso se hace
        // en «Revisar», viéndola completa. Quién aprobó el cambio queda en la
        // propuesta y en el historial.
    }).eq('id', q.id);
    if (alcance) query = query.or(alcance);
    const { data: escritas, error } = await query.select('id');
    if (error) return { success: false, error: fallo('aprobarPropuesta', error) };
    if (!escritas?.length) return { success: false, error: 'Esa pregunta no existe o no es de tu academia.' };

    const { error: errProp } = await supabaseAdmin.from('question_proposals').update(decididaPor(auth.user, 'approved')).eq('id', proposalId);
    if (errProp) return { success: false, error: fallo('aprobarPropuesta.estado', errProp) };
    registraAccion({ actorId: auth.user.id, action: 'approve_proposal', target: q.id, organizationId: auth.user.organizationId, detail: { propuesta: proposalId } });
    return { success: true };
}

/** Los campos que un cambio «mecánico» de Claude puede tocar: el enunciado (quitar «texto proporcionado»), la referencia legal y la explicación (numeración de las opciones). */
const CAMPOS_MECANICOS = ['question_text', 'legal_reference', 'explanation'] as const;

/**
 * Acepta EN BLOQUE los cambios mecánicos de Claude (regla 138: lo decide un
 * tutor, que pulsa el botón y confirma). De 50 en 50, por id, para que el
 * navegador pueda ir llamando hasta que se acabe sin repetir ninguno.
 *
 * Solo entran los de origen `claude` que tocan únicamente el enunciado, la
 * referencia o la explicación. Cada uno pasa por `aprobarPropuesta`: la misma
 * comprobación que a mano (que la pregunta siga como cuando se propuso, que
 * valga como pregunta) y deja su historial y su registro. NO da ninguna
 * pregunta por revisada.
 */
export async function aprobarCambiosMecanicos(input: unknown): Promise<
    { success: true; aprobadas: number; saltadas: number; ultimo: string | null; fin: boolean } | { success: false; error: string }
> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false as const, error: auth.error };
    const d = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const despuesDe = typeof d.despuesDe === 'string' && /^[0-9a-f-]{36}$/i.test(d.despuesDe) ? d.despuesDe : null;
    const TANDA = 50;

    let consulta = supabaseAdmin
        .from('question_proposals')
        .select('id, after')
        .eq('status', 'pending')
        .eq('source', 'claude')
        .order('id', { ascending: true })
        .limit(TANDA);
    const alcance = alcanceLecturaOrg(auth.user);
    if (alcance) consulta = consulta.or(alcance);
    if (despuesDe) consulta = consulta.gt('id', despuesDe);
    const { data: filas, error } = await consulta;
    if (error) return { success: false as const, error: fallo('aprobarCambiosMecanicos', error) };

    let aprobadas = 0;
    let saltadas = 0;
    for (const f of filas ?? []) {
        const despues = leeValores(f.after);
        if (!despues || !Object.keys(despues).every((k) => (CAMPOS_MECANICOS as readonly string[]).includes(k))) { saltadas++; continue; }
        const r = await aprobarPropuesta(f.id as string);
        if (r.success) aprobadas++; else saltadas++;
    }
    const ultimo = (filas ?? []).length ? ((filas ?? [])[(filas ?? []).length - 1].id as string) : despuesDe;
    return { success: true as const, aprobadas, saltadas, ultimo, fin: (filas ?? []).length < TANDA };
}

/** Rechaza un cambio propuesto (regla 138): la pregunta no se toca y queda anotado quién y por qué. */
export async function rechazarPropuesta(proposalId: string, nota?: unknown): Promise<ModerationResult> {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };
    if (typeof proposalId !== 'string' || !proposalId) return { success: false, error: 'Falta el cambio propuesto.' };
    const motivo = typeof nota === 'string' ? nota.trim().slice(0, 500) || null : null;

    const leido = await propuestaYPregunta(auth.user, proposalId);
    if ('error' in leido) return { success: false, error: leido.error };

    const { error } = await supabaseAdmin.from('question_proposals').update(decididaPor(auth.user, 'rejected', motivo)).eq('id', proposalId).eq('status', 'pending');
    if (error) return { success: false, error: fallo('rechazarPropuesta', error) };
    registraAccion({ actorId: auth.user.id, action: 'reject_proposal', target: leido.q.id, organizationId: auth.user.organizationId, detail: { propuesta: proposalId, motivo } });
    return { success: true };
}

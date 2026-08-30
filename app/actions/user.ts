'use server'

import { supabaseAdmin } from './core';
import { getSessionUser, requireUser, type AuthUser } from '../lib/auth';
import { summarizeResults, type TestResultRow } from '../lib/stats';
import {
  groupFailedAttempts,
  failuresByTopic,
  type FailedAttemptRow,
  type FailedQuestion,
} from '../lib/review';

/**
 * Devuelve el usuario de la sesion actual, o null si no hay sesion.
 *
 * Sustituye al antiguo `getUserRole(userId)`, que aceptaba un id del cliente y
 * se lo creia: bastaba con enviar el UUID de un administrador para que la UI
 * pintara el panel de administracion.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  return getSessionUser();
}

// --- ESTADISTICAS ---

/** Cuantos resultados recientes se agregan para las metricas. */
const STATS_SAMPLE = 100;
/** Cuantos se muestran en el historial. */
const RECENT_ITEMS = 5;

/**
 * `question_attempts` guarda `question_id` y el titulo del tema en `topic`,
 * pero NO el enunciado de la pregunta. La UI lo pintaba igualmente
 * (`item.question_text.replace(...)`) y reventaba en cuanto habia un solo
 * resultado guardado.
 *
 * Se traen por join en vez de desnormalizar: no hace falta migracion ni quedan
 * copias que se puedan quedar obsoletas si un admin edita la pregunta.
 */
// Solo se trae el enunciado: el tema ya viaja como texto en `topic`, asi que
// el join a `subjects` que habia aqui sobraba (y no habria resuelto: la tabla
// no guarda `subject_id`).
const ENRICHED_SELECT = '*, question:question_bank(question_text)';

type EnrichedRow = TestResultRow & {
  question?: { question_text?: string | null } | null;
};

/** Aplana el resultado del join a las claves que espera la UI. */
function flatten(row: EnrichedRow): TestResultRow & Record<string, unknown> {
  return {
    ...row,
    question_text: row.question?.question_text ?? null,
  };
}

export async function getUserStats() {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };

  try {
    const query = (select: string) =>
      supabaseAdmin
        .from('question_attempts')
        .select(select)
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false })
        .limit(STATS_SAMPLE);

    let rows: EnrichedRow[] = [];
    const enriched = await query(ENRICHED_SELECT);

    if (enriched.error) {
      // El join necesita que las claves ajenas esten declaradas en la BD para
      // que PostgREST las resuelva. Si no lo estan, se degrada a la consulta
      // plana en vez de dejar al alumno sin estadisticas.
      // La FK question_attempts.question_id -> question_bank.id quedo
      // declarada en la fase 2.5, asi que el join deberia resolver siempre.
      // El respaldo se queda como red por si el esquema vuelve a moverse.
      console.error('getUserStats: join no disponible, usando consulta plana:', enriched.error.message);
      const plain = await query('*');
      if (plain.error) throw plain.error;
      rows = (plain.data ?? []) as EnrichedRow[];
    } else {
      rows = ((enriched.data ?? []) as EnrichedRow[]).map(flatten);
    }

    const summary = summarizeResults(rows);

    return {
      success: true as const,
      stats: {
        // Las metricas se agregan en el servidor sobre la muestra completa. La
        // UI las calculaba sobre las 5 ultimas y las dividia entre el total.
        ...summary,
        lastItems: rows.slice(0, RECENT_ITEMS),
      },
    };
  } catch (e) {
    console.error('getUserStats:', e instanceof Error ? e.message : e);
    return { success: false as const, error: 'Error al calcular estadisticas.' };
  }
}

// --- REPASO DE LO FALLADO ---

/**
 * Cuantos intentos fallados se leen para construir el repaso.
 *
 * Es mas alto que `STATS_SAMPLE` a proposito: las estadisticas describen el
 * momento actual, pero una pregunta fallada hace tres meses y nunca repasada
 * sigue siendo una laguna.
 */
const REVIEW_SAMPLE = 300;

/**
 * Las preguntas que el alumno ha fallado, para volver a ellas.
 *
 * La plataforma sabia perfectamente cuales eran —y por que, porque el
 * diagnostico del error es obligatorio— y no tenia ni una pantalla para
 * repasarlas: el dato se recogia y se moria en la tabla.
 *
 * El enunciado y las opciones vienen por JOIN (regla 5). Desnormalizarlos
 * dejaria copias que se quedan obsoletas en cuanto un admin corrija la
 * pregunta, y el alumno repasaria la version mala.
 *
 * No acepta `userId`: sale de la cookie de sesion (regla 1).
 */
export async function getFailedQuestions(): Promise<
  | { success: true; items: FailedQuestion[]; byTopic: { topic: string; count: number }[] }
  | { success: false; error: string }
> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const { data, error } = await supabaseAdmin
    .from('question_attempts')
    .select('question_id, topic, error_type, created_at, is_correct, selected_index, question:question_bank(question_text, options, correct_index, explanation, legal_reference)')
    .eq('user_id', auth.user.id)
    .eq('is_correct', false)
    .order('created_at', { ascending: false })
    .limit(REVIEW_SAMPLE);

  if (error) {
    // Un error de lectura NO se traga: sin esto la pantalla diria "no has
    // fallado nada", que es la mentira mas tranquilizadora posible.
    console.error('getFailedQuestions:', error.message);
    return { success: false as const, error: error.message };
  }

  const rows: FailedAttemptRow[] = (data ?? []).map((row) => {
    // PostgREST devuelve el objeto embebido, pero lo tipa como array cuando no
    // puede probar que la relacion es de uno: se normaliza aqui y no en el
    // modulo puro, que no tiene por que saber de PostgREST.
    const q = Array.isArray(row.question) ? row.question[0] : row.question;
    return {
      question_id: row.question_id,
      topic: row.topic,
      error_type: row.error_type,
      created_at: row.created_at,
      is_correct: row.is_correct,
      selected_index: row.selected_index,
      question_text: q?.question_text ?? null,
      options: q?.options,
      correct_index: q?.correct_index ?? null,
      explanation: q?.explanation ?? null,
      legal_reference: q?.legal_reference ?? null,
    };
  });

  const items = groupFailedAttempts(rows);
  return { success: true as const, items, byTopic: failuresByTopic(items) };
}

'use server'

import { supabaseAdmin } from './core';
import { getSessionUser, requireUser, type AuthUser } from '../lib/auth';
import { summarizeResults, type TestResultRow } from '../lib/stats';

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
 * `test_results` guarda `question_id` y `subject_id`, pero NO el enunciado ni el
 * nombre del tema. La UI los pintaba igualmente (`item.question_text.replace(...)`)
 * y reventaba en cuanto habia un solo resultado guardado.
 *
 * Se traen por join en vez de desnormalizar: no hace falta migracion ni quedan
 * copias que se puedan quedar obsoletas si un admin edita la pregunta.
 */
const ENRICHED_SELECT = '*, question:question_bank(question_text), subject:subjects(title, topic_number)';

type EnrichedRow = TestResultRow & {
  question?: { question_text?: string | null } | null;
  subject?: { title?: string | null; topic_number?: number | null } | null;
};

/** Aplana el resultado del join a las claves que espera la UI. */
function flatten(row: EnrichedRow): TestResultRow & Record<string, unknown> {
  return {
    ...row,
    question_text: row.question?.question_text ?? null,
    topic: row.subject?.title ?? null,
  };
}

export async function getUserStats() {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };

  try {
    const query = (select: string) =>
      supabaseAdmin
        .from('test_results')
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
      // TODO (fase 1.3): al versionar el esquema, confirmar las FK
      // test_results.question_id -> question_bank.id y .subject_id -> subjects.id
      // y quitar este respaldo.
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

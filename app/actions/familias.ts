'use server'
import { supabaseAdmin } from './core';
import { requireAdmin } from '../lib/auth';
import { filtroEscrituraBanco } from '../lib/permisos-banco';
import { fallo } from '../lib/fallos';
import { paginaCompleta, type ResultadoPagina } from '../lib/pagination';
import { paginaDeFamilias, type FilaDeFamilia, type MiembroDeFamilia } from '../lib/familias';
import { QUESTION_STATUS } from '../lib/questions';
import { registraAccion } from '../lib/admin-audit';

/**
 * PREGUNTAS REPETIDAS (regla 119): las familias que `npm run familias` ha
 * agrupado, para decidir con qué pregunta de cada una quedarse.
 *
 * ADMIN DE LA ACADEMIA Y SUPERADMIN, cada uno sobre lo que puede tocar
 * (`filtroEscrituraBanco`, regla 123): con UNA_SOLA_ACADEMIA, el admin de
 * Alphapol trabaja sobre el banco global; si se pone a `false`, solo sobre el
 * suyo. Se enseña solo lo que se puede descartar: botones que fallarían
 * serían engañar.
 */

export async function getFamiliasRepetidas(params: { page?: number }) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const alcance = filtroEscrituraBanco(auth.user);

  // Todas las activas con familia, paginadas: PostgREST corta a 1.000 sin avisar (regla 74).
  const { data: filas, error } = await paginaCompleta<FilaDeFamilia>(
    (d, h) => {
      let q = supabaseAdmin
        .from('question_bank')
        .select('id, family_id')
        .eq('status', QUESTION_STATUS.ACTIVE)
        .not('family_id', 'is', null)
        .order('id')
        .range(d, h);
      if (alcance) q = q.or(alcance);
      return q as unknown as Promise<ResultadoPagina<FilaDeFamilia>>;
    },
  );
  if (error) return { success: false as const, error };

  const pagina = paginaDeFamilias(filas, params.page ?? 1);
  if (pagina.familias.length === 0) return { success: true as const, ...pagina, familias: [] as { id: string; miembros: MiembroDeFamilia[] }[] };

  let consulta = supabaseAdmin
    .from('question_bank')
    .select('id, family_id, question_text, options, correct_index, explanation, legal_reference, difficulty_level, difficulty_source, subjects(topic_number)')
    .in('family_id', pagina.familias.map((f) => f.id))
    .eq('status', QUESTION_STATUS.ACTIVE)
    .order('id')
    // 10 familias de 30 como mucho (`MAX_FAMILIA`): 300 filas, lejos del corte de 1.000.
    .limit(1000);
  if (alcance) consulta = consulta.or(alcance);
  const { data, error: errMiembros } = await consulta;
  if (errMiembros) return { success: false as const, error: fallo('getFamiliasRepetidas', errMiembros) };

  const porFamilia = new Map<string, MiembroDeFamilia[]>();
  for (const f of (data ?? []) as unknown as (MiembroDeFamilia & { family_id: string; subjects?: { topic_number: number } | null })[]) {
    const lista = porFamilia.get(f.family_id) ?? [];
    lista.push({ ...f, tema: f.subjects?.topic_number ?? null });
    porFamilia.set(f.family_id, lista);
  }
  return {
    success: true as const,
    ...pagina,
    familias: pagina.familias.map((f) => ({ id: f.id, miembros: porFamilia.get(f.id) ?? [] })),
  };
}

/**
 * Se queda con UNA pregunta de la familia y descarta el resto. No borra nada
 * (regla 3): pasan a `disabled`, que no se sirve ni vuelve al resembrar.
 */
export async function quedarseConUna(params: { familyId: string; keepId: string }) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const alcance = filtroEscrituraBanco(auth.user);
  const { familyId, keepId } = params;
  if (!familyId || !keepId) return { success: false as const, error: 'Falta la familia o la pregunta.' };

  let lectura = supabaseAdmin
    // Una familia no pasa de `MAX_FAMILIA` (30).
    .from('question_bank').select('id').eq('family_id', familyId).eq('status', QUESTION_STATUS.ACTIVE).limit(100);
  if (alcance) lectura = lectura.or(alcance);
  const { data: activas, error } = await lectura;
  if (error) return { success: false as const, error: fallo('quedarseConUna', error) };
  const ids = (activas ?? []).map((r) => r.id as string);
  // La que se conserva tiene que ser de ESTA familia y estar activa: si no, se descartarían todas.
  if (!ids.includes(keepId)) return { success: false as const, error: 'Esa pregunta ya no está en la familia.' };

  const otras = ids.filter((id) => id !== keepId);
  if (otras.length === 0) return { success: true as const, descartadas: 0 };

  let descarte = supabaseAdmin
    .from('question_bank')
    .update({ status: QUESTION_STATUS.DISABLED })
    .in('id', otras)
    .eq('family_id', familyId)
    .eq('status', QUESTION_STATUS.ACTIVE);
  // Dentro de la consulta, por si la familia mezcla preguntas de dos bancos (regla 65).
  if (alcance) descarte = descarte.or(alcance);
  const { data: hechas, error: errDescarte } = await descarte.select('id');
  if (errDescarte) return { success: false as const, error: fallo('quedarseConUna', errDescarte) };

  registraAccion({
    actorId: auth.user.id,
    action: 'disable_family_duplicates',
    target: familyId,
    detail: { conservada: keepId, descartadas: hechas?.length ?? 0 },
  });
  return { success: true as const, descartadas: hechas?.length ?? 0 };
}

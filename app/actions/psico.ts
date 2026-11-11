'use server'
import { randomInt } from 'node:crypto';
import { supabaseAdmin } from './core';
import { requireUser } from '../lib/auth';
import { requireModule } from '../lib/module-guard';
import { fallo } from '../lib/fallos';
import {
  VERSION_PSICO, TAMANOS_PSICO, MINUTOS_PSICO, OPCIONES_PSICO,
  aPublica, corrigeSesion, generaSesion, normalizaRespuesta, tiposValidos,
  type PreguntaPsico, type PreguntaPsicoPublica, type ResultadoPsico, type TipoPsico,
} from '../lib/psico';

/**
 * PSICOTÉCNICOS (regla 117).
 *
 * `psico_sessions` solo la toca la clave de servicio (RLS sin políticas): la
 * semilla está ahí y el alumno no puede leerla. Cada consulta lleva el id de
 * la sesión del usuario (regla 1) dentro de la consulta.
 */

const FALTA_GUION = 'Los psicotécnicos todavía no están activados en esta academia. Avisa a tu preparador.';

export type SesionPsico = {
  id: string;
  minutos: number;
  preguntas: PreguntaPsicoPublica[];
};

/**
 * Empieza una sesión: guarda la semilla y devuelve las preguntas SIN la
 * respuesta. El reloj empieza a contar aquí, en el servidor.
 */
export async function empiezaPsico(input: unknown): Promise<{ success: true; sesion: SesionPsico } | { success: false; error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const modulo = await requireModule('psico', auth.user.organizationId);
  if (!modulo.ok) return { success: false as const, error: modulo.error };
  const organizationId = auth.user.organizationId;
  if (!organizationId) return { success: false as const, error: 'No hemos encontrado tu academia.' };

  const d = (input ?? {}) as { tipos?: unknown; total?: unknown };
  const tipos = tiposValidos(d.tipos);
  const total = (TAMANOS_PSICO as readonly number[]).includes(Number(d.total)) ? Number(d.total) : TAMANOS_PSICO[0];
  const minutos = MINUTOS_PSICO[total];
  const seed = randomInt(1, 2 ** 31 - 1);

  const { data, error } = await supabaseAdmin
    .from('psico_sessions')
    .insert({ user_id: auth.user.id, organization_id: organizationId, seed, version: VERSION_PSICO, kinds: tipos, total, minutes: minutos })
    .select('id')
    .single();
  if (error || !data) {
    fallo('empiezaPsico', error ?? { message: 'sin fila' });
    return { success: false as const, error: FALTA_GUION };
  }

  return {
    success: true as const,
    sesion: { id: data.id as string, minutos, preguntas: generaSesion(seed, tipos, total).map(aPublica) },
  };
}

export type RevisionPsico = (PreguntaPsico & { marcada: number })[];

/**
 * Entrega: el servidor vuelve a generar la sesión con SU semilla y corrige. Lo
 * que manda el navegador es solo qué opción marcó en cada pregunta.
 *
 * Una sesión se entrega una vez (`finished_at is null` va en la escritura): un
 * doble toque no la corrige dos veces ni la deja reescribir.
 */
export async function entregaPsico(input: unknown): Promise<
  { success: true; resultado: ResultadoPsico; revision: RevisionPsico; duracionMs: number } | { success: false; error: string }
> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const modulo = await requireModule('psico', auth.user.organizationId);
  if (!modulo.ok) return { success: false as const, error: modulo.error };

  const d = (input ?? {}) as { id?: unknown; respuestas?: unknown };
  if (typeof d.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(d.id)) return { success: false as const, error: 'Datos no válidos.' };

  const { data: fila, error: leer } = await supabaseAdmin
    .from('psico_sessions')
    .select('id, seed, version, kinds, total, minutes, started_at, finished_at')
    .eq('id', d.id)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (leer) return { success: false as const, error: fallo('entregaPsico', leer) };
  if (!fila) return { success: false as const, error: 'Esa sesión no existe.' };
  if (fila.finished_at) return { success: false as const, error: 'Esa sesión ya estaba entregada.' };
  if (fila.version !== VERSION_PSICO) {
    return { success: false as const, error: 'La aplicación se ha actualizado mientras hacías esta sesión y ya no se puede corregir. Empieza otra.' };
  }

  const total = fila.total as number;
  const preguntas = generaSesion(Number(fila.seed), tiposValidos(fila.kinds) as TipoPsico[], total);
  const respuestas = Array.from({ length: total }, (_, i) => normalizaRespuesta(Array.isArray(d.respuestas) ? d.respuestas[i] : -1));
  const resultado = corrigeSesion(preguntas, respuestas);

  // La duración sale del reloj del servidor (regla 14), con tope en lo que duraba la sesión.
  const tope = (fila.minutes as number) * 60_000;
  const duracionMs = Math.max(0, Math.min(tope, Date.now() - new Date(fila.started_at as string).getTime()));

  const { data: escrita, error } = await supabaseAdmin
    .from('psico_sessions')
    .update({
      finished_at: new Date().toISOString(),
      correct: resultado.aciertos,
      wrong: resultado.fallos,
      blank: resultado.blancos,
      duration_ms: duracionMs,
      by_kind: resultado.porTipo,
      answers: respuestas,
    })
    .eq('id', d.id)
    .eq('user_id', auth.user.id)
    .is('finished_at', null)
    .select('id');
  if (error) return { success: false as const, error: fallo('entregaPsico', error) };
  if (!escrita?.length) return { success: false as const, error: 'Esa sesión ya estaba entregada.' };

  return {
    success: true as const,
    resultado,
    revision: preguntas.map((q, i) => ({ ...q, marcada: respuestas[i] })),
    duracionMs,
  };
}

export type SesionPsicoHecha = {
  id: string;
  fecha: string;
  total: number;
  aciertos: number;
  fallos: number;
  blancos: number;
  duracionMs: number;
  tipos: TipoPsico[];
  porTipo: ResultadoPsico['porTipo'];
};

/** Las últimas sesiones entregadas del alumno, de la más nueva a la más vieja. */
export async function getMisPsico(): Promise<{ success: true; sesiones: SesionPsicoHecha[] } | { success: false; error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const modulo = await requireModule('psico', auth.user.organizationId);
  if (!modulo.ok) return { success: false as const, error: modulo.error };

  const { data, error } = await supabaseAdmin
    .from('psico_sessions')
    .select('id, finished_at, total, correct, wrong, blank, duration_ms, kinds, by_kind')
    .eq('user_id', auth.user.id)
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(40);
  if (error) {
    // Sin la tabla todavía, el módulo se abre igual: simplemente no hay historial.
    fallo('getMisPsico', error);
    return { success: true as const, sesiones: [] };
  }

  return {
    success: true as const,
    sesiones: (data ?? []).map((f) => ({
      id: f.id as string,
      fecha: f.finished_at as string,
      total: f.total as number,
      aciertos: (f.correct as number) ?? 0,
      fallos: (f.wrong as number) ?? 0,
      blancos: (f.blank as number) ?? 0,
      duracionMs: (f.duration_ms as number) ?? 0,
      tipos: tiposValidos(f.kinds),
      porTipo: (f.by_kind as ResultadoPsico['porTipo']) ?? {},
    })),
  };
}

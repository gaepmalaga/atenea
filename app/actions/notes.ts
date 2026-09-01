'use server'

import { requireUser } from '../lib/auth';
import { createSupabaseServerClient } from '../lib/supabase/server';
import { MAX_NOTE_CHARS, normalizeNote } from '../lib/notes';

/**
 * Las notas que el alumno escribe sobre una pregunta (P3.8).
 *
 * POR QUE EXISTEN
 * Un opositor que falla una pregunta y entiende por que quiere dejarse un
 * aviso para la proxima: "ojo, aqui confundo prescripcion con caducidad".
 * Hasta ahora no tenia donde: la plataforma guardaba su respuesta y el tipo de
 * error, pero ni una palabra suya.
 *
 * SON PRIVADAS, y eso decide donde viven. No van en `question_bank`, que es
 * contenido compartido por todos los alumnos, sino en `question_notes`, con el
 * par (usuario, pregunta) y RLS de propietario.
 *
 * Ninguna de estas acciones acepta un identificador de usuario: sale de la
 * cookie de sesion (regla 1). Es especialmente importante aqui, porque el
 * parametro obvio —"dame la nota de este usuario para esta pregunta"— seria
 * exactamente el fallo original del proyecto.
 *
 * Y NO USAN LA CLAVE DE SERVICIO (fase 1.2). Van con el cliente de la sesion,
 * asi que la politica `question_notes_propietario` se aplica de verdad: aunque
 * alguien se dejara el `.eq('user_id', …)`, Postgres no devolveria la nota de
 * otro. Antes ese filtro era la unica barrera, porque la clave de servicio
 * salta RLS.
 */

type NoteResult = { success: boolean; error?: string };

export async function getQuestionNote(
  questionId: string
): Promise<{ success: boolean; note: string | null; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, note: null, error: auth.error };
  if (!questionId) return { success: true, note: null };

  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from('question_notes')
    .select('note')
    .eq('user_id', auth.user.id)
    .eq('question_id', questionId)
    .maybeSingle();

  // El error NO se traga: sin esto la pantalla diria "no tienes nota", que es
  // indistinguible de haberla perdido (regla 4).
  if (error) {
    console.error('getQuestionNote:', error.message);
    return { success: false, note: null, error: error.message };
  }

  return { success: true, note: data?.note ?? null };
}

/**
 * Guarda la nota, o la borra si se queda vacia.
 *
 * Vaciar el recuadro y guardar significa "ya no la quiero", y la alternativa
 * —una fila con la cadena vacia— dejaria al alumno con un apunte en blanco
 * colgando de la pregunta para siempre. Ademas `note` es NOT NULL en la tabla.
 *
 * Se apoya en la restriccion unica `(user_id, question_id)`: por eso puede ser
 * un upsert y no hace falta leer antes para saber si actualizar o insertar.
 */
export async function saveQuestionNote(input: unknown): Promise<NoteResult & { deleted?: boolean }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };

  const d = (input ?? {}) as { questionId?: unknown; note?: unknown };
  const questionId = typeof d.questionId === 'string' ? d.questionId : '';
  if (!questionId) return { success: false, error: 'Falta la pregunta.' };

  const note = normalizeNote(d.note);

  const db = await createSupabaseServerClient();

  if (note === '') {
    const { error } = await db
      .from('question_notes')
      .delete()
      .eq('user_id', auth.user.id)
      .eq('question_id', questionId);
    return { success: !error, error: error?.message, deleted: true };
  }

  if (note.length > MAX_NOTE_CHARS) {
    return { success: false, error: `La nota no puede pasar de ${MAX_NOTE_CHARS} caracteres.` };
  }

  const { error } = await db.from('question_notes').upsert(
    {
      // El usuario sale de la sesion y va PRIMERO, sin expandir nada del
      // cliente encima (regla 2). Con RLS ademas es obligatorio: el
      // `with check` de la politica rechaza la fila si no coincide.
      user_id: auth.user.id,
      question_id: questionId,
      note,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,question_id' }
  );

  return { success: !error, error: error?.message };
}

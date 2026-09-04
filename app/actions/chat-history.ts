'use server'
import { requireUser } from '../lib/auth';
import { requireModule } from '../lib/module-guard';
import { createSupabaseServerClient } from '../lib/supabase/server';
import { tituloDeConversacion, type ChatTurn } from '../lib/chat';

/**
 * EL HISTORIAL DEL CHAT.
 *
 * Hasta ahora la conversación vivía solo en el `sessionStorage` del navegador:
 * se borraba al cerrar la pestaña y no llegaba nunca a la base de datos. Un
 * alumno que hacía una buena pregunta el martes no podía releer la respuesta
 * el jueves.
 *
 * LA IDEA QUE SOSTIENE TODO ESTO: guardar y usar como contexto son DOS COSAS
 * DISTINTAS. Guardar es casi gratis; lo que cuesta dinero es meter el
 * historial en el prompt. Así que se guarda todo y se le manda al modelo muy
 * poco — como mucho los últimos 6 turnos, y eso lo impone `trimHistory` en el
 * servidor, no el cliente.
 *
 * Y UNA CONVERSACIÓN CERRADA NO ES CONTEXTO DE NADA. Se puede releer, pero no
 * viaja al modelo. Eso es lo que hace que tener historial entero no encarezca
 * ni una pregunta.
 *
 * TODO VA CON EL CLIENTE DE LA SESIÓN, no con `supabaseAdmin` (regla 34):
 * estas tablas tienen política de propietario, así que es Postgres quien
 * impone que un alumno solo vea lo suyo, en vez de que dependa de acordarse de
 * escribir `.eq('user_id', …)`. Con la clave de servicio, RLS no protegería
 * nada.
 */

export type ConversacionResumen = {
  id: string;
  title: string;
  subjectId: number | null;
  /** `null` = abierta. Una cerrada se lee pero no aporta contexto. */
  closedAt: string | null;
  updatedAt: string;
};

export type MensajeGuardado = {
  id: string;
  role: 'user' | 'ai';
  content: string;
  createdAt: string;
};

/** Las conversaciones del alumno, la más reciente primero. */
export async function listConversations(limite = 30) {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const modulo = await requireModule('chat');
  if (!modulo.ok) return { success: false as const, error: modulo.error };

  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from('chat_conversations')
    .select('id, title, subject_id, closed_at, updated_at')
    .eq('user_id', auth.user.id)
    .order('updated_at', { ascending: false })
    .limit(Math.max(1, Math.min(100, limite)));

  if (error) return { success: false as const, error: error.message };

  const conversaciones: ConversacionResumen[] = (data ?? []).map((c) => ({
    id: c.id as string,
    title: (c.title as string) ?? 'Consulta',
    subjectId: (c.subject_id as number | null) ?? null,
    closedAt: (c.closed_at as string | null) ?? null,
    updatedAt: c.updated_at as string,
  }));

  return { success: true as const, conversaciones };
}

/** Los mensajes de una conversación, en orden. */
export async function getConversation(conversationId: string) {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const db = await createSupabaseServerClient();
  // El `.eq('user_id', …)` es redundante con la política de propietario y va
  // igual: es la misma cinturón-y-tirantes que en `question_notes`, y no
  // cuesta nada.
  const { data, error } = await db
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: true });

  if (error) return { success: false as const, error: error.message };

  const mensajes: MensajeGuardado[] = (data ?? []).map((m) => ({
    id: m.id as string,
    role: m.role as 'user' | 'ai',
    content: m.content as string,
    createdAt: m.created_at as string,
  }));

  return { success: true as const, mensajes };
}

/**
 * Guarda un turno completo: lo que preguntó el alumno y lo que respondió.
 *
 * Crea la conversación si no venía ninguna, y le pone de título la primera
 * pregunta recortada. Devolver el id es lo que permite que el cliente siga
 * escribiendo en la misma conversación sin tener que pedirla otra vez.
 *
 * Los dos mensajes van en UN SOLO insert: en dos, una caída entre medias
 * dejaría una pregunta sin respuesta guardada, y al releerla parecería que
 * Atenea no contestó.
 */
export async function appendTurn(params: {
  conversationId: string | null;
  subjectId: number | null;
  pregunta: string;
  respuesta: string;
  sources?: unknown;
}) {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const modulo = await requireModule('chat');
  if (!modulo.ok) return { success: false as const, error: modulo.error };

  const db = await createSupabaseServerClient();
  const userId = auth.user.id;
  const ahora = new Date().toISOString();

  let conversationId = params.conversationId;

  if (!conversationId) {
    const { data, error } = await db
      .from('chat_conversations')
      .insert({
        user_id: userId,
        title: tituloDeConversacion(params.pregunta),
        subject_id: params.subjectId,
        created_at: ahora,
        updated_at: ahora,
      })
      .select('id')
      .single();
    if (error || !data) return { success: false as const, error: error?.message ?? 'No se pudo abrir la conversación.' };
    conversationId = data.id as string;
  }

  const { error } = await db.from('chat_messages').insert([
    { conversation_id: conversationId, user_id: userId, role: 'user', content: params.pregunta, created_at: ahora },
    {
      conversation_id: conversationId,
      user_id: userId,
      role: 'ai',
      content: params.respuesta,
      sources: params.sources ?? null,
      // Un milisegundo después para que el orden por fecha nunca los cruce:
      // dos filas con el mismo `created_at` pueden salir al revés y la
      // conversación se leería con la respuesta antes de la pregunta.
      created_at: new Date(Date.parse(ahora) + 1).toISOString(),
    },
  ]);
  if (error) return { success: false as const, error: error.message };

  // `updated_at` es por lo que se ordena la lista: sin tocarlo, una
  // conversación activa se hunde por debajo de otra que nadie usa.
  await db.from('chat_conversations').update({ updated_at: ahora }).eq('id', conversationId).eq('user_id', userId);

  return { success: true as const, conversationId };
}

/**
 * Cierra una conversación: se sigue pudiendo leer, pero deja de ser contexto.
 *
 * No borra nada. Es la operación que hace que guardar todo el historial no
 * cueste dinero — lo caro nunca fue guardar, fue mandarlo al modelo.
 */
export async function closeConversation(conversationId: string) {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const db = await createSupabaseServerClient();
  const { error } = await db
    .from('chat_conversations')
    .update({ closed_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('user_id', auth.user.id);

  return error ? { success: false as const, error: error.message } : { success: true as const };
}

/** Borra una conversación y sus mensajes (la clave ajena va en cascada). */
export async function deleteConversation(conversationId: string) {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const db = await createSupabaseServerClient();
  const { error } = await db
    .from('chat_conversations')
    .delete()
    .eq('id', conversationId)
    .eq('user_id', auth.user.id);

  return error ? { success: false as const, error: error.message } : { success: true as const };
}

/**
 * El contexto que se le manda al modelo de una conversación ABIERTA.
 *
 * Es la pieza que evita romper la regla 11 al guardar el historial. Si «el
 * historial no es contexto» se aplicara también a la conversación abierta,
 * volvería el fallo que costó arreglar: «¿y qué plazo aplica en ese caso?» no
 * recuperaba NADA del temario porque el buscador no sabía de qué se hablaba.
 *
 * Una conversación CERRADA devuelve vacío: se lee, no se paga.
 */
export async function contextoDeConversacion(conversationId: string) {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const db = await createSupabaseServerClient();
  const { data: conv, error: errorConv } = await db
    .from('chat_conversations')
    .select('closed_at')
    .eq('id', conversationId)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (errorConv) return { success: false as const, error: errorConv.message };
  if (!conv) return { success: true as const, turnos: [] as ChatTurn[] };
  if (conv.closed_at) return { success: true as const, turnos: [] as ChatTurn[] };

  const { data, error } = await db
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    // Se piden más de los que caben y `trimHistory` recorta: pedir justo el
    // límite y que el cliente no recorte dejaría el número real a merced de
    // dos sitios distintos.
    .limit(12);

  if (error) return { success: false as const, error: error.message };

  const turnos: ChatTurn[] = (data ?? [])
    .reverse()
    .map((m) => ({ role: m.role as 'user' | 'ai', content: m.content as string }));

  return { success: true as const, turnos };
}

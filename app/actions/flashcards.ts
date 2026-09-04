'use server'
import { supabaseAdmin as supabase, flashcardModel, getSubjectIdByName, getSubjectNameById } from './core';
import { parseAIJson, validateFlashcard, randomContextWindow } from '../lib/ai-output';
import { buildFlashcardPrompt } from '../lib/flashcard-prompt';
import { flashcardHash } from '../lib/question-hash';
import { QUESTION_STATUS } from '../lib/questions';
import { scheduleCard, nextReviewDate } from '../lib/srs';
import { requireAdmin, requireUser } from '../lib/auth';
import { checkQuota } from '../lib/rate-limit';
import { requireModule } from '../lib/module-guard';
import { createSupabaseServerClient } from '../lib/supabase/server';

/** Tarjeta que devuelve la UI al puntuarla. */
export type FlashcardInput = {
  /**
   * La ficha del banco de la que sale este repaso.
   *
   * Es lo que permite saber que tarjetas del banco ha visto ya el alumno para
   * poder servirle la siguiente. La columna existia en `flashcard_progress`
   * desde el principio y NO SE ESCRIBIA NUNCA; sin ella, el banco compartido
   * no puede funcionar. Sigue siendo opcional porque las filas anteriores a
   * esto no la tienen.
   */
  card_id?: string | null;
    /** Id de la fila de `flashcard_progress` si es un repaso. */
    db_id?: string | null;
    front: string;
    back: string;
    topic: string;
    subjectId?: number | null;
    box?: number | null;
};

function errorMessage(e: unknown, fallback = 'Error desconocido'): string {
    return e instanceof Error ? e.message : fallback;
}

export async function generateFlashcard(topicNameOrId: string | number) {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const db = await createSupabaseServerClient();
  const userId = auth.user.id;

  const modulo = await requireModule('cards');
  if (!modulo.ok) return { success: false as const, error: modulo.error };

  const quota = await checkQuota(userId, 'flashcard');
  if (!quota.ok) return { success: false as const, error: quota.error };

  try {
    let subjectId: number;
    let topicName: string = "";

    if (typeof topicNameOrId === 'number') {
        subjectId = topicNameOrId;
        // El titulo de verdad, no `Tema N`: es lo que se guarda en la columna
        // `topic` y con lo que se buscan despues las tarjetas pendientes.
        topicName = await getSubjectNameById(subjectId);
    } else {
        subjectId = await getSubjectIdByName(topicNameOrId);
        topicName = topicNameOrId;
    }

    // `flashcard_progress` identifica el tema por `topic`, no por `subject_id`:
    // esa columna no existe en la tabla. Quien si la tiene es `flashcard_results`.
    const { data: due } = await db.from('flashcard_progress')
        .select('*')
        .eq('user_id', userId)
        .eq('topic', topicName)
        .lte('next_review', new Date().toISOString())
        .limit(1);

    if (due && due.length > 0) {
        const card = due[0];
        // Se normaliza a camelCase antes de devolverla para que el guardado no
        // tenga que resolver el tema por su nombre en cada repaso. El id no
        // viene en la fila (la tabla no lo guarda): se arrastra el ya resuelto.
        return {
            success: true as const,
            data: {
                db_id: card.id,
                card_id: card.card_id ?? null,
                front: card.front,
                back: card.back,
                topic: card.topic ?? topicName,
                subjectId,
                box: card.box ?? 1,
                isReview: true,
            },
        };
    }

    // NO SE GENERA NADA AQUI. La ficha sale del BANCO COMPARTIDO.
    //
    // Antes, cuando el alumno no tenia ninguna tarjeta que repasar, esta
    // accion le pedia una nueva a Gemini: una llamada de pago por tarjeta,
    // decidida por quien no paga la factura, y una tarjeta distinta para cada
    // alumno del mismo tema. Ahora las escribe el administrador una vez
    // (`npm run sembrar -- --fichas`) y las repasan todos.
    //
    // El esquema ya estaba preparado para esto desde el principio y nadie lo
    // habia usado: `flashcard_bank` existia con `card_hash` y `status`, y
    // `flashcard_progress` tenia una columna `card_id` que NO SE ESCRIBIA
    // NUNCA. Sin ella no habia forma de saber que tarjetas del banco ya ha
    // visto un alumno, que es justo lo que hace falta para servir la
    // siguiente.
    //
    // Se lee con la clave de servicio: `flashcard_bank` es contenido
    // compartido y tiene RLS sin politicas, asi que con la sesion del alumno
    // devolveria cero filas en silencio (regla 34).
    const { data: vistas } = await db.from('flashcard_progress')
        .select('card_id')
        .eq('user_id', userId)
        .eq('topic', topicName)
        .not('card_id', 'is', null);

    const yaVistas = (vistas ?? []).map(v => v.card_id).filter(Boolean);

    let consulta = supabase.from('flashcard_bank')
        .select('id, front, back, topic')
        .eq('topic', topicName)
        .eq('status', 'active')
        .limit(1);
    if (yaVistas.length > 0) consulta = consulta.not('id', 'in', `(${yaVistas.join(',')})`);

    const { data: nuevas, error: errorBanco } = await consulta;
    if (errorBanco) return { success: false as const, error: errorBanco.message };

    if (!nuevas || nuevas.length === 0) {
        // Se distinguen los dos casos, porque piden cosas distintas del
        // alumno: si no hay NINGUNA ficha del tema, falta sembrar; si las ha
        // visto todas, es que va bien y le toca esperar al repaso.
        const { count } = await supabase.from('flashcard_bank')
            .select('id', { count: 'exact', head: true })
            .eq('topic', topicName).eq('status', 'active');

        return {
            success: false as const,
            error: (count ?? 0) === 0
                ? 'Este tema todavía no tiene fichas. Avisa a tu academia para que las añada.'
                : 'Ya has visto todas las fichas de este tema. Vuelve cuando toque repasarlas.',
        };
    }

    const ficha = nuevas[0];
    return {
        success: true as const,
        data: {
            card_id: ficha.id,
            front: ficha.front,
            back: ficha.back,
            topic: ficha.topic ?? topicName,
            subjectId,
            isReview: false,
        },
    };

  } catch (e) { return { success: false, error: errorMessage(e) }; }
}

export async function saveFlashcardProgress(cardData: FlashcardInput, rating: 'fail' | 'hard' | 'easy') {
    const auth = await requireUser();
    if (!auth.ok) return { success: false, error: auth.error };
    const db = await createSupabaseServerClient();
    const userId = auth.user.id;

    try {
        const boxBefore = cardData.box ?? 1;
        const { box: newBox, days } = scheduleCard(boxBefore, rating);
        const nextDate = nextReviewDate(new Date(), days);
        const subjectId = cardData.subjectId ?? await getSubjectIdByName(cardData.topic);

        // Sin `subject_id`: la tabla no tiene esa columna y PostgREST rechazaba
        // la escritura entera con
        //   Could not find the 'subject_id' column of 'flashcard_progress'
        // El tema viaja en `topic`. `subjectId` se sigue calculando porque
        // `flashcard_results`, que es otra tabla, si lo guarda.
        const payload = {
            user_id: userId,
            card_id: cardData.card_id ?? null,
            front: cardData.front,
            back: cardData.back,
            box: newBox,
            next_review: nextDate,
            topic: cardData.topic
        };

        const { error } = cardData.db_id
            ? await db.from('flashcard_progress').update(payload).eq('id', cardData.db_id).eq('user_id', userId)
            : await db.from('flashcard_progress').insert(payload);

        // Antes no se comprobaba: la UI pasaba a la tarjeta siguiente dando por
        // buena una escritura que podía haber fallado.
        if (error) {
            console.error('saveFlashcardProgress:', error.message);
            return { success: false, error: error.message };
        }

        // Histórico para la analítica. La tabla `flashcard_results` existía y
        // NADIE escribía en ella: `saveFlashcardResult` estaba exportada y sin
        // un solo consumidor. Va en el mismo paso para no exigir dos llamadas
        // desde el cliente.
        await recordFlashcardResult({
            userId, subjectId, topic: cardData.topic,
            front: cardData.front, back: cardData.back,
            grade: rating, boxBefore, boxAfter: newBox,
            nextReview: nextDate.toISOString(),
        });

        return { success: true, box: newBox, nextReview: nextDate.toISOString() };
    } catch (e) { return { success: false, error: errorMessage(e) }; }
}

/**
 * Apunta el repaso en el historico de analitica.
 *
 * Es best-effort a proposito: si la tabla no existe o falla la insercion, el
 * progreso del alumno ya esta guardado y no tiene sentido tumbar la sesion de
 * repaso por no poder escribir una fila de estadisticas.
 */
async function recordFlashcardResult(entry: {
    userId: string;
    subjectId: number;
    topic: string;
    front: string;
    back: string;
    grade: string;
    boxBefore: number;
    boxAfter: number;
    nextReview: string;
}) {
    // Su propio cliente de sesion: es un ayudante privado y no ve el de quien
    // lo llama. Crear el cliente solo lee las cookies, no abre nada.
    const db = await createSupabaseServerClient();

    const { error } = await db.from('flashcard_results').insert({
        user_id: entry.userId,
        subject_id: entry.subjectId,
        topic: entry.topic,
        front: entry.front,
        back: entry.back,
        grade: entry.grade,
        box_before: entry.boxBefore,
        box_after: entry.boxAfter,
        next_review: entry.nextReview,
    });
    if (error) console.error('flashcard_results (no bloqueante):', error.message);
}


// ==========================================
// SEMBRAR EL BANCO DE FICHAS (SOLO ADMIN)
// ==========================================

/** Tope por lote. Cada ficha es una llamada de pago a Gemini. */
const MAX_FICHAS_LOTE = 100;

/**
 * Escribe N fichas de un tema en `flashcard_bank`.
 *
 * Es el gemelo de `seedQuestionBank`, y existe por lo mismo: desde que las
 * fichas salen de un banco compartido, alguien tiene que llenarlo. El guion
 * `npm run sembrar -- --solo-fichas` hace lo mismo desde la terminal; esto lo
 * pone al alcance de quien lleva la academia sin pedirle una consola.
 *
 * Va con la clave de servicio a propósito: `flashcard_bank` es contenido
 * compartido, tiene RLS y CERO políticas, así que con el cliente de la sesión
 * devolvería cero filas en silencio (regla 34). Lo que lo protege es
 * `requireAdmin`.
 */
export async function seedFlashcardBank(params: {
  subjectId: number;
  topic: string;
  count: number;
}) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const modulo = await requireModule('cards');
  if (!modulo.ok) return { success: false as const, error: modulo.error };

  // El tope se aplica ANTES de la cuota: pedir 5.000 fichas por un cero de más
  // no puede llegar siquiera a intentarse.
  const pedidas = Math.max(1, Math.min(MAX_FICHAS_LOTE, Math.floor(params.count) || 0));

  const quota = await checkQuota(auth.user.id, 'seed');
  if (!quota.ok) return { success: false as const, error: quota.error };

  const { data: docs } = await supabase
    .from('documents').select('full_text').eq('subject_id', params.subjectId).limit(5);
  if (!docs || docs.length === 0) {
    return { success: false as const, error: 'Ese tema no tiene documentos indexados todavía.' };
  }

  // Los anversos que ya existen viajan al prompt para que no vuelva a escribir
  // lo mismo. La huella frena las fichas IDÉNTICAS; esto frena las parecidas,
  // que la huella no ve.
  const { data: previas } = await supabase
    .from('flashcard_bank').select('front').eq('topic', params.topic).limit(30);
  const anversos = (previas ?? []).map((f) => f.front as string);

  let inserted = 0, duplicated = 0, failed = 0;

  // En serie y no en paralelo: son llamadas de pago y cada ficha nueva mejora
  // el prompt de la siguiente (se le pasa el anverso recién escrito para que
  // no repita). En paralelo, las N saldrían todas del mismo punto de partida.
  for (let i = 0; i < pedidas; i++) {
    const doc = docs[Math.floor(Math.random() * docs.length)];
    const fragmento = randomContextWindow(doc.full_text ?? '', 2500);
    if (fragmento.trim().length < 200) { failed++; continue; }

    try {
      const r = await flashcardModel.generateContent(buildFlashcardPrompt(fragmento, anversos));
      const parsed = parseAIJson(r.response.text());
      const check = validateFlashcard(parsed);
      if (!check.ok) { failed++; continue; }

      const { data: fila, error } = await supabase
        .from('flashcard_bank')
        .upsert(
          {
            topic: params.topic,
            front: check.value.front,
            back: check.value.back,
            card_hash: flashcardHash(params.topic, check.value.front, check.value.back),
            status: QUESTION_STATUS.ACTIVE,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'card_hash', ignoreDuplicates: true },
        )
        .select()
        .maybeSingle();

      if (error) failed++;
      else if (fila) { inserted++; anversos.push(check.value.front); }
      else duplicated++;
    } catch { failed++; }
  }

  return { success: true as const, inserted, duplicated, failed, requested: pedidas };
}

/** Cuántas fichas hay por tema. Para que el panel no siembre a ciegas. */
export async function getFlashcardBankCounts() {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const { data, error } = await supabase
    .from('flashcard_bank').select('topic').eq('status', QUESTION_STATUS.ACTIVE);
  if (error) return { success: false as const, error: error.message };

  const porTema: Record<string, number> = {};
  for (const f of data ?? []) {
    const t = (f.topic as string) ?? '';
    porTema[t] = (porTema[t] ?? 0) + 1;
  }
  return { success: true as const, porTema };
}

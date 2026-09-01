'use server'
import { supabaseAdmin as supabase, flashcardModel, getSubjectIdByName, getSubjectNameById } from './core';
import { parseAIJson, validateFlashcard, randomContextWindow } from '../lib/ai-output';
import { scheduleCard, nextReviewDate } from '../lib/srs';
import { requireUser } from '../lib/auth';
import { checkQuota } from '../lib/rate-limit';
import { requireModule } from '../lib/module-guard';
import { createSupabaseServerClient } from '../lib/supabase/server';

/** Tarjeta que devuelve la UI al puntuarla. */
export type FlashcardInput = {
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
                front: card.front,
                back: card.back,
                topic: card.topic ?? topicName,
                subjectId,
                box: card.box ?? 1,
                isReview: true,
            },
        };
    }

    const { data: docs } = await supabase.from('documents')
        .select('full_text').eq('subject_id', subjectId).limit(5);
    
    if (!docs || docs.length === 0) return { success: false, error: "Tema vacío." };

    const doc = docs[Math.floor(Math.random() * docs.length)];
    // Ventana ALEATORIA del documento. Antes era siempre `substring(0, 2500)`:
    // los mismos 2500 primeros caracteres del mismo tema una y otra vez, así que
    // repasar producía tarjetas prácticamente idénticas.
    const textSlice = randomContextWindow(doc.full_text ?? '', 2500);
    if (textSlice.trim().length < 200) return { success: false as const, error: "Texto insuficiente en el tema." };

    const prompt = `
      Genera UNA flashcard de estudio a partir de este fragmento de temario.
      El anverso es una pregunta breve o un concepto; el reverso, el dato exacto.
      No repitas el enunciado en la respuesta.

      FRAGMENTO: """${textSlice}"""
    `;

    const result = await flashcardModel.generateContent(prompt);
    const parsed = parseAIJson(result.response.text());
    if (!parsed) return { success: false as const, error: "La IA no devolvió un JSON legible." };

    const check = validateFlashcard(parsed);
    if (!check.ok) {
      console.error("Flashcard descartada:", check.reason);
      return { success: false as const, error: `Tarjeta descartada: ${check.reason}` };
    }

    return { success: true as const, data: { ...check.value, subjectId, topic: topicName, isReview: false } };

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

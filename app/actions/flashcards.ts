'use server'
import { supabaseAdmin as supabase, flashcardModel, getSubjectIdByName } from './core';
import { parseAIJson, validateFlashcard, randomContextWindow } from '../lib/ai-output';
import { scheduleCard, nextReviewDate } from '../lib/srs';
import { requireUser } from '../lib/auth';

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
  const userId = auth.user.id;

  try {
    let subjectId: number;
    let topicName: string = "";

    if (typeof topicNameOrId === 'number') {
        subjectId = topicNameOrId;
        topicName = `Tema ${subjectId}`; 
    } else {
        subjectId = await getSubjectIdByName(topicNameOrId);
        topicName = topicNameOrId;
    }

    const { data: due } = await supabase.from('flashcard_progress')
        .select('*')
        .eq('user_id', userId)
        .eq('subject_id', subjectId)
        .lte('next_review', new Date().toISOString())
        .limit(1);

    if (due && due.length > 0) return { success: true, data: { ...due[0], db_id: due[0].id, isReview: true } };

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
    const userId = auth.user.id;

    try {
        const { box: newBox, days } = scheduleCard(cardData.box ?? undefined, rating);
        const nextDate = nextReviewDate(new Date(), days);

        const payload = {
            user_id: userId,
            subject_id: cardData.subjectId ?? await getSubjectIdByName(cardData.topic),
            front: cardData.front,
            back: cardData.back,
            box: newBox,
            next_review: nextDate,
            topic: cardData.topic 
        };

        if (cardData.db_id) {
             await supabase.from('flashcard_progress').update(payload).eq('id', cardData.db_id);
        } else {
             await supabase.from('flashcard_progress').insert(payload);
        }
        return { success: true };
    } catch (e) { return { success: false, error: errorMessage(e) }; }
}

// Faltaba el guardado de histórico (analytics)
export async function saveFlashcardResult(
  topic: string, front: string, back: string, grade: string,
  boxBefore?: number, boxAfter?: number, nextReview?: string
) {
  const auth = await requireUser();
  if (!auth.ok) return { success: false };
  const userId = auth.user.id;

  const subjectId = await getSubjectIdByName(topic);
  const { error } = await supabase.from('flashcard_results').insert({
    user_id: userId, subject_id: subjectId, topic, front, back, grade,
    box_before: boxBefore, box_after: boxAfter, next_review: nextReview
  });
  return { success: !error };
}
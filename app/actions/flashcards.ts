'use server'
import { supabaseAdmin as supabase, chatModel, cleanAIResponse, getSubjectIdByName } from './core';
import { scheduleCard, nextReviewDate } from '../lib/srs';
import { requireUser } from '../lib/auth';

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
    const textSlice = doc.full_text?.substring(0, 2500) || "";
    
    const prompt = `Genera Flashcard (Front/Back) dato puro: ${textSlice}. JSON: { "front": "...", "back": "..."}`;
    const result = await chatModel.generateContent(prompt);
    const jsonData = JSON.parse(cleanAIResponse(result.response.text()));
    
    return { success: true, data: { ...jsonData, subjectId, topic: topicName, isReview: false } };
  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function saveFlashcardProgress(cardData: any, rating: 'fail' | 'hard' | 'easy') {
    const auth = await requireUser();
    if (!auth.ok) return { success: false, error: auth.error };
    const userId = auth.user.id;

    try {
        const { box: newBox, days } = scheduleCard(cardData.box, rating);
        const nextDate = nextReviewDate(new Date(), days);

        const payload = {
            user_id: userId,
            subject_id: cardData.subjectId || await getSubjectIdByName(cardData.topic),
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
    } catch (e: any) { return { success: false, error: e.message }; }
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
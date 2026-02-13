'use server'
import { supabaseAdmin as supabase, chatModel, cleanAIResponse, getSubjectIdByName } from './core';

export async function generateFlashcard(userId: string, topicNameOrId: string | number) {
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

export async function saveFlashcardProgress(userId: string, cardData: any, rating: 'fail' | 'hard' | 'easy') {
    try {
        let newBox = cardData.box || 1;
        let days = 0;
        if (rating === 'fail') { newBox = 1; days = 1; }
        else if (rating === 'hard') { days = 3; }
        else { 
            newBox = Math.min(newBox + 1, 5); 
            days = newBox === 2 ? 3 : newBox === 3 ? 7 : newBox === 4 ? 15 : 30; 
        }

        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + days);

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
  userId: string, topic: string, front: string, back: string, grade: string,
  boxBefore?: number, boxAfter?: number, nextReview?: string
) {
  const subjectId = await getSubjectIdByName(topic);
  const { error } = await supabase.from('flashcard_results').insert({
    user_id: userId, subject_id: subjectId, topic, front, back, grade,
    box_before: boxBefore, box_after: boxAfter, next_review: nextReview
  });
  return { success: !error };
}
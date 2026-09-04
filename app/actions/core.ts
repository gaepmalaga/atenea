// app/actions/core.ts
import 'server-only'; 

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { QUESTION_SCHEMA } from '../lib/question-prompt';

// --- CONFIGURACIÓN BLINDADA ---
const API_KEY = process.env.GEMINI_API_KEY;
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SB_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!API_KEY || !SB_URL || !SB_SERVICE_KEY || !SB_ANON_KEY) {
  throw new Error("❌ ERROR CRÍTICO: Faltan claves en .env");
}

// --- CLIENTES IA ---
export const genAI = new GoogleGenerativeAI(API_KEY);

const TEXT_MODEL = "gemini-2.5-flash";

export const chatModel = genAI.getGenerativeModel({ model: TEXT_MODEL });
export const smartModel = genAI.getGenerativeModel({ model: TEXT_MODEL });

// --- MODELOS EN MODO JSON ---
// Con `responseSchema` el modelo no puede devolver otra forma: se acabaron las
// vallas de markdown, el texto de cortesía por delante y las comas colgantes que
// el parser tenía que limpiar a base de expresiones regulares.

// El esquema vive en `lib/question-prompt.ts`, junto al prompt: los dos tienen
// que cambiar a la vez, y el script de siembra masiva necesita los dos sin
// poder importar este fichero.
export const questionModel = genAI.getGenerativeModel({
  model: TEXT_MODEL,
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: QUESTION_SCHEMA,
  },
});

export const flashcardModel = genAI.getGenerativeModel({
  model: TEXT_MODEL,
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: {
      type: SchemaType.OBJECT,
      properties: {
        front: { type: SchemaType.STRING },
        back: { type: SchemaType.STRING },
      },
      required: ["front", "back"],
    },
  },
});

export const reportModel = genAI.getGenerativeModel({
  model: TEXT_MODEL,
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: {
      type: SchemaType.OBJECT,
      properties: {
        score: { type: SchemaType.INTEGER },
        veredicto: { type: SchemaType.STRING },
        fortalezas: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        contradicciones: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        recomendaciones: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      },
      required: ["score", "veredicto", "fortalezas", "contradicciones", "recomendaciones"],
    },
  },
});

export const planModel = genAI.getGenerativeModel({
  model: TEXT_MODEL,
  generationConfig: { responseMimeType: "application/json" },
});

// Para embeddings, si 'models/gemini-embedding-001' te funcionó (dio 32 vectores),
// lo dejamos así. Si fallara, probaríamos con 'text-embedding-004'.
export const embeddingModel = genAI.getGenerativeModel({ model: "models/gemini-embedding-001" });

// --- CLIENTES SUPABASE ---
export const supabaseAdmin = createClient(SB_URL, SB_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

// Nota: `supabaseAnon` se elimino al cerrar la Fase 1.1. Lo usaban voteQuestion
// y reportQuestion, que ahora escriben con el id verificado de la sesion. Para
// consultas sujetas a RLS en nombre del usuario, usar
// `createSupabaseServerClient()` de app/lib/supabase/server.ts.

// --- UTILIDADES COMPARTIDAS (SÍNCRONAS) ---
// Viven en app/lib/text.ts (módulo puro y testeado). Se reexportan aquí para
// no romper los imports existentes.
export { cleanLegalText, chunkLegalText } from '../lib/text';

/**
 * El titulo del tema a partir de su id.
 *
 * Hace falta porque no todas las tablas guardan `subject_id`:
 * `flashcard_progress` y `question_attempts` identifican el tema por su
 * TITULO, en la columna `topic`. Sin esto, al entrar por id se guardaba
 * literalmente "Tema 7" y ninguna consulta posterior encontraba nada.
 */
export async function getSubjectNameById(subjectId: number): Promise<string> {
  const { data } = await supabaseAdmin
    .from('subjects')
    .select('title')
    .eq('id', subjectId)
    .limit(1)
    .single();

  return data?.title ?? `Tema ${subjectId}`;
}

export async function getSubjectIdByName(topicName: string): Promise<number> {
  const search = topicName.trim();
  
  const { data } = await supabaseAdmin
    .from('subjects')
    .select('id')
    .ilike('title', `%${search}%`)
    .limit(1)
    .single();
    
  if (data) return data.id;

  const up = search.toUpperCase();
  if (up.includes("CONSTITUCION")) return 2;
  if (up.includes("UNION EUROPEA") || up.includes("UE")) return 4;
  if (up.includes("EXTRANJERIA")) return 10;
  if (up.includes("PENAL")) return 16;
  
  return 1;
}
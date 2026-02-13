// app/actions/core.ts
import 'server-only'; 

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

// ✅ CORRECCIÓN FINAL: Usamos los modelos VIGENTES según tu documentación.
// 'gemini-2.5-flash' es el modelo estable, rápido y potente actual.
export const chatModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
export const smartModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 

// Para embeddings, si 'models/gemini-embedding-001' te funcionó (dio 32 vectores),
// lo dejamos así. Si fallara, probaríamos con 'text-embedding-004'.
export const embeddingModel = genAI.getGenerativeModel({ model: "models/gemini-embedding-001" });

// --- CLIENTES SUPABASE ---
export const supabaseAdmin = createClient(SB_URL, SB_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

export const supabaseAnon = createClient(SB_URL, SB_ANON_KEY);

// --- UTILIDADES COMPARTIDAS (SÍNCRONAS) ---

export function cleanAIResponse(text: string): string {
  if (!text) return "{}";
  let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
      clean = clean.substring(firstBrace, lastBrace + 1);
  }
  return clean.replace(/,\s*\]/g, ']').replace(/,\s*\}/g, '}');
}

export function cleanLegalText(raw: string): string {
  return raw
    .replace(/%[0-9A-F]{2}/g, (match) => { try { return decodeURIComponent(match); } catch { return match; } })
    .replace(/----------------Page \(\d+\) Break----------------/g, '\n')
    .replace(/\n\s*\d+\s*\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[]/g, '')
    .trim();
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
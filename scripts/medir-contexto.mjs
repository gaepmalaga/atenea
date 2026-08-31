/**
 * ¿Cabe el temario entero en el modelo, y responde mejor así?
 *
 * Mide tokens, tiempo y —lo que importa— si acierta.
 */
import { readFileSync } from 'node:fs';
import { GoogleGenerativeAI } from '@google/generative-ai';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()])
);
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const K = env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: K, Authorization: 'Bearer ' + K };

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

const docs = await (await fetch(U + '/rest/v1/documents?select=id,filename,full_text', { headers: h })).json();

console.log('=== TAMAÑO DEL TEMARIO ===');
let total = 0;
for (const d of docs) {
  const txt = d.full_text || '';
  const { totalTokens } = await model.countTokens(txt);
  total += totalTokens;
  console.log(`${String(totalTokens).padStart(7)} tokens  ${String(txt.length).padStart(7)} car.  ${d.filename.slice(0, 55)}`);
}
console.log(`${String(total).padStart(7)} tokens  EL TEMARIO ENTERO`);
console.log(`\nVentana de gemini-2.5-flash: 1.048.576 tokens de entrada.`);
console.log(`El temario entero ocupa el ${((total / 1048576) * 100).toFixed(1)}% de la ventana.`);

// --- Responder con el DOCUMENTO ENTERO --------------------------------------
const ce = docs.find((d) => /BOE-A-1978/.test(d.filename));

const PREGUNTAS = [
  '¿Cuántos artículos tiene la Constitución?',
  '¿Cuántos títulos tiene la Constitución?',
  '¿Qué artículos comprende el Título I?',
  '¿Qué dice el artículo 27?',
];

console.log('\n=== RESPONDIENDO CON EL DOCUMENTO ENTERO ===');

for (const p of PREGUNTAS) {
  const prompt = `Eres un profesor de oposiciones. Responde a partir del texto que va debajo, que es la Constitución Española completa.
Responde en la primera línea, sin preámbulos, y cita el artículo cuando proceda.

TEXTO:
"""
${ce.full_text}
"""

PREGUNTA: ${p}`;

  const t0 = Date.now();
  const res = await model.generateContent(prompt);
  const ms = Date.now() - t0;
  const uso = res.response.usageMetadata;

  console.log('\n' + '-'.repeat(76));
  console.log('P: ' + p);
  console.log(`   [${uso.promptTokenCount} tokens de entrada · ${(ms / 1000).toFixed(1)} s]`);
  console.log('R: ' + res.response.text().trim().slice(0, 700));
}

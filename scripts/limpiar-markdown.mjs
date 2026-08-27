/**
 * Limpia las marcas de Markdown de las preguntas ya guardadas en el banco.
 *
 * POR QUE
 * El modelo escribe `**correcta**` para poner una palabra en negrita, y la
 * pantalla lo pintaba en crudo: el alumno veia los asteriscos. Desde ahora
 * `validateGeneratedQuestion` lo limpia AL GUARDAR (ver `stripMarkdown` en
 * app/lib/ai-output.ts), pero las preguntas que ya estaban siguen sucias.
 *
 * Esto es de un solo uso: cuando el banco este limpio, no hay que volver a
 * lanzarlo. Se queda en el repo porque documenta que paso y como se arreglo.
 *
 *   node scripts/limpiar-markdown.mjs           # solo enseña que cambiaria
 *   node scripts/limpiar-markdown.mjs --aplicar # lo escribe
 */

import { readFileSync } from 'node:fs';

const APLICAR = process.argv.includes('--aplicar');

function env(clave) {
  const linea = readFileSync('.env', 'utf-8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(clave + '='));
  if (!linea) throw new Error(`Falta ${clave} en .env`);
  return linea.slice(clave.length + 1).trim().replace(/^"|"$/g, '');
}

const URL_BASE = env('NEXT_PUBLIC_SUPABASE_URL');
const KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const cabeceras = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// Misma logica que `stripMarkdown` en app/lib/ai-output.ts. Se copia en vez de
// importarse porque este guion es JS suelto y aquel es TypeScript del bundle;
// si una cambia, hay que mirar la otra — pero este solo se ejecuta una vez.
function stripMarkdown(texto) {
  return texto
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[\s(¿¡"'])\*(\S(?:.*?\S)?)\*(?=[\s).,;:!?"']|$)/g, '$1$2')
    .replace(/(^|[\s(¿¡"'])_(\S(?:.*?\S)?)_(?=[\s).,;:!?"']|$)/g, '$1$2')
    .replace(/`(.+?)`/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

const respuesta = await fetch(
  `${URL_BASE}/rest/v1/question_bank?select=id,question_text,options,explanation`,
  { headers: cabeceras }
);
if (!respuesta.ok) throw new Error(`Supabase respondio ${respuesta.status}`);

const preguntas = await respuesta.json();
console.log(`Preguntas en el banco: ${preguntas.length}`);

const sucias = [];
for (const q of preguntas) {
  const question_text = stripMarkdown(q.question_text ?? '');
  const explanation = stripMarkdown(String(q.explanation ?? ''));
  const options = Array.isArray(q.options)
    ? q.options.map((o) => (typeof o === 'string' ? stripMarkdown(o) : o))
    : q.options;

  const cambia =
    question_text !== q.question_text ||
    explanation !== String(q.explanation ?? '') ||
    JSON.stringify(options) !== JSON.stringify(q.options);

  if (cambia) sucias.push({ id: q.id, antes: q.question_text, question_text, options, explanation });
}

console.log(`Con marcas de Markdown: ${sucias.length}\n`);

for (const s of sucias) {
  console.log('  antes: ' + (s.antes ?? '').slice(0, 78));
  console.log('  ahora: ' + s.question_text.slice(0, 78));
  console.log('');
}

if (!sucias.length) {
  console.log('Nada que limpiar.');
  process.exit(0);
}

if (!APLICAR) {
  console.log('Esto es solo una vista previa. Para escribirlo:');
  console.log('  node scripts/limpiar-markdown.mjs --aplicar');
  process.exit(0);
}

let hechas = 0;
for (const s of sucias) {
  const r = await fetch(`${URL_BASE}/rest/v1/question_bank?id=eq.${s.id}`, {
    method: 'PATCH',
    headers: cabeceras,
    body: JSON.stringify({
      question_text: s.question_text,
      options: s.options,
      explanation: s.explanation,
    }),
  });
  if (r.ok) hechas++;
  else console.error(`  FALLA ${s.id}: ${r.status} ${await r.text()}`);
}

console.log(`Limpiadas ${hechas} de ${sucias.length}.`);

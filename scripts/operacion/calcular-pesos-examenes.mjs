/**
 * CALCULA EL PESO REAL DE CADA TEMA, DE LOS 5 EXÁMENES OFICIALES YA INDEXADOS.
 *
 * Los PDF de la regla 72 (2021-2025, `examen-oficial-20XX-resuelto`) están
 * «resueltos y desarrollados»: cada pregunta lleva su propia etiqueta
 * «Tema N · Título» en el texto. No hace falta IA para saber de qué tema
 * sale cada pregunta real — ya lo dice el documento.
 *
 * Este guion NO se ejecuta en cada arranque: lee los 5 documentos una vez y
 * escribe un fichero de datos generado (`app/lib/exam-weight-data.ts`) que
 * se comitea, igual que cualquier otra constante de referencia. Los 5
 * exámenes son históricos y no cambian, así que no hace falta recalcularlo
 * en cada despliegue — solo si se añade una convocatoria nueva.
 *
 * USO
 *   node --experimental-strip-types scripts/operacion/calcular-pesos-examenes.mjs
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

import { normalizeSupabaseUrl } from '../../app/lib/supabase-url.ts';
import { extraeTemasDeExamenReal, cuentaPorTema } from '../../app/lib/exam-weights.ts';

config({ path: '.env.local' });

const URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const supabase = createClient(URL, KEY);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Los exámenes oficiales viven en topic_number 46-50 (regla 72). Se resuelven
// por número, no por id fijo: el id cambia si algún día se reindexan.
const { data: temasExamenes, error: e1 } = await supabase
  .from('subjects')
  .select('id, topic_number, title')
  .gte('topic_number', 46)
  .lte('topic_number', 50)
  .order('topic_number');
if (e1) { console.error(e1.message); process.exit(1); }
if (!temasExamenes?.length) {
  console.error('No hay temas 46-50 (exámenes oficiales). ¿Se ejecutó indexar-examenes-oficiales.mjs?');
  process.exit(1);
}

const { data: docs, error: e2 } = await supabase
  .from('documents')
  .select('id, filename, subject_id, full_text')
  .in('subject_id', temasExamenes.map((t) => t.id));
if (e2) { console.error(e2.message); process.exit(1); }

const listasPorExamen = [];
console.log('Examen                        | preguntas con "Tema N ·"');
for (const doc of (docs ?? []).sort((a, b) => a.filename.localeCompare(b.filename))) {
  const temas = extraeTemasDeExamenReal(doc.full_text ?? '');
  listasPorExamen.push(temas);
  console.log(`${doc.filename.padEnd(30)} | ${temas.length}`);
}

const cuenta = cuentaPorTema(...listasPorExamen);
const total = Object.values(cuenta).reduce((a, b) => a + b, 0);
console.log(`\nTotal de preguntas reales clasificadas: ${total} (de ${listasPorExamen.length} exámenes)`);

const filas = Object.entries(cuenta)
  .map(([tema, n]) => [Number(tema), n])
  .sort((a, b) => a[0] - b[0]);

const contenido = `/**
 * PESO REAL DE CADA TEMA — GENERADO, NO SE EDITA A MANO.
 *
 * Cuántas preguntas de los 5 exámenes oficiales reales (2021-2025, regla 72)
 * caen en cada tema del temario (1-45), contadas con \`extraeTemasDeExamenReal\`
 * (\`app/lib/exam-weights.ts\`) sobre el texto ya indexado de cada documento.
 * Es un dato histórico y no cambia salvo que se añada una convocatoria nueva.
 *
 * Regenerar: node --experimental-strip-types scripts/operacion/calcular-pesos-examenes.mjs
 * Generado: ${new Date().toISOString().slice(0, 10)}. Total: ${total} preguntas de ${listasPorExamen.length} exámenes.
 */

/** topic_number (1-45) -> cuántas preguntas reales de 2021-2025 le tocaron. */
export const PESO_EXAMEN_REAL: Record<number, number> = {
${filas.map(([t, n]) => `  ${t}: ${n},`).join('\n')}
};

export const TOTAL_PREGUNTAS_REALES = ${total};
`;

const destino = join(__dirname, '..', '..', 'app', 'lib', 'exam-weight-data.ts');
writeFileSync(destino, contenido, 'utf-8');
console.log(`\nEscrito ${destino}`);

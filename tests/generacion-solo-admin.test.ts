import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * EL GASTO DE IA NO LO DECIDE QUIEN NO PAGA LA FACTURA.
 *
 * Habia dos sitios donde un alumno disparaba llamadas de pago a Gemini con un
 * solo clic:
 *
 *   · La pantalla del examen. Si el banco no cubria los temas elegidos, pedia
 *     a la IA las preguntas que faltaban, EN PARALELO. Abrir un simulacro de
 *     100 preguntas sobre un tema vacio eran 100 llamadas.
 *   · Drills. Cada ficha nueva era una llamada, por alumno.
 *
 * Y el dinero era el menor de los problemas: el alumno estudiaba con
 * preguntas SIN REVISAR mezcladas con las del banco y sin forma de
 * distinguirlas, y cada uno veia contenido distinto del mismo tema, asi que
 * "esta pregunta la falla el 40%" dejaba de significar nada.
 *
 * Ahora el contenido lo siembra el administrador. Este test es estatico: lee
 * el codigo y no necesita Supabase.
 */

const raiz = join(__dirname, '..');
const leer = (r: string) => readFileSync(join(raiz, r), 'utf-8');

/** Quita comentarios: varios CITAN lo prohibido para explicarlo (convencion del repo). */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('solo el administrador gasta en IA', () => {
  it('generar una pregunta exige requireAdmin, no requireUser', () => {
    const src = sinComentarios(leer('app/actions/exams.ts'));
    const cuerpo = src.slice(src.indexOf('export async function generateAndSaveCandidate'));
    const hasta = cuerpo.slice(0, cuerpo.indexOf('try {'));
    expect(hasta).toMatch(/requireAdmin\(\)/);
    expect(hasta).not.toMatch(/requireUser\(\)/);
  });

  it('la pantalla del examen ya no puede pedir preguntas a la IA', () => {
    // No basta con la guarda del servidor: mientras el cliente siga llamando,
    // el alumno ve un error raro en vez de un examen. Se quita en los dos.
    const src = sinComentarios(leer('app/components/student/modules/exams/ExamManager.tsx'));
    expect(src).not.toMatch(/generateAndSaveCandidate/);
  });

  it('el examen DICE cuántas preguntas faltan en vez de generarlas', () => {
    const src = leer('app/components/student/modules/exams/ExamManager.tsx');
    expect(src).toMatch(/preguntasQueFaltan/);
  });

  it('pedir una ficha COMO ALUMNO no llama al modelo', () => {
    // La comprobacion es sobre el CUERPO de `generateFlashcard`, no sobre el
    // fichero entero: en el mismo modulo vive ahora `seedFlashcardBank`, que
    // SI llama al modelo y debe hacerlo. Prohibirlo en todo el fichero era
    // una guarda mal apuntada — vigilaba el sitio en vez de la ruta.
    const src = sinComentarios(leer('app/actions/flashcards.ts'));
    const desde = src.indexOf('export async function generateFlashcard');
    const hasta = src.indexOf('export async function saveFlashcardProgress');
    expect(desde).toBeGreaterThan(-1);
    expect(hasta).toBeGreaterThan(desde);
    const cuerpo = src.slice(desde, hasta);
    expect(cuerpo).not.toMatch(/generateContent/);
    expect(cuerpo).toMatch(/flashcard_bank/);
  });

  it('sembrar fichas exige requireAdmin', () => {
    const src = sinComentarios(leer('app/actions/flashcards.ts'));
    const desde = src.indexOf('export async function seedFlashcardBank');
    expect(desde).toBeGreaterThan(-1);
    const cabecera = src.slice(desde, desde + 600);
    expect(cabecera).toMatch(/requireAdmin\(\)/);
    expect(cabecera).not.toMatch(/requireUser\(\)/);
  });

  it('sembrar fichas tiene un tope por lote', () => {
    // Cada ficha es una llamada de pago: un cero de mas en el formulario no
    // puede convertirse en cinco mil llamadas.
    const src = sinComentarios(leer('app/actions/flashcards.ts'));
    expect(src).toMatch(/MAX_FICHAS_LOTE/);
    expect(src).toMatch(/Math\.min\(MAX_FICHAS_LOTE/);
  });

  it('el progreso de una ficha guarda de QUÉ ficha del banco sale', () => {
    // Sin `card_id` no hay forma de saber qué ha visto ya el alumno, y la
    // siguiente ficha servida podría ser la misma. La columna existía desde el
    // principio y no se escribía nunca.
    const src = sinComentarios(leer('app/actions/flashcards.ts'));
    expect(src).toMatch(/card_id:\s*cardData\.card_id/);
    const ui = sinComentarios(leer('app/components/student/modules/flashcards/FlashcardDeck.tsx'));
    expect(ui).toMatch(/card_id\?:/);
  });

  it('la huella de una ficha se calcula en UN solo sitio', () => {
    // Regla 27: dos caminos de escritura con huellas distintas meten la misma
    // ficha dos veces.
    expect(leer('app/lib/question-hash.ts')).toMatch(/export function flashcardHash/);
    const seed = sinComentarios(leer('scripts/operacion/sembrar.mjs'));
    expect(seed).toMatch(/flashcardHash\(/);
    expect(seed).toMatch(/onConflict: 'card_hash', ignoreDuplicates: true/);
  });

  it('el prompt de las fichas vive en lib/, donde se puede probar', () => {
    // Regla 32: un prompt dentro de un `'use server'` solo corre en
    // producción, que es donde nadie lo lee.
    const p = leer('app/lib/flashcard-prompt.ts');
    expect(p).toMatch(/export function buildFlashcardPrompt/);
    expect(p).toMatch(/export const FLASHCARD_SCHEMA/);
  });
});

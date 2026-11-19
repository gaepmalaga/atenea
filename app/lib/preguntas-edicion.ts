/**
 * EDITAR UNA PREGUNTA DEL BANCO, Y QUÉ LE FALTA PARA SERVIRSE (regla 135).
 *
 * MÓDULO PURO (regla 21): lo usan las acciones, el panel y los tests.
 *
 * Una pregunta pendiente (`candidate`) no se sirve a ningún alumno. Para
 * aprobarla hacen falta sus etiquetas: una explicación de verdad y una
 * dificultad. `null` no es 2 (regla 16): una pregunta nueva entra SIN
 * dificultad, no con la de siembra, y por eso nadie la aprueba sin haberla
 * puesto.
 */

import { MIN_EXPLANATION_CHARS } from './ai-output';

/** Lo que una persona puede cambiar de una pregunta. */
export type CamposEditables = {
  question_text: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
  difficulty_level: number | null;
};

export type Etiqueta = 'explicación' | 'dificultad';

type ConEtiquetas = { explanation?: string | null; difficulty_level?: number | null };

/** Las etiquetas que todavía faltan. Vacío = lista para aprobarse. */
export function etiquetasQueFaltan(f: ConEtiquetas): Etiqueta[] {
  const faltan: Etiqueta[] = [];
  if ((f.explanation ?? '').trim().length < MIN_EXPLANATION_CHARS) faltan.push('explicación');
  if (![1, 2, 3].includes(Number(f.difficulty_level))) faltan.push('dificultad');
  return faltan;
}

export function estaCompleta(f: ConEtiquetas): boolean {
  return etiquetasQueFaltan(f).length === 0;
}

/** «Falta la explicación» · «Faltan la explicación y la dificultad». */
export function textoFaltan(faltan: Etiqueta[]): string {
  if (faltan.length === 0) return '';
  const con = faltan.map((e) => `la ${e}`);
  return `${faltan.length === 1 ? 'Falta' : 'Faltan'} ${con.join(' y ')}`;
}

type FilaBanco = {
  question_text?: unknown;
  options?: unknown;
  correct_index?: unknown;
  explanation?: unknown;
  difficulty_level?: unknown;
};

/** La foto de los campos editables de una fila, para guardarla en el historial. */
export function instantanea(f: FilaBanco): CamposEditables {
  return {
    question_text: String(f.question_text ?? ''),
    options: Array.isArray(f.options) ? (f.options as unknown[]).map((o) => String(o ?? '')) : [],
    correct_index: Number.isInteger(f.correct_index) ? (f.correct_index as number) : -1,
    explanation: typeof f.explanation === 'string' ? f.explanation : null,
    difficulty_level: typeof f.difficulty_level === 'number' ? f.difficulty_level : null,
  };
}

const NOMBRE: Record<keyof CamposEditables, string> = {
  question_text: 'el enunciado',
  options: 'las opciones',
  correct_index: 'la respuesta correcta',
  explanation: 'la explicación',
  difficulty_level: 'la dificultad',
};

/** Qué campos son distintos entre dos fotos, por su nombre en castellano. */
export function camposCambiados(antes: CamposEditables, despues: CamposEditables): string[] {
  const out: string[] = [];
  (Object.keys(NOMBRE) as (keyof CamposEditables)[]).forEach((k) => {
    if (JSON.stringify(antes[k]) !== JSON.stringify(despues[k])) out.push(NOMBRE[k]);
  });
  return out;
}

export function hayCambios(antes: CamposEditables, despues: CamposEditables): boolean {
  return camposCambiados(antes, despues).length > 0;
}

/** Una foto del historial leída de la base de datos: se vuelve a comprobar antes de volver a usarla. */
export function leeInstantanea(v: unknown): CamposEditables | null {
  if (!v || typeof v !== 'object') return null;
  const d = v as Record<string, unknown>;
  if (typeof d.question_text !== 'string' || !Array.isArray(d.options) || d.options.length !== 3) return null;
  if (!Number.isInteger(d.correct_index) || (d.correct_index as number) < 0 || (d.correct_index as number) > 2) return null;
  return instantanea(d);
}

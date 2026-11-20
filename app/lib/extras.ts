/**
 * LAS FORMACIONES EXTRAS (regla 142).
 *
 * Además de las clases fijas de los grupos, la academia da formaciones extras
 * (el Curso OSINT y otras), para los mismos alumnos o para gente externa. Una
 * fila de `extra_events` es una, en una fecha, con hora opcional, un título,
 * uno o dos profesores, para quién es y una nota. Sin lista de asistentes por
 * ahora (dueño, 20 nov).
 *
 * MÓDULO PURO (regla 21): lo que se valida aquí lo comprueba también la acción.
 */

export const AUDIENCIAS = ['alumnos', 'externos', 'ambos'] as const;
export type Audiencia = (typeof AUDIENCIAS)[number];

export const ETIQUETA_AUDIENCIA: Record<Audiencia, string> = {
  alumnos: 'Para los alumnos',
  externos: 'Para gente externa',
  ambos: 'Alumnos y gente externa',
};

export const MAX_TITULO_EXTRA = 120;
export const MAX_NOTA_EXTRA = 200;

/** Una formación extra, como la lee el calendario y el cuadrante. */
export type ExtraEvento = {
  id: string;
  fecha: string;
  /** `HH:MM`; `null` = sin hora fijada. */
  inicio: string | null;
  fin: string | null;
  titulo: string;
  profesorIds: string[];
  audiencia: Audiencia;
  nota: string | null;
};

const sinNul = (v: string) => v.replace(/\0/g, '').replace(/\s+/g, ' ').trim();

/** El título, sin NUL ni espacios de más; de 2 a 120 letras o `null`. */
export function normalizaTituloExtra(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = sinNul(v);
  return t.length >= 2 ? t.slice(0, MAX_TITULO_EXTRA) : null;
}

export function normalizaNotaExtra(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = sinNul(v);
  return t ? t.slice(0, MAX_NOTA_EXTRA) : null;
}

export function normalizaAudiencia(v: unknown): Audiencia {
  return (AUDIENCIAS as readonly unknown[]).includes(v) ? (v as Audiencia) : 'alumnos';
}

/** `HH:MM` válida (de 00:00 a 23:59) o `null`. Acepta `HH:MM:SS` de la base de datos. */
export function normalizaHoraExtra(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(v.trim());
  return m ? `${m[1]}:${m[2]}` : null;
}

/** Las dos horas juntas: sin inicio no hay fin, y el fin tiene que ser posterior al inicio. */
export function horasDeExtra(inicio: unknown, fin: unknown): { inicio: string | null; fin: string | null; error?: string } {
  const i = normalizaHoraExtra(inicio);
  const f = normalizaHoraExtra(fin);
  if (!i) return { inicio: null, fin: null };
  if (f && f <= i) return { inicio: i, fin: null, error: 'La hora de fin tiene que ser posterior a la de inicio.' };
  return { inicio: i, fin: f };
}

/** Una fila de `extra_events` → `ExtraEvento`. */
export function aExtraEvento(r: Record<string, unknown>): ExtraEvento {
  return {
    id: r.id as string,
    fecha: r.event_date as string,
    inicio: normalizaHoraExtra(r.start_time),
    fin: normalizaHoraExtra(r.end_time),
    titulo: r.title as string,
    profesorIds: [...new Set([r.teacher_id, r.teacher2_id].filter((x): x is string => typeof x === 'string' && !!x))],
    audiencia: normalizaAudiencia(r.audience),
    nota: (r.note as string | null) ?? null,
  };
}

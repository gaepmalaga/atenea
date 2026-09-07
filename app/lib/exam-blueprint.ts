/**
 * EL SIMULACRO ES REPRESENTATIVO, NO ALEATORIO.
 *
 * `shuffle(banco).slice(100)` puede darte 40 preguntas del mismo artículo,
 * repetirte lo de ayer, o salir facilísimo un día y durísimo al siguiente —
 * y entonces comparar dos notas no significa nada.
 *
 * Este módulo arma un simulacro que SÍ es comparable de una vez a otra:
 *
 *   1. REPARTO POR TEMAS — cada tema del alcance recibe su cuota (a partes
 *      iguales, el resto a los que más banco tienen). No al azar.
 *   2. SIN REPETIR LO RECIENTE — se evitan las preguntas contestadas en los
 *      últimos días; si no llegan, se relaja.
 *   3. MEZCLA DE DIFICULTAD FIJA — la proporción fácil/media/alta la marca el
 *      nivel elegido y NO cambia entre simulacros del mismo nivel. Es lo que
 *      hace que «he pasado de 4 a 6» quiera decir algo.
 *   4. COBERTURA POR ARTÍCULO — dentro de un tema, se reparte entre artículos
 *      distintos (`legal_reference`) en vez de amontonarse en uno.
 *
 * El orden final se baraja: un examen de verdad no va agrupado por tema.
 *
 * Módulo PURO (regla 21). NO adapta al alumno: eso es el entrenamiento.
 */

import { shuffle } from './questions';

export type CandidataExamen = {
  questionId: string;
  topic: string;
  /** 1 fácil · 2 media · 3 alta. Ausente = se cuenta como media. */
  difficultyLevel?: number | null;
  /** Artículo o disposición del que sale, si consta. Para la cobertura. */
  legalReference?: string | null;
};

export type PlanExamen = {
  questionIds: string[];
  /** No se llegó a `limit` ni relajando los filtros. La pantalla ya lo avisa. */
  corto: boolean;
};

export type NivelExamen = 'easy' | 'medium' | 'hard';

/**
 * Fracción [fácil, media, alta] de cada nivel. FIJA a propósito: dos simulacros
 * del mismo nivel tienen que tener la misma mezcla para poder compararse.
 */
export const MEZCLA_DIFICULTAD: Record<NivelExamen, [number, number, number]> = {
  easy: [0.55, 0.35, 0.1],
  medium: [0.3, 0.45, 0.25],
  hard: [0.1, 0.35, 0.55],
};

function nivelDe(d: number | null | undefined): 0 | 1 | 2 {
  return d === 1 ? 0 : d === 3 ? 2 : 1;
}

/** Reparte `n` en `pesos.length` cubos según `pesos` (que suman ~1), sin perder unidades. */
function repartePorPeso(n: number, pesos: number[]): number[] {
  const bruto = pesos.map((p) => p * n);
  const base = bruto.map(Math.floor);
  let resto = n - base.reduce((a, b) => a + b, 0);
  // El resto va a los cubos con mayor parte fraccionaria.
  const orden = bruto
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of orden) {
    if (resto <= 0) break;
    base[i]++;
    resto--;
  }
  return base;
}

/**
 * De una lista de candidatas de UN tema, coge `cuota` repartiendo por nivel de
 * dificultad (según `mezcla`) y, dentro de cada nivel, por artículo distinto.
 */
function eligeDelTema(
  items: CandidataExamen[],
  cuota: number,
  mezcla: [number, number, number],
  random: () => number,
): string[] {
  if (cuota <= 0 || items.length === 0) return [];

  const porNivel: CandidataExamen[][] = [[], [], []];
  for (const it of items) porNivel[nivelDe(it.difficultyLevel)].push(it);

  const objetivo = repartePorPeso(Math.min(cuota, items.length), mezcla);
  const elegidas: string[] = [];
  const usadas = new Set<string>();

  // Primera pasada: cada nivel aporta su objetivo, repartiendo por artículo.
  for (let nv = 0; nv < 3; nv++) {
    const cogidas = porArticulo(shuffle(porNivel[nv], random), objetivo[nv]);
    for (const id of cogidas) {
      if (!usadas.has(id)) { usadas.add(id); elegidas.push(id); }
    }
  }

  // Segunda pasada: si algún nivel se quedó corto, se completa con lo que haya.
  if (elegidas.length < cuota) {
    for (const it of shuffle(items, random)) {
      if (elegidas.length >= cuota) break;
      if (!usadas.has(it.questionId)) { usadas.add(it.questionId); elegidas.push(it.questionId); }
    }
  }

  return elegidas.slice(0, cuota);
}

/** Coge `n` preguntas repartiendo entre `legal_reference` distintos (round-robin). */
function porArticulo(items: CandidataExamen[], n: number): string[] {
  if (n <= 0) return [];
  const colas = new Map<string, CandidataExamen[]>();
  for (const it of items) {
    const k = (it.legalReference ?? '').trim() || `__sin_ref_${it.questionId}`;
    const q = colas.get(k) ?? [];
    q.push(it);
    colas.set(k, q);
  }
  const claves = [...colas.keys()];
  const out: string[] = [];
  let i = 0;
  while (out.length < n && claves.some((k) => (colas.get(k)?.length ?? 0) > 0)) {
    const cola = colas.get(claves[i % claves.length]);
    if (cola && cola.length) out.push(cola.shift()!.questionId);
    i++;
    if (i > items.length * (claves.length + 1)) break;
  }
  return out;
}

export function planExamen(params: {
  disponibles: CandidataExamen[];
  limit: number;
  dificultad: NivelExamen;
  /** questionIds contestados hace poco: se evitan si se puede. */
  recientes?: Set<string>;
  random?: () => number;
}): PlanExamen {
  const random = params.random ?? Math.random;
  const limit = Math.max(0, Math.floor(params.limit));
  const mezcla = MEZCLA_DIFICULTAD[params.dificultad] ?? MEZCLA_DIFICULTAD.medium;
  const recientes = params.recientes ?? new Set<string>();

  if (limit === 0 || !params.disponibles?.length) {
    return { questionIds: [], corto: limit > 0 };
  }

  // Lo reciente se aparta a un lado, no se descarta: es el respaldo si no llega.
  const frescas = params.disponibles.filter((c) => !recientes.has(c.questionId));
  const respaldo = params.disponibles.filter((c) => recientes.has(c.questionId));
  const pool = frescas.length >= limit ? frescas : params.disponibles;

  // Agrupar por tema.
  const porTema = new Map<string, CandidataExamen[]>();
  for (const c of pool) {
    const q = porTema.get(c.topic) ?? [];
    q.push(c);
    porTema.set(c.topic, q);
  }
  const temas = [...porTema.keys()];

  // Cuota por tema: a partes iguales; el resto a los que más banco tienen.
  const cuotaBase = Math.floor(limit / temas.length);
  const restoLimit = limit - cuotaBase * temas.length;
  const porRestoOrden = [...temas].sort(
    (a, b) => (porTema.get(b)?.length ?? 0) - (porTema.get(a)?.length ?? 0),
  );
  const cuota = new Map<string, number>();
  for (const t of temas) cuota.set(t, cuotaBase);
  for (let i = 0; i < restoLimit; i++) {
    const t = porRestoOrden[i % porRestoOrden.length];
    cuota.set(t, (cuota.get(t) ?? 0) + 1);
  }

  const elegidas: string[] = [];
  const usadas = new Set<string>();
  let deficit = 0;

  for (const t of temas) {
    const c = cuota.get(t) ?? 0;
    const cogidas = eligeDelTema(porTema.get(t) ?? [], c, mezcla, random);
    for (const id of cogidas) {
      if (!usadas.has(id)) { usadas.add(id); elegidas.push(id); }
    }
    deficit += Math.max(0, c - cogidas.length);
  }

  // Redistribuir el déficit: coger de cualquier tema lo que haya sobrado.
  if (elegidas.length < limit) {
    for (const c of shuffle(pool, random)) {
      if (elegidas.length >= limit) break;
      if (!usadas.has(c.questionId)) { usadas.add(c.questionId); elegidas.push(c.questionId); }
    }
  }

  // Último recurso: tirar del respaldo (lo reciente).
  if (elegidas.length < limit) {
    for (const c of shuffle(respaldo, random)) {
      if (elegidas.length >= limit) break;
      if (!usadas.has(c.questionId)) { usadas.add(c.questionId); elegidas.push(c.questionId); }
    }
  }

  // El examen no va agrupado por tema.
  return {
    questionIds: shuffle(elegidas, random).slice(0, limit),
    corto: elegidas.length < limit,
  };
}

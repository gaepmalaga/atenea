/**
 * LA DIFICULTAD DE UNA PREGUNTA: el prompt, la validación y la medida del acuerdo.
 *
 * MÓDULO PURO (regla 21): sin base de datos ni red, para poder probarlo y para
 * que el script de operación y los tests usen EXACTAMENTE el mismo prompt
 * (regla 32: dos copias de un prompt son dos prompts).
 *
 * QUÉ SE MIDE
 * Dificultad = cuánta gente PREPARADA fallaría la pregunta, no lo complicada
 * que sea de redactar (`docs/DIFICULTAD.md`). Tres niveles, los de
 * `question_bank.difficulty_level`.
 *
 * LO QUE NO HACE
 * No pone un 2 a lo que el modelo no contesta: una pregunta sin nivel válido
 * queda como `null`, «no se sabe» (regla 16). Rellenarla con el valor por
 * defecto es exactamente cómo las 4.617 preguntas acabaron valiendo todas 2.
 */

import { SchemaType, type Schema } from '@google/generative-ai';
import { calculaGasto, type PrecioModelo, PRECIO_FLASH } from './ai-usage.ts';

export type Nivel = 1 | 2 | 3;
export const NIVELES: readonly Nivel[] = [1, 2, 3];

/** La rúbrica de `docs/DIFICULTAD.md`. Si se cambia allí, se cambia aquí. */
export const RUBRICA = `Clasificas preguntas de test de la oposición a Policía Nacional (Escala Básica) por su DIFICULTAD.

Dificultad = cuánta gente que ha estudiado el tema FALLARÍA la pregunta. No es lo complicada que sea de redactar.

NIVEL 1 · FÁCIL: un dato explícito y aislado que todo el que ha estudiado el tema sabe (una definición clásica, un órgano conocido), con opciones muy distintas y sin negaciones.
NIVEL 2 · MEDIA: hay que distinguir entre elementos parecidos (órganos, competencias, definiciones cercanas), aplicar una regla a un supuesto sencillo o recordar una lista con excepciones.
NIVEL 3 · ALTA: un dato numérico o una fecha poco conocidos (plazos, penas, años), «excepto» o «NO es correcta», combinación de varios preceptos, opciones casi idénticas, o un detalle de organigrama o de disposición transitoria.

Reglas:
- Un plazo o una pena concretos son de nivel 3 aunque la pregunta sea corta: con tres opciones numéricas, el que no se lo sabe acierta una de cada tres.
- Juzga por lo que sabría alguien que ha estudiado, no por lo que sabes tú.
- No hay un nivel «por defecto»: decide en cada pregunta.
- Contesta solo con el nivel de cada una, en el formato pedido.`;

export type PreguntaParaClasificar = {
  /** Número dentro de la tanda, desde 1. */
  n: number;
  tema: string;
  pregunta: string;
  opciones: string[];
  /** Índice de la correcta. */
  correcta: number;
};

const LETRAS = ['A', 'B', 'C', 'D'];

/** El prompt de una tanda. La rúbrica va aparte (instrucción de sistema). */
export function promptDeTanda(preguntas: readonly PreguntaParaClasificar[]): string {
  const bloques = preguntas.map((p) => {
    const ops = p.opciones.map((o, i) => `   ${LETRAS[i] ?? i + 1}) ${o}${i === p.correcta ? '  ← correcta' : ''}`).join('\n');
    return `[${p.n}] Tema: ${p.tema}\n   ${p.pregunta}\n${ops}`;
  });
  return `Clasifica estas ${preguntas.length} preguntas. Devuelve un elemento por pregunta con su número «n» y su «nivel» (1, 2 o 3).\n\n${bloques.join('\n\n')}`;
}

export const DIFICULTAD_SCHEMA: Schema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      n: { type: SchemaType.INTEGER },
      nivel: { type: SchemaType.INTEGER },
    },
    required: ['n', 'nivel'],
  },
};

/**
 * Lo que devuelve el modelo, comprobado (regla 10): un nivel por cada número
 * pedido. Lo que falta, está repetido o no es 1, 2 o 3 queda `null`, y se
 * cuenta aparte para que el script pueda decir cuántas no se clasificaron.
 */
export function leeNiveles(raw: unknown, pedidos: readonly number[]): { niveles: Map<number, Nivel | null>; invalidas: number } {
  const lista = Array.isArray(raw) ? raw : [];
  const vistos = new Map<number, Nivel>();
  const repetidos = new Set<number>();
  for (const it of lista) {
    const n = (it as { n?: unknown })?.n;
    const nivel = (it as { nivel?: unknown })?.nivel;
    if (typeof n !== 'number' || !pedidos.includes(n)) continue;
    if (nivel !== 1 && nivel !== 2 && nivel !== 3) continue;
    if (vistos.has(n)) repetidos.add(n);
    else vistos.set(n, nivel);
  }
  // Dos respuestas distintas para la misma pregunta: no se elige una al azar.
  for (const n of repetidos) vistos.delete(n);
  const niveles = new Map<number, Nivel | null>(pedidos.map((n) => [n, vistos.get(n) ?? null]));
  return { niveles, invalidas: pedidos.filter((n) => niveles.get(n) === null).length };
}

// ---------------------------------------------------------------------------
// El acuerdo entre dos clasificaciones
// ---------------------------------------------------------------------------

export type Acuerdo = {
  /** Pares con los dos niveles válidos. */
  comparadas: number;
  coinciden: number;
  /** 0-100. `null` sin pares (regla 8). */
  porcentajeExacto: number | null;
  /** Difieren en UN nivel. */
  diferenUno: number;
  /** Difieren en dos niveles: el fácil contra el difícil. Lo grave. */
  diferenDos: number;
  /** `matriz[a-1][b-1]`: cuántas son nivel `a` para la referencia y `b` para el modelo. */
  matriz: number[][];
  /**
   * Nivel medio del modelo menos el de la referencia. Positivo: el modelo es
   * más duro. Sin esto, un 70 % de acuerdo puede esconder que siempre se
   * equivoca hacia el mismo lado.
   */
  sesgo: number | null;
};

const redondea = (n: number, dec = 2) => Math.round(n * 10 ** dec) / 10 ** dec;

/** `referencia` y `modelo` por id de pregunta. Solo cuentan los pares donde los dos tienen nivel. */
export function acuerdo(referencia: ReadonlyMap<string, Nivel | null>, modelo: ReadonlyMap<string, Nivel | null>): Acuerdo {
  const matriz = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let comparadas = 0, coinciden = 0, diferenUno = 0, diferenDos = 0, suma = 0;
  for (const [id, a] of referencia) {
    const b = modelo.get(id);
    if (!a || !b) continue;
    comparadas++;
    matriz[a - 1][b - 1]++;
    suma += b - a;
    const d = Math.abs(a - b);
    if (d === 0) coinciden++;
    else if (d === 1) diferenUno++;
    else diferenDos++;
  }
  return {
    comparadas,
    coinciden,
    porcentajeExacto: comparadas > 0 ? redondea((coinciden / comparadas) * 100, 1) : null,
    diferenUno,
    diferenDos,
    matriz,
    sesgo: comparadas > 0 ? redondea(suma / comparadas) : null,
  };
}

/** Cuántas hay de cada nivel. Las `null` no cuentan. */
export function reparto(niveles: Iterable<Nivel | null | undefined>): Record<Nivel, number> {
  const r: Record<Nivel, number> = { 1: 0, 2: 0, 3: 0 };
  for (const n of niveles) if (n === 1 || n === 2 || n === 3) r[n]++;
  return r;
}

/**
 * ¿Se fía uno de la clasificación del modelo para clasificar todo el banco?
 *
 * Criterio puesto ANTES de ver los resultados, para no ajustarlo a lo que
 * salga: al menos el 60 % de coincidencia exacta, no más del 5 % de errores de
 * dos niveles, y un sesgo medio de menos de 0,3 niveles hacia cualquier lado.
 * Tres niveles dan un 33 % de acuerdo por puro azar; con dos personas
 * clasificando a mano costaría llegar al 70-75 %.
 */
export const CRITERIO_ACUERDO = { exactoMinimo: 60, dosNivelesMaximo: 5, sesgoMaximo: 0.3, comparadasMinimo: 100 } as const;

export function sirveParaClasificar(a: Acuerdo): { ok: boolean; motivos: string[] } {
  const motivos: string[] = [];
  if (a.comparadas < CRITERIO_ACUERDO.comparadasMinimo) motivos.push(`solo ${a.comparadas} comparadas (mínimo ${CRITERIO_ACUERDO.comparadasMinimo})`);
  if (a.porcentajeExacto === null || a.porcentajeExacto < CRITERIO_ACUERDO.exactoMinimo) motivos.push(`coincidencia exacta ${a.porcentajeExacto ?? '—'} % (mínimo ${CRITERIO_ACUERDO.exactoMinimo} %)`);
  const dos = a.comparadas > 0 ? (a.diferenDos / a.comparadas) * 100 : 0;
  if (dos > CRITERIO_ACUERDO.dosNivelesMaximo) motivos.push(`errores de dos niveles ${redondea(dos, 1)} % (máximo ${CRITERIO_ACUERDO.dosNivelesMaximo} %)`);
  if (a.sesgo !== null && Math.abs(a.sesgo) > CRITERIO_ACUERDO.sesgoMaximo) motivos.push(`sesgo ${a.sesgo} niveles (máximo ±${CRITERIO_ACUERDO.sesgoMaximo})`);
  return { ok: motivos.length === 0, motivos };
}

// ---------------------------------------------------------------------------
// El coste, antes de gastarlo
// ---------------------------------------------------------------------------

/** Tokens de entrada por pregunta: texto + opciones + el marco del prompt. Medido a ojo, a propósito por arriba. */
export const TOKENS_ENTRADA_POR_PREGUNTA = 220;
/** Tokens de salida por pregunta: `{"n":12,"nivel":3},`. */
export const TOKENS_SALIDA_POR_PREGUNTA = 14;
/** La rúbrica se repite en cada llamada. */
export const TOKENS_RUBRICA = 450;

/** Dólares para clasificar `preguntas` en tandas de `tanda`. Una estimación, no una factura. */
export function costeEstimado(preguntas: number, tanda: number, precio: PrecioModelo = PRECIO_FLASH): { llamadas: number; coste: number } {
  const llamadas = Math.ceil(preguntas / Math.max(1, tanda));
  const g = calculaGasto(
    {
      promptTokenCount: preguntas * TOKENS_ENTRADA_POR_PREGUNTA + llamadas * TOKENS_RUBRICA,
      candidatesTokenCount: preguntas * TOKENS_SALIDA_POR_PREGUNTA,
    },
    precio,
  );
  return { llamadas, coste: g.coste };
}

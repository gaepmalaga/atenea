/**
 * LO COMÚN DE LOS PSICOTÉCNICOS (regla 117): los tipos de pregunta, el azar reproducible y los
 * ayudantes de los generadores. Vive aparte para que los generadores de `psico.ts` y de
 * `psico-nuevos.ts` lo compartan sin importarse el uno al otro.
 */

/** Cuántas opciones genera cada generador. En la versión 2 se recortan a 4 o 3 (`opcionesDe`). */
export const OPCIONES_PSICO = 5;

/**
 * Los tipos nuevos van AL FINAL: una sesión guarda sus tipos y se regenera con
 * ellos, y los generadores de los seis primeros no han cambiado, así que
 * añadir estos no obliga a subir `VERSION_PSICO`.
 */
export const TIPOS_PSICO = [
  'series', 'letras', 'calculo', 'verbal', 'atencion', 'figuras', 'dominos', 'rotaciones', 'tablas',
  'conteo', 'dobles', 'problemas', 'abecedario', 'logica', 'cuadros', 'cifrado', 'simbolos', 'ordenes',
  'cubos', 'desarrollos', 'plegados', 'giros', 'parentescos',
] as const;
export type TipoPsico = (typeof TIPOS_PSICO)[number];

export function esTipoPsico(v: unknown): v is TipoPsico {
  return typeof v === 'string' && (TIPOS_PSICO as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Figuras
// ---------------------------------------------------------------------------

export const FORMAS = ['circulo', 'cuadrado', 'triangulo', 'rombo', 'cruz'] as const;
export type Forma = (typeof FORMAS)[number];
export const RELLENOS = ['vacio', 'gris', 'negro'] as const;
export type Relleno = (typeof RELLENOS)[number];

/** Una casilla: una forma, repetida `n` veces, con un relleno. */
export type Celda = { forma: Forma; n: number; relleno: Relleno };

/** Una ficha de dominó: los puntos de la mitad de arriba y los de la de abajo (0 a 6). */
export type Ficha = [number, number];
/** Una figura de cuadraditos rellenos sobre una rejilla 3×3 (`true` = relleno). */
export type Rejilla = boolean[][];
export type Tabla = { cabecera: string[]; filas: string[][] };

/** Una figura con cuatro huecos (arriba, derecha, abajo, izquierda), cada uno con un elemento que se puede girar. */
export type Elemento = { forma: 'flecha' | 'triangulo' | 'cruz' | 'cuadrado'; /** 0 arriba, 1 derecha, 2 abajo, 3 izquierda */ giro: number };
export type FiguraCompleja = Elemento[];
/** Un desarrollo de cubo: las seis casillas con su símbolo. */
export type Desarrollo = { x: number; y: number; s: string }[];
/** Las alturas de las columnas de una figura de cubos (filas × columnas). */
export type Alturas = number[][];

/** Un símbolo del ejercicio 2: del 0 al 19 (5 dibujos × 4 giros). */
export type Leyenda = { nombre: string; simbolo: number }[];

export type OpcionPsico = {
  texto?: string; celda?: Celda; ficha?: Ficha; rejilla?: Rejilla;
  /** una fila de símbolos */ fila?: number[];
  /** un papel desplegado: `true` = agujero */ agujeros?: boolean[][];
  figura?: FiguraCompleja;
};

export type PreguntaPsico = {
  tipo: TipoPsico;
  enunciado: string;
  /** Líneas en letra de ancho fijo: la serie, o las parejas de códigos. */
  lineas?: string[];
  /** La tabla de 3×3; la última casilla (`null`) es la que falta. */
  matriz?: (Celda | null)[];
  /** La serie de dominós; la última ficha (`null`) es la que falta. */
  fichas?: (Ficha | null)[];
  /** La figura que se gira. */
  rejilla?: Rejilla;
  /** La tabla de datos. */
  tabla?: Tabla;
  /** La tabla de símbolos y nombres del ejercicio 2. */
  leyenda?: Leyenda;
  /** Figuras de cubos (de una a tres), cada una con las alturas de sus columnas. */
  cubos?: Alturas[];
  /** El desarrollo de un cubo. */
  desarrollo?: Desarrollo;
  /** La figura de varios elementos que se gira. */
  figura?: FiguraCompleja;
  opciones: OpcionPsico[];
  correcta: number;
  explicacion: string;
};

/** Lo que viaja al navegador: sin la respuesta ni la explicación. */
export type PreguntaPsicoPublica = Omit<PreguntaPsico, 'correcta' | 'explicacion'>;

// ---------------------------------------------------------------------------
// Azar reproducible
// ---------------------------------------------------------------------------

export type Azar = () => number;

/** mulberry32: pequeño, rápido y con la misma salida en cualquier motor de JavaScript. */
export function azarDe(semilla: number): Azar {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const entero = (r: Azar, min: number, max: number) => min + Math.floor(r() * (max - min + 1));
export const elige = <T,>(r: Azar, lista: readonly T[]): T => lista[Math.floor(r() * lista.length)];

/** Fisher-Yates (regla 15), con el azar de la sesión. */
export function baraja<T>(r: Azar, lista: readonly T[]): T[] {
  const out = lista.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Cinco opciones de texto: la correcta y cuatro distractores DISTINTOS entre
 * sí y de ella, barajadas. Si los candidatos no dan para cuatro, se rellenan
 * con `relleno(k)` hasta que los haya.
 */
export function conDistractores(r: Azar, correcta: string, candidatos: string[], relleno: (k: number) => string): { opciones: OpcionPsico[]; correcta: number } {
  const vistos = new Set<string>([correcta]);
  const malos: string[] = [];
  for (const c of baraja(r, candidatos)) {
    if (malos.length === OPCIONES_PSICO - 1) break;
    if (!vistos.has(c)) { vistos.add(c); malos.push(c); }
  }
  for (let k = 1; malos.length < OPCIONES_PSICO - 1 && k < 200; k++) {
    const c = relleno(k);
    if (!vistos.has(c)) { vistos.add(c); malos.push(c); }
  }
  const todas = baraja(r, [correcta, ...malos]);
  return { opciones: todas.map((texto) => ({ texto })), correcta: todas.indexOf(correcta) };
}

/** Lo mismo, para una respuesta numérica: los distractores son los errores típicos. */
export function numericas(r: Azar, correcta: number, errores: number[]) {
  return conDistractores(
    r,
    String(correcta),
    errores.filter((n) => Number.isFinite(n)).map((n) => String(n)),
    (k) => String(correcta + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.abs(correcta) > 60 ? 5 : 1)),
  );
}


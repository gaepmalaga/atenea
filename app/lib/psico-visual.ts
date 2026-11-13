/**
 * LOS TIPOS VISUALES DEL EJERCICIO 1 (regla 117, 13 nov): cubos contados,
 * desarrollos de cubo, plegados de papel, giros de figuras con varios elementos
 * y parentescos. Los dibujos los hace la pantalla con SVG (`FiguraPsico.tsx`);
 * aquí solo están los datos y la GEOMETRÍA, que es lo que hay que acertar.
 *
 * Cada una se comprueba con un cálculo independiente en los tests: el plegado
 * enumera los puntos del papel, el desarrollo rueda un cubo sobre sus casillas,
 * el giro rota las posiciones y los parentescos salen de un árbol.
 */
import {
  entero, elige, baraja, conDistractores, numericas,
  type Azar, type Alturas, type Desarrollo, type Elemento, type FiguraCompleja, type PreguntaPsico,
} from './psico-comun';

// ---------------------------------------------------------------------------
// Cubos contados
// ---------------------------------------------------------------------------

/**
 * Una figura de cubos apilados: columnas de 0 a 4 cubos que bajan hacia el
 * observador (cada columna es igual o menor que la de detrás y la de su
 * izquierda), así que todas se ven y no hay huecos. El total es la suma.
 */
export function figuraDeCubos(r: Azar, filas = 3, columnas = 4): Alturas {
  const tope = entero(r, 2, 4);
  const h: Alturas = Array.from({ length: filas }, () => Array(columnas).fill(0));
  for (let y = 0; y < filas; y++) {
    for (let x = 0; x < columnas; x++) {
      const maximo = Math.min(y === 0 ? tope : h[y - 1][x], x === 0 ? tope : h[y][x - 1]);
      const baja = r() < 0.45 ? 1 : 0;
      h[y][x] = y === 0 && x === 0 ? tope : Math.max(0, maximo - baja);
    }
  }
  return h;
}
export const totalDeCubos = (a: Alturas) => a.reduce((s, f) => s + f.reduce((t, x) => t + x, 0), 0);

export function cubos(r: Azar): PreguntaPsico {
  let figuras: Alturas[] = [], total = 0, enunciado = '', explicacion = '';
  for (let intento = 0; intento < 100; intento++) {
    const variante = entero(r, 0, 2);
    const hechas = Array.from({ length: variante === 0 ? 1 : variante === 1 ? 2 : 3 }, () => figuraDeCubos(r));
    const n = hechas.map(totalDeCubos);
    if (n.some((x) => x < 4 || x > 22)) continue;
    if (variante === 0) {
      total = n[0]; enunciado = 'Todos los cubos están apoyados unos sobre otros, sin huecos. ¿Cuántos cubos forman la figura, contando los que no se ven?';
      explicacion = `Se cuenta columna a columna: ${hechas[0].flat().filter((x) => x > 0).join(' + ')} = ${total}.`;
    } else if (variante === 1) {
      total = n[0] + n[1]; enunciado = 'Contando todos los cubos de cada figura (están apoyados, sin huecos), realiza la suma de A + B.';
      explicacion = `A tiene ${n[0]} cubos y B tiene ${n[1]}: ${n[0]} + ${n[1]} = ${total}.`;
    } else {
      if (n[0] + n[1] - n[2] < 1) continue;
      total = n[0] + n[1] - n[2]; enunciado = 'Contando todos los cubos de cada figura (están apoyados, sin huecos), realiza la operación A + B − C.';
      explicacion = `A tiene ${n[0]}, B tiene ${n[1]} y C tiene ${n[2]}: ${n[0]} + ${n[1]} − ${n[2]} = ${total}.`;
    }
    figuras = hechas;
    break;
  }
  if (figuras.length === 0) { figuras = [figuraDeCubos(r)]; total = totalDeCubos(figuras[0]); enunciado = '¿Cuántos cubos forman la figura (apoyados, sin huecos)?'; explicacion = `Son ${total} = ${total}.`; }
  const o = numericas(r, total, [total + 1, total - 1, total + 2, total - 2, total + 3, total - 3, totalDeCubos(figuras[0])]);
  return { tipo: 'cubos', enunciado, cubos: figuras, opciones: o.opciones, correcta: o.correcta, explicacion };
}

// ---------------------------------------------------------------------------
// Desarrollos de cubo
// ---------------------------------------------------------------------------

const RED_1_4_1 = (arriba: number, abajo: number): [number, number][] => [[0, 1], [1, 1], [2, 1], [3, 1], [arriba, 0], [abajo, 2]];
/** Desarrollos de cubo válidos: la familia 1-4-1 (16 formas), la 2-2-2 escalera y la 3-3. */
export const DESARROLLOS: [number, number][][] = [
  ...[0, 1, 2, 3].flatMap((a) => [0, 1, 2, 3].map((b) => RED_1_4_1(a, b))),
  [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2]],
  [[0, 0], [1, 0], [2, 0], [2, 1], [3, 1], [4, 1]],
];

/**
 * Rueda un cubo sobre las casillas del desarrollo, empezando por la primera: la
 * cara que queda abajo en cada casilla es la que va pintada ahí. Devuelve la
 * etiqueta de cara (0 a 5) de cada casilla, o `null` si no es un desarrollo
 * (si dos casillas dan la misma cara, no se pliega en un cubo).
 * Etiquetas: 0 arriba, 1 abajo, 2 norte, 3 sur, 4 este, 5 oeste; son opuestas 0-1, 2-3 y 4-5.
 */
export function carasDelDesarrollo(celdas: readonly [number, number][]): number[] | null {
  const clave = (x: number, y: number) => `${x},${y}`;
  const mapa = new Map(celdas.map(([x, y], i) => [clave(x, y), i]));
  const cara: number[] = Array(celdas.length).fill(-1);
  // estado = [arriba, abajo, norte, sur, este, oeste] (qué etiqueta hay en cada lado)
  const pila: { i: number; e: number[] }[] = [{ i: 0, e: [0, 1, 2, 3, 4, 5] }];
  cara[0] = 1;
  while (pila.length) {
    const { i, e } = pila.pop()!;
    const [x, y] = celdas[i];
    const pasos: [number, number, (e: number[]) => number[]][] = [
      [1, 0, ([a, b, n, s, es, o]) => [o, es, n, s, a, b]],   // rueda al este
      [-1, 0, ([a, b, n, s, es, o]) => [es, o, n, s, b, a]],  // al oeste
      [0, -1, ([a, b, n, s, es, o]) => [s, n, a, b, es, o]],  // al norte (hacia y−1)
      [0, 1, ([a, b, n, s, es, o]) => [n, s, b, a, es, o]],   // al sur
    ];
    for (const [dx, dy, mueve] of pasos) {
      const j = mapa.get(clave(x + dx, y + dy));
      if (j === undefined || cara[j] !== -1) continue;
      const nuevo = mueve(e);
      cara[j] = nuevo[1];
      pila.push({ i: j, e: nuevo });
    }
  }
  if (cara.some((c) => c === -1) || new Set(cara).size !== 6) return null;
  return cara;
}
const OPUESTA = [1, 0, 3, 2, 5, 4];
const GLIFOS_CARA = ['●', '■', '✚', '◆', '★', '○'] as const;

export function desarrollos(r: Azar): PreguntaPsico {
  const red = elige(r, DESARROLLOS);
  const cara = carasDelDesarrollo(red)!;
  const simbolos = baraja(r, GLIFOS_CARA);                 // símbolo de cada etiqueta de cara
  const desarrollo: Desarrollo = red.map(([x, y], i) => ({ x, y, s: simbolos[cara[i]] }));
  const de = (s: string) => simbolos.indexOf(s as (typeof GLIFOS_CARA)[number]);

  if (r() < 0.55) {
    const dado = elige(r, simbolos);
    const opuesto = simbolos[OPUESTA[de(dado)]];
    const o = conDistractores(r, opuesto, simbolos.filter((s) => s !== opuesto && s !== dado), () => '—');
    return {
      tipo: 'desarrollos',
      enunciado: `Se pliega el desarrollo y se forma un cubo. ¿Qué figura queda en la cara opuesta a la ${dado}?`,
      desarrollo, opciones: o.opciones, correcta: o.correcta,
      explicacion: `Dos caras son opuestas si en el desarrollo hay una entre ellas en línea (o están separadas por una casilla en cada dirección). Frente a ${dado} queda ${opuesto} = ${opuesto}.`,
    };
  }
  // «¿Qué tres figuras NO se pueden ver a la vez?»: la imposible lleva dos caras opuestas.
  const trioValido = (): string[] => {
    for (let i = 0; i < 100; i++) {
      const t = baraja(r, simbolos).slice(0, 3);
      if (!t.some((a, k) => t.some((b, m) => k < m && OPUESTA[de(a)] === de(b)))) return t;
    }
    return [simbolos[0], simbolos[2], simbolos[4]];
  };
  const trioImposible = (): string[] => {
    const a = elige(r, simbolos);
    const resto = simbolos.filter((s) => s !== a && s !== simbolos[OPUESTA[de(a)]]);
    return baraja(r, [a, simbolos[OPUESTA[de(a)]], elige(r, resto)]);
  };
  const clave = (t: string[]) => [...t].sort().join('');
  const mala = trioImposible();
  const vistos = new Set([clave(mala)]);
  const buenos: string[][] = [];
  for (let i = 0; i < 200 && buenos.length < 3; i++) { const t = trioValido(); if (!vistos.has(clave(t))) { vistos.add(clave(t)); buenos.push(t); } }
  const todas = baraja(r, [mala, ...buenos]);
  return {
    tipo: 'desarrollos',
    enunciado: 'Se pliega el desarrollo y se forma un cubo. ¿Cuál de estos grupos de tres figuras NO se puede ver a la vez en el cubo?',
    desarrollo,
    opciones: todas.map((t) => ({ texto: t.join('   ') })),
    correcta: todas.indexOf(mala),
    explicacion: `En un cubo solo se ven a la vez tres caras que se tocan en una esquina; dos opuestas nunca. Aquí ${mala[0]}, ${mala[1]} y ${mala[2]} incluyen dos opuestas: ${mala.join(' ')} = ${mala.join('   ')}.`,
  };
}

// ---------------------------------------------------------------------------
// Plegados: se dobla un papel, se agujerea y se pregunta cómo queda al abrirlo
// ---------------------------------------------------------------------------

export type Pliegue = 'izquierda-sobre-derecha' | 'derecha-sobre-izquierda' | 'arriba-sobre-abajo' | 'abajo-sobre-arriba';
const TEXTO_PLIEGUE: Record<Pliegue, string> = {
  'izquierda-sobre-derecha': 'se dobla la mitad izquierda sobre la derecha',
  'derecha-sobre-izquierda': 'se dobla la mitad derecha sobre la izquierda',
  'arriba-sobre-abajo': 'se dobla la mitad de arriba sobre la de abajo',
  'abajo-sobre-arriba': 'se dobla la mitad de abajo sobre la de arriba',
};

/** Dónde cae cada casilla (x, y) de un papel de `n`×`n` tras los pliegues: su posición en el papel doblado. */
export function posicionTrasPliegues(x: number, y: number, n: number, pliegues: readonly Pliegue[]): [number, number] {
  let w = n, h = n, px = x, py = y;
  for (const p of pliegues) {
    if (p === 'izquierda-sobre-derecha') { px = px < w / 2 ? w - 1 - px - w / 2 : px - w / 2; w /= 2; }
    else if (p === 'derecha-sobre-izquierda') { px = px >= w / 2 ? w - 1 - px : px; w /= 2; }
    else if (p === 'arriba-sobre-abajo') { py = py < h / 2 ? h - 1 - py - h / 2 : py - h / 2; h /= 2; }
    else { py = py >= h / 2 ? h - 1 - py : py; h /= 2; }
  }
  return [px, py];
}

/** Los agujeros del papel abierto si se agujerea la casilla (hx, hy) del papel doblado. */
export function agujerosAlAbrir(n: number, pliegues: readonly Pliegue[], hx: number, hy: number): boolean[][] {
  return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (__, x) => {
    const [px, py] = posicionTrasPliegues(x, y, n, pliegues);
    return px === hx && py === hy;
  }));
}

const ESQUINA = (hx: number, hy: number) => `${hy === 0 ? 'arriba' : 'abajo'} a la ${hx === 0 ? 'izquierda' : 'derecha'}`;

export function plegados(r: Azar): PreguntaPsico {
  const n = 4;
  const horizontales: Pliegue[] = ['izquierda-sobre-derecha', 'derecha-sobre-izquierda'];
  const verticales: Pliegue[] = ['arriba-sobre-abajo', 'abajo-sobre-arriba'];
  const primero = r() < 0.5 ? horizontales : verticales;
  const segundo = primero === horizontales ? verticales : horizontales;
  const pliegues = [elige(r, primero), elige(r, segundo)];
  const hx = entero(r, 0, 1), hy = entero(r, 0, 1);
  const buena = agujerosAlAbrir(n, pliegues, hx, hy);
  const otras: boolean[][][] = [];
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) if (x !== hx || y !== hy) otras.push(agujerosAlAbrir(n, pliegues, x, y));
  const todas = baraja(r, [buena, ...otras]);
  return {
    tipo: 'plegados',
    enunciado: `Un papel cuadrado ${TEXTO_PLIEGUE[pliegues[0]]} y, después, ${TEXTO_PLIEGUE[pliegues[1]]}. Se hace un agujero en la casilla de ${ESQUINA(hx, hy)} del papel ya doblado. ¿Cómo queda el papel al abrirlo del todo?`,
    opciones: todas.map((agujeros) => ({ agujeros })),
    correcta: todas.indexOf(buena),
    explicacion: `Cada pliegue refleja el papel: el agujero atraviesa las cuatro capas y al abrir aparece 4 veces, una en cada cuarto del papel, en las casillas que quedaron juntas = ${buena.flat().filter(Boolean).length} agujeros.`,
  };
}

// ---------------------------------------------------------------------------
// Giros de figuras con varios elementos
// ---------------------------------------------------------------------------

const FORMAS_GIRO: Elemento['forma'][] = ['flecha', 'triangulo', 'cruz', 'cuadrado'];
const conGiro = (f: Elemento['forma']) => f === 'flecha' || f === 'triangulo';

/** Gira la figura 90° a la derecha `veces` veces: cada elemento pasa al hueco siguiente y gira con ella. */
export function giraFigura(f: FiguraCompleja, veces: number): FiguraCompleja {
  let out = f;
  for (let k = 0; k < ((veces % 4) + 4) % 4; k++) {
    out = out.map((_, i) => { const e = out[(i + 3) % 4]; return { forma: e.forma, giro: conGiro(e.forma) ? (e.giro + 1) % 4 : 0 }; });
  }
  return out;
}
/** La imagen en un espejo vertical: los huecos de la derecha y la izquierda se cambian y los giros se reflejan. */
export function espejoFigura(f: FiguraCompleja): FiguraCompleja {
  const out = [f[0], f[3], f[2], f[1]];
  return out.map((e) => ({ forma: e.forma, giro: conGiro(e.forma) ? (4 - e.giro) % 4 : 0 }));
}
const llaveFigura = (f: FiguraCompleja) => f.map((e) => `${e.forma}${e.giro}`).join('|');

export function giros(r: Azar): PreguntaPsico {
  let figura: FiguraCompleja = [{ forma: 'flecha', giro: 0 }, { forma: 'cruz', giro: 0 }, { forma: 'triangulo', giro: 1 }, { forma: 'cuadrado', giro: 0 }];
  for (let i = 0; i < 100; i++) {
    const f: FiguraCompleja = Array.from({ length: 4 }, () => { const forma = elige(r, FORMAS_GIRO); return { forma, giro: conGiro(forma) ? entero(r, 0, 3) : 0 }; });
    const versiones = [0, 1, 2, 3].flatMap((k) => [giraFigura(f, k), espejoFigura(giraFigura(f, k))]).map(llaveFigura);
    if (f.filter((e) => conGiro(e.forma)).length >= 2 && new Set(versiones).size === 8) { figura = f; break; }
  }
  const veces = elige(r, [1, 2, 3]);
  const buena = giraFigura(figura, veces);
  const otras = [0, 1, 2, 3].flatMap((k) => [giraFigura(figura, k), espejoFigura(giraFigura(figura, k))]).filter((g) => llaveFigura(g) !== llaveFigura(buena));
  const elegidas = baraja(r, otras).slice(0, 3);
  const todas = baraja(r, [buena, ...elegidas]);
  return {
    tipo: 'giros',
    enunciado: `Se gira la figura ${veces * 90}° a la derecha, en el sentido de las agujas del reloj. ¿Cuál es el resultado?`,
    figura,
    opciones: todas.map((f) => ({ figura: f })),
    correcta: todas.findIndex((f) => llaveFigura(f) === llaveFigura(buena)),
    explicacion: `Cada elemento pasa ${veces} ${veces === 1 ? 'hueco' : 'huecos'} a la derecha (en el sentido del reloj) y las flechas y los triángulos giran ${veces * 90}° con la figura. Las otras opciones son otros giros o la figura en espejo.`,
  };
}

// ---------------------------------------------------------------------------
// Parentescos
// ---------------------------------------------------------------------------

type Persona = { nombre: string; mujer: boolean };
type Familia = {
  abuelo: Persona; abuela: Persona;
  hijos: [Persona, Persona]; pareja: [Persona, Persona]; nietos: [Persona, Persona];
};
const NOMBRES_H = ['Antonio', 'Manuel', 'Francisco', 'Luis', 'Pablo', 'Javier', 'Carlos', 'Andrés', 'Sergio', 'Ramón'];
const NOMBRES_M = ['Lucía', 'Ana', 'Pilar', 'Asunción', 'María', 'Teresa', 'Elena', 'Rosa', 'Marta', 'Irene'];

/** El árbol: una pareja de abuelos, dos hijos con su pareja, y un nieto de cada pareja. */
function creaFamilia(r: Azar): Familia {
  const h = baraja(r, NOMBRES_H), m = baraja(r, NOMBRES_M);
  const persona = (mujer: boolean): Persona => ({ mujer, nombre: (mujer ? m : h).shift()! });
  const abuelo = persona(false), abuela = persona(true);
  const hijo1 = persona(r() < 0.5), hijo2 = persona(r() < 0.5);
  const par1 = persona(!hijo1.mujer), par2 = persona(!hijo2.mujer);
  const nieto1 = persona(r() < 0.5), nieto2 = persona(r() < 0.5);
  return { abuelo, abuela, hijos: [hijo1, hijo2], pareja: [par1, par2], nietos: [nieto1, nieto2] };
}

/** Qué es `a` de `b`, según el árbol; `null` si el parentesco no es uno de los que se preguntan. */
export function parentesco(f: Familia, a: Persona, b: Persona): string | null {
  const todos = [f.abuelo, f.abuela, ...f.hijos, ...f.pareja, ...f.nietos];
  if (!todos.includes(a) || !todos.includes(b) || a === b) return null;
  const padres = (p: Persona): Persona[] => (p === f.hijos[0] || p === f.hijos[1] ? [f.abuelo, f.abuela] : p === f.nietos[0] ? [f.hijos[0], f.pareja[0]] : p === f.nietos[1] ? [f.hijos[1], f.pareja[1]] : []);
  const pareja = (p: Persona): Persona | null => (p === f.abuelo ? f.abuela : p === f.abuela ? f.abuelo : p === f.hijos[0] ? f.pareja[0] : p === f.pareja[0] ? f.hijos[0] : p === f.hijos[1] ? f.pareja[1] : p === f.pareja[1] ? f.hijos[1] : null);
  const hermanos = (p: Persona): Persona[] => (p === f.hijos[0] ? [f.hijos[1]] : p === f.hijos[1] ? [f.hijos[0]] : []);
  const g = (m: string, fem: string) => (a.mujer ? fem : m);

  if (padres(b).includes(a)) return g('padre', 'madre');
  if (padres(a).includes(b)) return g('hijo', 'hija');
  if (pareja(a) === b) return g('esposo', 'esposa');
  if (hermanos(a).includes(b)) return g('hermano', 'hermana');
  if (padres(b).some((p) => padres(p).includes(a))) return g('abuelo', 'abuela');
  if (padres(a).some((p) => padres(p).includes(b))) return g('nieto', 'nieta');
  if (padres(b).some((p) => hermanos(p).includes(a))) return g('tío', 'tía');
  if (padres(a).some((p) => hermanos(p).includes(b))) return g('sobrino', 'sobrina');
  if (padres(a).some((p) => padres(b).some((q) => hermanos(p).includes(q)))) return g('primo', 'prima');
  const parejaB = pareja(b);
  if (parejaB && padres(parejaB).includes(a)) return g('suegro', 'suegra');
  if (padres(a).includes(b) === false && pareja(a) && padres(pareja(a)!).includes(b)) return g('yerno', 'nuera');
  if (hermanos(b).some((x) => pareja(x) === a)) return g('cuñado', 'cuñada');
  if (parejaB && hermanos(parejaB).includes(a)) return g('cuñado', 'cuñada');
  return null;
}

export function parentescos(r: Azar): PreguntaPsico {
  const f = creaFamilia(r);
  const todos = [f.abuelo, f.abuela, ...f.hijos, ...f.pareja, ...f.nietos];
  let a = todos[0], b = todos[1], buena = parentesco(f, a, b)!;
  for (let i = 0; i < 100; i++) {
    a = elige(r, todos); b = elige(r, todos);
    const p = parentesco(f, a, b);
    // Los parentescos de pareja, padre e hijo son demasiado directos: se prefiere lo que obliga a razonar.
    if (p && !/^(esposo|esposa|padre|madre|hijo|hija)$/.test(p)) { buena = p; break; }
  }
  const hijoDe = (x: Persona) => (x.mujer ? 'hija' : 'hijo');
  const casadoCon = (x: Persona) => (x.mujer ? 'casada' : 'casado');
  const frases = baraja(r, [
    `${f.abuelo.nombre} y ${f.abuela.nombre} están casados`,
    `${f.hijos[0].nombre} es ${hijoDe(f.hijos[0])} de ${f.abuelo.nombre} y de ${f.abuela.nombre}`,
    `${f.hijos[1].nombre} es ${hijoDe(f.hijos[1])} de ${f.abuelo.nombre} y de ${f.abuela.nombre}`,
    `${f.pareja[0].nombre} está ${casadoCon(f.pareja[0])} con ${f.hijos[0].nombre}`,
    `${f.pareja[1].nombre} está ${casadoCon(f.pareja[1])} con ${f.hijos[1].nombre}`,
    `${f.nietos[0].nombre} es ${hijoDe(f.nietos[0])} de ${f.hijos[0].nombre} y de ${f.pareja[0].nombre}`,
    `${f.nietos[1].nombre} es ${hijoDe(f.nietos[1])} de ${f.hijos[1].nombre} y de ${f.pareja[1].nombre}`,
  ]);
  const confundibles = a.mujer
    ? ['tía', 'prima', 'sobrina', 'cuñada', 'suegra', 'nuera', 'nieta', 'abuela', 'hermana']
    : ['tío', 'primo', 'sobrino', 'cuñado', 'suegro', 'yerno', 'nieto', 'abuelo', 'hermano'];
  const o = conDistractores(r, buena, confundibles, () => (a.mujer ? 'madrina' : 'padrino'));
  return {
    tipo: 'parentescos',
    enunciado: `${frases.join('. ')}. ¿Qué es ${a.nombre} de ${b.nombre}?`,
    opciones: o.opciones, correcta: o.correcta,
    explicacion: `Siguiendo el árbol: ${a.nombre} es ${buena} de ${b.nombre} = ${buena}.`,
  };
}

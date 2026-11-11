/**
 * PSICOTÉCNICOS (regla 117): las preguntas las genera el código, no un banco.
 *
 * POR QUÉ ASÍ
 * Un psicotécnico no pregunta nada que haya que saber: mide rapidez y
 * razonamiento con series, cálculo, atención y figuras. Con un banco de 300
 * preguntas escritas, a la tercera semana el alumno se las sabe de memoria y
 * ya no entrena nada. Aquí cada sesión sale de una SEMILLA: el mismo número da
 * siempre las mismas preguntas, y un número distinto, otras. No se acaban, no
 * cuestan nada (ni IA ni redactarlas) y no hay respuesta que memorizar.
 *
 * LA SEMILLA ES LA CLAVE DE LA CORRECCIÓN. El servidor la guarda al empezar y
 * manda al navegador las preguntas SIN la respuesta (`aPublica`). Al entregar,
 * vuelve a generar la sesión con la misma semilla y corrige (`corrigeSesion`):
 * el acierto lo decide el servidor (regla 110).
 *
 * Cinco opciones (A-E), como la zona 2 de la hoja de respuestas del examen.
 *
 * MÓDULO PURO (regla 21): sin `Math.random`, sin fecha, sin red. Todo lo
 * aleatorio sale del generador que se le pasa, y por eso se puede probar.
 *
 * SI SE CAMBIA UN GENERADOR, una sesión empezada antes del despliegue y
 * entregada después se corregiría contra preguntas distintas. `VERSION` va en
 * cada sesión para poder detectarlo: súbela al tocar cualquier generador.
 */

export const VERSION_PSICO = 1;

export const TIPOS_PSICO = ['series', 'letras', 'calculo', 'verbal', 'atencion', 'figuras'] as const;
export type TipoPsico = (typeof TIPOS_PSICO)[number];

export const TIPO_PSICO_LABEL: Record<TipoPsico, string> = {
  series: 'Series numéricas',
  letras: 'Series de letras',
  calculo: 'Cálculo',
  verbal: 'Sinónimos y antónimos',
  atencion: 'Atención',
  figuras: 'Figuras',
};

export const TIPO_PSICO_DESC: Record<TipoPsico, string> = {
  series: 'Encuentra el número que sigue.',
  letras: 'Encuentra la letra que sigue, con el abecedario español.',
  calculo: 'Operaciones, porcentajes y reglas de tres, sin calculadora.',
  verbal: 'La palabra que significa lo mismo, o lo contrario.',
  atencion: 'Cuenta las parejas de códigos que son idénticas.',
  figuras: 'La figura que falta en la tabla.',
};

export function esTipoPsico(v: unknown): v is TipoPsico {
  return typeof v === 'string' && (TIPOS_PSICO as readonly string[]).includes(v);
}

/** Cuántas preguntas se pueden pedir, y los minutos de cada tamaño (unos 30 s por pregunta). */
export const TAMANOS_PSICO = [15, 25, 40] as const;
export const MINUTOS_PSICO: Record<number, number> = { 15: 8, 25: 12, 40: 20 };
export const OPCIONES_PSICO = 5;

// ---------------------------------------------------------------------------
// Figuras
// ---------------------------------------------------------------------------

export const FORMAS = ['circulo', 'cuadrado', 'triangulo', 'rombo', 'cruz'] as const;
export type Forma = (typeof FORMAS)[number];
export const RELLENOS = ['vacio', 'gris', 'negro'] as const;
export type Relleno = (typeof RELLENOS)[number];

/** Una casilla: una forma, repetida `n` veces, con un relleno. */
export type Celda = { forma: Forma; n: number; relleno: Relleno };

export type OpcionPsico = { texto?: string; celda?: Celda };

export type PreguntaPsico = {
  tipo: TipoPsico;
  enunciado: string;
  /** Líneas en letra de ancho fijo: la serie, o las parejas de códigos. */
  lineas?: string[];
  /** La tabla de 3×3; la última casilla (`null`) es la que falta. */
  matriz?: (Celda | null)[];
  opciones: OpcionPsico[];
  correcta: number;
  explicacion: string;
};

/** Lo que viaja al navegador: sin la respuesta ni la explicación. */
export type PreguntaPsicoPublica = Omit<PreguntaPsico, 'correcta' | 'explicacion'>;

export function aPublica(q: PreguntaPsico): PreguntaPsicoPublica {
  return { tipo: q.tipo, enunciado: q.enunciado, lineas: q.lineas, matriz: q.matriz, opciones: q.opciones };
}

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

const entero = (r: Azar, min: number, max: number) => min + Math.floor(r() * (max - min + 1));
const elige = <T,>(r: Azar, lista: readonly T[]): T => lista[Math.floor(r() * lista.length)];

/** Fisher-Yates (regla 15), con el azar de la sesión. */
function baraja<T>(r: Azar, lista: readonly T[]): T[] {
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
function conDistractores(r: Azar, correcta: string, candidatos: string[], relleno: (k: number) => string): { opciones: OpcionPsico[]; correcta: number } {
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
function numericas(r: Azar, correcta: number, errores: number[]) {
  return conDistractores(
    r,
    String(correcta),
    errores.filter((n) => Number.isFinite(n)).map((n) => String(n)),
    (k) => String(correcta + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.abs(correcta) > 60 ? 5 : 1)),
  );
}

// ---------------------------------------------------------------------------
// Series numéricas
// ---------------------------------------------------------------------------

function series(r: Azar): PreguntaPsico {
  const variante = entero(r, 0, 6);
  let terminos: number[] = [];
  let siguiente = 0;
  let explicacion = '';
  let errores: number[] = [];

  if (variante === 0) {
    const d = elige(r, [-9, -7, -6, -5, -4, -3, 3, 4, 5, 6, 7, 8, 9, 11, 12]);
    const a = entero(r, d < 0 ? 60 : 2, d < 0 ? 99 : 30);
    terminos = Array.from({ length: 5 }, (_, i) => a + d * i);
    siguiente = a + d * 5;
    explicacion = `Cada número es el anterior ${d > 0 ? `más ${d}` : `menos ${-d}`}.`;
    errores = [siguiente + 1, siguiente - 1, siguiente + d, siguiente - d, siguiente + 2];
  } else if (variante === 1) {
    const q = elige(r, [2, 3]);
    const a = entero(r, 1, q === 2 ? 7 : 4);
    terminos = Array.from({ length: 5 }, (_, i) => a * q ** i);
    siguiente = a * q ** 5;
    explicacion = `Cada número es el anterior multiplicado por ${q}.`;
    errores = [siguiente + terminos[4], siguiente - terminos[4], terminos[4] + terminos[3], siguiente + q, siguiente - q, terminos[4] * (q + 1)];
  } else if (variante === 2) {
    const paso = elige(r, [1, 2, 3]);
    const a = entero(r, 1, 20);
    let v = a;
    terminos = [a];
    for (let i = 1; i < 6; i++) { v += paso * i; terminos.push(v); }
    siguiente = terminos.pop()!;
    explicacion = `Lo que se suma crece cada vez: +${paso}, +${paso * 2}, +${paso * 3}, +${paso * 4}, y ahora +${paso * 5}.`;
    errores = [siguiente - paso, siguiente + paso, siguiente - 1, siguiente + 1, terminos[4] + paso * 4];
  } else if (variante === 3) {
    const sube = entero(r, 5, 12), baja = entero(r, 2, sube - 2);
    const a = entero(r, 3, 25);
    terminos = [a];
    for (let i = 1; i < 7; i++) terminos.push(terminos[i - 1] + (i % 2 ? sube : -baja));
    siguiente = terminos.pop()!;
    explicacion = `Se alternan dos pasos: sumar ${sube} y restar ${baja}. Toca ${terminos.length % 2 ? 'sumar' : 'restar'}.`;
    errores = [terminos[5] + sube, terminos[5] - baja, siguiente + 1, siguiente - 1, terminos[5] + sube - baja];
  } else if (variante === 4) {
    const a = entero(r, 2, 15), b = entero(r, 30, 60);
    const d1 = entero(r, 2, 6), d2 = -entero(r, 2, 6);
    terminos = [a, b, a + d1, b + d2, a + 2 * d1, b + 2 * d2];
    siguiente = a + 3 * d1;
    explicacion = `Son dos series mezcladas: las posiciones impares van de ${d1} en ${d1} (${a}, ${a + d1}, ${a + 2 * d1}…) y las pares bajan de ${-d2} en ${-d2}.`;
    errores = [b + 3 * d2, siguiente + 1, siguiente - 1, a + 2 * d1 + d2, siguiente + d1];
  } else if (variante === 5) {
    const k = entero(r, -3, 6), n0 = entero(r, 1, 5);
    terminos = Array.from({ length: 5 }, (_, i) => (n0 + i) ** 2 + k);
    siguiente = (n0 + 5) ** 2 + k;
    explicacion = `Son cuadrados seguidos (${n0}², ${n0 + 1}², ${n0 + 2}²…)${k === 0 ? '' : k > 0 ? ` más ${k}` : ` menos ${-k}`}. Las diferencias crecen de 2 en 2.`;
    errores = [siguiente - 2, siguiente + 2, siguiente - 1, siguiente + 1, terminos[4] + (terminos[4] - terminos[3])];
  } else {
    const a = entero(r, 1, 6), b = entero(r, a + 1, 9);
    terminos = [a, b];
    for (let i = 2; i < 7; i++) terminos.push(terminos[i - 1] + terminos[i - 2]);
    siguiente = terminos.pop()!;
    explicacion = 'Cada número es la suma de los dos anteriores.';
    errores = [siguiente + 1, siguiente - 1, terminos[5] * 2, terminos[5] + terminos[3], siguiente + terminos[0]];
  }

  return {
    tipo: 'series',
    enunciado: '¿Qué número continúa la serie?',
    lineas: [`${terminos.join('  ·  ')}  ·  ?`],
    ...numericas(r, siguiente, errores),
    explicacion,
  };
}

// ---------------------------------------------------------------------------
// Series de letras
// ---------------------------------------------------------------------------

/** El abecedario español: 27 letras, con la Ñ. */
export const ABECEDARIO = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
const N = ABECEDARIO.length;
const letra = (i: number) => ABECEDARIO[((i % N) + N) % N];

function letras(r: Azar): PreguntaPsico {
  const variante = entero(r, 0, 2);
  const inicio = entero(r, 0, N - 1);
  let indices: number[] = [];
  let siguiente = 0;
  let explicacion = '';

  if (variante === 0) {
    const salto = elige(r, [-3, -2, 2, 3, 4]);
    indices = Array.from({ length: 5 }, (_, i) => inicio + salto * i);
    siguiente = inicio + salto * 5;
    explicacion = salto > 0 ? `Se avanzan ${salto} letras cada vez.` : `Se retroceden ${-salto} letras cada vez.`;
  } else if (variante === 1) {
    let v = inicio;
    indices = [v];
    for (let i = 1; i < 6; i++) { v += i; indices.push(v); }
    siguiente = indices.pop()!;
    explicacion = 'El salto crece cada vez: una letra, luego dos, luego tres, cuatro, y ahora cinco.';
  } else {
    const otra = inicio + entero(r, 8, 14);
    const s1 = elige(r, [1, 2]), s2 = elige(r, [-1, -2]);
    indices = [inicio, otra, inicio + s1, otra + s2, inicio + 2 * s1, otra + 2 * s2];
    siguiente = inicio + 3 * s1;
    explicacion = `Son dos series mezcladas: las posiciones impares avanzan ${s1 === 1 ? 'una letra' : 'dos letras'} y las pares retroceden.`;
  }

  const correcta = letra(siguiente);
  const candidatos = [-3, -2, -1, 1, 2, 3].map((d) => letra(siguiente + d));
  return {
    tipo: 'letras',
    enunciado: '¿Qué letra continúa la serie? (abecedario español, con la Ñ; después de la Z vuelve la A)',
    lineas: [`${indices.map(letra).join('  ·  ')}  ·  ?`],
    ...conDistractores(r, correcta, candidatos, (k) => letra(siguiente + 3 + k)),
    explicacion,
  };
}

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------

function calculo(r: Azar): PreguntaPsico {
  const variante = entero(r, 0, 4);

  if (variante === 0) {
    const a = entero(r, 6, 19), b = entero(r, 3, 9), c = entero(r, 11, 49);
    const suma = r() < 0.5;
    const res = suma ? a * b + c : a * b - c;
    return {
      tipo: 'calculo',
      enunciado: `¿Cuánto es ${a} × ${b} ${suma ? '+' : '−'} ${c}?`,
      ...numericas(r, res, [a * (b + (suma ? c : -c)), res + 10, res - 10, res + b, res - a, suma ? a * b - c : a * b + c]),
      explicacion: `Primero la multiplicación: ${a} × ${b} = ${a * b}. Después, ${suma ? `más ${c}` : `menos ${c}`}: ${res}.`,
    };
  }
  if (variante === 1) {
    const pct = elige(r, [5, 10, 15, 20, 25, 30, 40, 75]);
    const base = entero(r, 2, 24) * (pct % 10 === 0 ? 10 : 20);
    const res = (base * pct) / 100;
    return {
      tipo: 'calculo',
      enunciado: `¿Cuánto es el ${pct} % de ${base}?`,
      ...numericas(r, res, [res * 2, res / 2, base - res, res + 10, res - 5, (base * (pct + 5)) / 100].filter(Number.isInteger)),
      explicacion: `${pct} % de ${base} = ${base} × ${pct} ÷ 100 = ${res}.`,
    };
  }
  if (variante === 2) {
    const unidades = entero(r, 2, 6), precio = entero(r, 3, 12), pedidas = entero(r, 7, 15);
    const cosa = elige(r, [['cuadernos', '€'], ['cajas', 'kg'], ['entradas', '€'], ['sacos', 'kg']] as const);
    const total = unidades * precio, res = pedidas * precio;
    return {
      tipo: 'calculo',
      enunciado: cosa[1] === '€'
        ? `Si ${unidades} ${cosa[0]} cuestan ${total} €, ¿cuánto cuestan ${pedidas}?`
        : `Si ${unidades} ${cosa[0]} pesan ${total} kg, ¿cuánto pesan ${pedidas}?`,
      ...numericas(r, res, [res + precio, res - precio, pedidas * unidades, total + pedidas, res + unidades, total * pedidas / 10].filter(Number.isInteger)),
      explicacion: `Cada uno ${cosa[1] === '€' ? 'cuesta' : 'pesa'} ${total} ÷ ${unidades} = ${precio}. Por ${pedidas}: ${res}.`,
    };
  }
  if (variante === 3) {
    const den = elige(r, [3, 4, 5, 6, 8]), num = entero(r, 2, den - 1);
    const base = den * entero(r, 6, 25);
    const res = (base / den) * num;
    return {
      tipo: 'calculo',
      enunciado: `¿Cuánto es ${num}/${den} de ${base}?`,
      ...numericas(r, res, [base / den, base - res, res + base / den, res - base / den, res + num, base / num].filter(Number.isInteger)),
      explicacion: `${base} ÷ ${den} = ${base / den}; por ${num}: ${res}.`,
    };
  }
  const a = entero(r, 12, 48), b = entero(r, 6, 19), c = entero(r, 2, 6);
  const res = (a + b) * c;
  return {
    tipo: 'calculo',
    enunciado: `¿Cuánto es (${a} + ${b}) × ${c}?`,
    ...numericas(r, res, [a + b * c, a * c + b, res + c, res - c, res + 10]),
    explicacion: `Primero el paréntesis: ${a} + ${b} = ${a + b}. Por ${c}: ${res}.`,
  };
}

// ---------------------------------------------------------------------------
// Verbal
// ---------------------------------------------------------------------------

/**
 * Parejas de significados alejados entre sí: los distractores de una salen de
 * las respuestas de las otras, así que ninguna puede valer para dos.
 */
export const SINONIMOS: readonly (readonly [string, string])[] = [
  ['diligente', 'aplicado'], ['efímero', 'pasajero'], ['perspicaz', 'agudo'], ['lacónico', 'breve'],
  ['veraz', 'sincero'], ['arduo', 'difícil'], ['nítido', 'claro'], ['pretérito', 'pasado'],
  ['exiguo', 'escaso'], ['ileso', 'indemne'], ['hurtar', 'robar'], ['auxiliar', 'socorrer'],
  ['ocultar', 'esconder'], ['altercado', 'disputa'], ['indagar', 'investigar'], ['cautela', 'prudencia'],
  ['custodiar', 'vigilar'], ['dádiva', 'regalo'], ['fatiga', 'cansancio'], ['júbilo', 'alegría'],
  ['morada', 'vivienda'], ['raudo', 'veloz'], ['tenaz', 'constante'], ['vetusto', 'antiguo'],
  ['zozobra', 'inquietud'], ['querella', 'denuncia'], ['sosiego', 'calma'], ['mermar', 'disminuir'],
  ['omitir', 'callar'], ['recluir', 'encerrar'], ['absolver', 'perdonar'], ['coacción', 'presión'],
];

export const ANTONIMOS: readonly (readonly [string, string])[] = [
  ['lícito', 'ilegal'], ['culpable', 'inocente'], ['acusar', 'defender'], ['temerario', 'prudente'],
  ['opaco', 'transparente'], ['escaso', 'abundante'], ['efímero', 'duradero'], ['veraz', 'mentiroso'],
  ['ascender', 'bajar'], ['ampliar', 'reducir'], ['aliado', 'enemigo'], ['valiente', 'cobarde'],
  ['fértil', 'estéril'], ['humilde', 'soberbio'], ['encender', 'apagar'], ['vigente', 'derogado'],
  ['público', 'privado'], ['leve', 'grave'], ['tenso', 'relajado'], ['áspero', 'suave'],
  ['admitir', 'rechazar'], ['premiar', 'castigar'], ['urbano', 'rural'], ['nocivo', 'beneficioso'],
  ['detener', 'liberar'], ['ordenar', 'desordenar'], ['mayoría', 'minoría'], ['anterior', 'posterior'],
  ['absolver', 'condenar'], ['aumentar', 'disminuir'], ['voluntario', 'obligatorio'], ['ganancia', 'pérdida'],
];

function verbal(r: Azar): PreguntaPsico {
  const sinonimo = r() < 0.5;
  const lista = sinonimo ? SINONIMOS : ANTONIMOS;
  const i = entero(r, 0, lista.length - 1);
  const [palabra, respuesta] = lista[i];
  const otras = lista.filter((_, k) => k !== i).map((p) => p[1]).filter((p) => p !== respuesta && p !== palabra);
  return {
    tipo: 'verbal',
    enunciado: sinonimo
      ? `¿Qué palabra significa lo mismo que «${palabra}»?`
      : `¿Qué palabra significa lo contrario de «${palabra}»?`,
    ...conDistractores(r, respuesta, otras, (k) => `opción ${k}`),
    explicacion: sinonimo ? `«${palabra}» y «${respuesta}» son sinónimos.` : `Lo contrario de «${palabra}» es «${respuesta}».`,
  };
}

// ---------------------------------------------------------------------------
// Atención
// ---------------------------------------------------------------------------

/** Sin letras ni cifras que se confundan a propósito: la dificultad está en mirar, no en adivinar. */
const SIGNOS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function codigo(r: Azar, largo: number): string {
  let s = '';
  for (let i = 0; i < largo; i++) s += SIGNOS[Math.floor(r() * SIGNOS.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** El mismo código con UN cambio: un signo distinto, o dos vecinos cambiados de sitio. */
function alterado(r: Azar, original: string): string {
  const chars = original.split('');
  const posiciones = chars.map((c, i) => (c === '-' ? -1 : i)).filter((i) => i >= 0);
  if (r() < 0.5) {
    const i = elige(r, posiciones);
    let nuevo = chars[i];
    while (nuevo === chars[i]) nuevo = SIGNOS[Math.floor(r() * SIGNOS.length)];
    chars[i] = nuevo;
  } else {
    const pares = posiciones.filter((i) => chars[i + 1] && chars[i + 1] !== '-' && chars[i + 1] !== chars[i]);
    if (pares.length) {
      const i = elige(r, pares);
      [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
    } else {
      const i = posiciones[0];
      chars[i] = chars[i] === 'A' ? 'B' : 'A';
    }
  }
  return chars.join('');
}

function atencion(r: Azar): PreguntaPsico {
  const parejas = OPCIONES_PSICO - 1; // 4 parejas: la respuesta va de 0 a 4, justo cinco opciones
  const iguales = entero(r, 0, parejas);
  const cuales = baraja(r, Array.from({ length: parejas }, (_, i) => i < iguales));
  const lineas = cuales.map((igual) => {
    const a = codigo(r, 8);
    return `${a}     ${igual ? a : alterado(r, a)}`;
  });
  return {
    tipo: 'atencion',
    enunciado: '¿Cuántas de estas parejas son exactamente iguales?',
    lineas,
    opciones: Array.from({ length: OPCIONES_PSICO }, (_, i) => ({ texto: i === 0 ? 'Ninguna' : String(i) })),
    correcta: iguales,
    explicacion: iguales === 0
      ? 'Ninguna: en todas cambia un signo o hay dos cambiados de sitio.'
      : `Son iguales ${iguales === 1 ? 'la' : 'las'} ${cuales.map((x, i) => (x ? `${i + 1}.ª` : '')).filter(Boolean).join(', ')}. En las demás cambia un signo o hay dos cambiados de sitio.`,
  };
}

// ---------------------------------------------------------------------------
// Figuras
// ---------------------------------------------------------------------------

const mismaCelda = (a: Celda, b: Celda) => a.forma === b.forma && a.n === b.n && a.relleno === b.relleno;

/**
 * Una tabla de 3×3 donde cada rasgo (forma, cantidad, relleno) sigue su propia
 * regla: cambia por filas, por columnas o en diagonal. Falta la última casilla.
 */
function figuras(r: Azar): PreguntaPsico {
  const formas = baraja(r, FORMAS).slice(0, 3);
  const rellenos = baraja(r, RELLENOS);
  const cantidades = baraja(r, [1, 2, 3]);
  // Cuatro maneras de recorrer la tabla; cada rasgo usa una distinta.
  const reglas = baraja(r, [
    { f: (fila: number, col: number) => fila, nombre: 'cambia de fila en fila' },
    { f: (fila: number, col: number) => col, nombre: 'cambia de columna en columna' },
    { f: (fila: number, col: number) => (fila + col) % 3, nombre: 'se desplaza un puesto en cada fila' },
    { f: (fila: number, col: number) => (col - fila + 3) % 3, nombre: 'se desplaza un puesto hacia el otro lado en cada fila' },
  ]).slice(0, 3);

  const celda = (fila: number, col: number): Celda => ({
    forma: formas[reglas[0].f(fila, col)],
    n: cantidades[reglas[1].f(fila, col)],
    relleno: rellenos[reglas[2].f(fila, col)],
  });
  const matriz: (Celda | null)[] = [];
  for (let fila = 0; fila < 3; fila++) for (let col = 0; col < 3; col++) matriz.push(fila === 2 && col === 2 ? null : celda(fila, col));

  const buena = celda(2, 2);
  // Los distractores fallan en UN rasgo: son los errores de quien solo mira dos reglas.
  const candidatas: Celda[] = [
    ...formas.filter((f) => f !== buena.forma).map((forma) => ({ ...buena, forma })),
    ...cantidades.filter((n) => n !== buena.n).map((n) => ({ ...buena, n })),
    ...rellenos.filter((x) => x !== buena.relleno).map((relleno) => ({ ...buena, relleno })),
  ];
  const malas = baraja(r, candidatas).slice(0, OPCIONES_PSICO - 1);
  const todas = baraja(r, [buena, ...malas]);

  return {
    tipo: 'figuras',
    enunciado: '¿Qué figura falta en la tabla?',
    matriz,
    opciones: todas.map((c) => ({ celda: c })),
    correcta: todas.findIndex((c) => mismaCelda(c, buena)),
    explicacion: `La forma ${reglas[0].nombre}; la cantidad ${reglas[1].nombre}; el relleno ${reglas[2].nombre}.`,
  };
}

// ---------------------------------------------------------------------------
// La sesión
// ---------------------------------------------------------------------------

const GENERADORES: Record<TipoPsico, (r: Azar) => PreguntaPsico> = { series, letras, calculo, verbal, atencion, figuras };

/** Los tipos pedidos, limpios y en el orden de siempre; sin ninguno válido, todos. */
export function tiposValidos(tipos: unknown): TipoPsico[] {
  const pedidos = Array.isArray(tipos) ? tipos.filter(esTipoPsico) : [];
  const limpios = TIPOS_PSICO.filter((t) => pedidos.includes(t));
  return limpios.length ? limpios : [...TIPOS_PSICO];
}

/**
 * La sesión entera, a partir de la semilla. Los tipos se reparten por turno
 * para que salgan los mismos de cada uno, y luego se barajan.
 *
 * MISMA semilla, MISMOS tipos y MISMO total → las mismas preguntas, siempre.
 */
export function generaSesion(semilla: number, tipos: readonly TipoPsico[], total: number): PreguntaPsico[] {
  const r = azarDe(semilla);
  const lista = tipos.length ? tipos : TIPOS_PSICO;
  const orden = baraja(r, Array.from({ length: total }, (_, i) => lista[i % lista.length]));
  return orden.map((tipo) => GENERADORES[tipo](r));
}

export type ResultadoPsico = {
  total: number;
  aciertos: number;
  fallos: number;
  blancos: number;
  /** Sobre 10, con la penalización: cada fallo resta 1/(opciones − 1) de un acierto. */
  nota: number;
  porTipo: Partial<Record<TipoPsico, { a: number; t: number }>>;
};

/**
 * La nota: aciertos menos fallos/(n − 1), sobre 10 y sin bajar de cero. Es la
 * misma fórmula de la prueba de conocimientos (regla 22, con 3 opciones cada
 * dos fallos quitan un acierto) llevada a cinco opciones: cada cuatro fallos.
 */
export function notaPsico(aciertos: number, fallos: number, total: number): number {
  if (total <= 0) return 0;
  const netos = Math.max(0, aciertos - fallos / (OPCIONES_PSICO - 1));
  return Math.round((netos / total) * 1000) / 100;
}

/** `-1` (o cualquier cosa que no sea una opción) es blanco: ni acierto ni fallo (regla 24). */
export function normalizaRespuesta(v: unknown): number {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) < OPCIONES_PSICO ? (v as number) : -1;
}

export function corrigeSesion(preguntas: readonly PreguntaPsico[], respuestas: readonly unknown[]): ResultadoPsico {
  let aciertos = 0, fallos = 0, blancos = 0;
  const porTipo: ResultadoPsico['porTipo'] = {};
  preguntas.forEach((q, i) => {
    const marcada = normalizaRespuesta(respuestas[i]);
    const t = porTipo[q.tipo] ?? { a: 0, t: 0 };
    t.t++;
    if (marcada === -1) blancos++;
    else if (marcada === q.correcta) { aciertos++; t.a++; }
    else fallos++;
    porTipo[q.tipo] = t;
  });
  return { total: preguntas.length, aciertos, fallos, blancos, nota: notaPsico(aciertos, fallos, preguntas.length), porTipo };
}

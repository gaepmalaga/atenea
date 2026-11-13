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

export const VERSION_PSICO = 2;

import {
  TIPOS_PSICO, esTipoPsico, OPCIONES_PSICO, FORMAS, RELLENOS, azarDe, entero, elige, baraja, conDistractores, numericas,
  type TipoPsico, type Azar, type Celda, type Ficha, type Rejilla, type Tabla, type Forma, type Relleno,
  type OpcionPsico, type PreguntaPsico, type PreguntaPsicoPublica,
} from './psico-comun';
export * from './psico-comun';
import { cubos, desarrollos, plegados, giros, parentescos } from './psico-visual';
import { conteo, dobles, problemas, abecedario, logica, cuadros, cifrado, ordenes, simbolos, leyendaDe } from './psico-nuevos';
export { aplicaOrdenes, ORDENES, leyendaDe, NOMBRES_SIMBOLOS } from './psico-nuevos';
export { parentesco, carasDelDesarrollo, agujerosAlAbrir, posicionTrasPliegues, giraFigura, espejoFigura, totalDeCubos, figuraDeCubos, DESARROLLOS } from './psico-visual';


export const TIPO_PSICO_LABEL: Record<TipoPsico, string> = {
  series: 'Series numéricas',
  letras: 'Series de letras',
  calculo: 'Cálculo',
  verbal: 'Sinónimos y antónimos',
  atencion: 'Atención',
  figuras: 'Figuras',
  dominos: 'Dominós',
  rotaciones: 'Rotaciones',
  tablas: 'Tablas de datos',
  conteo: 'Contar números',
  dobles: 'Series dobles',
  problemas: 'Problemas',
  abecedario: 'Abecedario',
  logica: 'Lógica',
  cuadros: 'Cuadros con una X',
  cifrado: 'Palabras en símbolos',
  simbolos: 'Símbolos y nombres',
  ordenes: 'Órdenes sobre una frase',
  cubos: 'Cubos contados',
  desarrollos: 'Desarrollos de cubo',
  plegados: 'Plegados de papel',
  giros: 'Giros de figuras',
  parentescos: 'Parentescos',
};

export const TIPO_PSICO_DESC: Record<TipoPsico, string> = {
  series: 'Encuentra el número que sigue.',
  letras: 'Encuentra la letra que sigue, con el abecedario español.',
  calculo: 'Operaciones, porcentajes y reglas de tres, sin calculadora.',
  verbal: 'La palabra que significa lo mismo, o lo contrario.',
  atencion: 'Cuenta las parejas de códigos que son idénticas.',
  figuras: 'La figura que falta en la tabla.',
  dominos: 'La ficha que continúa la serie.',
  rotaciones: 'La figura que queda al girarla.',
  tablas: 'Sumas, diferencias y porcentajes sobre una tabla.',
  conteo: 'Cuántos números hay entre dos, quitando algunos.',
  dobles: 'Dos series mezcladas: encuentra el siguiente.',
  problemas: 'El aceite, la cuenta del bar, los grifos, las edades…',
  abecedario: 'Posiciones de letras y palabras ordenadas.',
  logica: 'Quién es más alto, y qué se deduce de unas afirmaciones.',
  cuadros: 'El número que falta en una tabla, con su regla.',
  cifrado: 'Una palabra escrita en símbolos y su anagrama.',
  simbolos: 'Ejercicio 2: cambia símbolos por nombres y busca el orden alfabético.',
  ordenes: 'Ejercicio 3: aplica órdenes en cadena a una frase.',
  cubos: 'Cuenta los cubos de una figura, sumando o restando figuras.',
  desarrollos: 'Qué cara queda frente a otra al plegar un cubo.',
  plegados: 'Cómo queda un papel doblado y agujereado al abrirlo.',
  giros: 'Una figura con varios elementos, girada 90°, 180° o 270°.',
  parentescos: 'Quién es quién en una familia.',
};

/**
 * LOS TRES EJERCICIOS DEL EXAMEN (docs/PSICOTECNICO-REAL.md): cuántas
 * preguntas, cuántos minutos y cuántas opciones tiene cada uno. El ejercicio 1
 * mezcla los tipos de razonamiento; el 2 y el 3 son de un solo tipo.
 */
export const EJERCICIOS_PSICO = {
  1: {
    nombre: 'Ejercicio 1', descripcion: 'Razonamiento numérico, verbal y espacial', total: 40, minutos: 23,
    tipos: ['series', 'letras', 'calculo', 'verbal', 'figuras', 'dominos', 'rotaciones', 'tablas', 'conteo', 'dobles', 'problemas', 'abecedario', 'logica', 'cuadros', 'cifrado', 'cubos', 'desarrollos', 'plegados', 'giros', 'parentescos'] as TipoPsico[],
  },
  2: { nombre: 'Ejercicio 2', descripcion: 'Símbolos y nombres en orden alfabético', total: 34, minutos: 18, tipos: ['simbolos'] as TipoPsico[] },
  3: { nombre: 'Ejercicio 3', descripcion: 'Órdenes sobre una frase', total: 30, minutos: 18, tipos: ['ordenes'] as TipoPsico[] },
} as const;
export type NumeroEjercicio = keyof typeof EJERCICIOS_PSICO;
export const esEjercicio = (v: unknown): v is NumeroEjercicio => v === 1 || v === 2 || v === 3;

/**
 * Las versiones que el servidor sabe regenerar. La 1 tenía siempre 5 opciones;
 * la 2 (13 nov) tiene 4 opciones, o 3 en los ejercicios 2 y 3, como el examen.
 * Una sesión empezada con la 1 se sigue corrigiendo y repasando como la 1.
 */
export const VERSIONES_PSICO = [1, 2] as const;
export const esVersionPsico = (v: unknown): v is (typeof VERSIONES_PSICO)[number] => (VERSIONES_PSICO as readonly unknown[]).includes(v);

/** Cuántas opciones tiene una pregunta de este tipo en esta versión. */
export function opcionesDe(tipo: TipoPsico, version: number = VERSION_PSICO): number {
  if (version < 2) return OPCIONES_PSICO;
  return tipo === 'simbolos' || tipo === 'ordenes' ? 3 : 4;
}

/**
 * Deja la correcta y `n − 1` distractores elegidos al azar, en su orden. Un
 * generador hace siempre 5 opciones; recortar después deja intactas las
 * sesiones de la versión 1 (no se gasta ni un número aleatorio más en ellas).
 */
function recorta(q: PreguntaPsico, n: number, r: Azar): PreguntaPsico {
  if (q.opciones.length <= n) return q;
  const otras = baraja(r, q.opciones.map((_, i) => i).filter((i) => i !== q.correcta)).slice(0, n - 1);
  const quedan = [...otras, q.correcta].sort((a, b) => a - b);
  return { ...q, opciones: quedan.map((i) => q.opciones[i]), correcta: quedan.indexOf(q.correcta) };
}


/** Cuántas preguntas se pueden pedir, y los minutos de cada tamaño (unos 30 s por pregunta). */
export const TAMANOS_PSICO = [15, 25, 40] as const;
export const MINUTOS_PSICO: Record<number, number> = { 15: 8, 25: 12, 40: 20 };


export function aPublica(q: PreguntaPsico): PreguntaPsicoPublica {
  return { tipo: q.tipo, enunciado: q.enunciado, lineas: q.lineas, matriz: q.matriz, fichas: q.fichas, rejilla: q.rejilla, tabla: q.tabla, leyenda: q.leyenda, cubos: q.cubos, desarrollo: q.desarrollo, figura: q.figura, opciones: q.opciones };
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
// Dominós
// ---------------------------------------------------------------------------

const PUNTOS = 7; // de 0 a 6
const mod7 = (n: number) => ((n % PUNTOS) + PUNTOS) % PUNTOS;

const regla = (paso: number, mitad: string) =>
  paso === 0 ? `la mitad de ${mitad} se queda igual`
    : `la mitad de ${mitad} ${paso > 0 ? 'sube' : 'baja'} ${Math.abs(paso)} en cada ficha`;

/**
 * Una serie de cuatro fichas y la que sigue. Cada mitad sigue su propia regla:
 * sube o baja un número fijo de puntos en cada ficha, y después del 6 viene el 0
 * (y antes del 0, el 6). Una ficha de dominó se puede dar la vuelta, así que
 * ningún distractor es la misma ficha que la buena puesta del revés.
 */
function dominos(r: Azar): PreguntaPsico {
  let pasoArriba = 0, pasoAbajo = 0;
  while (pasoArriba === 0 && pasoAbajo === 0) { pasoArriba = entero(r, -3, 3); pasoAbajo = entero(r, -3, 3); }
  const a0 = entero(r, 0, 6), b0 = entero(r, 0, 6);
  const ficha = (i: number): Ficha => [mod7(a0 + i * pasoArriba), mod7(b0 + i * pasoAbajo)];
  const buena = ficha(4);

  const llave = (f: Ficha) => `${Math.min(...f)}-${Math.max(...f)}`;
  const vistas = new Set<string>([llave(buena)]);
  const malas: Ficha[] = [];
  const candidatas: Ficha[] = baraja(r, [
    [mod7(buena[0] + 1), buena[1]], [mod7(buena[0] - 1), buena[1]],
    [buena[0], mod7(buena[1] + 1)], [buena[0], mod7(buena[1] - 1)],
    [mod7(buena[0] + pasoArriba), buena[1]], [buena[0], mod7(buena[1] + pasoAbajo)],
    [mod7(buena[0] + 2), mod7(buena[1] - 2)], [mod7(buena[0] - pasoArriba), mod7(buena[1] - pasoAbajo)],
  ] as Ficha[]);
  for (const c of candidatas) if (!vistas.has(llave(c))) { vistas.add(llave(c)); malas.push(c); }
  for (let a = 0; malas.length < OPCIONES_PSICO - 1 && a < PUNTOS; a++) {
    for (let b = 0; malas.length < OPCIONES_PSICO - 1 && b < PUNTOS; b++) {
      const f: Ficha = [a, b];
      if (!vistas.has(llave(f))) { vistas.add(llave(f)); malas.push(f); }
    }
  }
  const todas = baraja(r, [buena, ...malas.slice(0, OPCIONES_PSICO - 1)]);

  return {
    tipo: 'dominos',
    enunciado: '¿Qué ficha continúa la serie?',
    fichas: [ficha(0), ficha(1), ficha(2), ficha(3), null],
    opciones: todas.map((f) => ({ ficha: f })),
    correcta: todas.findIndex((f) => f === buena),
    explicacion: `En la serie, ${regla(pasoArriba, 'arriba')} y ${regla(pasoAbajo, 'abajo')} (después del 6 viene el 0). La que sigue es ${buena[0]} arriba y ${buena[1]} abajo.`,
  };
}

// ---------------------------------------------------------------------------
// Rotaciones
// ---------------------------------------------------------------------------

const LADO = 3;
const giraDerecha = (g: Rejilla): Rejilla => g.map((_, i) => g.map((__, j) => g[LADO - 1 - j][i]));
const espejo = (g: Rejilla): Rejilla => g.map((fila) => [...fila].reverse());
const llaveRejilla = (g: Rejilla) => g.map((f) => f.map((x) => (x ? '1' : '0')).join('')).join('/');
const VUELTAS: Record<number, number> = { 90: 1, 180: 2, 270: 3 };
export const girar = (g: Rejilla, grados: number): Rejilla => {
  let out = g;
  for (let k = 0; k < (VUELTAS[grados] ?? 0); k++) out = giraDerecha(out);
  return out;
};

/** La figura «F»: no tiene ningún eje de simetría, así que sus 8 versiones son distintas. */
const FIGURA_F: Rejilla = [[false, true, true], [true, true, false], [false, true, false]];

/**
 * Una figura de cinco cuadraditos y lo que queda al girarla 90°, 180° o 270° a
 * la derecha. Los distractores son las otras siete versiones: las demás
 * vueltas y los espejos, que es en lo que se equivoca quien gira «a ojo».
 * La figura se elige SIN simetrías, para que ninguna versión se repita.
 */
function rotaciones(r: Azar): PreguntaPsico {
  let figura = FIGURA_F;
  for (let intento = 0; intento < 60; intento++) {
    const celdas = baraja(r, Array.from({ length: LADO * LADO }, (_, i) => i)).slice(0, 5);
    const g: Rejilla = Array.from({ length: LADO }, (_, i) => Array.from({ length: LADO }, (__, j) => celdas.includes(i * LADO + j)));
    const versiones = [0, 90, 180, 270].flatMap((d) => [girar(g, d), espejo(girar(g, d))]).map(llaveRejilla);
    // Conexa por lados sería más bonita, pero lo que importa es que las 8 versiones sean distintas.
    if (new Set(versiones).size === 8) { figura = g; break; }
  }
  const grados = elige(r, [90, 180, 270]);
  const buena = girar(figura, grados);
  const otras = baraja(r, [90, 180, 270, 0].flatMap((d) => [girar(figura, d), espejo(girar(figura, d))])
    .filter((g) => llaveRejilla(g) !== llaveRejilla(buena))).slice(0, OPCIONES_PSICO - 1);
  const todas = baraja(r, [buena, ...otras]);

  return {
    tipo: 'rotaciones',
    enunciado: `Esta figura se gira ${grados}° a la derecha, en el sentido de las agujas del reloj. ¿Cómo queda?`,
    rejilla: figura,
    opciones: todas.map((g) => ({ rejilla: g })),
    correcta: todas.findIndex((g) => llaveRejilla(g) === llaveRejilla(buena)),
    explicacion: `Un giro de ${grados}° a la derecha lleva ${grados === 90 ? 'lo de arriba a la derecha' : grados === 180 ? 'lo de arriba abajo y lo de la izquierda a la derecha' : 'lo de arriba a la izquierda'}. Las otras opciones son otros giros o la figura en espejo.`,
  };
}

// ---------------------------------------------------------------------------
// Tablas de datos
// ---------------------------------------------------------------------------

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'septiembre', 'octubre'];
const DELITOS = ['Robos', 'Hurtos', 'Daños', 'Estafas', 'Amenazas'];
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);

/**
 * Una tabla de denuncias por mes y tipo, y una pregunta que se resuelve con la
 * tabla delante: un total, una diferencia, una media o una variación en tanto
 * por ciento. Los números salen para que el resultado sea siempre entero.
 */
function tablas(r: Azar): PreguntaPsico {
  const inicio = entero(r, 0, MESES.length - 4);
  const meses = MESES.slice(inicio, inicio + 4);
  const delitos = baraja(r, DELITOS).slice(0, 3);
  const datos = meses.map(() => delitos.map(() => entero(r, 4, 20) * 5)); // múltiplos de 5: los porcentajes salen limpios
  const tabla: Tabla = {
    cabecera: ['Mes', ...delitos],
    filas: meses.map((m, i) => [cap(m), ...datos[i].map(String)]),
  };
  const col = entero(r, 0, 2);
  const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const variante = entero(r, 0, 3);
  let enunciado = '', correcta = 0, errores: number[] = [], explicacion = '';

  if (variante === 0) {
    const columna = datos.map((f) => f[col]);
    correcta = suma(columna);
    enunciado = `¿Cuántas denuncias de ${delitos[col].toLowerCase()} hubo entre los cuatro meses?`;
    errores = [correcta - columna[0], correcta - columna[3], correcta + columna[1], suma(datos.map((f) => f[(col + 1) % 3])), correcta - 5, correcta + 10];
    explicacion = `Suma de ${delitos[col].toLowerCase()}: ${columna.join(' + ')} = ${correcta}.`;
  } else if (variante === 1) {
    const i = entero(r, 0, 3);
    correcta = suma(datos[i]);
    enunciado = `¿Cuántas denuncias se presentaron en total en ${meses[i]}?`;
    errores = [correcta - datos[i][0], correcta - datos[i][2], correcta + datos[i][1], suma(datos[(i + 1) % 4]), correcta - 5, correcta + 10];
    explicacion = `Suma de ${meses[i]}: ${datos[i].join(' + ')} = ${correcta}.`;
  } else if (variante === 2) {
    // La diferencia entre dos meses de un mismo tipo.
    const a = entero(r, 0, 3);
    const b = (a + entero(r, 1, 3)) % 4;
    if (datos[a][col] === datos[b][col]) { datos[b][col] += 10; tabla.filas[b][col + 1] = String(datos[b][col]); }
    const mayor = datos[a][col] > datos[b][col] ? a : b;
    const menor = mayor === a ? b : a;
    correcta = datos[mayor][col] - datos[menor][col];
    enunciado = `¿Cuántas denuncias de ${delitos[col].toLowerCase()} más hubo en ${meses[mayor]} que en ${meses[menor]}?`;
    errores = [datos[mayor][col] + datos[menor][col], correcta + 5, correcta - 5, correcta + 10, datos[mayor][col]];
    explicacion = `${datos[mayor][col]} − ${datos[menor][col]} = ${correcta}.`;
  } else {
    // La media de un tipo: se ajusta el último mes para que la suma sea múltiplo de 4.
    const columna = datos.map((f) => f[col]);
    const resto = suma(columna) % 4;
    if (resto !== 0) { datos[3][col] += 4 - resto; columna[3] = datos[3][col]; tabla.filas[3][col + 1] = String(columna[3]); }
    correcta = suma(columna) / 4;
    enunciado = `¿Cuál es la media mensual de denuncias de ${delitos[col].toLowerCase()}?`;
    errores = [suma(columna), suma(columna) / 3, correcta + 5, correcta - 5, Math.max(...columna), correcta + 10];
    explicacion = `(${columna.join(' + ')}) ÷ 4 = ${suma(columna)} ÷ 4 = ${correcta}.`;
  }

  const o = numericas(r, correcta, errores.map((n) => Math.round(n)));
  return { tipo: 'tablas', enunciado, tabla, opciones: o.opciones, correcta: o.correcta, explicacion };
}

// ---------------------------------------------------------------------------
// La sesión
// ---------------------------------------------------------------------------

type Contexto = { leyenda: ReturnType<typeof leyendaDe> };
const GENERADORES: Record<TipoPsico, (r: Azar, ctx: Contexto) => PreguntaPsico> = {
  series, letras, calculo, verbal, atencion, figuras, dominos, rotaciones, tablas,
  conteo, dobles, problemas, abecedario, logica, cuadros, cifrado, ordenes,
  simbolos: (r, ctx) => simbolos(r, ctx.leyenda),
  cubos, desarrollos, plegados, giros, parentescos,
};

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
export function generaSesion(semilla: number, tipos: readonly TipoPsico[], total: number, version: number = VERSION_PSICO): PreguntaPsico[] {
  const r = azarDe(semilla);
  const lista = tipos.length ? tipos : TIPOS_PSICO;
  const orden = baraja(r, Array.from({ length: total }, (_, i) => lista[i % lista.length]));
  // La tabla de símbolos sale de OTRA semilla derivada: no gasta números del azar de la sesión.
  const ctx: Contexto = { leyenda: leyendaDe(semilla) };
  return orden.map((tipo) => {
    const q = GENERADORES[tipo](r, ctx);
    return version >= 2 ? recorta(q, opcionesDe(tipo, version), r) : q;
  });
}

export type ResultadoPsico = {
  total: number;
  aciertos: number;
  fallos: number;
  blancos: number;
  /** Sobre 10, con la penalización: cada fallo resta 1/(opciones − 1) de un acierto. */
  nota: number;
  /** `a` aciertos, `t` preguntas, `f` fallos (solo en la versión 2; la 1 no lo guardaba). */
  porTipo: Partial<Record<TipoPsico, { a: number; t: number; f?: number }>>;
};

/**
 * La nota: aciertos menos fallos/(n − 1), sobre 10 y sin bajar de cero. Es la
 * misma fórmula de la prueba de conocimientos (regla 22, con 3 opciones cada
 * dos fallos quitan un acierto) llevada a cinco opciones: cada cuatro fallos.
 */
export function notaPsico(aciertos: number, fallos: number, total: number, opciones: number = OPCIONES_PSICO): number {
  if (total <= 0) return 0;
  const netos = Math.max(0, aciertos - fallos / (opciones - 1));
  return Math.round((netos / total) * 1000) / 100;
}

/** Los fallos de un tipo valen lo que dicen sus opciones: con 3 son medio acierto, con 4 un tercio. */
const restaPorFallo = (tipo: TipoPsico, version: number) => 1 / (opcionesDe(tipo, version) - 1);

/**
 * La nota de una sesión YA guardada, sin volver a generarla: de los totales y
 * del desglose por tipo. Una sesión de la versión 1, o una sin los fallos por
 * tipo, se calcula con 5 opciones como siempre.
 */
export function notaDeSesionGuardada(s: { version: number; total: number; aciertos: number; fallos: number; porTipo: ResultadoPsico['porTipo'] }): number {
  const tipos = Object.entries(s.porTipo) as [TipoPsico, { a: number; t: number; f?: number }][];
  if (s.version < 2 || tipos.length === 0 || tipos.some(([, v]) => typeof v.f !== 'number')) return notaPsico(s.aciertos, s.fallos, s.total);
  const resta = tipos.reduce((acc, [t, v]) => acc + (v.f ?? 0) * restaPorFallo(t, s.version), 0);
  if (s.total <= 0) return 0;
  return Math.round((Math.max(0, s.aciertos - resta) / s.total) * 1000) / 100;
}

/** Cómo se dice la penalización de una sesión, según las opciones de sus preguntas. */
export function textoPenalizacion(opciones: readonly number[]): string {
  const ns = [...new Set(opciones)];
  if (ns.length !== 1) return 'Los fallos restan según las opciones de cada pregunta; los blancos no restan.';
  const f = ns[0] - 1;
  return `Cada ${f === 1 ? 'fallo' : `${f} fallos`} ${f === 1 ? 'quita' : 'quitan'} un acierto; los blancos no restan.`;
}

/** `-1` (o cualquier cosa que no sea una opción) es blanco: ni acierto ni fallo (regla 24). */
export function normalizaRespuesta(v: unknown, opciones: number = OPCIONES_PSICO): number {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) < opciones ? (v as number) : -1;
}

export function corrigeSesion(preguntas: readonly PreguntaPsico[], respuestas: readonly unknown[]): ResultadoPsico {
  let aciertos = 0, fallos = 0, blancos = 0, resta = 0;
  const porTipo: ResultadoPsico['porTipo'] = {};
  preguntas.forEach((q, i) => {
    // Una opción que esta pregunta no tiene (un 4 en una de 3) es un blanco.
    const marcada = normalizaRespuesta(respuestas[i], q.opciones.length);
    const t = porTipo[q.tipo] ?? { a: 0, t: 0, f: 0 };
    t.t++;
    if (marcada === -1) blancos++;
    else if (marcada === q.correcta) { aciertos++; t.a++; }
    else { fallos++; t.f = (t.f ?? 0) + 1; resta += 1 / (q.opciones.length - 1); }
    porTipo[q.tipo] = t;
  });
  const total = preguntas.length;
  const nota = total <= 0 ? 0 : Math.round((Math.max(0, aciertos - resta) / total) * 1000) / 100;
  return { total, aciertos, fallos, blancos, nota, porTipo };
}

// ---------------------------------------------------------------------------
// Lo que ve el admin de un alumno
// ---------------------------------------------------------------------------

/** Por debajo de esto, un tipo no dice nada: dos fallos seguidos no son «flojo». */
export const MIN_PREGUNTAS_TIPO_FLOJO = 6;
/** Hasta qué acierto (0-1) un tipo se llama flojo. */
export const UMBRAL_TIPO_FLOJO = 0.5;

export type SesionParaResumen = {
  version: number; fecha: string; total: number; aciertos: number; fallos: number; blancos: number;
  porTipo: ResultadoPsico['porTipo'];
};

export type ResumenPsicoAlumno = {
  sesiones: number;
  /** Media de las notas de sus sesiones; `null` si no ha hecho ninguna (regla 16: no es un 0). */
  notaMedia: number | null;
  /** Nota de la última y de la anterior, para ver si sube. */
  ultimaNota: number | null;
  ultimaFecha: string | null;
  /** Acierto por tipo, del peor al mejor, con las preguntas que lo sostienen. */
  tipos: { tipo: TipoPsico; acierto: number; preguntas: number }[];
  /** Los tipos con acierto bajo y preguntas suficientes, del peor al mejor. */
  flojos: { tipo: TipoPsico; acierto: number; preguntas: number }[];
};

/**
 * La ficha de psicotécnicos de un alumno a partir de sus sesiones entregadas
 * (de la más nueva a la más vieja). Puro (regla 21). Un blanco no es un fallo
 * (regla 24): el acierto de un tipo es sobre lo que se contestó de verdad.
 */
export function resumenPsicoAlumno(sesiones: readonly SesionParaResumen[]): ResumenPsicoAlumno {
  if (sesiones.length === 0) return { sesiones: 0, notaMedia: null, ultimaNota: null, ultimaFecha: null, tipos: [], flojos: [] };
  const notas = sesiones.map((s) => notaDeSesionGuardada({ version: s.version, total: s.total, aciertos: s.aciertos, fallos: s.fallos, porTipo: s.porTipo }));
  const suma = new Map<TipoPsico, { a: number; t: number }>();
  for (const s of sesiones) {
    for (const [tipo, v] of Object.entries(s.porTipo) as [TipoPsico, { a: number; t: number; f?: number }][]) {
      const x = suma.get(tipo) ?? { a: 0, t: 0 };
      x.a += v.a; x.t += v.t;
      suma.set(tipo, x);
    }
  }
  const tipos = [...suma.entries()]
    .filter(([, v]) => v.t > 0)
    .map(([tipo, v]) => ({ tipo, acierto: v.a / v.t, preguntas: v.t }))
    .sort((a, b) => a.acierto - b.acierto || b.preguntas - a.preguntas);
  return {
    sesiones: sesiones.length,
    notaMedia: Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 100) / 100,
    ultimaNota: notas[0],
    ultimaFecha: sesiones[0].fecha,
    tipos,
    flojos: tipos.filter((t) => t.preguntas >= MIN_PREGUNTAS_TIPO_FLOJO && t.acierto < UMBRAL_TIPO_FLOJO).slice(0, 4),
  };
}

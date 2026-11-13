/**
 * LOS GENERADORES DE LOS EJERCICIOS DEL EXAMEN REAL (regla 117, 13 nov).
 *
 * A partir de dos modelos de psicotécnico de Policía Nacional (ver
 * `docs/PSICOTECNICO-REAL.md`) se añaden los tipos que faltaban: los del
 * ejercicio 1 (conteo, series dobles, problemas, abecedario, lógica, cuadros y
 * cifrado) y los ejercicios 2 (símbolos y nombres) y 3 (órdenes sobre una
 * frase). No se copia ninguna pregunta: son las mismas FORMAS con datos
 * generados.
 *
 * Cada generador es puro: todo lo aleatorio sale del `Azar` que recibe. Los
 * resultados salen SIEMPRE enteros, y cada explicación termina en «= N.» con
 * la respuesta, que es lo que comprueban los tests.
 */
import {
  OPCIONES_PSICO, azarDe, entero, elige, baraja, conDistractores, numericas,
  type Azar, type Leyenda, type PreguntaPsico,
} from './psico-comun';

const ALFABETO = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
const comparador = new Intl.Collator('es', { sensitivity: 'base' });
const ordena = (xs: readonly string[]) => [...xs].sort((a, b) => comparador.compare(a, b));
const suma = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** Opciones numéricas con una unidad («3 horas», «45 €»). Los distractores son errores típicos. */
function conUnidad(r: Azar, valor: number, errores: number[], sufijo: string) {
  const f = (n: number) => `${n}${sufijo}`;
  return conDistractores(r, f(valor), errores.filter((n) => Number.isInteger(n) && n > 0).map(f), (k) => f(valor + k));
}

// ---------------------------------------------------------------------------
// Conteo: «¿cuántos números hay del 7 al 38 sin contar los que acaban en…?»
// ---------------------------------------------------------------------------

export function conteo(r: Azar): PreguntaPsico {
  const variante = entero(r, 0, 3);
  let enunciado = '', total = 0, quitados = 0, errores: number[] = [], explicacion = '';

  if (variante === 0) {
    const a = entero(r, 5, 30), b = a + entero(r, 15, 40);
    const finales = baraja(r, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3).sort((x, y) => x - y);
    let buenos = 0;
    for (let n = a; n <= b; n++) if (!finales.includes(n % 10)) buenos++;
    total = b - a + 1; quitados = total - buenos;
    enunciado = `¿Cuántos números hay del ${a} al ${b}, ambos incluidos, sin contar los que acaban en ${finales.slice(0, -1).join(', ')} y ${finales[2]}?`;
    errores = [total, buenos + 1, buenos - 1, buenos + 2, buenos - 2, total - 1];
    explicacion = `Del ${a} al ${b} hay ${total} números; los que acaban en ${finales.join(', ')} son ${quitados}: ${total} − ${quitados} = ${buenos}.`;
    return cierraConteo(r, enunciado, buenos, errores, explicacion);
  }
  if (variante === 1) {
    const k = elige(r, [3, 4, 6, 7]);
    const a = entero(r, 10, 60), b = a + entero(r, 80, 200);
    let cuenta = 0;
    for (let n = a + 1; n < b; n++) if (n % k === 0) cuenta++;
    let conExtremos = 0;
    for (let n = a; n <= b; n++) if (n % k === 0) conExtremos++;
    enunciado = `¿Cuántos números divisibles por ${k} hay entre el ${a} y el ${b}, ambos exclusive?`;
    errores = [conExtremos, cuenta + 1, cuenta - 1, Math.ceil((b - a) / k), cuenta + 2, cuenta - 2];
    explicacion = `Entre el ${a} y el ${b} hay ${b - a - 1} números, y uno de cada ${k} es múltiplo de ${k}: en total son ${cuenta} (primer múltiplo ${Math.floor(a / k) * k + k}, último ${Math.ceil(b / k) * k - k}) = ${cuenta}.`;
    return cierraConteo(r, enunciado, cuenta, errores, explicacion);
  }
  const a = entero(r, 30, 60), b = a + entero(r, 80, 150);
  const par = variante === 2;
  let buenos = 0, malos = 0;
  for (let n = a; n <= b; n++) {
    const dosCifras = n >= 10 && n <= 99;
    if ((par ? n % 2 === 0 : n % 2 === 1) && dosCifras) malos++; else buenos++;
  }
  total = b - a + 1;
  enunciado = `¿Cuántos números hay del ${a} al ${b}, ambos inclusive, sin contar los números ${par ? 'pares' : 'impares'} de 2 cifras?`;
  errores = [total, buenos + 1, buenos - 1, buenos + 2, buenos - 2, total - malos + 1];
  explicacion = `Del ${a} al ${b} hay ${total} números; los ${par ? 'pares' : 'impares'} de 2 cifras (hasta el 99) son ${malos}: ${total} − ${malos} = ${buenos}.`;
  return cierraConteo(r, enunciado, buenos, errores, explicacion);
}

function cierraConteo(r: Azar, enunciado: string, valor: number, errores: number[], explicacion: string): PreguntaPsico {
  const o = numericas(r, valor, errores);
  return { tipo: 'conteo', enunciado, opciones: o.opciones, correcta: o.correcta, explicacion };
}

// ---------------------------------------------------------------------------
// Series dobles: dos series entrelazadas
// ---------------------------------------------------------------------------

export function dobles(r: Azar): PreguntaPsico {
  let da = 0, db = 0;
  while (da === 0 || db === 0 || da === db) { da = entero(r, -4, 7); db = entero(r, -4, 7); }
  const a0 = entero(r, 12, 40) + (da < 0 ? -4 * da : 0);
  const b0 = entero(r, 12, 40) + (db < 0 ? -4 * db : 0);
  const A = (i: number) => a0 + i * da;
  const B = (i: number) => b0 + i * db;
  const dados: number[] = [];
  for (let i = 0; i < 4; i++) dados.push(A(i), B(i));
  const siguiente = A(4);
  const o = numericas(r, siguiente, [B(4), siguiente + 1, siguiente - 1, A(3) + db, siguiente + da, B(3) + da]);
  return {
    tipo: 'dobles',
    enunciado: '¿Qué número continuaría la serie?',
    lineas: [dados.join('   ')],
    opciones: o.opciones,
    correcta: o.correcta,
    explicacion: `Son dos series entrelazadas. Las de los lugares impares (${[0, 1, 2, 3].map(A).join(', ')}) ${da > 0 ? 'suben' : 'bajan'} ${Math.abs(da)} cada vez; las de los pares (${[0, 1, 2, 3].map(B).join(', ')}), ${db > 0 ? 'suben' : 'bajan'} ${Math.abs(db)}. Toca la de los impares: ${A(3)} ${da > 0 ? '+' : '−'} ${Math.abs(da)} = ${siguiente}.`,
  };
}

// ---------------------------------------------------------------------------
// Problemas: los de toda la vida (el aceite, la cuenta del bar, los grifos…)
// ---------------------------------------------------------------------------

type Problema = { enunciado: string; valor: number; errores: number[]; sufijo: string; explicacion: string };

/** La media de lo que cuesta el litro cuando se compra a precios distintos. */
function aceite(r: Azar): Problema {
  for (let intento = 0; intento < 400; intento++) {
    const litros = [entero(r, 2, 6), entero(r, 2, 6), entero(r, 2, 6)];
    const precios = [entero(r, 1, 4), entero(r, 2, 5), entero(r, 3, 6)];
    const gasto = litros.reduce((a, l, i) => a + l * precios[i], 0);
    const total = suma(litros);
    if (gasto % total !== 0 || new Set(precios).size < 3) continue;
    const media = gasto / total;
    const lote = (i: number) => `${litros[i]} litros a ${precios[i]} € el litro`;
    return {
      enunciado: `Compro ${lote(0)}, otros ${lote(1)} y otros ${lote(2)}. ¿A cuánto sale de media el litro de aceite?`,
      valor: media, sufijo: ' €',
      errores: [Math.round(suma(precios) / 3), media + 1, media - 1, gasto, Math.round(gasto / 3), media + 2],
      explicacion: `Gasto: ${litros.map((l, i) => `${l}·${precios[i]}`).join(' + ')} = ${gasto} €. Litros: ${litros.join(' + ')} = ${total}. Media: ${gasto} ÷ ${total} = ${media}.`,
    };
  }
  return gallinas(r);
}

/** El precio del último lote, conocida la media. */
function aceiteX(r: Azar): Problema {
  for (let intento = 0; intento < 400; intento++) {
    const l1 = entero(r, 2, 6), l2 = entero(r, 2, 6), l3 = entero(r, 2, 6);
    const p1 = entero(r, 1, 4), p2 = entero(r, 2, 5), p3 = entero(r, 2, 7);
    const total = l1 + l2 + l3;
    const gasto = l1 * p1 + l2 * p2 + l3 * p3;
    if (gasto % total !== 0) continue;
    const media = gasto / total;
    if (p3 === p1 || p3 === p2) continue;
    return {
      enunciado: `Compro ${l1} litros de aceite a ${p1} € el litro y otros ${l2} litros a ${p2} € el litro. Después compro ${l3} litros más, a X € el litro, y el precio medio de todo el aceite sale a ${media} € el litro. ¿Cuánto vale X?`,
      valor: p3, sufijo: ' €',
      errores: [p3 + 1, p3 - 1, media, p3 + 2, p3 - 2, Math.round((p1 + p2) / 2)],
      explicacion: `En total son ${total} litros a ${media} € = ${media * total} €. Ya llevo ${l1 * p1 + l2 * p2} € y quedan ${media * total - l1 * p1 - l2 * p2} € para ${l3} litros: ${media * total - l1 * p1 - l2 * p2} ÷ ${l3} = ${p3}.`,
    };
  }
  return gallinas(r);
}

/** La cuenta del bar: alguien no paga y lo reparten los demás. */
function bar(r: Azar): Problema {
  const n = entero(r, 4, 8), m = entero(r, 1, 2), c = entero(r, 1, 3);
  const cuenta = n * (n - m) * c * 2;
  const pagan = n - m;
  const cada = cuenta / pagan, normal = cuenta / n;
  if (r() < 0.5) {
    return {
      enunciado: `${n} amigos toman algo en un bar y la cuenta es de ${cuenta} €. ${m === 1 ? 'Uno de ellos tiene que irse y no paga' : 'Dos de ellos tienen que irse y no pagan'}; los demás reparten la cuenta a partes iguales. ¿Cuánto paga cada uno de los que pagan?`,
      valor: cada, sufijo: ' €',
      errores: [normal, cuenta / (n + 1), cada + 1, cada - 1, cada + 2, cuenta - cada],
      explicacion: `Pagan ${n} − ${m} = ${pagan} personas: ${cuenta} ÷ ${pagan} = ${cada}.`,
    };
  }
  return {
    enunciado: `${n} amigos toman algo en un bar y la cuenta es de ${cuenta} €. ${m === 1 ? 'Uno de ellos se va sin pagar' : 'Dos de ellos se van sin pagar'}, así que los demás reparten la cuenta a partes iguales. ¿Cuánto más paga cada uno de los que se quedan respecto a lo que pagaría si hubiesen pagado todos?`,
    valor: cada - normal, sufijo: ' €',
    errores: [cada, normal, cada - normal + 1, cada - normal - 1, cada - normal + 2, m],
    explicacion: `Si pagan todos: ${cuenta} ÷ ${n} = ${normal} €. Pagando ${pagan}: ${cuenta} ÷ ${pagan} = ${cada} €. Diferencia: ${cada} − ${normal} = ${cada - normal}.`,
  };
}

/** Los invitados de una comida: cuántos asisten. */
function invitados(r: Azar): Problema {
  for (let intento = 0; intento < 400; intento++) {
    const p = entero(r, 8, 20), x = p + entero(r, 3, 10), m = entero(r, 2, 5);
    if ((m * x) % (x - p) !== 0) continue;
    const n = (m * x) / (x - p);
    if (n <= m || n > 40) continue;
    return {
      enunciado: `El precio de una comida es de ${p} € por persona. A esta comida acuden ${m} personas que no pagarán, ya que serán invitadas por el resto de asistentes, que abonarán ${x} € cada uno. ¿Cuántas personas asisten a la comida?`,
      valor: n, sufijo: '',
      errores: [n + 1, n - 1, n - m, n + m, m * p, n + 2],
      explicacion: `Si asisten n personas, el total es ${p}·n y lo pagan n − ${m} personas a ${x} €: ${p}n = ${x}(n − ${m}) → ${x - p}n = ${x * m} → n = ${n}.`,
    };
  }
  return bar(r);
}

function gallinas(r: Azar): Problema {
  const cabezas = entero(r, 20, 50), conejos = entero(r, 5, cabezas - 5);
  const patas = 2 * (cabezas - conejos) + 4 * conejos;
  return {
    enunciado: `En una granja hay gallinas y conejos: en total ${cabezas} cabezas y ${patas} patas. ¿Cuántos conejos hay?`,
    valor: conejos, sufijo: '',
    errores: [cabezas - conejos, conejos + 1, conejos - 1, conejos + 2, conejos - 2, patas - cabezas],
    explicacion: `Si todos fueran gallinas habría ${2 * cabezas} patas; sobran ${patas} − ${2 * cabezas} = ${patas - 2 * cabezas}, y cada conejo aporta 2 más: ${patas - 2 * cabezas} ÷ 2 = ${conejos}.`,
  };
}

function porcentaje(r: Azar): Problema {
  const p = elige(r, [10, 20, 25, 30, 40, 60, 75]);
  const base = entero(r, 4, 25) * 20;
  const parte = (base * p) / 100;
  if (r() < 0.5) {
    return {
      enunciado: `En una comisaría trabajan ${base} agentes y el ${p} % son mujeres. ¿Cuántos hombres trabajan en ella?`,
      valor: base - parte, sufijo: '',
      errores: [parte, base - parte + 10, base - parte - 10, base - parte + 5, base - parte - 5, base + parte],
      explicacion: `El ${p} % de ${base} es ${parte}; hombres: ${base} − ${parte} = ${base - parte}.`,
    };
  }
  return {
    enunciado: `Un artículo costaba ${base} € y ha subido un ${p} %. ¿Cuánto cuesta ahora?`,
    valor: base + parte, sufijo: ' €',
    errores: [parte, base - parte, base + parte + 10, base + parte - 10, base + parte + 5, base + parte - 5],
    explicacion: `El ${p} % de ${base} es ${parte}; ahora cuesta ${base} + ${parte} = ${base + parte}.`,
  };
}

function grifos(r: Azar): Problema {
  const [a, b] = elige(r, [[6, 3], [12, 4], [6, 12], [10, 15], [20, 5], [30, 20], [12, 6], [24, 8], [15, 10]] as const);
  const juntos = (a * b) / (a + b);
  return {
    enunciado: `Un grifo llena un depósito en ${a} horas y otro lo llena en ${b} horas. ¿Cuánto tardan en llenarlo abriendo los dos a la vez?`,
    valor: juntos, sufijo: ' horas',
    errores: [(a + b) / 2, a + b, Math.abs(a - b), juntos + 1, juntos + 2, Math.max(1, juntos - 1)].map((n) => Math.round(n)),
    explicacion: `En una hora llenan 1/${a} + 1/${b} = ${a + b}/${a * b} del depósito, luego tardan ${a * b}/${a + b} = ${juntos}.`,
  };
}

function reparto(r: Azar): Problema {
  const e = [6, 12, 18];
  const total = entero(r, 5, 30) * 6000; // múltiplo de 36·1000/6: las tres partes salen enteras
  const idx = entero(r, 0, 2);
  const parte = (total * e[idx]) / suma(e);
  return {
    enunciado: `Se reparten ${total} € entre tres personas de 6, 12 y 18 años, de forma proporcional a sus edades. ¿Cuánto recibe la de ${e[idx]} años?`,
    valor: parte, sufijo: ' €',
    errores: [total / 3, parte + 5000, parte - 5000, (total * e[(idx + 1) % 3]) / suma(e), total - parte, parte + 10000],
    explicacion: `Las edades suman ${suma(e)}: cada parte vale ${total} ÷ ${suma(e)} = ${total / suma(e)} y a ${e[idx]} años le tocan ${e[idx]} partes: ${e[idx]} × ${total / suma(e)} = ${parte}.`,
  };
}

function tiempo(r: Azar): Problema {
  const w = entero(r, 1, 3), d = entero(r, 1, 6);
  const dias = 7 * w + d, minutos = dias * 1440;
  return {
    enunciado: `¿Cuántos minutos hay en ${w} ${w === 1 ? 'semana' : 'semanas'} y ${d} ${d === 1 ? 'día' : 'días'}?`,
    valor: minutos, sufijo: '',
    errores: [dias * 1400, dias * 1240, (dias + 1) * 1440, (dias - 1) * 1440, dias * 24 * 100, minutos + 1440 / 2],
    explicacion: `${w} semanas y ${d} días son ${7 * w} + ${d} = ${dias} días; cada día tiene 24·60 = 1440 minutos: ${dias} × 1440 = ${minutos}.`,
  };
}

function encuentro(r: Azar): Problema {
  const v1 = entero(r, 12, 30), v2 = entero(r, 12, 30), t = entero(r, 2, 8);
  const d = (v1 + v2) * t;
  return {
    enunciado: `Dos ciclistas salen a la vez de dos puntos separados ${d} km, uno hacia el otro, a ${v1} km/h y a ${v2} km/h. ¿Cuántas horas tardan en encontrarse?`,
    valor: t, sufijo: ' horas',
    errores: [t + 1, t - 1, t + 2, Math.round(d / v1), Math.round(d / v2), t * 2],
    explicacion: `Cada hora se acercan ${v1} + ${v2} = ${v1 + v2} km: ${d} ÷ ${v1 + v2} = ${t}.`,
  };
}

function impresoras(r: Azar): Problema {
  const a = elige(r, [30, 35, 40, 45, 50, 55]), b = elige(r, [20, 25, 30, 35]), t = entero(r, 2, 9);
  const copias = (a + b) * t;
  return {
    enunciado: `La impresora de un despacho hace ${a} copias por minuto y la de otro hace ${b}. ¿Cuántos minutos necesitan las dos juntas para imprimir ${copias} copias?`,
    valor: t, sufijo: ' minutos',
    errores: [t + 1, t - 1, t + 2, Math.round(copias / a), Math.round(copias / b), t * 2],
    explicacion: `Juntas hacen ${a} + ${b} = ${a + b} copias por minuto: ${copias} ÷ ${a + b} = ${t}.`,
  };
}

function edades(r: Azar): Problema {
  const luis = entero(r, 5, 30), n = entero(r, 2, 10);
  const s = 3 * luis + 2 * n;
  return {
    enunciado: `Ana tiene el doble de edad que Luis. Dentro de ${n} años, sus edades sumarán ${s}. ¿Cuántos años tiene Luis ahora?`,
    valor: luis, sufijo: ' años',
    errores: [luis + 1, luis - 1, 2 * luis, luis + n, luis - n, luis + 2],
    explicacion: `Hoy suman 3 veces la edad de Luis; dentro de ${n} años suman ${2 * n} más: 3·Luis + ${2 * n} = ${s} → Luis = ${(s - 2 * n)} ÷ 3 = ${luis}.`,
  };
}

const PROBLEMAS: ((r: Azar) => Problema)[] = [aceite, aceiteX, bar, invitados, gallinas, porcentaje, grifos, reparto, tiempo, encuentro, impresoras, edades];

export function problemas(r: Azar): PreguntaPsico {
  const p = elige(r, PROBLEMAS)(r);
  const o = conUnidad(r, p.valor, p.errores.map((n) => Math.round(n)), p.sufijo);
  return { tipo: 'problemas', enunciado: p.enunciado, opciones: o.opciones, correcta: o.correcta, explicacion: p.explicacion };
}

// ---------------------------------------------------------------------------
// Abecedario
// ---------------------------------------------------------------------------

const PALABRAS_ORDEN = [
  'compañero', 'comisaría', 'comunicación', 'comprobante', 'compromiso', 'competencia', 'comparecencia', 'comandante',
  'combatiente', 'cooperación', 'conducta', 'conciudadano', 'consigna', 'constitución', 'contravención', 'convocatoria',
  'corporación', 'corrupción', 'coordinación', 'contrato',
];
const SIN_ACENTO = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/N~|n~/g, 'Ñ');
const PALABRAS_QUITAR = ['EDIFICAR', 'COMISARIA', 'PATRULLA', 'DENUNCIA', 'ARRESTO', 'AGENTE', 'SEGURIDAD', 'DETENIDO', 'CUSTODIA'];

export function abecedario(r: Azar): PreguntaPsico {
  const variante = entero(r, 0, 3);
  if (variante === 0) {
    const palabra = elige(r, PALABRAS_QUITAR);
    const quitadas = new Set(palabra);
    const quedan = [...ALFABETO].filter((l) => !quitadas.has(l));
    const k = entero(r, 3, 10);
    const buena = quedan[k - 1];
    const o = conDistractores(r, buena, [quedan[k - 2], quedan[k], ALFABETO[k - 1], quedan[k + 1], quedan[k - 3]].filter(Boolean), (j) => ALFABETO[(j * 3) % ALFABETO.length]);
    return {
      tipo: 'abecedario',
      enunciado: `Eliminando del abecedario las letras que forman la palabra ${palabra}, ¿qué letra ocupa el lugar ${k}?`,
      opciones: o.opciones, correcta: o.correcta,
      explicacion: `Quedan: ${quedan.join(' ')}. La que ocupa el lugar ${k} es la ${buena}: lugar ${k} = ${buena}.`,
    };
  }
  if (variante === 1) {
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < 400; i++) {
      x = entero(r, 2, 27); y = entero(r, 2, 27); z = entero(r, 2, 14);
      if ((x * y) % z === 0 && x !== y && y !== z && x !== z) break;
    }
    const valor = (x * y) / z;
    const l = (n: number) => ALFABETO[n - 1];
    const o = numericas(r, valor, [x * y, valor + 1, valor - 1, x + y - z, valor + 2, valor - 2, (x * z) / y]);
    return {
      tipo: 'abecedario',
      enunciado: `Teniendo en cuenta la posición de cada letra en el abecedario español, ¿cuánto resulta de multiplicar la posición de la ${l(x)} por la de la ${l(y)} y dividir el resultado entre la posición de la ${l(z)}?`,
      opciones: o.opciones, correcta: o.correcta,
      explicacion: `${l(x)} = ${x}, ${l(y)} = ${y}, ${l(z)} = ${z}: (${x} × ${y}) ÷ ${z} = ${x * y} ÷ ${z} = ${valor}.`,
    };
  }
  if (variante === 2) {
    const palabras = baraja(r, PALABRAS_ORDEN).slice(0, 5);
    const orden = ordena(palabras);
    const j = entero(r, 1, 5);
    const sitio = entero(r, 4, 7);
    const sel = orden[j - 1];
    const buena = SIN_ACENTO(sel).toUpperCase()[sitio - 1];
    const cercanas = [orden[(j) % 5], orden[(j + 1) % 5], orden[(j + 2) % 5], orden[(j + 3) % 5]].map((w) => SIN_ACENTO(w).toUpperCase()[sitio - 1]);
    const o = conDistractores(r, buena, [...cercanas, SIN_ACENTO(sel).toUpperCase()[sitio], SIN_ACENTO(sel).toUpperCase()[sitio - 2]].filter(Boolean), (n) => ALFABETO[(n * 5) % ALFABETO.length]);
    const nombreLugar = ['primera', 'segunda', 'tercera', 'cuarta', 'quinta'][j - 1];
    return {
      tipo: 'abecedario',
      enunciado: `Ordena alfabéticamente estas palabras: ${palabras.join(', ')}. ¿Qué letra ocupa el lugar ${sitio} de la ${nombreLugar} palabra?`,
      opciones: o.opciones, correcta: o.correcta,
      explicacion: `Ordenadas: ${orden.join(', ')}. La ${nombreLugar} es «${sel}» y su letra número ${sitio} es la ${buena} = ${buena}.`,
    };
  }
  // El valor de cada letra es su posición más k: se da con tres ejemplos.
  const k = elige(r, [1, 2, -1]);
  const tres = baraja(r, [1, 3, 5, 7, 9, 11, 13]).slice(0, 3).sort((a, b) => a - b);
  let x = 0, y = 0, z = 0;
  do { x = entero(r, 8, 24); y = entero(r, 2, x - 1); z = entero(r, 2, 6); } while (x - y === 0);
  const vx = x + k, vy = y + k, vz = z + k;
  const valor = (vx - vy) * vz;
  const o = numericas(r, valor, [vx * vz - vy, valor + vz, valor - vz, (vx + vy) * vz, valor + 1, valor - 1, (x - y) * z]);
  return {
    tipo: 'abecedario',
    enunciado: `En un código cada letra vale su posición en el abecedario ${k > 0 ? 'más' : 'menos'} ${Math.abs(k)} (${tres.map((n) => `${ALFABETO[n - 1]} = ${n + k}`).join(', ')}…). ¿Cuánto vale (${ALFABETO[x - 1]} − ${ALFABETO[y - 1]}) × ${ALFABETO[z - 1]}?`,
    opciones: o.opciones, correcta: o.correcta,
    explicacion: `${ALFABETO[x - 1]} = ${vx}, ${ALFABETO[y - 1]} = ${vy}, ${ALFABETO[z - 1]} = ${vz}: (${vx} − ${vy}) × ${vz} = ${vx - vy} × ${vz} = ${valor}.`,
  };
}

// ---------------------------------------------------------------------------
// Lógica: estatura y silogismos
// ---------------------------------------------------------------------------

const NOMBRES_PERSONAS = ['Juan', 'David', 'Teresa', 'Pedro', 'Marta', 'Luis', 'Elena', 'Pablo', 'Irene', 'Sergio'];
/** Cada grupo, en plural y en singular («Ningún héroe es cobarde»). */
type Nombre = readonly [string, string];
export const TRIPLES: readonly (readonly [Nombre, Nombre, Nombre])[] = [
  [['cobardes', 'cobarde'], ['héroes', 'héroe'], ['soldados', 'soldado']],
  [['músicos', 'músico'], ['deportistas', 'deportista'], ['estudiantes', 'estudiante']],
  [['pintores', 'pintor'], ['jardineros', 'jardinero'], ['vecinos', 'vecino']],
  [['conductores', 'conductor'], ['ciclistas', 'ciclista'], ['alumnos', 'alumno']],
  [['lectores', 'lector'], ['escritores', 'escritor'], ['profesores', 'profesor']],
  [['pilotos', 'piloto'], ['médicos', 'médico'], ['viajeros', 'viajero']],
];

export function logica(r: Azar): PreguntaPsico {
  if (r() < 0.5) {
    const gente = baraja(r, NOMBRES_PERSONAS).slice(0, 4); // de más alto a más bajo
    const frases = [0, 1, 2].map((i) => (r() < 0.5
      ? `${gente[i]} es más alto que ${gente[i + 1]}`
      : `${gente[i + 1]} es menos alto que ${gente[i]}`));
    const pide = elige(r, ['alto', 'bajo', 'segundo']);
    const buena = pide === 'alto' ? gente[0] : pide === 'bajo' ? gente[3] : gente[1];
    const pregunta = pide === 'alto' ? '¿Quién es el más alto de los cuatro?' : pide === 'bajo' ? '¿Quién es el más bajo de los cuatro?' : '¿Quién es el segundo más alto?';
    const o = conDistractores(r, buena, [...gente.filter((g) => g !== buena), 'No se puede saber'], () => 'Ninguno');
    return {
      tipo: 'logica',
      enunciado: `${baraja(r, frases).join('. ')}. ${pregunta}`,
      opciones: o.opciones, correcta: o.correcta,
      explicacion: `De más alto a más bajo: ${gente.join(' > ')}. ${pregunta.replace('¿', '').replace('?', '')}: ${buena}.`,
    };
  }
  const [[X, x], [Y, y], [Z, z]] = elige(r, TRIPLES);
  const plantillas = [
    { p: [`Ningún ${y} es ${x}`, `Algunos ${Z} son ${X}`], bien: `Algunos ${Z} no son ${Y}`, mal: [`Algunos ${Y} son ${X}`, `Todos los ${Z} son ${Y}`, `Todos los ${Z} son ${X}`, `Algunos ${Z} son ${Y}`] },
    { p: [`Todos los ${X} son ${Y}`, `Todos los ${Y} son ${Z}`], bien: `Todos los ${X} son ${Z}`, mal: [`Todos los ${Z} son ${X}`, `Ningún ${x} es ${z}`, `Algunos ${Z} no son ${Y}`, `Todos los ${Y} son ${X}`] },
    { p: [`Todos los ${X} son ${Y}`, `Ningún ${y} es ${z}`], bien: `Ningún ${x} es ${z}`, mal: [`Todos los ${X} son ${Z}`, `Algunos ${X} son ${Z}`, `Todos los ${Z} son ${X}`, `Algunos ${Z} son ${Y}`] },
    { p: [`Algunos ${X} son ${Y}`, `Todos los ${Y} son ${Z}`], bien: `Algunos ${X} son ${Z}`, mal: [`Todos los ${X} son ${Z}`, `Ningún ${x} es ${z}`, `Todos los ${Z} son ${Y}`, `Algunos ${X} no son ${Y}`] },
  ];
  const t = elige(r, plantillas);
  const premisas = t.p.map((x) => `${x}.`);
  const todas = baraja(r, [t.bien, ...t.mal]);
  return {
    tipo: 'logica',
    enunciado: `¿Cuál de las alternativas es la conclusión a partir de estas afirmaciones? ${premisas.join(' ')}`,
    opciones: todas.map((texto) => ({ texto: `${texto}.` })),
    correcta: todas.indexOf(t.bien),
    explicacion: `Solo «${t.bien}» se sigue de lo que se afirma; las demás no se deducen o lo contradicen. Conclusión = ${t.bien}.`,
  };
}

// ---------------------------------------------------------------------------
// Cuadros con una X
// ---------------------------------------------------------------------------

export function cuadros(r: Azar): PreguntaPsico {
  const reglas = [
    { clave: 'suma', nombre: 'la tercera columna es la suma de las dos primeras', c: (a: number, b: number) => a + b, valido: () => true },
    { clave: 'resta', nombre: 'la tercera columna es la primera menos la segunda', c: (a: number, b: number) => a - b, valido: (a: number, b: number) => a > b },
    { clave: 'producto', nombre: 'la tercera columna es la primera por la segunda', c: (a: number, b: number) => a * b, valido: () => true },
    { clave: 'doble', nombre: 'la tercera columna es el doble de la primera más la segunda', c: (a: number, b: number) => 2 * a + b, valido: () => true },
  ];
  const regla = elige(r, reglas);
  const producto = regla.clave === 'producto';
  const filas: [number, number, number][] = [];
  while (filas.length < 3) {
    const a = producto ? entero(r, 2, 9) : entero(r, 10, 60), b = producto ? entero(r, 2, 9) : entero(r, 3, 50);
    if (!regla.valido(a, b)) continue;
    filas.push([a, b, regla.c(a, b)]);
  }
  const col = entero(r, 0, 2);
  const valor = filas[2][col];
  const tabla = {
    cabecera: ['', '', ''],
    filas: filas.map((f, i) => f.map((n, k) => (i === 2 && k === col ? 'X' : String(n)))),
  };
  const [a, b, c] = filas[2];
  const o = numericas(r, valor, [valor + 1, valor - 1, valor + 10, valor - 10, valor + 2, valor - 2, a + b + c]);
  const despeje = regla.clave === 'suma'
    ? (col === 2 ? `${a} + ${b}` : col === 0 ? `${c} − ${b}` : `${c} − ${a}`)
    : regla.clave === 'resta'
      ? (col === 2 ? `${a} − ${b}` : col === 0 ? `${c} + ${b}` : `${a} − ${c}`)
      : regla.clave === 'producto'
        ? (col === 2 ? `${a} × ${b}` : col === 0 ? `${c} ÷ ${b}` : `${c} ÷ ${a}`)
        : (col === 2 ? `2·${a} + ${b}` : col === 0 ? `(${c} − ${b}) ÷ 2` : `${c} − 2·${a}`);
  return {
    tipo: 'cuadros',
    enunciado: 'Sustituye la X por su valor.',
    tabla,
    opciones: o.opciones, correcta: o.correcta,
    explicacion: `En todas las filas ${regla.nombre}. En la última: ${despeje} = ${valor}.`,
  };
}

// ---------------------------------------------------------------------------
// Cifrado: una palabra y su anagrama, en símbolos
// ---------------------------------------------------------------------------

const GLIFOS = ['●', '○', '■', '□', '▲', '△', '◆', '◇', '★', '☆', '◐', '◑'];
const PALABRAS_CIFRA = ['COMISARIA', 'DENUNCIAS', 'PATRULLAS', 'AUTORIDAD', 'DETENCION', 'SEGURIDAD', 'JUSTICIAS', 'ESCOLTAS', 'CAMPEONES', 'PERSONAJE', 'INVIERNO', 'ESCORPION'];

export function cifrado(r: Azar): PreguntaPsico {
  const w1 = elige(r, PALABRAS_CIFRA);
  const unicas = [...new Set(w1)];
  const glifos = baraja(r, GLIFOS).slice(0, unicas.length);
  const mapa = new Map(unicas.map((l, i) => [l, glifos[i]]));
  const cifra = (w: string) => [...w].map((l) => mapa.get(l)!).join(' ');
  let w2 = w1;
  for (let i = 0; i < 40 && w2 === w1; i++) w2 = baraja(r, [...w1]).join('');
  const buena = cifra(w2);
  const parts = [...w2].map((l) => mapa.get(l)!);
  const candidatos: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] !== parts[i + 1]) { const c = [...parts]; [c[i], c[i + 1]] = [c[i + 1], c[i]]; candidatos.push(c.join(' ')); }
  }
  for (let i = 0; i < parts.length; i++) {
    const otro = glifos.find((g) => g !== parts[i])!;
    const c = [...parts]; c[i] = otro; candidatos.push(c.join(' '));
  }
  const o = conDistractores(r, buena, candidatos, (k) => [...parts].reverse().concat(glifos.slice(0, k % glifos.length)).join(' '));
  return {
    tipo: 'cifrado',
    enunciado: `${w1} se escribe así: ${cifra(w1)}. ¿Cómo se escribe ${w2}?`,
    opciones: o.opciones, correcta: o.correcta,
    explicacion: `Cada letra tiene siempre su símbolo (${unicas.map((l) => `${l} = ${mapa.get(l)}`).join(', ')}). ${w2} = ${buena}.`,
  };
}

// ---------------------------------------------------------------------------
// Ejercicio 3: órdenes sobre una frase (3 opciones)
// ---------------------------------------------------------------------------

const FRASES = [
  'obras son amores y no buenas razones',
  'más vale pájaro en mano que ciento volando',
  'a caballo regalado no le mires el diente',
  'no hay mal que por bien no venga',
  'ojos que no ven corazón que no siente',
  'no por mucho madrugar amanece más temprano',
  'dime con quién andas y te diré quién eres',
  'quien siembra vientos recoge tempestades',
];

export type Orden = { clave: string; texto: string; minimo: number; aplica: (p: string[]) => string[] };

const cambia = (p: string[], i: number, j: number) => { const c = [...p]; [c[i], c[j]] = [c[j], c[i]]; return c; };

export const ORDENES: readonly Orden[] = [
  { clave: 'A', texto: 'Pasa la primera palabra al final de la frase', minimo: 2, aplica: (p) => [...p.slice(1), p[0]] },
  { clave: 'B', texto: 'Cambia entre sí la primera y la última palabra', minimo: 2, aplica: (p) => cambia(p, 0, p.length - 1) },
  { clave: 'C', texto: 'Cambia entre sí la tercera y la sexta palabra', minimo: 6, aplica: (p) => cambia(p, 2, 5) },
  { clave: 'D', texto: 'Cambia entre sí la primera y la quinta palabra', minimo: 5, aplica: (p) => cambia(p, 0, 4) },
  { clave: 'E', texto: 'Quita la cuarta palabra', minimo: 4, aplica: (p) => p.filter((_, i) => i !== 3) },
  { clave: 'F', texto: 'Copia la cuarta palabra al final de la frase', minimo: 4, aplica: (p) => [...p, p[3]] },
  { clave: 'G', texto: 'Añade una «s» a las palabras que terminan en «s»', minimo: 1, aplica: (p) => p.map((w) => (w.endsWith('s') ? `${w}s` : w)) },
  { clave: 'H', texto: 'Quita la primera palabra', minimo: 2, aplica: (p) => p.slice(1) },
];

/** Aplica las órdenes en cadena; `null` si alguna no se puede aplicar (faltan palabras). */
export function aplicaOrdenes(frase: string, claves: readonly string[]): { pasos: string[]; final: string } | null {
  let p = frase.split(' ');
  const pasos: string[] = [];
  for (const c of claves) {
    const o = ORDENES.find((x) => x.clave === c)!;
    if (p.length < o.minimo) return null;
    p = o.aplica(p);
    pasos.push(`${c}: ${p.join(' ')}`);
  }
  return { pasos, final: p.join(' ') };
}

export function ordenes(r: Azar): PreguntaPsico {
  const frase = elige(r, FRASES);
  let claves: string[] = [], res: ReturnType<typeof aplicaOrdenes> = null;
  for (let i = 0; i < 200 && !res; i++) {
    const n = entero(r, 3, 4);
    claves = Array.from({ length: n }, () => elige(r, ORDENES).clave);
    res = aplicaOrdenes(frase, claves);
    if (res && res.final === frase) res = null;
  }
  if (!res) { claves = ['A', 'B', 'D']; res = aplicaOrdenes(frase, claves)!; }
  const buena = res.final;

  // Los errores de verdad: saltarse una orden, cambiar dos de sitio o aplicar una al revés.
  const candidatos: string[] = [];
  for (let i = 0; i < claves.length; i++) {
    const sin = aplicaOrdenes(frase, claves.filter((_, k) => k !== i));
    if (sin) candidatos.push(sin.final);
    if (i < claves.length - 1) {
      const cc = [...claves]; [cc[i], cc[i + 1]] = [cc[i + 1], cc[i]];
      const x = aplicaOrdenes(frase, cc);
      if (x) candidatos.push(x.final);
    }
  }
  const pb = buena.split(' ');
  candidatos.push(cambia(pb, 0, pb.length - 1).join(' '), cambia(pb, 1, 2).join(' '), pb.slice(0, -1).join(' '), [...pb].reverse().join(' '));
  const vistos = new Set([buena]);
  const malas: string[] = [];
  for (const c of baraja(r, candidatos)) if (c && !vistos.has(c) && malas.length < 2) { vistos.add(c); malas.push(c); }
  for (let k = 0; malas.length < 2; k++) { const c = cambia(pb, k % pb.length, (k + 2) % pb.length).join(' '); if (!vistos.has(c)) { vistos.add(c); malas.push(c); } }
  const todas = baraja(r, [buena, ...malas]);
  return {
    tipo: 'ordenes',
    enunciado: `Aplica las órdenes ${claves.join('-')}, una tras otra, a la frase inicial. Cada orden se aplica sobre el resultado de la anterior.`,
    lineas: [`Frase inicial: «${frase}»`],
    tabla: { cabecera: ['Orden', 'Qué hace'], filas: ORDENES.map((o) => [o.clave, o.texto]) },
    opciones: todas.map((texto) => ({ texto })),
    correcta: todas.indexOf(buena),
    explicacion: `${res.pasos.join(' → ')}. El resultado es: «${buena}» = ${buena}.`,
  };
}

// ---------------------------------------------------------------------------
// Ejercicio 2: símbolos y nombres en orden alfabético (3 opciones)
// ---------------------------------------------------------------------------

export const NOMBRES_SIMBOLOS = [
  'Álvaro', 'Alicia', 'Beatriz', 'Blas', 'Carmen', 'Cristina', 'Daniel', 'Elena', 'Emilio', 'Fátima',
  'Gonzalo', 'Héctor', 'Irene', 'Javier', 'Laura', 'Manuel', 'Nuria', 'Óscar', 'Pilar', 'Rubén',
] as const;

/** La tabla de 20 símbolos con sus nombres: la misma en todas las preguntas de una sesión. */
export function leyendaDe(semilla: number): Leyenda {
  const r = azarDe((semilla ^ 0x9e3779b9) >>> 0);
  const simbolos = baraja(r, Array.from({ length: 20 }, (_, i) => i));
  return baraja(r, NOMBRES_SIMBOLOS).map((nombre, i) => ({ nombre, simbolo: simbolos[i] }));
}

export function simbolos(r: Azar, leyenda: Leyenda): PreguntaPsico {
  const k = entero(r, 3, 5);
  const simboloDe = (n: string) => leyenda.find((x) => x.nombre === n)!.simbolo;
  const nombresDeFila = () => baraja(r, leyenda.map((x) => x.nombre)).slice(0, k);
  const buena = ordena(nombresDeFila());
  const estaOrdenada = (xs: string[]) => xs.every((x, i) => i === 0 || comparador.compare(xs[i - 1], x) <= 0);
  const mala = (): string[] => {
    for (let i = 0; i < 100; i++) {
      let xs = nombresDeFila();
      if (r() < 0.6) { xs = ordena(xs); const j = entero(r, 0, k - 2); xs = cambia(xs, j, j + 1); } // un solo error, el más traicionero
      if (!estaOrdenada(xs)) return xs;
    }
    return [...buena].reverse();
  };
  const filas = [buena, mala(), mala()];
  const claves = new Set<string>();
  const unicas = filas.filter((f) => { const c = f.join('|'); if (claves.has(c)) return false; claves.add(c); return true; });
  while (unicas.length < 3) unicas.push(mala());
  const orden = baraja(r, unicas);
  return {
    tipo: 'simbolos',
    enunciado: 'Cambia cada símbolo por su nombre, según la tabla. ¿En qué fila están los nombres en orden alfabético?',
    leyenda,
    opciones: orden.map((f) => ({ fila: f.map(simboloDe) })),
    correcta: orden.findIndex((f) => f.join('|') === buena.join('|')),
    explicacion: `En orden alfabético: ${buena.join(', ')} = ${buena.join(', ')}.`,
  };
}

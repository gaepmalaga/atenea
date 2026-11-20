/**
 * LAS EXPLICACIONES QUE NUMERAN LAS OPCIONES (regla 139).
 *
 * La IA escribió miles de explicaciones diciendo «la opción correcta es la 1»,
 * «la opción 0 es incorrecta», contando desde 0. El alumno ve A, B y C: «la 1»
 * se lee como la A cuando era la B. Aprende al revés.
 *
 * Se arregla cambiando el número por su letra (0 = A, 1 = B, 2 = C). Pero solo
 * cuando SE PUEDE DEMOSTRAR desde dónde cuenta la explicación: por una «opción
 * 0» (solo existe contando desde 0) o porque la opción que declara correcta
 * coincide con la de la base de datos. Y se comprueba el resultado: la letra
 * correcta tiene que ser la marcada. Lo que no cuadra, `null`: lo mira un tutor.
 *
 * MÓDULO PURO (regla 21).
 */

/** Un número que NO es de opción: «3.ª categoría», «2º», «1.5», «250.000». */
const NO_ES_OPCION = '(?![ªº°]|\\.[ªº°\\d]|,\\d|\\.\\d)';
/** «opción 2», «la opción correcta es la 1», «la correcta es la 0». Captura el prefijo y la cifra. */
const SEÑAS = new RegExp(`(\\bopci[oó]n(?:\\s+correcta)?(?:\\s+es)?\\s+(?:la\\s+)?|\\bcorrecta\\s+es\\s+(?:la\\s+)?)(\\d)\\b${NO_ES_OPCION}`, 'gi');
/** Las que DECLARAN la correcta de otra forma: «la respuesta correcta es la opción 1», «la opción 2 es correcta / es la respuesta correcta». */
const DECLARA_ANTES = new RegExp(`\\b(?:respuesta|opci[oó]n)\\s+correcta\\s+es\\s+(?:la\\s+)?(?:opci[oó]n\\s+)?(\\d)\\b${NO_ES_OPCION}`, 'gi');
const DECLARA_DESPUES = new RegExp(`\\bopci[oó]n\\s+(\\d)\\b${NO_ES_OPCION}[^.;]{0,25}?\\b(?:es|resulta)\\s+(?:la\\s+)?(?:correcta|respuesta\\s+correcta|v[aá]lida)`, 'gi');
/** Una lista de opciones: «las opciones 0 y 1», «la opción 0, 1 o 2». Se convierte entera si la base está demostrada. */
const LISTA = new RegExp(`\\bopci[oó]n(?:es)?\\s+\\d\\b${NO_ES_OPCION}(?:\\s*(?:,|y|o|e|\\/)\\s*\\d\\b${NO_ES_OPCION})+`, 'gi');
const LETRAS = ['A', 'B', 'C'];

export type ArregloNumeracion = { texto: string; desde: 0 | 1; cambios: number };

/** ¿Habla de opciones por su número? Lo que se arregla (o se deja al tutor). */
export function numeraOpciones(explicacion: string | null | undefined): boolean {
  return new RegExp(`opci[oó]n(?:es)?\\s+\\d\\b${NO_ES_OPCION}|correcta\\s+es\\s+(?:la\\s+)?\\d\\b${NO_ES_OPCION}`, 'i').test(explicacion ?? '');
}

const cifras = (re: RegExp, t: string): number[] => [...t.matchAll(re)].map((m) => Number(m[1]));

/**
 * La explicación con las opciones por letra, o `null` si no se puede hacer con
 * seguridad. `correcta` es el índice (0, 1 o 2) de la opción marcada.
 */
export function corrigeNumeracion(explicacion: string | null | undefined, correcta: number): ArregloNumeracion | null {
  const texto = explicacion ?? '';
  if (!numeraOpciones(texto) || !Number.isInteger(correcta) || correcta < 0 || correcta > 2) return null;

  const señas = [...texto.matchAll(SEÑAS)].map((m) => ({ cifra: Number(m[2]), declaraCorrecta: /correcta/i.test(m[1]) }));
  const enListas = [...texto.matchAll(LISTA)].flatMap((m) => [...m[0].matchAll(/\d/g)].map((x) => Number(x[0])));
  // Las que declaran la correcta, de cualquier forma reconocible.
  const declaradas = [...señas.filter((s) => s.declaraCorrecta).map((s) => s.cifra), ...cifras(DECLARA_ANTES, texto), ...cifras(DECLARA_DESPUES, texto)];
  if (!señas.length && !enListas.length) return null;
  const todas = [...señas.map((s) => s.cifra), ...enListas];

  // Desde dónde cuenta: una «opción 0» solo existe contando desde 0; si no, lo dice la que declara correcta.
  let desde: 0 | 1 | null = null;
  if (todas.some((c) => c === 0)) desde = 0;
  else if (declaradas.length) {
    const d = declaradas[0];
    if (d === correcta) desde = 0;
    else if (d === correcta + 1) desde = 1;
    else return null;
  }
  if (desde === null) return null;
  if (todas.some((c) => c - desde! < 0 || c - desde! > 2)) return null;
  // Todas las que declaran la correcta tienen que decir la marcada.
  if (declaradas.some((c) => c - desde! !== correcta)) return null;

  let cambios = 0;
  const aLetra = (c: string) => { cambios++; return LETRAS[Number(c) - desde!]; };
  // Primero las listas (que llevan varias cifras), luego las señas sueltas.
  let nuevo = texto.replace(LISTA, (m) => m.replace(/\d/g, aLetra));
  nuevo = nuevo.replace(SEÑAS, (_m, prefijo: string, cifra: string) => `${prefijo}${aLetra(cifra)}`);
  nuevo = nuevo.replace(DECLARA_ANTES, (m) => m.replace(/(\d)\s*$/, (c) => aLetra(c)));
  nuevo = nuevo.replace(DECLARA_DESPUES, (m) => m.replace(/^(\bopci[oó]n\s+)(\d)/i, (_x, pre: string, c: string) => `${pre}${aLetra(c)}`));
  // Nada de números de opción sin convertir, y la letra declarada tiene que ser la marcada.
  if (numeraOpciones(nuevo)) return null;
  return { texto: nuevo, desde, cambios };
}

/** El motivo que lleva una propuesta de este arreglo. Los tutores la reconocen por él. */
export const MOTIVO_NUMERACION = 'La explicación numera las opciones (la opción 0, la 1…) y el alumno ve A, B y C: se cambia el número por su letra.';

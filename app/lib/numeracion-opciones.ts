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

/** «opción 2», «la opción correcta es la 1», «la correcta es la 0». Captura el prefijo y la cifra. */
const SEÑAS = /(\bopci[oó]n(?:\s+correcta)?(?:\s+es)?\s+(?:la\s+)?|\bcorrecta\s+es\s+(?:la\s+)?)(\d)\b/gi;
/** «las opciones 0 y 1», «opción 1 y 2», «opción 0, 1»: listas que no se convierten solas. */
const LISTAS = /opciones\s+\d|opci[oó]n\s+\d\s*(?:y|o|e|,|\/)\s*\d/i;
const LETRAS = ['A', 'B', 'C'];

export type ArregloNumeracion = { texto: string; desde: 0 | 1; cambios: number };

/** ¿Habla de opciones por su número? Lo que se arregla (o se deja al tutor). */
export function numeraOpciones(explicacion: string | null | undefined): boolean {
  return /opci[oó]n\s+\d|correcta\s+es\s+(?:la\s+)?\d\b/i.test(explicacion ?? '');
}

/**
 * La explicación con las opciones por letra, o `null` si no se puede hacer con
 * seguridad. `correcta` es el índice (0, 1 o 2) de la opción marcada.
 */
export function corrigeNumeracion(explicacion: string | null | undefined, correcta: number): ArregloNumeracion | null {
  const texto = explicacion ?? '';
  if (!numeraOpciones(texto) || LISTAS.test(texto) || !Number.isInteger(correcta) || correcta < 0 || correcta > 2) return null;

  const señas = [...texto.matchAll(SEÑAS)].map((m) => ({ cifra: Number(m[2]), declaraCorrecta: /correcta/i.test(m[1]) }));
  if (!señas.length) return null;

  // Desde dónde cuenta: una «opción 0» solo existe contando desde 0; si no, lo dice la que declara correcta.
  let desde: 0 | 1 | null = null;
  if (señas.some((s) => s.cifra === 0)) desde = 0;
  else {
    const declarada = señas.find((s) => s.declaraCorrecta);
    if (!declarada) return null;
    if (declarada.cifra === correcta) desde = 0;
    else if (declarada.cifra === correcta + 1) desde = 1;
    else return null;
  }
  if (señas.some((s) => s.cifra - desde! < 0 || s.cifra - desde! > 2)) return null;
  // Todas las que declaran la correcta tienen que decir la marcada.
  if (señas.some((s) => s.declaraCorrecta && s.cifra - desde! !== correcta)) return null;

  let cambios = 0;
  const nuevo = texto.replace(SEÑAS, (_m, prefijo: string, cifra: string) => { cambios++; return `${prefijo}${LETRAS[Number(cifra) - desde!]}`; });
  // Nada de números de opción sin convertir.
  if (numeraOpciones(nuevo)) return null;
  return { texto: nuevo, desde, cambios };
}

/** El motivo que lleva una propuesta de este arreglo. Los tutores la reconocen por él. */
export const MOTIVO_NUMERACION = 'La explicación numera las opciones (la opción 0, la 1…) y el alumno ve A, B y C: se cambia el número por su letra.';

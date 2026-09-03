/**
 * Leer un número de un campo de formulario sin que se cuele un `NaN`.
 *
 * POR QUÉ
 * El generador de preguntas del panel hacía `setCount(Number(e.target.value))`
 * sobre un `<input type="number">`. Un campo de tipo número admite estados
 * intermedios que NO son números: el campo vacío, un `-` suelto, un `e` de
 * notación científica a medio escribir. `Number('-')` es `NaN`.
 *
 * Y el `NaN` no se quedaba en la pantalla. Viajaba a `seedQuestionBank`, donde
 * el tope del servidor hace `Math.min(Math.max(1, Math.floor(count) || 0), 200)`:
 * `Math.floor(NaN)` es `NaN`, `NaN || 0` es `0`, y `Math.max(1, 0)` es **1**.
 * El administrador pedía un lote de veinte preguntas y se generaba UNA, sin un
 * solo aviso. El fallo más caro de este repo —la escritura que falla en
 * silencio— con otro disfraz.
 *
 * Es la regla 16 (`Number('')` es `0`) aplicada a los enteros con rango.
 */

/**
 * Un entero dentro de `[min, max]`, o `null` si lo escrito todavía no es un
 * número usable.
 *
 * Devolver `null` en vez de un cero permite a quien llama QUEDARSE COMO ESTABA
 * mientras el usuario escribe, en lugar de plantarle un 0 en el campo a media
 * pulsación.
 */
export function enteroEnRango(
  valor: string,
  { min, max }: { min: number; max: number },
): number | null {
  if (valor.trim() === '') return null;

  const n = Number(valor);
  if (!Number.isFinite(n)) return null;

  const entero = Math.trunc(n);
  // Se recorta al rango en vez de rechazarlo: escribir "500" donde el máximo
  // son 200 es una intención clara, y dejar el campo intacto pareceria que la
  // tecla no ha funcionado.
  return Math.min(Math.max(entero, min), max);
}

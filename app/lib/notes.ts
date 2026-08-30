/**
 * Las notas privadas del alumno sobre una pregunta (P3.8).
 *
 * Aqui solo vive lo puro —el limite y la normalizacion—, que es lo que
 * comparten el recuadro del navegador y la Server Action. La accion tiene que
 * normalizar aunque el formulario ya lo haya hecho: es un endpoint publico
 * (regla 1), y confiar en la validacion del cliente es como llegaron a la base
 * de datos las alturas de 0 cm de la regla 16.
 */

/**
 * Tope de una nota.
 *
 * No es un limite de la columna (`note` es `text`): es que una nota es un
 * recordatorio, no un tema. Quien necesite mas espacio esta escribiendo
 * apuntes, y para eso esta el temario.
 */
export const MAX_NOTE_CHARS = 2000;

/**
 * Deja la nota como se va a guardar.
 *
 * Recorta y normaliza los saltos de linea. Devuelve cadena vacia para
 * cualquier cosa que no sea texto, y esa cadena vacia SIGNIFICA "borrala":
 * vaciar el recuadro y guardar es como se retira una nota.
 */
export function normalizeNote(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  return valor.replace(/\r\n/g, '\n').trim();
}

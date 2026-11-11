/**
 * LOS DATOS DEL ALUMNO: nombre, teléfono y foto (regla 114).
 *
 * Módulo puro (regla 21): limpiar y validar lo que escribe el alumno o la
 * academia antes de que toque `profiles`. Lo que entra a mano se valida igual
 * que lo que escribe la IA (regla 27), y un campo vacío es `null`, no una
 * cadena vacía (regla 16).
 */

export type DatosAlumno = {
  nombre: string | null;
  telefono: string | null;
  fotoUrl: string | null;
};

export const DATOS_VACIOS: DatosAlumno = { nombre: null, telefono: null, fotoUrl: null };

export const NOMBRE_MIN = 2;
export const NOMBRE_MAX = 80;

/** Lo más que puede pesar la foto ya reducida (el cubo admite 300 KB). */
export const FOTO_MAX_BYTES = 300 * 1024;
/** El lado de la foto: se recorta a un cuadrado de este tamaño en el navegador. */
export const FOTO_LADO = 256;

type Limpio<T> = { ok: true; valor: T } | { ok: false; error: string };

/** Quita caracteres de control (un NUL tumba la fila entera, regla 71) y espacios de más. */
function texto(valor: unknown): string {
  // eslint-disable-next-line no-control-regex
  return String(valor ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** El nombre: `null` si viene vacío; si no, entre 2 y 80 caracteres y con alguna letra. */
export function limpiaNombre(valor: unknown): Limpio<string | null> {
  const t = texto(valor);
  if (!t) return { ok: true, valor: null };
  if (t.length < NOMBRE_MIN) return { ok: false, error: 'El nombre es demasiado corto.' };
  if (t.length > NOMBRE_MAX) return { ok: false, error: `El nombre no puede pasar de ${NOMBRE_MAX} caracteres.` };
  if (!/\p{L}/u.test(t)) return { ok: false, error: 'El nombre tiene que llevar letras.' };
  if (/[<>]/.test(t)) return { ok: false, error: 'El nombre lleva caracteres que no valen.' };
  return { ok: true, valor: t };
}

/**
 * El teléfono: `null` si viene vacío. Se guarda sin espacios ni guiones, con
 * su `+` si lo traía. Un móvil español son 9 cifras; con prefijo, hasta 15.
 */
export function limpiaTelefono(valor: unknown): Limpio<string | null> {
  const t = texto(valor);
  if (!t) return { ok: true, valor: null };
  if (!/^\+?[\d\s().-]+$/.test(t)) return { ok: false, error: 'El teléfono solo puede llevar números.' };
  const cifras = t.replace(/\D/g, '');
  if (cifras.length < 9 || cifras.length > 15) return { ok: false, error: 'El teléfono tiene que tener entre 9 y 15 cifras.' };
  return { ok: true, valor: (t.startsWith('+') ? '+' : '') + cifras };
}

/** «600123456» → «600 123 456». Con prefijo se deja como está. */
export function telefonoLegible(telefono: string | null | undefined): string {
  if (!telefono) return '';
  return /^\d{9}$/.test(telefono) ? telefono.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : telefono;
}

/**
 * La foto llega como `data:image/jpeg;base64,…` ya reducida en el navegador.
 * Aquí se comprueba que ES un JPEG (por sus tres primeros bytes, no por lo que
 * diga la cabecera) y que no pesa más de la cuenta.
 */
export function leeFoto(dataUrl: unknown): Limpio<Uint8Array> {
  if (typeof dataUrl !== 'string') return { ok: false, error: 'No ha llegado ninguna foto.' };
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return { ok: false, error: 'La foto tiene que ser una imagen JPEG.' };
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
  } catch {
    return { ok: false, error: 'La foto no se ha podido leer.' };
  }
  if (bytes.length < 100 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return { ok: false, error: 'La foto tiene que ser una imagen JPEG.' };
  }
  if (bytes.length > FOTO_MAX_BYTES) return { ok: false, error: 'La foto pesa demasiado. Prueba con otra.' };
  return { ok: true, valor: bytes };
}

/** El nombre que se enseña: el que puso, o el deducido del correo. */
export function nombreVisible(nombre: string | null | undefined, correo: string | null | undefined): string {
  if (nombre && nombre.trim()) return nombre.trim();
  const partes = (correo ?? '').split('@')[0].split(/[._\d]+/).filter(Boolean);
  if (!partes.length) return correo ?? '';
  return partes.slice(0, 2).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
}

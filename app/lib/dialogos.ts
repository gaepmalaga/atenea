/**
 * LAS VENTANAS DE LA APP (regla 128): confirmar, avisar y pedir un texto.
 *
 * `window.confirm`, `alert` y `prompt` las pinta el navegador con SU estilo
 * («ateneapolicial.com dice…», botones azules del sistema), que no tiene nada
 * que ver con la plataforma y en el móvil se ve feo y pequeño. Aquí hay una sola
 * ventana propia (`ui/DialogosHost.tsx`, montada una vez en la raíz) y tres
 * funciones que se llaman desde cualquier sitio, también desde un `onClick`:
 *
 *   if (await confirmar('¿Borrar esto?')) …
 *   avisar('No se pudo guardar.')
 *   const escrito = await pedirTexto({ texto: 'Escribe BORRAR', ... })
 *
 * Si no hay ventana montada (un test, otra pantalla) se cae al diálogo del
 * navegador: peor de ver, pero nunca se pierde la pregunta.
 */

export type OpcionesConfirmar = {
  titulo?: string;
  texto: string;
  /** Lo que dice el botón de aceptar. Por defecto «Aceptar», o «Borrar» si la pregunta va de borrar. */
  confirmar?: string;
  cancelar?: string;
  /** Botón rojo. Por defecto se deduce del texto («borrar», «anular», «no se puede deshacer»…). */
  peligro?: boolean;
};
export type OpcionesTexto = { titulo?: string; texto: string; etiqueta?: string; confirmar?: string; cancelar?: string };
export type OpcionesAviso = { titulo?: string; texto: string; boton?: string };

export type Pedido =
  | { tipo: 'confirmar'; opciones: OpcionesConfirmar; resolve: (v: boolean) => void }
  | { tipo: 'avisar'; opciones: OpcionesAviso; resolve: () => void }
  | { tipo: 'texto'; opciones: OpcionesTexto; resolve: (v: string | null) => void };

let anfitrion: ((p: Pedido) => void) | null = null;

/** La ventana de la raíz se da de alta aquí; devuelve la función para darla de baja. */
export function registraAnfitrion(fn: (p: Pedido) => void): () => void {
  anfitrion = fn;
  return () => { if (anfitrion === fn) anfitrion = null; };
}

const comoOpciones = <T extends { texto: string }>(o: string | T): T => (typeof o === 'string' ? ({ texto: o } as T) : o);

/** Si la pregunta va de algo que no se puede deshacer, el botón va en rojo. */
export function esPeligrosa(texto: string): boolean {
  return /borr|anul|elimin|suspend|rechaz|descart|quitar|vaci|retirar|no se puede deshacer|apag/i.test(texto);
}

export function confirmar(o: string | OpcionesConfirmar): Promise<boolean> {
  const opciones = comoOpciones<OpcionesConfirmar>(o);
  if (!anfitrion) return Promise.resolve(typeof window !== 'undefined' ? window.confirm(opciones.texto) : false);
  const a = anfitrion;
  return new Promise((resolve) => a({ tipo: 'confirmar', opciones, resolve }));
}

export function avisar(o: string | OpcionesAviso): Promise<void> {
  const opciones = comoOpciones<OpcionesAviso>(o);
  if (!anfitrion) { if (typeof window !== 'undefined') window.alert(opciones.texto); return Promise.resolve(); }
  const a = anfitrion;
  return new Promise((resolve) => a({ tipo: 'avisar', opciones, resolve }));
}

/** Pide un texto; `null` si se cancela. */
export function pedirTexto(o: string | OpcionesTexto): Promise<string | null> {
  const opciones = comoOpciones<OpcionesTexto>(o);
  if (!anfitrion) return Promise.resolve(typeof window !== 'undefined' ? window.prompt(opciones.texto) : null);
  const a = anfitrion;
  return new Promise((resolve) => a({ tipo: 'texto', opciones, resolve }));
}

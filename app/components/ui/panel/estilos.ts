/**
 * LAS PIEZAS DEL PANEL DE ADMINISTRACIÓN (regla 101).
 *
 * El panel tenía el aspecto de la parte del alumno trasladado sin criterio:
 * tarjetas de 24-32 px de radio, títulos en `font-black` diminuto y un icono de
 * un color distinto por pestaña. Los dueños y los profesores lo veían «hecho
 * por una IA». El rediseño (noviembre 2026) fija una sola forma para todo el
 * panel, y vive aquí para que las once pantallas la compartan.
 *
 * La forma: esquinas pequeñas, filetes en vez de sombras, el color solo para
 * decir un estado, y el marino y el oro de Alphapol. El panel sigue el tema
 * (regla 45): claro sobre el crema de la marca y oscuro sobre el azul noche.
 * Solo la barra lateral es marino siempre.
 */

/** Una hoja: la superficie donde vive una lista, una tabla o un bloque. */
export const HOJA = 'min-w-0 rounded-lg border border-linea dark:border-noche-linea bg-white dark:bg-noche-2';

/** Un escalón por debajo de la hoja: cabeceras de tabla, cajas dentro de una hoja. */
export const HUNDIDO = 'bg-hundido dark:bg-noche-hondo';

/** El filete. */
export const LINEA = 'border-linea dark:border-noche-linea';

/** Los cinco significados del color. Fuera de aquí, el color no quiere decir nada. */
export type Tono = 'ok' | 'aviso' | 'malo' | 'apagado' | 'oro' | 'neutro';

/** El color de un texto o una cifra según el estado. */
export const TONO_TEXTO: Record<Tono, string> = {
  ok: 'text-emerald-700 dark:text-emerald-300',
  aviso: 'text-amber-700 dark:text-amber-300',
  malo: 'text-red-700 dark:text-red-300',
  apagado: 'text-slate-600 dark:text-slate-400',
  oro: 'text-oro-oscuro dark:text-oro-claro',
  neutro: 'text-slate-900 dark:text-white',
};

/** Una etiqueta pequeña: fondo suave y texto del mismo tono. */
export const TONO_ETIQUETA: Record<Tono, string> = {
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  aviso: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  malo: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  apagado: 'bg-slate-200 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300',
  oro: 'bg-oro/20 text-oro-oscuro dark:bg-oro/15 dark:text-oro-claro',
  neutro: 'bg-hundido text-slate-800 dark:bg-noche-hondo dark:text-slate-200',
};

/** El punto de un estado («● Activo»). */
export const TONO_PUNTO: Record<Tono, string> = {
  ok: 'bg-emerald-600 dark:bg-emerald-400',
  aviso: 'bg-amber-600 dark:bg-amber-400',
  malo: 'bg-red-600 dark:bg-red-400',
  apagado: 'bg-slate-400 dark:bg-slate-500',
  oro: 'bg-oro',
  neutro: 'bg-slate-700 dark:bg-slate-300',
};

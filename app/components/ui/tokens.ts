/**
 * LA ESCALA. Un solo sitio donde se decide cómo se ve la aplicación.
 *
 * POR QUÉ EXISTE ESTE FICHERO
 * Antes no había ninguno, y se notaba: contando las clases de los componentes
 * salían NUEVE radios distintos (`rounded-xl`, `2xl`, `3xl`, y seis valores a
 * mano: `[2rem]`, `[2.5rem]`, `[1.5rem]`, `[3rem]`, `[30px]`, `[1.25rem]`) y
 * TRECE rellenos, de `p-1` a `p-32`. Cada pantalla se inventaba su versión de
 * una tarjeta, así que cada pantalla fallaba a su manera y había que
 * descubrirlas de una en una en el móvil.
 *
 * `globals.css` tenía un sistema escrito —`.vip-card`, `.vip-button`,
 * `.vip-input`— que no usaba NI UN componente. Estaba muerto. Esto lo
 * sustituye con algo que sí se usa, porque los componentes de `ui/` son la
 * única forma de pintar una tarjeta o un botón.
 *
 * EL AIRE DEL LOGIN, TRAÍDO AQUÍ (4 sep). El login es plano: bordes en vez de
 * sombras, radios pequeños, cero degradados. Llevarlo a mano a las 35
 * pantallas sería el trabajo que este fichero existe para evitar, así que se
 * cambia AQUÍ y las 18 que ya salen de `ui/` lo siguen solas.
 *
 * Lo que se ha movido: los radios bajan un escalón (`rounded-3xl` era una
 * esquina de 24px en una tarjeta de 340px), `ELEVATION.flat` deja de tener
 * sombra —una tarjeta apoyada en el fondo no proyecta nada— y las superficies
 * separan con un borde de 2px en vez de con uno de 1 y una sombra.
 *
 * Lo que NO se ha movido, y es la decisión de fondo: la ESCALA TIPOGRÁFICA.
 * Las mayúsculas enormes del login funcionan diez segundos; el alumno mira la
 * pantalla del test cincuenta minutos. La firma viaja en los bordes y las
 * etiquetas, no en el texto que se lee (regla 43).
 *
 * LA REGLA DE ORO: la decisión responsiva se toma AQUÍ, no en la pantalla.
 * Una pantalla elige "tarjeta mediana"; cuánto encoge eso en un móvil de
 * 360px no es asunto suyo. Así, arreglar el móvil se hace una vez y vale para
 * todas — que es justo lo que no pasaba.
 */

/**
 * Radios. Tres pasos y ninguno más.
 *
 * Encogen en móvil a propósito: un radio de 40px (`rounded-[2.5rem]`, que
 * estaba en el chat y en la nota final) sobre una tarjeta de 340px de ancho se
 * come las esquinas y hace que el contenido parezca mal centrado. En
 * escritorio, con 600px de tarjeta, el mismo radio es elegante.
 */
export const RADIUS = {
  /** Chips, etiquetas, cosas pequeñas. */
  sm: 'rounded-md',
  /** Controles: botones, campos, opciones. */
  md: 'rounded-lg',
  /** Tarjetas y paneles. */
  lg: 'rounded-xl',
  /** Contenedores grandes (modales, pantallas completas). */
  xl: 'rounded-xl sm:rounded-2xl',
} as const;

/**
 * Relleno interior de una superficie.
 *
 * En móvil manda el ancho útil: con `p-8` (32px por lado) en una pantalla de
 * 360px, al texto le quedan 296px. Con `p-10` —que estaba en la nota final—
 * quedaban 280px para un número de 72px de alto. Por eso el paso móvil es
 * siempre notablemente menor que el de escritorio.
 */
export const PAD = {
  /** Filas de lista, celdas compactas. */
  sm: 'p-3 sm:p-4',
  /** El de casi todo: tarjetas normales. */
  md: 'p-4 sm:p-6',
  /** Tarjetas protagonistas (hero, resultado de examen). */
  lg: 'p-5 sm:p-8 md:p-10',
} as const;

/**
 * Separación entre bloques. Misma lógica: en móvil, apilado, sobra menos.
 */
export const GAP = {
  sm: 'gap-2 sm:gap-3',
  md: 'gap-3 sm:gap-4',
  lg: 'gap-4 sm:gap-6',
} as const;

/**
 * Elevación. Antes había `shadow-sm`, `shadow-lg`, `shadow-xl` y `shadow-2xl`
 * repartidos sin criterio: dos tarjetas hermanas de la misma pantalla podían
 * tener sombras distintas. Tres niveles y cada uno significa algo.
 */
export const ELEVATION = {
  /** Apoyada en el fondo. El de la mayoría. */
  flat: '',
  /** Separada del fondo: algo que se ha abierto o está activo. */
  raised: 'shadow-md shadow-slate-900/5 dark:shadow-black/40',
  /** Flotando por encima de todo: modales, barras fijas. */
  floating: 'shadow-xl shadow-slate-900/10 dark:shadow-black/60',
} as const;

/** El borde y el fondo de una superficie, por tono. */
export const SURFACE = {
  /** Tarjeta normal sobre el fondo de la aplicación. */
  base: 'bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800',
  /** Un escalón por debajo: cajas dentro de una tarjeta. */
  sunken: 'bg-slate-50 dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800',
  /** Con la marca: lo que hay que mirar primero. */
  brand: 'bg-indigo-600 text-white border border-indigo-600',
  /** Oscura siempre, en claro y en oscuro: paneles de datos. */
  contrast: 'bg-slate-900 text-white border border-slate-800',
} as const;

/**
 * Tipografía. Los tamaños grandes SIEMPRE escalan.
 *
 * `text-7xl` fijo (72px) en la nota del examen y `text-5xl` (48px) en el rango
 * de estadísticas estaban pensados mirando una pantalla de escritorio; en un
 * móvil de 360px el número casi tocaba los bordes.
 */
export const TEXT = {
  /** El número o la palabra que da sentido a la pantalla. */
  display: 'text-4xl sm:text-6xl font-black tracking-tighter',
  /** Título de pantalla. */
  title: 'text-xl sm:text-3xl font-black tracking-tight',
  /** Título de una tarjeta o sección. */
  heading: 'text-base sm:text-lg font-black',
  /** La etiqueta en mayúsculas que encabeza cada bloque. */
  label: 'text-[10px] sm:text-xs font-black uppercase tracking-widest',
  /** Texto corriente. */
  body: 'text-sm leading-relaxed',
  /** Apoyo, pies, ayudas. */
  muted: 'text-xs text-slate-500 dark:text-slate-400 leading-relaxed',
  /** Datos: tiempos, contadores, identificadores. */
  hud: 'font-mono tabular-nums text-xs font-bold',
} as const;

/**
 * Área táctil mínima.
 *
 * 44px es el mínimo que recomiendan tanto Apple como Google, y esto es una
 * aplicación que se usa de pie, en el metro, con una mano. Varios botones del
 * panel de administración estaban en 32px.
 */
export const TAP = 'min-h-[44px]';

/** Une clases saltándose las vacías. Evita `undefined` suelto en el HTML. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

import { TAP, cx } from '../ui';

/**
 * LAS PIEZAS DE LAS PANTALLAS DE ENTRADA (regla 90): entrar, crear cuenta,
 * poner la contraseña, elegir academia y «tu acceso no está activo».
 *
 * No salen de `ui/` (regla 43: son pantallas de marca, con su propio papel y
 * sin seguir el tema claro/oscuro), pero lo que protege la regla 36 sí:
 *   · el área táctil sale de `TAP`;
 *   · los campos llevan `text-base` en móvil (Safari hace zoom por debajo de
 *     16 px y descuadra la página);
 *   · los colores se han medido con `contraste.cjs`.
 *
 * Aquí y no en cada pantalla: eran cuatro copias de los mismos campos y la
 * misma paleta, y cuatro copias son cuatro sitios donde una se queda atrás.
 */

export const PALETA = {
  marino: '#14295a',
  marinoOscuro: '#0f2149',
  dorado: '#c5a738',
} as const;

export const ETIQUETA = 'block text-sm font-semibold text-slate-700 mb-1.5';

/** Un campo de texto. `conIcono` deja sitio a la izquierda para el icono. */
export const campo = (conIcono = false) => cx(
  'w-full h-14 rounded-xl border border-slate-300 bg-white outline-none',
  conIcono ? 'pl-11 pr-4' : 'px-4',
  // 16 px en móvil o Safari hace zoom al tocarlo y deja la página torcida.
  'text-base text-slate-900 placeholder:text-slate-400',
  'focus:border-[#14295a] focus:ring-4 focus:ring-[#14295a]/10 transition-shadow',
  'disabled:bg-slate-50 disabled:text-slate-500',
  TAP,
);

/** El icono que va DENTRO del campo, a la izquierda. */
export const ICONO_CAMPO = 'pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400';

export const BOTON_PRINCIPAL = cx(
  'w-full h-14 rounded-xl px-5 flex items-center justify-center gap-2.5',
  'bg-[#14295a] text-white text-base font-bold tracking-tight',
  'shadow-lg shadow-[#14295a]/25 hover:bg-[#0f2149] active:translate-y-px transition',
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c5a738]/50',
  'disabled:opacity-60 disabled:cursor-not-allowed',
  TAP,
);

export const BOTON_SECUNDARIO = cx(
  'w-full h-12 rounded-xl px-5 flex items-center justify-center gap-2',
  'border border-slate-300 bg-white text-slate-700 text-sm font-semibold',
  'hover:bg-slate-50 hover:border-slate-400 transition',
  TAP,
);

/** El enlace de texto (olvidé la contraseña, cambiar de modo). */
export const ENLACE = cx(
  'inline-flex items-center font-semibold text-[#14295a] underline decoration-[#c5a738] decoration-2 underline-offset-4',
  'hover:decoration-[#14295a] transition-colors',
  TAP,
);

export const AVISO_ERROR = 'flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-red-800';
export const AVISO_INFO = 'flex items-start gap-3 rounded-xl border border-[#c5a738]/50 bg-[#fbf6e4] p-3.5 text-[#14295a]';

export const TITULO = 'text-[28px] sm:text-3xl font-extrabold tracking-tight leading-tight text-[#14295a]';
export const SUBTITULO = 'mt-2 text-[15px] leading-relaxed text-slate-600';

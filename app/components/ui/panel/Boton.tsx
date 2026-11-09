import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../tokens';

type Variante = 'primary' | 'secondary' | 'danger' | 'ghost';

/**
 * El botón del panel: texto normal de 13 px y esquinas de 7 px, no las
 * mayúsculas de `font-black` del botón del alumno.
 *
 * Acepta las mismas propiedades que `Button` (`variant`, `size`, `icon`,
 * `iconRight`, `block`) para que cambiar una pantalla sea cambiar el nombre y
 * nada más. `danger` NO es un botón rojo relleno: es borde y texto rojos. Lo
 * irreversible no debe ser lo más llamativo de la pantalla (regla 26).
 */
const VARIANTE: Record<Variante, string> = {
  primary:
    'border-indigo-900 bg-indigo-900 text-white hover:bg-indigo-800 disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-600 dark:border-indigo-300 dark:bg-indigo-300 dark:text-marino-hondo dark:hover:bg-indigo-200 dark:disabled:border-slate-700 dark:disabled:bg-slate-700 dark:disabled:text-slate-400',
  secondary:
    'border-linea dark:border-noche-linea bg-white dark:bg-noche-2 text-slate-900 dark:text-slate-100 hover:border-indigo-700 dark:hover:border-indigo-300 disabled:text-slate-500 disabled:hover:border-linea dark:disabled:text-slate-500',
  danger:
    'border-red-300 dark:border-red-500/40 bg-white dark:bg-noche-2 text-red-700 dark:text-red-300 hover:border-red-600 disabled:text-slate-500 disabled:hover:border-red-300',
  ghost: 'border-transparent text-indigo-900 dark:text-indigo-200 hover:bg-hundido dark:hover:bg-noche-hondo disabled:text-slate-500',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variante;
  /** `sm` es más bajo en escritorio; en móvil todos miden 44 px (regla 36). */
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
}

export default function Boton({ variant = 'primary', size = 'md', icon, iconRight, block, className, children, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-[7px] border px-3.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed',
        size === 'sm' ? 'min-h-[44px] lg:min-h-[36px] lg:px-3 lg:text-[12.5px]' : 'min-h-[44px]',
        VARIANTE[variant],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  );
}

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { RADIUS, TAP, cx } from './tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400 disabled:shadow-none',
  secondary:
    'bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-500',
  ghost:
    'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800',
  danger:
    'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20 disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400',
};

const SIZE: Record<Size, string> = {
  sm: 'px-3 py-2 text-[11px]',
  md: 'px-5 py-3 text-xs',
  lg: 'px-6 py-4 text-sm',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  /** Ocupa todo el ancho. En móvil suele ser lo que quieres. */
  block?: boolean;
  /** Icono a la izquierda del texto. */
  icon?: ReactNode;
  /** Icono a la derecha (flechas de "siguiente", etc.). */
  iconRight?: ReactNode;
}

/**
 * Botón.
 *
 * Lo que aporta y antes no estaba: **área táctil mínima de 44px, siempre**.
 * Es el mínimo que recomiendan Apple y Google, y varios botones del panel de
 * administración estaban en 32px — se fallaba el toque con el pulgar. Aquí no
 * se puede hacer un botón demasiado pequeño porque `TAP` va en todos.
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  iconRight,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 font-black uppercase tracking-wider transition-all active:scale-[0.98]',
        // `opacity-60` sobre blanco dejaba el texto de un boton deshabilitado a
        // 1.5:1: no se leia QUE es lo que no se puede pulsar. El color del
        // deshabilitado lo pone cada variante; aqui solo se quita el relieve.
        'disabled:cursor-not-allowed disabled:active:scale-100 disabled:opacity-80',
        RADIUS.md,
        TAP,
        VARIANT[variant],
        SIZE[size],
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

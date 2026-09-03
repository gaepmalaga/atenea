import type { ReactNode } from 'react';
import { RADIUS, PAD, ELEVATION, SURFACE, cx } from './tokens';

type Tone = keyof typeof SURFACE;
type Size = keyof typeof PAD;
type Elevation = keyof typeof ELEVATION;

interface CardProps {
  children: ReactNode;
  /** `base` (por defecto), `sunken` para cajas dentro de otra, `brand`, `contrast`. */
  tone?: Tone;
  /** Relleno interior. `md` por defecto. */
  pad?: Size | 'none';
  elevation?: Elevation;
  className?: string;
}

/**
 * La superficie de la que está hecha toda la aplicación.
 *
 * Antes cada pantalla escribía a mano su propia versión de esta línea:
 * `bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800
 * rounded-3xl p-8 shadow-sm`. Aparecía 40 veces, con cuatro radios y cinco
 * rellenos distintos, y en móvil cada copia fallaba a su manera.
 *
 * `pad="none"` es para cuando la tarjeta lleva cabecera propia o una lista que
 * tiene que llegar hasta el borde.
 */
export default function Card({
  children,
  tone = 'base',
  pad = 'md',
  elevation = 'flat',
  className,
}: CardProps) {
  return (
    <div
      className={cx(
        SURFACE[tone],
        RADIUS.lg,
        pad !== 'none' && PAD[pad],
        ELEVATION[elevation],
        className,
      )}
    >
      {children}
    </div>
  );
}

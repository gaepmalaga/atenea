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
 *
 * **`min-w-0` no es opcional y por eso vive aqui.** Un hijo de `grid` o de
 * `flex` tiene `min-width: auto`, que significa "no encojas por debajo de tu
 * contenido". Y el ancho minimo de un texto con `truncate` (que es
 * `white-space: nowrap`) es el texto ENTERO. Resultado real, medido en el
 * banco de pruebas: dos tarjetas del panel de academia con titulos de tema
 * truncados dentro empujaban la pagina a 470px de ancho en una pantalla de
 * 390 — el panel entero se arrastraba de lado. `truncate` no sirve de nada si
 * el contenedor crece para no truncar. Ponerlo en la tarjeta lo arregla en
 * todas a la vez; dejarlo a cada pantalla es como se llego al problema.
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
        'min-w-0',
        pad !== 'none' && PAD[pad],
        ELEVATION[elevation],
        className,
      )}
    >
      {children}
    </div>
  );
}

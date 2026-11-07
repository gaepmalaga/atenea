import type { ReactNode } from 'react';
import { MARCA } from '@/app/lib/marca';
import { TAP, cx } from './tokens';

/**
 * LAS PIEZAS DE LA IDENTIDAD DE ALPHAPOL (regla 94): marino, oro y la
 * tipografía condensada. Viven aquí, con el resto del sistema de diseño, para
 * que ninguna pantalla escriba su propio dorado (regla 36).
 */

/** La etiqueta dorada en mayúsculas que abre un bloque: «HOY TE TOCAN». */
export function Kicker({ children, onMarino = false, className }: { children: ReactNode; onMarino?: boolean; className?: string }) {
  return (
    <p
      className={cx(
        'font-titulo font-bold uppercase tracking-[0.2em] text-xs sm:text-sm',
        // Sobre marino, el oro claro; sobre el fondo de la pantalla, el oscuro
        // (el oro del logo no se lee sobre crema) y, en modo oscuro, el claro.
        onMarino ? 'text-oro-claro' : 'text-oro-oscuro dark:text-oro-claro',
        className,
      )}
    >
      {children}
    </p>
  );
}

/**
 * El bloque marino que abre una pantalla: la «A» del logo de marca de agua, un
 * filete dorado abajo y, dentro, lo que hay que mirar primero. Es marino en
 * claro y en oscuro: es la marca, no un panel que siga el tema.
 */
export function HeroMarino({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'relative overflow-hidden min-w-0 bg-marino text-white border-b-[3px] border-oro',
        'rounded-t-sm rounded-b-2xl p-5 sm:p-8',
        className,
      )}
    >
      {/* Decorativa: no lleva texto alternativo. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MARCA.isotipo} alt="" aria-hidden="true" className="pointer-events-none absolute -right-8 -top-4 w-40 sm:w-52 opacity-10" />
      <div className="relative">{children}</div>
    </div>
  );
}

type Opcion<T extends string> = { valor: T; etiqueta: string; /** Una línea pequeña debajo: «examen real». */ nota?: string };

/**
 * Una elección entre pocas cosas, como fichas: la elegida lleva borde marino y
 * un filete dorado debajo. `compacta` las hace más bajas (para tres o más).
 */
export function Fichas<T extends string>({
  opciones,
  valor,
  onChange,
  etiqueta,
  className,
}: {
  opciones: readonly Opcion<T>[];
  valor: T;
  onChange: (v: T) => void;
  /** Para lectores de pantalla: qué se está eligiendo. */
  etiqueta: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={etiqueta} className={cx('grid gap-2', opciones.length === 2 ? 'grid-cols-2' : 'grid-cols-3', className)}>
      {opciones.map((o) => {
        const activa = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            onClick={() => onChange(o.valor)}
            aria-pressed={activa}
            className={cx(
              'font-titulo uppercase tracking-widest text-sm sm:text-base transition-colors px-2 rounded-sm',
              TAP,
              'min-h-[48px]',
              activa
                ? 'border-2 border-marino dark:border-oro-claro bg-white dark:bg-slate-900 text-marino dark:text-white font-bold shadow-[inset_0_-3px_0_var(--color-oro)]'
                : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 font-semibold',
            )}
          >
            {o.etiqueta}
            {o.nota && <span className="block font-sans normal-case tracking-normal text-[10px] font-semibold text-oro-oscuro dark:text-oro-claro leading-tight">{o.nota}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** El modo de dos caras: lo mismo que `Fichas` pero pegado, como un interruptor. */
export function Interruptor<T extends string>({
  opciones,
  valor,
  onChange,
  etiqueta,
}: {
  opciones: readonly [Opcion<T>, Opcion<T>];
  valor: T;
  onChange: (v: T) => void;
  etiqueta: string;
}) {
  return (
    <div role="group" aria-label={etiqueta} className="grid grid-cols-2 gap-1 p-1 rounded-sm bg-slate-200/70 dark:bg-slate-800">
      {opciones.map((o) => {
        const activa = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            onClick={() => onChange(o.valor)}
            aria-pressed={activa}
            className={cx(
              'min-h-[48px] rounded-sm font-titulo uppercase tracking-widest text-sm sm:text-base transition-colors',
              activa ? 'bg-marino text-white font-bold dark:ring-1 dark:ring-oro-claro' : 'text-slate-600 dark:text-slate-300 font-semibold',
            )}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

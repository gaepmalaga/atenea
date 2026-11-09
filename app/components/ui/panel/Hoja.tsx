import type { ReactNode } from 'react';
import { HOJA, HUNDIDO } from './estilos';
import { cx } from '../tokens';

const RELLENO = { none: '', sm: 'p-3 sm:p-3.5', md: 'p-4 sm:p-5', lg: 'p-5 sm:p-6' } as const;

/**
 * Una hoja: la superficie de una lista, una tabla o un bloque. Esquinas de 8 px
 * y un filete. Acepta las propiedades de `Card` (`tone`, `pad`) para que migrar
 * una pantalla sea cambiar el nombre; `brand` es la franja marino con el filete
 * dorado, para lo que hay que mirar primero.
 */
export function Hoja({
  children, className, tone = 'base', pad = 'none',
}: { children: ReactNode; className?: string; tone?: 'base' | 'sunken' | 'brand'; pad?: keyof typeof RELLENO }) {
  return (
    <div
      className={cx(
        tone === 'brand' ? 'min-w-0 rounded-lg border border-marino border-b-[3px] border-b-oro bg-marino text-white' : HOJA,
        tone === 'sunken' && HUNDIDO,
        RELLENO[pad],
        className,
      )}
    >
      {children}
    </div>
  );
}

/** El título de un bloque dentro de una hoja: «SUS GRUPOS». */
export function BloqueTitulo({ children, aside, icon }: { children: ReactNode; aside?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex min-w-0 items-center gap-2 font-titulo text-lg font-bold uppercase leading-none tracking-wider text-slate-900 dark:text-white">
        {icon && <span className="shrink-0 text-slate-600 dark:text-slate-400">{icon}</span>}
        {children}
      </h3>
      {aside}
    </div>
  );
}

/** La etiqueta pequeña en mayúsculas que encabeza una lista o un campo. */
export function Rotulo({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-400">{children}</p>;
}

/** Un aviso con su color de estado: pendientes, temas sin profesor, tablas que faltan. */
export function Aviso({ tono = 'aviso', children }: { tono?: 'aviso' | 'info' | 'malo'; children: ReactNode }) {
  return (
    <div
      className={cx(
        'flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-[13px] leading-relaxed',
        tono === 'aviso' && 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200',
        tono === 'malo' && 'bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-200',
        tono === 'info' && 'bg-hundido text-slate-800 dark:bg-noche-hondo dark:text-slate-200',
      )}
    >
      {children}
    </div>
  );
}

/** El botón de «← Volver» de una pantalla que se abre desde una lista. */
export function Atras({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-[44px] items-center gap-1.5 self-start text-sm font-semibold text-indigo-900 dark:text-indigo-200">
      <span aria-hidden>←</span> {children}
    </button>
  );
}

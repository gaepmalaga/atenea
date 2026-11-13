import type { ReactNode } from 'react';
import { cx } from '../tokens';

/**
 * Una fila de filtros: en móvil se desplaza hacia los lados, sin saltar de línea.
 *
 * `enHoja` es para cuando van DENTRO de una tarjeta: ahí no pueden salirse al
 * margen de la página (se asomaban 4 px por fuera de la tarjeta) ni esconder un
 * chip fuera de pantalla, así que saltan de línea.
 */
export function Filtros({ children, etiqueta, enHoja }: { children: ReactNode; etiqueta?: string; enHoja?: boolean }) {
  return (
    <div role="group" aria-label={etiqueta} className={enHoja ? 'flex flex-wrap gap-1.5' : 'flex gap-1.5 overflow-x-auto scrollbar-hide max-sm:-mx-4 max-sm:px-4 sm:flex-wrap'}>
      {children}
    </div>
  );
}

/** Un filtro con su contador: «Necesitan atención 6». */
export function FiltroChip({
  activo, onClick, children, cuenta,
}: { activo: boolean; onClick: () => void; children: ReactNode; cuenta?: number | string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cx(
        'inline-flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition-colors',
        activo
          ? 'border-indigo-900 bg-indigo-900 text-white dark:border-indigo-300 dark:bg-indigo-300 dark:text-marino-hondo'
          : 'border-linea dark:border-noche-linea bg-white dark:bg-noche-2 text-slate-800 dark:text-slate-200 hover:border-indigo-700 dark:hover:border-indigo-300',
      )}
    >
      {children}
      {cuenta !== undefined && <b className={cx('font-semibold tabular-nums', activo ? 'opacity-80' : 'text-slate-600 dark:text-slate-400')}>{cuenta}</b>}
    </button>
  );
}

import type { ReactNode } from 'react';
import { RADIUS, TAP, cx } from './tokens';

interface OptionCardProps {
  title: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
}

/**
 * Una opción que se elige tocándola: modo de examen, dificultad, diagnóstico
 * del error, tipo de reporte.
 *
 * Aquí está el fallo que costó dos rondas de capturas: la selección de modo
 * era un `grid-cols-2` fijo, así que "ENTRENAMIENTO" y "SIMULACRO REAL"
 * compartían fila SIEMPRE. En un móvil de 360px a cada etiqueta le quedaban
 * unos 110px y el texto tocaba literalmente el borde de su caja.
 *
 * Por eso el componente NO decide el número de columnas: lo hace
 * `OptionGroup`, que apila en móvil. Una opción no puede volver a quedarse sin
 * ancho por decisión de la pantalla que la usa.
 */
export default function OptionCard({
  title,
  description,
  selected,
  onClick,
  icon,
  disabled = false,
}: OptionCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cx(
        'w-full text-left p-4 border-2 transition-all active:scale-[0.99]',
        RADIUS.md,
        TAP,
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
        selected
          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-600'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-300',
      )}
    >
      <span className="flex items-center gap-2">
        {icon}
        <span
          className={cx(
            'text-sm font-black uppercase',
            selected ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300',
          )}
        >
          {title}
        </span>
      </span>
      {description && (
        <span className="block text-[11px] text-slate-400 font-medium leading-snug mt-1">
          {description}
        </span>
      )}
    </button>
  );
}

/**
 * El contenedor de las opciones. **Apila en móvil, reparte en escritorio.**
 *
 * `cols` es cuántas caben en ESCRITORIO. En móvil siempre es una, salvo que se
 * pida `compact` (opciones de una palabra: "Básica", "Estándar"), donde sí
 * caben dos o cuatro.
 */
export function OptionGroup({
  children,
  cols = 2,
  compact = false,
}: {
  children: ReactNode;
  cols?: 2 | 3 | 4;
  compact?: boolean;
}) {
  const escritorio = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' }[cols];
  return (
    <div className={cx('grid gap-2 sm:gap-3', compact ? 'grid-cols-2' : 'grid-cols-1', escritorio)}>
      {children}
    </div>
  );
}

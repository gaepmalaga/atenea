import type { ReactNode } from 'react';
import { RADIUS, TEXT, cx } from './tokens';

type Tone = 'neutral' | 'success' | 'danger' | 'warning' | 'brand';

const TONE: Record<Tone, { box: string; value: string; label: string }> = {
  neutral: {
    box: 'bg-slate-100 dark:bg-slate-800/50',
    value: 'text-slate-600 dark:text-slate-300',
    label: 'text-slate-500/80',
  },
  success: {
    box: 'bg-emerald-50 dark:bg-emerald-900/10',
    value: 'text-emerald-600 dark:text-emerald-400',
    label: 'text-emerald-600/70',
  },
  danger: {
    box: 'bg-red-50 dark:bg-red-900/10',
    value: 'text-red-600 dark:text-red-400',
    label: 'text-red-600/70',
  },
  warning: {
    box: 'bg-amber-50 dark:bg-amber-900/10',
    value: 'text-amber-600 dark:text-amber-400',
    label: 'text-amber-600/70',
  },
  brand: {
    box: 'bg-indigo-50 dark:bg-indigo-900/20',
    value: 'text-indigo-600 dark:text-indigo-400',
    label: 'text-indigo-600/70',
  },
};

interface StatTileProps {
  label: string;
  /**
   * El dato. **`null` significa "no hay dato", y NO es lo mismo que 0.**
   *
   * Es la regla 8 del proyecto metida en el componente: 0 % de acierto es un
   * alumno que va mal; `null` es uno que no ha empezado. Se llama a personas
   * distintas. Pintando `null` como 0 se pierde esa diferencia, y ya pasó en
   * el panel de academia.
   */
  value: number | string | null;
  /** Se pega al valor: "%", "/100", "s". No se pinta si el valor es `null`. */
  suffix?: string;
  tone?: Tone;
  icon?: ReactNode;
}

/**
 * El recuadro de un dato: número grande, etiqueta pequeña.
 *
 * Estaba reescrito en la nota del examen, en la revisión previa a entregar, en
 * el centro de mando, en estadísticas y en el panel de academia — cinco
 * versiones con tamaños distintos.
 */
export default function StatTile({ label, value, suffix, tone = 'neutral', icon }: StatTileProps) {
  const style = TONE[tone];
  const sinDato = value === null;

  return (
    <div className={cx(style.box, RADIUS.md, 'p-3 sm:p-4')}>
      <div className={cx(TEXT.label, style.label, 'flex items-center gap-1.5')}>
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p
        className={cx(
          'text-xl sm:text-2xl font-black mt-1 tabular-nums',
          sinDato ? 'text-slate-300 dark:text-slate-600' : style.value,
        )}
      >
        {sinDato ? '—' : value}
        {!sinDato && suffix && <span className="text-sm font-bold opacity-60">{suffix}</span>}
      </p>
    </div>
  );
}

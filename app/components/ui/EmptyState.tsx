import type { ReactNode } from 'react';
import { TEXT, RADIUS, cx } from './tokens';

interface EmptyStateProps {
  title: string;
  /** Qué hacer para que deje de estar vacío. */
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
  /** Marco de puntos. Para huecos que el usuario puede rellenar. */
  bordered?: boolean;
}

/**
 * "Aquí no hay nada todavía".
 *
 * Merece un componente porque en este proyecto **distinguir "sin datos" de
 * "cero" es una regla** (la 8): no es lo mismo un alumno con 0 % de acierto
 * que uno que no ha empezado. Una pantalla en blanco no dice cuál de los dos
 * es, y ya dejó al alumno mirando un hueco sin saber si la aplicación se había
 * roto.
 */
export default function EmptyState({
  title,
  hint,
  icon,
  action,
  bordered = false,
}: EmptyStateProps) {
  return (
    <div
      className={cx(
        'text-center py-10 sm:py-16 px-4',
        bordered && cx('border-2 border-dashed border-slate-200 dark:border-slate-800', RADIUS.lg),
      )}
    >
      {icon && <div className="flex justify-center mb-3 text-slate-300 dark:text-slate-700">{icon}</div>}
      <p className={cx(TEXT.label, 'text-slate-400')}>{title}</p>
      {hint && <p className={cx(TEXT.muted, 'mt-2 max-w-sm mx-auto')}>{hint}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

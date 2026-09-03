import type { ReactNode } from 'react';
import { TEXT, cx } from './tokens';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Icono. Se pinta dentro de un recuadro de marca. */
  icon?: ReactNode;
  /** Acciones a la derecha (botones). En móvil bajan a su propia línea. */
  actions?: ReactNode;
  /** Centrado, para pantallas de configuración. Por defecto va a la izquierda. */
  center?: boolean;
  className?: string;
}

/**
 * La cabecera de una pantalla.
 *
 * Antes cada una traía la suya: icono de 64px, título de 30px y subtítulo, sin
 * escalar. En un móvil eso ocupaba un tercio de la pantalla ANTES del primer
 * control — el usuario lo describió como "ocupa muchísimo", y tenía razón.
 * Aquí el icono y el título encogen solos.
 */
export default function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  center = false,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cx(
        'mb-4 sm:mb-6 md:mb-8',
        center ? 'text-center' : 'flex flex-wrap items-end justify-between gap-3',
        className,
      )}
    >
      <div className={center ? undefined : 'min-w-0'}>
        {icon && (
          <div
            className={cx(
              'w-10 h-10 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center',
              'bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 border border-indigo-600/20',
              center ? 'mx-auto mb-2 sm:mb-3' : 'mb-3',
            )}
          >
            {icon}
          </div>
        )}
        <h2 className={cx(TEXT.title, 'text-slate-900 dark:text-white uppercase')}>{title}</h2>
        {subtitle && (
          <p className={cx(TEXT.muted, center ? 'mt-1' : 'mt-1 truncate')}>{subtitle}</p>
        )}
      </div>

      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

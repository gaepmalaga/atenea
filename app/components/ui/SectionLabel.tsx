import type { ReactNode } from 'react';
import { TEXT, cx } from './tokens';

interface SectionLabelProps {
  children: ReactNode;
  /** Icono pequeño a la izquierda. */
  icon?: ReactNode;
  /** Contenido a la derecha: un contador, un botón de "ver todo". */
  aside?: ReactNode;
  className?: string;
}

/**
 * La etiqueta en mayúsculas que encabeza cada bloque
 * ("MODO DE OPERACIÓN", "DIFICULTAD", "TEMARIO (1)"...).
 *
 * Estaba copiada literalmente en más de treinta sitios, con tres tamaños de
 * letra distintos y dos espaciados. Es la pieza que le da a la aplicación su
 * aire de panel táctico, así que merece ser una sola.
 */
export default function SectionLabel({ children, icon, aside, className }: SectionLabelProps) {
  return (
    <div className={cx('flex items-center justify-between gap-2 mb-3 sm:mb-4', className)}>
      <span className={cx(TEXT.label, 'text-slate-400 flex items-center gap-2 min-w-0')}>
        {icon}
        <span className="truncate">{children}</span>
      </span>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}

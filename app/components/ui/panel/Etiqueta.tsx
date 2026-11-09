import type { ReactNode } from 'react';
import { TONO_ETIQUETA, TONO_PUNTO, TONO_TEXTO, type Tono } from './estilos';
import { cx } from '../tokens';

/** Una etiqueta pequeña con el color de un estado: «Con acceso», «Completa». */
export function Etiqueta({ tono = 'neutro', children, className }: { tono?: Tono; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-block whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-semibold leading-snug', TONO_ETIQUETA[tono], className)}>
      {children}
    </span>
  );
}

/** Un punto de color y una palabra: «● Activo». El estado nunca va solo en color. */
export function Estado({ tono = 'neutro', children }: { tono?: Tono; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-xs font-semibold', TONO_TEXTO[tono])}>
      <i className={cx('h-2 w-2 shrink-0 rounded-full', TONO_PUNTO[tono])} aria-hidden />
      {children}
    </span>
  );
}

/** Un grupo, un tema, un dato corto: gris, con filete. */
export function Dato({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block whitespace-nowrap rounded border border-linea dark:border-noche-linea bg-hundido dark:bg-noche-hondo px-2 py-0.5 text-[11.5px] font-medium text-slate-800 dark:text-slate-200">
      {children}
    </span>
  );
}

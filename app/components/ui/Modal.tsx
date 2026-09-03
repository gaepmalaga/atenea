'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { RADIUS, ELEVATION, TEXT, TAP, cx } from './tokens';

interface ModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** Botones del pie. Se quedan fijos: no hay que buscarlos con scroll. */
  footer?: ReactNode;
  /** Ancho máximo en escritorio. En móvil siempre ocupa lo que hay. */
  width?: 'sm' | 'md' | 'lg';
  /** Cabecera con el color de marca (visores, cosas destacadas). */
  accent?: boolean;
}

const WIDTH = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' } as const;

/**
 * Ventana modal.
 *
 * Había cuatro implementaciones distintas —el visor de fuentes del chat, el
 * editor del banco, el compositor de preguntas y el reporte de una pregunta—
 * y todas cometían el mismo fallo en móvil: `max-h-[85vh]`.
 *
 * `vh` en un móvil es la altura CON la barra de direcciones plegada, así que
 * al abrir el modal con la barra visible el pie —donde están "Guardar" y
 * "Cerrar"— se quedaba fuera de la pantalla. Aquí se usa `dvh`, que sí sigue a
 * la barra. Y el cuerpo es lo único que hace scroll: cabecera y pie no se van.
 */
export default function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 'md',
  accent = false,
}: ModalProps) {
  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      {/*
        En móvil se apoya abajo (`items-end`) y ocupa todo el ancho: es donde
        llega el pulgar y es el patrón que usan las aplicaciones nativas. En
        escritorio se centra, como siempre.
      */}
      <div
        className={cx(
          'w-full flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800',
          'max-h-[92dvh] sm:max-h-[85dvh]',
          'rounded-t-3xl sm:rounded-3xl',
          ELEVATION.floating,
          WIDTH[width],
          'animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300',
        )}
      >
        <div
          className={cx(
            'flex items-start justify-between gap-3 p-4 sm:p-6 shrink-0 border-b',
            accent
              ? 'bg-indigo-600 text-white border-indigo-500 rounded-t-3xl'
              : 'border-slate-100 dark:border-slate-800',
          )}
        >
          <div className="min-w-0">
            <h3 className={cx(TEXT.heading, accent ? 'text-white' : 'text-slate-900 dark:text-white')}>
              {title}
            </h3>
            {subtitle && (
              <p className={cx('text-xs mt-0.5 truncate', accent ? 'text-white/70' : 'text-slate-500')}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className={cx(
              'shrink-0 flex items-center justify-center w-11 h-11 -mr-2 -mt-2 rounded-full transition-colors',
              TAP,
              accent ? 'hover:bg-white/15' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400',
            )}
          >
            <X size={20} />
          </button>
        </div>

        <div className={cx('flex-1 overflow-y-auto p-4 sm:p-6', RADIUS.sm)}>{children}</div>

        {footer && (
          <div className="shrink-0 p-4 sm:p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

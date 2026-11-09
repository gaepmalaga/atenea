import type { ReactNode } from 'react';
import { TONO_TEXTO, type Tono } from './estilos';
import { cx } from '../tokens';

export type CifraPulso = { valor: ReactNode; etiqueta: ReactNode; tono?: Tono; extra?: ReactNode };

/**
 * La franja de cifras de una pantalla: una línea con filetes, no cuatro cajas
 * iguales. Cada cifra dice qué hay que hacer con ella (color de estado). En
 * móvil pasan a dos columnas.
 *
 * `valor === null` es «sin datos» y se pinta «—», distinto de un cero (regla 8).
 */
export default function Pulso({ cifras }: { cifras: CifraPulso[] }) {
  const n = cifras.length;
  return (
    <div
      className="grid grid-cols-2 border-y border-linea dark:border-noche-linea lg:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]"
      style={{ '--n': n } as React.CSSProperties}
    >
      {cifras.map((c, i) => (
        <div
          key={i}
          className={cx(
            'min-w-0 py-3 px-3.5 border-linea dark:border-noche-linea',
            'max-lg:odd:pl-0 max-lg:even:border-l',
            i < n - 2 + (n % 2) && 'max-lg:border-b',
            'lg:border-l lg:first:border-l-0 lg:first:pl-0 lg:px-4',
          )}
        >
          <strong
            className={cx(
              'block font-titulo text-3xl font-bold leading-none tabular-nums',
              c.valor === null ? 'text-slate-400 dark:text-slate-600' : TONO_TEXTO[c.tono ?? 'neutro'],
            )}
          >
            {c.valor === null ? '—' : c.valor}
          </strong>
          {c.extra}
          <span className="mt-1 block text-xs text-slate-600 dark:text-slate-400">{c.etiqueta}</span>
        </div>
      ))}
    </div>
  );
}

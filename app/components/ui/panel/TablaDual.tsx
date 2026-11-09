import type { ReactNode } from 'react';
import { HOJA, HUNDIDO } from './estilos';
import { cx } from '../tokens';

export type Columna<T> = {
  id: string;
  titulo: ReactNode;
  celda: (fila: T) => ReactNode;
  /** Solo con mucho ancho (xl): en una pantalla justa se oculta. */
  soloAncho?: boolean;
  /** No sale en la tarjeta del móvil. */
  sinTarjeta?: boolean;
  /** Va al final, sin título: «Editar», «+». En la tarjeta, abajo. */
  acciones?: boolean;
  /** Alineada a la derecha. */
  derecha?: boolean;
};

/**
 * Una tabla en escritorio y tarjetas en móvil, desde los MISMOS datos.
 *
 * La primera columna que no sea de acciones es la identidad de la fila: en la
 * tarjeta hace de título y el resto salen como «título: valor». Una tabla de
 * ocho columnas no cabe en un teléfono y desplazarla hacia los lados se
 * esconde casi todo: por eso son dos presentaciones y no una tabla con scroll.
 */
export default function TablaDual<T>({
  columnas, filas, clave, onFila, vacio, soloLectura,
}: {
  columnas: Columna<T>[];
  filas: T[];
  clave: (fila: T) => string;
  onFila?: (fila: T) => void;
  vacio?: ReactNode;
  soloLectura?: boolean;
}) {
  if (filas.length === 0 && vacio) return <div className={cx(HOJA, 'p-7 text-sm text-slate-600 dark:text-slate-400')}>{vacio}</div>;
  const datos = columnas.filter((c) => !c.acciones);
  const acciones = columnas.filter((c) => c.acciones);
  const clicable = !!onFila && !soloLectura;

  return (
    <>
      <div className={cx(HOJA, 'hidden overflow-x-auto lg:block')}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {columnas.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className={cx(
                    HUNDIDO,
                    'border-b border-linea dark:border-noche-linea px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-400',
                    c.soloAncho && 'hidden xl:table-cell',
                    c.derecha && 'text-right',
                  )}
                >
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr
                key={clave(f)}
                onClick={clicable ? () => onFila(f) : undefined}
                onKeyDown={clicable ? (e) => { if (e.key === 'Enter') onFila(f); } : undefined}
                tabIndex={clicable ? 0 : undefined}
                className={cx('border-b border-linea dark:border-noche-linea last:border-b-0', clicable && 'cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-500/10')}
              >
                {columnas.map((c) => (
                  <td key={c.id} className={cx('px-3.5 py-2.5 align-middle', c.soloAncho && 'hidden xl:table-cell', c.derecha && 'text-right')}>
                    {c.celda(f)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:hidden">
        {filas.map((f) => (
          <article
            key={clave(f)}
            onClick={clicable ? () => onFila(f) : undefined}
            className={cx(HOJA, 'grid gap-2.5 p-3.5', clicable && 'cursor-pointer')}
          >
            <div className="min-w-0">{datos[0]?.celda(f)}</div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-1.5 text-[13px]">
              {datos.slice(1).filter((c) => !c.sinTarjeta).map((c) => (
                <div key={c.id} className="contents">
                  <dt className="text-slate-600 dark:text-slate-400">{c.titulo}</dt>
                  <dd className="min-w-0 break-words text-right">{c.celda(f)}</dd>
                </div>
              ))}
            </dl>
            {acciones.length > 0 && <div className="flex flex-wrap gap-2">{acciones.map((c) => <span key={c.id} className="contents">{c.celda(f)}</span>)}</div>}
          </article>
        ))}
      </div>
    </>
  );
}

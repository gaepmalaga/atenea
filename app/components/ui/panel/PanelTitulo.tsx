import type { ReactNode } from 'react';

/**
 * El título de una pantalla del panel: Barlow Condensed en mayúsculas, el
 * subtítulo debajo y las acciones a la derecha. En móvil las acciones ocupan
 * todo el ancho, repartido a partes iguales.
 */
export default function PanelTitulo({ titulo, sub, acciones }: { titulo: string; sub?: ReactNode; acciones?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h2 className="font-titulo text-3xl sm:text-4xl font-bold uppercase leading-none tracking-wide text-slate-900 dark:text-white">{titulo}</h2>
        {sub && <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">{sub}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:[&>*]:flex-1">{acciones}</div>}
    </div>
  );
}

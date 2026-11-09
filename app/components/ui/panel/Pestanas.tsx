import { cx } from '../tokens';

export type PestanaItem<T extends string> = { id: T; etiqueta: string; cuenta?: number };

/** Pestañas dentro de una pantalla: subrayado dorado en la activa. */
export default function Pestanas<T extends string>({
  items, activa, onCambia, etiqueta,
}: { items: readonly PestanaItem<T>[]; activa: T; onCambia: (id: T) => void; etiqueta: string }) {
  return (
    <div role="tablist" aria-label={etiqueta} className="flex gap-0.5 overflow-x-auto scrollbar-hide border-b border-linea dark:border-noche-linea">
      {items.map((p) => {
        const on = p.id === activa;
        return (
          <button
            key={p.id}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onCambia(p.id)}
            className={cx(
              '-mb-px flex min-h-[46px] shrink-0 items-center gap-2 border-b-[3px] px-4 text-sm font-semibold transition-colors',
              on ? 'border-oro text-indigo-900 dark:text-indigo-200' : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white',
            )}
          >
            {p.etiqueta}
            {p.cuenta !== undefined && (
              <b className="rounded-full border border-linea dark:border-noche-linea bg-hundido dark:bg-noche-hondo px-1.5 text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">{p.cuenta}</b>
            )}
          </button>
        );
      })}
    </div>
  );
}

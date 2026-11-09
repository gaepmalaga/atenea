import { cx } from '../tokens';

export type DatoBarra = { etiqueta: string; valor: number };

/**
 * Un gráfico de barras que se pinta con HTML y no con SVG: así la letra no se
 * encoge con el ancho de la pantalla (un SVG escalado a 330 px dejaba los
 * números a 7 px) y no hace falta saber el ancho para dibujarlo.
 *
 * La altura de cada barra es proporcional al valor y la cifra va sobre la barra.
 * La última se pinta más fuerte: es el periodo en curso.
 */
export default function Barras({ datos, formato, resumen }: { datos: DatoBarra[]; formato: (v: number) => string; resumen: string }) {
  const max = Math.max(0, ...datos.map((d) => d.valor)) || 1;
  return (
    <figure className="m-0 min-w-0" role="img" aria-label={resumen}>
      <div className="flex h-48 items-stretch gap-1.5 border-b border-linea dark:border-noche-linea sm:gap-3">
        {datos.map((d, i) => (
          <div key={d.etiqueta + i} className="flex min-w-0 flex-1 flex-col items-center justify-end">
            <span className="mb-1 text-[11px] font-semibold tabular-nums text-slate-900 dark:text-white">{formato(d.valor)}</span>
            <div
              className={cx('w-full max-w-16 rounded-t', i === datos.length - 1 ? 'bg-indigo-900 dark:bg-indigo-300' : 'bg-indigo-300 dark:bg-indigo-500/40')}
              style={{ height: `calc((100% - 1.5rem) * ${d.valor / max})`, minHeight: d.valor > 0 ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <figcaption className="mt-1.5 flex gap-1.5 sm:gap-3">
        {datos.map((d, i) => (
          <span key={d.etiqueta + i} className="min-w-0 flex-1 truncate text-center text-[11px] capitalize text-slate-600 dark:text-slate-400">{d.etiqueta}</span>
        ))}
      </figcaption>
    </figure>
  );
}

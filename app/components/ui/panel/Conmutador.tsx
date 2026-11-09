import { cx } from '../tokens';

/** Un interruptor de encendido y apagado, con zona táctil de 44 px. */
export default function Conmutador({
  activo, onChange, etiqueta, disabled,
}: { activo: boolean; onChange: (v: boolean) => void; etiqueta: string; disabled?: boolean }) {
  return (
    <span className="grid min-h-[44px] min-w-[54px] place-items-center">
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-label={etiqueta}
        disabled={disabled}
        onClick={() => onChange(!activo)}
        className={cx(
          'relative h-8 w-[54px] shrink-0 rounded-full border-[1.5px] transition-colors disabled:opacity-60',
          activo ? 'border-indigo-900 bg-indigo-900 dark:border-indigo-300 dark:bg-indigo-300' : 'border-linea dark:border-noche-linea bg-hundido dark:bg-noche-hondo',
        )}
      >
        <span
          className={cx(
            'absolute left-[3px] top-[3px] h-[23px] w-[23px] rounded-full transition-transform',
            activo ? 'translate-x-[22px] bg-white dark:bg-marino-hondo' : 'bg-slate-500 dark:bg-slate-400',
          )}
        />
      </button>
    </span>
  );
}

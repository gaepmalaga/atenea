import { cx } from '../tokens';

/**
 * Un interruptor de encendido y apagado. La pastilla que se ve mide 32 px de
 * alto; lo que se toca, el botón entero, mide 44 (regla 36). Un interruptor de
 * 32 px se falla con el pulgar, y aquí fallarlo apaga un módulo entero.
 */
export default function Conmutador({
  activo, onChange, etiqueta, disabled,
}: { activo: boolean; onChange: (v: boolean) => void; etiqueta: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={disabled}
      onClick={() => onChange(!activo)}
      className="grid h-11 min-w-[54px] shrink-0 place-items-center disabled:opacity-60"
    >
      <span
        className={cx(
          'relative block h-8 w-[54px] rounded-full border-[1.5px] transition-colors',
          activo ? 'border-indigo-900 bg-indigo-900 dark:border-indigo-300 dark:bg-indigo-300' : 'border-linea dark:border-noche-linea bg-hundido dark:bg-noche-hondo',
        )}
      >
        <span
          className={cx(
            'absolute left-[3px] top-[3px] h-[23px] w-[23px] rounded-full transition-transform',
            activo ? 'translate-x-[22px] bg-white dark:bg-marino-hondo' : 'bg-slate-500 dark:bg-slate-400',
          )}
        />
      </span>
    </button>
  );
}

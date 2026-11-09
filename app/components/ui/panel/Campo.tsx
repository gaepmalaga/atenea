import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../tokens';

/**
 * Los campos del panel. Mismas propiedades que `TextField`, `TextAreaField` y
 * `SelectField`; cambia la forma (46 px, esquinas de 7 px, fondo del lienzo).
 * La letra es de 16 px en móvil, o Safari de iPhone hace zoom al tocarlos.
 */
const CONTROL = cx(
  'w-full min-h-[46px] min-w-0 rounded-[7px] border border-linea dark:border-noche-linea bg-crema dark:bg-noche',
  'px-3 text-base sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-500',
  'outline-none transition-colors focus:border-indigo-700 dark:focus:border-indigo-300 disabled:opacity-60',
);

function Etiqueta({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="mb-1.5 block text-[12.5px] font-semibold text-slate-800 dark:text-slate-200">{children}</label>;
}

type Base = { label?: string; hint?: string; id?: string };

export function Campo({ label, hint, id, className, trailing, ...rest }: Base & { trailing?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  id = id ?? auto;
  return (
    <div className="min-w-0">
      {label && <Etiqueta htmlFor={id}>{label}</Etiqueta>}
      <div className="relative">
        <input id={id} className={cx(CONTROL, trailing ? 'pr-12' : null, className)} {...rest} />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-1.5">{trailing}</div>}
      </div>
      {hint && <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

export function CampoArea({ label, hint, id, className, ...rest }: Base & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId();
  id = id ?? auto;
  return (
    <div className="min-w-0">
      {label && <Etiqueta htmlFor={id}>{label}</Etiqueta>}
      <textarea id={id} className={cx(CONTROL, 'resize-y py-2.5 leading-relaxed [field-sizing:content]', className)} {...rest} />
      {hint && <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

export function CampoSelect({ label, hint, id, className, children, ...rest }: Base & SelectHTMLAttributes<HTMLSelectElement>) {
  const auto = useId();
  id = id ?? auto;
  return (
    <div className="min-w-0">
      {label && <Etiqueta htmlFor={id}>{label}</Etiqueta>}
      <select id={id} className={cx(CONTROL, className)} {...rest}>{children}</select>
      {hint && <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

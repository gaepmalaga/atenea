import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';
import { RADIUS, TEXT, TAP, cx } from './tokens';

/**
 * El aspecto compartido de todo lo que se escribe o se elige.
 *
 * `text-base` en móvil NO es un capricho de tamaño: **Safari en iPhone hace
 * zoom automático sobre cualquier campo con letra menor de 16px al tocarlo**,
 * y luego deja la página desencuadrada. Toda la aplicación usaba `text-sm`
 * (14px), así que cada vez que el alumno escribía en el chat o rellenaba su
 * perfil, la pantalla daba un salto. A partir de `sm` (ya no es un móvil) se
 * vuelve a 14px, que es lo que pide el diseño.
 */
const CONTROL = cx(
  'w-full bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800',
  'text-slate-900 dark:text-white placeholder:text-slate-400',
  'outline-none transition-colors focus:border-indigo-500',
  'text-base sm:text-sm',
  RADIUS.md,
  TAP,
  'px-4 py-3',
);

function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className={cx(TEXT.label, 'text-slate-400 block mb-2')}>
      {children}
    </label>
  );
}

interface FieldWrap {
  label?: string;
  /** Texto de ayuda debajo. */
  hint?: string;
  id?: string;
}

export function TextField({
  label,
  hint,
  id,
  className,
  ...rest
}: FieldWrap & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}
      <input id={id} className={cx(CONTROL, className)} {...rest} />
      {hint && <p className={cx(TEXT.muted, 'mt-1.5')}>{hint}</p>}
    </div>
  );
}

export function TextAreaField({
  label,
  hint,
  id,
  className,
  ...rest
}: FieldWrap & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}
      <textarea id={id} className={cx(CONTROL, 'resize-none leading-relaxed', className)} {...rest} />
      {hint && <p className={cx(TEXT.muted, 'mt-1.5')}>{hint}</p>}
    </div>
  );
}

export function SelectField({
  label,
  hint,
  id,
  className,
  children,
  ...rest
}: FieldWrap & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}
      <select id={id} className={cx(CONTROL, 'cursor-pointer appearance-none pr-10', className)} {...rest}>
        {children}
      </select>
      {hint && <p className={cx(TEXT.muted, 'mt-1.5')}>{hint}</p>}
    </div>
  );
}

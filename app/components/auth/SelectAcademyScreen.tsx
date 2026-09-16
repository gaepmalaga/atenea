'use client'

import { Building2, LogOut, ArrowRight } from 'lucide-react';
import { TAP, cx } from '../ui';

/**
 * ELIGE TU ACADEMIA — P11h.
 *
 * Una cuenta puede estar en varias academias (decidido en P11, regla 65) sin
 * que la cookie de `middleware.ts` diga cuál usar — antes de esto, esa
 * combinación dejaba a la persona en `access: 'no-academy'`, la misma
 * pantalla de "habla con tu academia" que un alumno sin ninguna (`AccessLocked`).
 * No es lo mismo: aquí SÍ hay una salida real — elegir — así que se le ofrece
 * en vez de despedirla.
 *
 * Elegir navega a `/<slug>`: es el ÚNICO sitio que deja la cookie
 * `atenea-academia` (`middleware.ts`), así que reutiliza ese camino entero en
 * vez de inventar uno nuevo para fijarla desde el cliente.
 *
 * Mismo lenguaje visual que `LoginScreen`/`SetPasswordScreen` (regla 43): es
 * la misma familia de pantallas de entrada, no el panel ya dentro.
 */

interface Props {
  academias: { slug: string; name: string }[];
  email: string;
  onLogout: () => void;
}

const C = {
  fondo: 'bg-[#f7f4ee]',
  tinta: 'text-[#111820]',
  tinta2: 'text-[#3d4a5a]',
  rojo: 'bg-[#c60b1e]',
} as const;

export default function SelectAcademyScreen({ academias, email, onLogout }: Props) {
  return (
    <div className={cx('min-h-dvh flex flex-col', C.fondo)}>
      <header className="border-b-[3px] border-[#111820]">
        <div className="max-w-lg mx-auto px-6 py-3 flex items-center justify-between">
          <span className={cx('text-xs font-black uppercase tracking-[0.14em]', C.tinta)}>Atenea Policial</span>
          <span className="flex h-2 w-8">
            <span className="flex-1 bg-[#c60b1e]" /><span className="flex-1 bg-[#ffc400]" /><span className="flex-1 bg-[#c60b1e]" />
          </span>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-6">
          <div>
            <h1 className={cx('text-3xl sm:text-4xl font-black tracking-tight leading-none', C.tinta)}>
              Elige tu academia
            </h1>
            <p className={cx('mt-3 text-sm', C.tinta2)}>
              Tu cuenta está dada de alta en varias. Elige con cuál quieres entrar ahora — puedes volver a este enlace cuando quieras cambiar.
            </p>
          </div>

          <div className="space-y-2">
            {academias.map((a) => (
              <a
                key={a.slug}
                href={`/${a.slug}`}
                className={cx(
                  'flex items-center justify-between gap-3 w-full border-[3px] border-[#111820] px-4 py-4 min-h-[56px]',
                  'font-semibold text-[#111820] hover:bg-[#111820] hover:text-white transition-colors',
                  TAP,
                )}
              >
                <span className="flex items-center gap-3">
                  <Building2 size={18} className="shrink-0" />
                  {a.name}
                </span>
                <ArrowRight size={18} className="shrink-0" />
              </a>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs font-mono text-[#8d99a8]">{email}</p>
            <button
              onClick={onLogout}
              className={cx('flex items-center gap-2 text-xs font-black uppercase tracking-wider', C.tinta2, TAP)}
            >
              <LogOut size={14} /> Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

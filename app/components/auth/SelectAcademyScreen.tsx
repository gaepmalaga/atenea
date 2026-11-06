'use client'

import { Building2, LogOut, ArrowRight } from 'lucide-react';
import { TAP, cx } from '../ui';
import MarcoEntrada from './MarcoEntrada';
import { TITULO, SUBTITULO, ENLACE } from './estilosEntrada';

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
 * Mismo marco que `LoginScreen`/`SetPasswordScreen` (`MarcoEntrada`, regla
 * 90): es la misma familia de pantallas de entrada, no el panel ya dentro.
 */

interface Props {
  academias: { slug: string; name: string }[];
  email: string;
  onLogout: () => void;
}

export default function SelectAcademyScreen({ academias, email, onLogout }: Props) {
  return (
    <MarcoEntrada>
      <h1 className={TITULO}>Elige tu academia</h1>
      <p className={SUBTITULO}>
        Tu cuenta está dada de alta en varias. Elige con cuál quieres entrar ahora; puedes volver a este enlace cuando quieras cambiar.
      </p>

      <div className="mt-6 space-y-2.5">
        {academias.map((a) => (
          <a
            key={a.slug}
            href={`/${a.slug}`}
            className={cx(
              'flex w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3.5',
              'font-semibold text-slate-900 hover:border-[#14295a] hover:bg-slate-50 transition',
              TAP,
            )}
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#14295a]/5 text-[#14295a]">
                <Building2 size={18} aria-hidden />
              </span>
              <span className="min-w-0 break-words leading-snug">{a.name}</span>
            </span>
            <ArrowRight size={18} className="shrink-0 text-[#14295a]" aria-hidden />
          </a>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-200 pt-6">
        <p className="min-w-0 truncate text-sm text-slate-500">{email}</p>
        <button onClick={onLogout} className={cx(ENLACE, 'shrink-0 gap-1.5 text-sm')}>
          <LogOut size={15} aria-hidden /> Cerrar sesión
        </button>
      </div>
    </MarcoEntrada>
  );
}

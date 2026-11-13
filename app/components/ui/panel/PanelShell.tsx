'use client';

import { useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { LogOut, Menu, RefreshCw, X } from 'lucide-react';
import { cx } from '../tokens';
import TemaPanel from './TemaPanel';

export type PestanaPanel = { id: string; etiqueta: string; icono: LucideIcon; seccion: string };

/**
 * La cáscara del panel de administración.
 *
 * En escritorio, una barra lateral marino con las pantallas agrupadas por
 * sección. En móvil, una barra superior con el menú completo y una barra
 * inferior con las cuatro pantallas de cada día.
 *
 * LA BARRA SE QUEDA MARINO SIEMPRE: es la única cosa que no sigue el tema, y es
 * la señal de contexto. Este es el sitio donde se borra temario y se publican
 * preguntas para todos los alumnos, y conviene saber de un vistazo que ya no
 * estás en el de estudiar (regla 45).
 */
export default function PanelShell({
  nombre, logo, rol, correo, pestanas, principales, activa, onCambia, onRefrescar, onSalir, children,
}: {
  nombre: string;
  logo: string;
  rol: string;
  correo: string;
  pestanas: PestanaPanel[];
  /** Los ids de la barra inferior del móvil, en orden. */
  principales: string[];
  activa: string;
  onCambia: (id: string) => void;
  onRefrescar: () => void;
  onSalir: () => void;
  children: ReactNode;
}) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const secciones = [...new Set(pestanas.map((p) => p.seccion))];
  const abajo = principales.map((id) => pestanas.find((p) => p.id === id)).filter((p): p is PestanaPanel => !!p);

  const elige = (id: string) => { setMenuAbierto(false); onCambia(id); };

  return (
    <div className="min-h-dvh bg-crema dark:bg-noche text-slate-800 dark:text-slate-200 font-sans lg:grid lg:grid-cols-[13rem_minmax(0,1fr)]">
      {/* --- ESCRITORIO: la barra lateral --- */}
      <aside className="hidden lg:flex lg:sticky lg:top-0 lg:h-dvh flex-col overflow-y-auto bg-marino text-indigo-100">
        <div className="flex items-center gap-2.5 px-4.5 pb-5 pt-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="" width={34} height={34} className="h-[34px] w-[34px] shrink-0 rounded-lg object-cover" />
          <div className="min-w-0">
            <b className="block truncate font-titulo text-[17px] font-bold uppercase leading-none tracking-[0.12em] text-white">{nombre}</b>
            <small className="text-[10px] uppercase tracking-wider text-indigo-200/80">Panel</small>
          </div>
        </div>
        <nav aria-label="Secciones del panel" className="flex-1">
          {secciones.map((s) => (
            <div key={s}>
              <h6 className="px-4.5 pb-1 pt-3.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-200/70">{s}</h6>
              {pestanas.filter((p) => p.seccion === s).map((p) => (
                <ItemLateral key={p.id} p={p} on={p.id === activa} onClick={() => onCambia(p.id)} />
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 px-4.5 py-4">
          <span className="inline-block rounded bg-oro px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-marino-hondo">{rol}</span>
          <p className="mt-1.5 truncate text-[11px] text-indigo-200" title={correo}>{correo}</p>
          <div className="mt-2.5"><TemaPanel /></div>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={onRefrescar} aria-label="Recargar datos" title="Recargar datos" className="grid h-11 w-11 place-items-center rounded-lg border border-white/15 text-indigo-100 hover:bg-white/10">
              <RefreshCw size={16} />
            </button>
            <button type="button" onClick={onSalir} aria-label="Cerrar sesión" className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border border-white/15 text-sm font-semibold text-indigo-100 hover:bg-white/10">
              <LogOut size={15} /> Salir
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col lg:min-h-0">
        {/* --- MÓVIL Y TABLET: la barra superior --- */}
        <header className="flex items-center justify-between bg-marino px-4 pt-[env(safe-area-inset-top)] text-white lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt="" width={30} height={30} className="h-[30px] w-[30px] shrink-0 rounded-lg object-cover" />
            <b className="truncate font-titulo text-base font-bold uppercase tracking-[0.12em]">{nombre}</b>
          </div>
          <button type="button" onClick={() => setMenuAbierto((x) => !x)} aria-expanded={menuAbierto} aria-label={menuAbierto ? 'Cerrar el menú' : 'Abrir el menú'} className="grid h-11 w-11 place-items-center">
            {menuAbierto ? <X size={22} /> : <Menu size={22} />}
          </button>
        </header>
        {menuAbierto && (
          <nav aria-label="Todas las pantallas" className="bg-marino px-2 pb-3 text-indigo-100 lg:hidden">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]">
              {pestanas.map((p) => (
                <button key={p.id} type="button" onClick={() => elige(p.id)} className={cx('flex min-h-[44px] items-center px-2.5 text-left text-sm', p.id === activa ? 'font-semibold text-white' : 'text-indigo-200')}>
                  {p.etiqueta}
                </button>
              ))}
            </div>
            <div className="mt-2 border-t border-white/10 px-2.5 pt-3"><TemaPanel /></div>
            <div className="mt-2 flex items-center justify-between gap-2 px-2.5">
              <p className="min-w-0 truncate text-[11px] text-indigo-200"><b className="mr-1.5 rounded bg-oro px-1.5 py-0.5 text-[9px] font-black uppercase text-marino-hondo">{rol}</b>{correo}</p>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={onRefrescar} aria-label="Recargar datos" className="grid h-11 w-11 place-items-center rounded-lg border border-white/15"><RefreshCw size={16} /></button>
                <button type="button" onClick={onSalir} aria-label="Cerrar sesión" className="grid h-11 w-11 place-items-center rounded-lg border border-white/15"><LogOut size={16} /></button>
              </div>
            </div>
          </nav>
        )}

        <main className="min-w-0 flex-1 px-4 pb-8 pt-5 sm:px-5 lg:px-8 lg:pb-12 lg:pt-8">{children}</main>

        {/* --- MÓVIL Y TABLET: la barra inferior --- */}
        <nav aria-label="Pantallas principales" className="sticky bottom-0 z-30 grid border-t border-linea dark:border-noche-linea bg-white dark:bg-noche-2 px-1 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1 lg:hidden" style={{ gridTemplateColumns: `repeat(${abajo.length + 1}, minmax(0, 1fr))` }}>
          {abajo.map((p) => {
            const Icono = p.icono;
            const on = p.id === activa;
            return (
              <button key={p.id} type="button" onClick={() => elige(p.id)} aria-current={on ? 'page' : undefined} className={cx('grid min-h-[52px] min-w-0 justify-items-center gap-0.5 rounded-lg px-0.5 py-1.5 text-[11px]', on ? 'font-semibold text-indigo-900 dark:text-indigo-200' : 'font-medium text-slate-600 dark:text-slate-400')}>
                <Icono size={22} strokeWidth={on ? 2.4 : 1.8} />
                <span className="max-w-full truncate">{p.etiqueta}</span>
              </button>
            );
          })}
          {/* En una pantalla que no está abajo (Grupos, Ajustes…), «Más» dice
              dónde estás: si no, ninguna salía marcada. */}
          {(() => {
            const fuera = abajo.some((p) => p.id === activa) ? null : pestanas.find((p) => p.id === activa) ?? null;
            return (
              <button type="button" onClick={() => { window.scrollTo({ top: 0 }); setMenuAbierto(true); }} aria-current={fuera ? 'page' : undefined}
                className={cx('grid min-h-[52px] min-w-0 justify-items-center gap-0.5 rounded-lg px-0.5 py-1.5 text-[11px]', fuera ? 'font-semibold text-indigo-900 dark:text-indigo-200' : 'font-medium text-slate-600 dark:text-slate-400')}>
                <Menu size={22} strokeWidth={fuera ? 2.4 : 1.8} />
                <span className="max-w-full truncate">{fuera ? fuera.etiqueta : 'Más'}</span>
              </button>
            );
          })()}
        </nav>
      </div>
    </div>
  );
}

function ItemLateral({ p, on, onClick }: { p: PestanaPanel; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={on ? 'page' : undefined}
      className={cx(
        'flex min-h-[44px] w-full items-center px-4.5 text-left text-[13.5px] transition-colors',
        on ? 'bg-white/10 font-semibold text-white shadow-[inset_3px_0_0_var(--color-oro)]' : 'text-indigo-100 hover:bg-white/5',
      )}
    >
      {p.etiqueta}
    </button>
  );
}

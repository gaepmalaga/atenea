'use client';

import { useState } from 'react';
import { Power, MoreHorizontal, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cx, TEXT, TAP } from '../../ui';

interface MobileNavProps {
  activeTab: string;
  onTabChange: (id: string) => void;
  onLogout: () => void;
  items: { id: string; label: string; icon: LucideIcon }[];
}

/**
 * Cuántas pestañas caben de verdad en la barra.
 *
 * Con los ocho módulos encendidos, la barra metía ocho iconos MÁS el botón de
 * salir en el ancho de un teléfono: unos 40px por elemento, sin etiqueta y sin
 * separación real. Cuatro y un "Más" es lo que cabe pudiendo además poner
 * debajo el nombre de cada una, que es lo que convierte una fila de iconos
 * crípticos en una navegación que se entiende.
 */
const VISIBLES = 4;

/**
 * El nombre que cabe debajo del icono.
 *
 * "Inteligencia (RAG)" o "Rango & Estadisticas" no entran en un quinto de
 * pantalla: tomando la primera palabra salian "INTELIGENCIA" y "OPERACIONES",
 * que ya se pisaban entre si. Estos son los nombres cortos de verdad.
 */
const ETIQUETA_CORTA: Record<string, string> = {
  home: 'Inicio',
  chat: 'Chat',
  test: 'Test',
  review: 'Fallos',
  cards: 'Fichas',
  training: 'Física',
  interview: 'Perfil',
  stats: 'Rango',
};

export default function MobileNav({ activeTab, onTabChange, onLogout, items }: MobileNavProps) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  const principales = items.slice(0, VISIBLES);
  const resto = items.slice(VISIBLES);
  const activaEnElResto = resto.some((i) => i.id === activeTab);

  const irA = (id: string) => {
    onTabChange(id);
    setMenuAbierto(false);
  };

  return (
    <>
      {/* HOJA "MÁS": el resto de módulos y, aquí sí, el botón de salir. */}
      {menuAbierto && (
        <div
          className="md:hidden fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setMenuAbierto(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-t-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className={cx(TEXT.label, 'text-slate-500 dark:text-slate-400')}>Todo lo demás</span>
              <button
                onClick={() => setMenuAbierto(false)}
                aria-label="Cerrar"
                className={cx('flex items-center justify-center w-11 h-11 -mr-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800', TAP)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {resto.map((item) => {
                const Icon = item.icon;
                const activa = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => irA(item.id)}
                    className={cx(
                      'flex items-center gap-3 p-3 rounded-2xl text-left transition-colors',
                      TAP,
                      activa
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300',
                    )}
                  >
                    <Icon size={20} className="shrink-0" />
                    <span className="text-xs font-bold leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/*
              Cerrar sesión vive AQUÍ, y no en la barra, por la regla 26: una
              acción irreversible no comparte sitio, color ni tamaño con la que
              se pulsa veinte veces al día. Estaba pegada a los iconos de
              navegación, con el mismo aspecto: un pulgar despistado te sacaba
              de la sesión en mitad de un test.
            */}
            <button
              onClick={onLogout}
              className={cx(
                'mt-3 w-full flex items-center justify-center gap-2 p-3 rounded-2xl border border-red-500/20 bg-red-500/5 text-red-500 font-black uppercase text-[11px] tracking-widest',
                TAP,
              )}
            >
              <Power size={16} /> Cerrar sesión
            </button>
          </div>
        </div>
      )}

      {/* LA BARRA */}
      <nav data-nav-inferior className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 px-1 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
        <div className="flex items-stretch justify-around">
          {principales.map((item) => {
            const Icon = item.icon;
            const activa = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                aria-current={activa ? 'page' : undefined}
                className={cx(
                  // `min-w-0` es imprescindible: un hijo de flex NO encoge por
                  // debajo de su contenido sin el, asi que `truncate` no hacia
                  // nada y "INTELIGENCIA" y "OPERACIONES" se pisaban entre si.
                  'flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl transition-colors',
                  TAP,
                  activa ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400',
                )}
              >
                <Icon size={21} strokeWidth={activa ? 2.6 : 2} />
                {/* La etiqueta es la mitad del arreglo: ocho iconos sin nombre
                    obligaban a entrar en cada uno para saber qué era. */}
                <span className="w-full text-[9px] font-black uppercase tracking-tight leading-none truncate px-0.5 text-center">
                  {ETIQUETA_CORTA[item.id] ?? item.label.split(' ')[0]}
                </span>
              </button>
            );
          })}

          {resto.length > 0 && (
            <button
              onClick={() => setMenuAbierto(true)}
              className={cx(
                'flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl transition-colors',
                TAP,
                activaEnElResto ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400',
              )}
            >
              <MoreHorizontal size={21} strokeWidth={activaEnElResto ? 2.6 : 2} />
              <span className="text-[9px] font-black uppercase tracking-wide leading-none">Más</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}

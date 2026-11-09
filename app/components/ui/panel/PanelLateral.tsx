'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Un panel que se abre desde una lista: en escritorio, un cajón a la derecha
 * (la lista sigue a la vista); en móvil, una pantalla completa y opaca con su
 * flecha para volver. Es lo que el alumno ve como «ficha»: tocar no abre un
 * diálogo flotante sino otra pantalla (regla 36, `Modal` es para preguntar).
 */
export default function PanelLateral({
  titulo, sub, onCerrar, children,
}: { titulo: string; sub?: ReactNode; onCerrar: () => void; children: ReactNode }) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  return (
    <aside
      role="dialog"
      aria-label={titulo}
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-white dark:bg-noche-2 lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[28rem] lg:border-l lg:border-linea lg:shadow-2xl lg:dark:border-noche-linea"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-linea dark:border-noche-linea bg-white dark:bg-noche-2 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:px-6">
        <div className="min-w-0">
          <h3 className="font-titulo text-2xl font-bold uppercase leading-none tracking-wide text-slate-900 dark:text-white">{titulo}</h3>
          {sub && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{sub}</p>}
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-hundido dark:hover:bg-noche-hondo">
          <X size={20} />
        </button>
      </div>
      <div className="grid gap-5 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 lg:px-6">{children}</div>
    </aside>
  );
}

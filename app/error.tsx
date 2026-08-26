'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Ultimo recurso a nivel de ruta. Lo normal es que el fallo lo recoja antes el
 * ModuleErrorBoundary de la pestania correspondiente; esto cubre lo que ocurra
 * fuera de los modulos.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Fallo no controlado:', error);
  }, [error]);

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-6 text-center">
      <div className="p-4 bg-red-500/10 text-red-400 rounded-2xl mb-6 border border-red-500/20">
        <AlertTriangle size={32} />
      </div>

      <h1 className="text-2xl font-black mb-2">Algo ha fallado</h1>
      <p className="text-sm text-slate-400 max-w-md mb-8">
        El sistema ha encontrado un error inesperado. Puedes reintentar sin perder la sesion.
      </p>

      <button
        onClick={reset}
        className="flex items-center gap-2 px-6 py-3 bg-white text-slate-900 rounded-xl font-bold text-xs uppercase tracking-widest hover:scale-105 transition-transform"
      >
        <RotateCcw size={14} /> Reintentar
      </button>

      {error.digest && (
        <p className="mt-8 text-[11px] font-mono text-slate-600">ref: {error.digest}</p>
      )}
    </main>
  );
}

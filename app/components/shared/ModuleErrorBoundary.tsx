'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Aisla el fallo de un modulo para que no se lleve por delante el resto de la
 * aplicacion.
 *
 * `app/error.tsx` solo cubre la ruta entera, y como aqui todo el dashboard vive
 * en una sola ruta con pestanias, una excepcion en cualquier modulo dejaba la
 * pantalla completa en blanco: ni menu, ni forma de volver.
 *
 * React exige una clase para esto: no hay equivalente con hooks.
 */
type Props = { children: ReactNode; moduleName: string };
type State = { error: Error | null };

export default class ModuleErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.moduleName}] fallo de render:`, error);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6 animate-in fade-in">
        <div className="p-4 bg-amber-100 dark:bg-amber-900/20 text-amber-600 rounded-2xl mb-6">
          <AlertTriangle size={32} />
        </div>

        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">
          {this.props.moduleName} no se ha podido cargar
        </h3>
        <p className="text-sm text-slate-500 max-w-md mb-8">
          El resto de la aplicacion sigue funcionando: puedes cambiar de seccion en el menu.
        </p>

        <button
          onClick={this.reset}
          className="flex items-center gap-2 px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold text-xs uppercase tracking-widest hover:scale-105 transition-transform"
        >
          <RotateCcw size={14} /> Reintentar
        </button>

        {process.env.NODE_ENV === 'development' && (
          <pre className="mt-8 max-w-full overflow-x-auto text-left text-[11px] font-mono text-red-500 bg-red-500/5 border border-red-500/20 rounded-xl p-4">
            {this.state.error.message}
          </pre>
        )}
      </div>
    );
  }
}

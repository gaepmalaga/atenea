'use client';

import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { Modal, cx, TAP } from '../ui';

/**
 * EL SELECTOR DE TEMA — una hoja modal, NUNCA un `<select>` nativo.
 *
 * El picker nativo de Android sobre 45 temas es una lista infinita sin número
 * ni bloque, con la tipografía del sistema encima. Esto es un botón que abre un
 * modal con los bloques, el número de temario de cada tema y un contador
 * opcional. Se usa en el test, en el repaso de fallos y en las fichas.
 */

export type TemaOpcion = {
  /** El valor que viaja (el título del tema, o '' para «todos»). */
  valor: string;
  /** Lo que se lee. */
  etiqueta: string;
  /** Número de temario, si aplica. */
  numero?: number | null;
  /** Contador entre paréntesis (p. ej. cuántas preguntas falladas). */
  cuenta?: number | null;
};

export type GrupoTemas = { nombre: string; temas: TemaOpcion[] };

interface SelectorTemaProps {
  value: string;
  onChange: (valor: string) => void;
  /** Temas planos, o agrupados por bloque. Uno de los dos. */
  temas?: TemaOpcion[];
  grupos?: GrupoTemas[];
  /** La etiqueta pequeña de encima del botón. */
  label?: string;
  /** Texto del botón cuando no hay nada elegido. */
  placeholder?: string;
  /** Subtítulo del modal. */
  ayuda?: string;
}

export default function SelectorTema({
  value, onChange, temas, grupos, label = 'Tema', placeholder = 'Elige un tema', ayuda,
}: SelectorTemaProps) {
  const [abierto, setAbierto] = useState(false);

  const todos: TemaOpcion[] = grupos ? grupos.flatMap((g) => g.temas) : (temas ?? []);
  const elegido = todos.find((t) => t.valor === value) ?? null;

  const elegir = (valor: string) => { onChange(valor); setAbierto(false); };

  const Fila = ({ t }: { t: TemaOpcion }) => {
    const activo = t.valor === value;
    return (
      <button
        onClick={() => elegir(t.valor)}
        className={cx(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors',
          activo ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200',
        )}
      >
        {t.numero != null ? (
          <span className={cx(
            'w-7 h-7 shrink-0 rounded-lg text-xs font-black flex items-center justify-center tabular-nums',
            activo ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
          )}>
            {t.numero}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 text-sm font-bold leading-snug">{t.etiqueta}</span>
        {t.cuenta != null && (
          <span className={cx('text-xs font-mono shrink-0', activo ? 'text-white/70' : 'text-slate-400')}>
            {t.cuenta}
          </span>
        )}
        {activo && <Check size={16} className="shrink-0" />}
      </button>
    );
  };

  return (
    <>
      {label && (
        <span className="block text-[10px] sm:text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
          {label}
        </span>
      )}
      <button
        onClick={() => setAbierto(true)}
        className={cx(
          'w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors',
          TAP,
          'border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 bg-white dark:bg-slate-950',
        )}
      >
        {elegido?.numero != null && (
          <span className="w-8 h-8 shrink-0 rounded-lg bg-indigo-600 text-white text-xs font-black flex items-center justify-center tabular-nums">
            {elegido.numero}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-slate-900 dark:text-white truncate">
            {elegido?.etiqueta ?? placeholder}
          </span>
        </span>
        <ChevronDown size={16} className="shrink-0 text-slate-400" />
      </button>

      {abierto && (
        <Modal title={label} subtitle={ayuda} width="sm" onClose={() => setAbierto(false)}>
          {grupos ? (
            <div className="space-y-5">
              {grupos.map((g) => (
                <div key={g.nombre}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
                    {g.nombre}
                  </p>
                  <div className="space-y-1">
                    {g.temas.map((t) => <Fila key={t.valor || '·'} t={t} />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {(temas ?? []).map((t) => <Fila key={t.valor || '·'} t={t} />)}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

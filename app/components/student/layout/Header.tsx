'use client';

import { useState, useEffect } from 'react';
import { cx, TEXT } from '../../ui';

interface HeaderProps {
  title: string;
  activeTab: string;
}

/** El descriptor de cada zona. Es lo que le da a la aplicación su tono. */
const SUBTITULO: Record<string, string> = {
  interview: 'Sala de interrogatorios',
  test: 'Operaciones tácticas',
  chat: 'IA central · Atenea',
  stats: 'Expediente personal',
  cards: 'Memorización activa',
  review: 'Análisis de fallos',
  training: 'Preparación física',
};

export default function Header({ title, activeTab }: HeaderProps) {
  const [hora, setHora] = useState<string>('');

  // El reloj se pinta solo en el cliente: renderizarlo en el servidor daría una
  // hora distinta a la del navegador y React avisaría de desajuste de hidratación.
  useEffect(() => {
    const actualiza = () =>
      setHora(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }));
    actualiza();
    const t = setInterval(actualiza, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="flex items-end justify-between gap-3 mb-5 sm:mb-8 select-none">
      <div className="min-w-0">
        <p className={cx(TEXT.label, 'text-slate-400 flex items-center gap-2 mb-1')}>
          <span className="font-mono tabular-nums">{hora} ZULU</span>
          <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700 shrink-0" />
          <span className="truncate">{SUBTITULO[activeTab] ?? 'Panel de control'}</span>
        </p>

        {/* Este es el título de la pantalla. Los módulos NO repiten otro debajo:
            en el examen había dos cabeceras seguidas ("OPERACIONES (TEST)" y
            "CONFIGURACIÓN DE MISIÓN", con su icono grande), y entre las dos se
            comían media pantalla de móvil antes del primer control. */}
        <h1 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tighter uppercase truncate">
          {title}
        </h1>
      </div>

      <div className="hidden sm:flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20 shrink-0">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 animate-ping opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 tracking-wider uppercase">
          Sistema online
        </span>
      </div>
    </header>
  );
}

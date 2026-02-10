'use client';

import { useState, useEffect } from 'react';

interface HeaderProps {
  title: string;
  activeTab: string;
}

export default function Header({ title, activeTab }: HeaderProps) {
  const [time, setTime] = useState<string>('');

  // Lógica del reloj militar
  useEffect(() => {
    // Primera ejecución inmediata
    const updateTime = () => {
        const now = new Date();
        setTime(now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();

    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Texto dinámico según la sección
  const getSubTitle = () => {
      switch(activeTab) {
          case 'interview': return 'SALA DE INTERROGATORIOS';
          case 'test': return 'OPERACIONES TÁCTICAS';
          case 'chat': return 'IA CENTRAL - ATENEA';
          case 'stats': return 'EXPEDIENTE PERSONAL';
          case 'cards': return 'MEMORIZACIÓN ACTIVA';
          default: return 'PANEL DE CONTROL';
      }
  };

  return (
    <header className="flex justify-between items-end mb-8 select-none">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
          <span>{time} ZULU</span>
          <span className="w-1 h-1 rounded-full bg-slate-400"></span>
          <span>{getSubTitle()}</span>
        </p>
        
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">
          {title}
        </h1>
      </div>

      <div className="hidden md:flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
        <div className="relative">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-none"></div>
            <div className="absolute top-0 left-0 h-2 w-2 rounded-full bg-emerald-500 animate-ping opacity-75"></div>
        </div>
        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 tracking-wider">
            SISTEMA ONLINE
        </span>
      </div>
    </header>
  );
}
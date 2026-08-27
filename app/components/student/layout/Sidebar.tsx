'use client';

import { Power, Shield } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onTabChange: (id: string) => void;
  onLogout: () => void;
  items: { id: string; label: string; icon: LucideIcon }[];
  hidden?: boolean;
}

export default function Sidebar({ activeTab, onTabChange, onLogout, items, hidden = false }: SidebarProps) {
  
  if (hidden) return null;

  return (
    <aside className="hidden md:flex fixed top-0 left-0 h-screen w-20 flex-col items-center py-6 z-50 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-sm transition-transform duration-500">
      
      {/* LOGO INSTITUCIONAL */}
      <div className="mb-8 w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30 ring-4 ring-indigo-50 dark:ring-slate-800">
        <Shield size={24} fill="currentColor" className="text-white"/>
      </div>

      {/* MENÚ DE NAVEGACIÓN */}
      <nav className="flex-1 flex flex-col gap-4 w-full px-2">
        {items.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`group relative flex items-center justify-center w-full aspect-square rounded-xl transition-all duration-300 
                ${isActive 
                  ? 'bg-indigo-600 text-white shadow-md scale-105' 
                  : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600'
                }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              
              {/* Tooltip Estilo "Call of Duty" */}
              <span className="absolute left-14 bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0 pointer-events-none z-50 shadow-xl ml-2 whitespace-nowrap tracking-wider uppercase border border-slate-700">
                {item.label}
                {/* Triángulo del tooltip */}
                <span className="absolute left-[-4px] top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-900 rotate-45 border-l border-b border-slate-700"></span>
              </span>
            </button>
          );
        })}
      </nav>

      {/* BOTÓN SALIDA */}
      <div className="flex flex-col gap-3 w-full px-2 mt-auto">
        <button 
          onClick={onLogout} 
          className="group w-full aspect-square flex items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors"
          title="Cerrar Sesión"
        >
          <Power size={20} className="group-hover:drop-shadow-[0_0_8px_rgba(239,68,68,0.5)] transition-all"/>
        </button>
      </div>
    </aside>
  );
}
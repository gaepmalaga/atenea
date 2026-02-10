'use client';

import { Power } from 'lucide-react';

interface MobileNavProps {
  activeTab: string;
  onTabChange: (id: string) => void;
  onLogout: () => void;
  items: { id: string; label: string; icon: any }[];
}

export default function MobileNav({ activeTab, onTabChange, onLogout, items }: MobileNavProps) {
  return (
    <div className="md:hidden fixed bottom-0 left-0 w-full bg-white/80 dark:bg-slate-900/90 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 z-50 px-6 py-2 flex justify-between items-center pb-safe shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
      {items.map((item) => {
        const isActive = activeTab === item.id;
        const Icon = item.icon;
        
        return (
          <button 
            key={item.id} 
            onClick={() => onTabChange(item.id)} 
            className={`p-2 rounded-xl transition-all duration-300 relative ${isActive ? 'text-indigo-600 -translate-y-2' : 'text-slate-400'}`}
          >
            {/* Indicador de activo (Punto brillante) */}
            {isActive && <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 bg-indigo-600 rounded-full shadow-[0_0_10px_indigo]"></div>}
            
            <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
          </button>
        );
      })}
      
      <div className="w-px h-8 bg-slate-200 dark:bg-slate-800 mx-2"></div>

      <button onClick={onLogout} className="text-slate-400 p-2 active:scale-95 transition-transform">
        <Power size={24} />
      </button>
    </div>
  );
}
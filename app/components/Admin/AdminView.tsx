'use client';

import { useState } from 'react';
import { 
  Shield, LogOut, RefreshCw, Users, Book, 
  Activity, AlertTriangle, Database 
} from 'lucide-react';

// Importamos TODOS los sub-componentes (incluyendo el nuevo AdminBank)
import AdminUsers from './components/AdminUsers';
import AdminContent from './components/AdminContent';
import AdminActivity from './components/AdminActivity'; 
import AdminModeration from './components/AdminModeration';
import AdminBank from './components/AdminBank'; // <--- EL NUEVO FICHAJE

export default function AdminView({ user, onLogout }: { user: any, onLogout: () => void }) {
  // Estado para la navegación
  // Añadimos 'bank' a los tipos permitidos
  const [activeTab, setActiveTab] = useState<'users' | 'moderation' | 'content' | 'activity' | 'bank'>('users');
  
  // Truco para forzar recarga de componentes hijos sin recargar la página entera
  const [refreshKey, setRefreshKey] = useState(0); 

  const forceRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  // Configuración del Menú
  const tabs = [
    { id: 'users', label: 'Usuarios', icon: Users, color: 'text-blue-400' },
    { id: 'content', label: 'Temario & IA', icon: Book, color: 'text-purple-400' },
    { id: 'bank', label: 'Banco Oficial', icon: Database, color: 'text-emerald-400' }, // <--- NUEVA PESTAÑA
    { id: 'moderation', label: 'Moderación', icon: AlertTriangle, color: 'text-amber-400' },
    { id: 'activity', label: 'Logs & Auditoría', icon: Activity, color: 'text-slate-400' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-sans">
      
      {/* --- HEADER SUPERIOR --- */}
      <header className="flex flex-col md:flex-row justify-between items-center mb-8 pb-6 border-b border-slate-800 gap-6">
        
        {/* Identidad del Admin */}
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="bg-indigo-600/20 p-3 rounded-2xl border border-indigo-500/30 shadow-[0_0_15px_rgba(79,70,229,0.2)]">
            <Shield className="text-indigo-400" size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight leading-none">Centro de Mando</h1>
            <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-black bg-indigo-500 text-white px-1.5 py-0.5 rounded uppercase tracking-wider">GOD MODE</span>
                <p className="text-xs font-mono text-slate-500 truncate max-w-[200px]">{user.email}</p>
            </div>
          </div>
        </div>

        {/* Controles Globales */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
             <button 
                onClick={forceRefresh} 
                className="p-2.5 bg-slate-900 border border-slate-700 hover:border-slate-500 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-all group" 
                title="Recargar datos"
             >
                <RefreshCw size={18} className="group-hover:rotate-180 transition-transform duration-500"/>
             </button>
             
             <button 
                onClick={onLogout} 
                className="flex items-center gap-2 px-5 py-2.5 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40 text-red-400 rounded-xl transition-all font-bold text-xs uppercase tracking-wide"
             >
                <LogOut size={16}/> Salir
             </button>
        </div>
      </header>

      {/* --- NAVEGACIÓN PRINCIPAL (PESTAÑAS) --- */}
      <div className="mb-8 overflow-x-auto pb-2 scrollbar-hide"> {/* Scroll horizontal en móvil */}
        <div className="flex gap-2 min-w-max">
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;
                
                return (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`
                            relative px-5 py-3 rounded-xl font-bold text-sm flex items-center gap-3 transition-all duration-300
                            ${isActive 
                                ? 'bg-slate-800 text-white shadow-lg ring-1 ring-slate-700 translate-y-[-2px]' 
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'
                            }
                        `}
                    >
                        {/* Indicador de activo */}
                        {isActive && (
                            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-[3px] bg-indigo-500 rounded-t-full"></span>
                        )}
                        
                        <Icon size={18} className={isActive ? tab.color : 'opacity-70'} />
                        {tab.label}
                    </button>
                );
            })}
        </div>
      </div>

      {/* --- ÁREA DE CONTENIDO (RENDERIZADO DINÁMICO) --- */}
      <main className="animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-[600px]">
        {/* Usamos la 'key' para forzar remontaje si pulsamos Refrescar */}
        <div key={refreshKey}>
            
            {activeTab === 'users' && <AdminUsers userId={user.id}/>} 
            
            {activeTab === 'content' && <AdminContent userId={user.id}/>}
            
            {/* AQUÍ ESTÁ LA NUEVA PESTAÑA */}
            {activeTab === 'bank' && <AdminBank userId={user.id}/>}
            
            {activeTab === 'moderation' && <AdminModeration userId={user.id}/>}
            
            {activeTab === 'activity' && <AdminActivity userId={user.id}/>} 
            
        </div>
      </main>
      
    </div>
  );
}
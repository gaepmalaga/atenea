'use client';

import { useState, useEffect } from 'react';
import { 
  Shield, LogOut, RefreshCw, Users, Book,
  Activity, AlertTriangle, Database, Power, GraduationCap
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Importamos TODOS los sub-componentes (incluyendo el nuevo AdminBank)
import AdminUsers from './components/AdminUsers';
import AdminContent from './components/AdminContent';
import AdminActivity from './components/AdminActivity'; 
import AdminModeration from './components/AdminModeration';
import AdminBank from './components/AdminBank';
import AdminModules from './components/AdminModules';
import AdminAcademy from './components/AdminAcademy';
import ModuleErrorBoundary from '../shared/ModuleErrorBoundary';
import type { AuthUser } from '@/app/lib/auth';

/** Las pestañas del panel. El `id` de `tabs` tiene que ser uno de estos. */
type AdminTab = 'users' | 'academy' | 'moderation' | 'content' | 'activity' | 'bank' | 'modules';

export default function AdminView({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  // Estado para la navegación
  // Añadimos 'bank' a los tipos permitidos
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  
  // Truco para forzar recarga de componentes hijos sin recargar la página entera
  const [refreshKey, setRefreshKey] = useState(0); 

  // Al cambiar de seccion, arriba del todo. Mismo motivo que en el alumno: el
  // panel es UNA sola ruta con pestañas, asi que sin esto entras en la seccion
  // nueva por donde te quedaste en la anterior.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [activeTab]);

  const forceRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  // Configuración del Menú
  // `satisfies` y no `as`: obliga a que cada `id` sea un AdminTab de verdad,
  // sin borrar el tipo literal de cada uno. Antes se colaba con `as any` en el
  // onClick, asi que una pestaña mal escrita compilaba y no hacia nada.
  const tabs = [
    { id: 'users', label: 'Usuarios', icon: Users, color: 'text-blue-400' },
    { id: 'academy', label: 'Academia', icon: GraduationCap, color: 'text-sky-400' },
    { id: 'content', label: 'Temario & IA', icon: Book, color: 'text-purple-400' },
    { id: 'bank', label: 'Banco Oficial', icon: Database, color: 'text-emerald-400' }, // <--- NUEVA PESTAÑA
    { id: 'moderation', label: 'Moderación', icon: AlertTriangle, color: 'text-amber-400' },
    { id: 'modules', label: 'Módulos', icon: Power, color: 'text-cyan-400' },
    { id: 'activity', label: 'Logs & Auditoría', icon: Activity, color: 'text-slate-400' },
  ] satisfies { id: AdminTab; label: string; icon: LucideIcon; color: string }[];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 px-4 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))] md:p-8 font-sans">

      {/* --- HEADER SUPERIOR --- */}
      {/* Era `flex-col md:flex-row` con `items-center`: en movil eso centraba
          la identidad y dejaba los dos botones en una fila aparte, ocupando
          dos alturas completas antes de las pestañas. Ahora es una sola fila
          desde el principio, con los controles a la derecha. */}
      <header className="flex items-center justify-between gap-3 mb-5 md:mb-8 pb-4 md:pb-6 border-b border-slate-800">

        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-indigo-600/20 p-2.5 md:p-3 rounded-2xl border border-indigo-500/30 shrink-0">
            <Shield className="text-indigo-400 w-5 h-5 md:w-7 md:h-7" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-black text-white tracking-tight leading-none truncate">
              Centro de Mando
            </h1>
            <div className="flex items-center gap-2 mt-1 min-w-0">
              <span className="text-[9px] font-black bg-indigo-500 text-white px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
                Admin
              </span>
              <p className="text-[11px] font-mono text-slate-500 truncate">{user.email}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={forceRefresh}
            className="flex items-center justify-center w-11 h-11 bg-slate-900 border border-slate-700 hover:border-slate-500 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-all group"
            title="Recargar datos"
            aria-label="Recargar datos"
          >
            <RefreshCw size={18} className="group-hover:rotate-180 transition-transform duration-500" />
          </button>

          {/* En movil solo el icono: "Salir" escrito al lado empujaba el
              correo del admin hasta dejarlo en tres letras. */}
          <button
            onClick={onLogout}
            className="flex items-center justify-center gap-2 min-h-[44px] w-11 md:w-auto md:px-5 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40 text-red-400 rounded-xl transition-all font-bold text-xs uppercase tracking-wide"
            aria-label="Cerrar sesión"
          >
            <LogOut size={16} />
            <span className="hidden md:inline">Salir</span>
          </button>
        </div>
      </header>

      {/* --- NAVEGACIÓN PRINCIPAL (PESTAÑAS) --- */}
      {/* Siete pestañas no caben en un telefono, asi que la fila se desplaza en
          horizontal. El degradado del borde derecho es la parte que faltaba:
          sin el, no habia NADA que indicara que hay mas pestañas fuera de
          pantalla, y las tres ultimas (incluida Modulos) eran invisibles para
          quien no arrastrara por probar. */}
      <div className="relative mb-5 md:mb-8">
        <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex gap-2 min-w-max pb-1">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative min-h-[44px] px-4 md:px-5 rounded-xl font-bold text-sm flex items-center gap-2.5 transition-all duration-300 ${
                    isActive
                      ? 'bg-slate-800 text-white ring-1 ring-slate-700'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  {isActive && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-[3px] bg-indigo-500 rounded-t-full" />
                  )}
                  <Icon size={18} className={isActive ? tab.color : 'opacity-70'} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="md:hidden pointer-events-none absolute right-0 top-0 bottom-1 w-10 bg-gradient-to-l from-slate-950 to-transparent" />
      </div>

      {/* --- ÁREA DE CONTENIDO (RENDERIZADO DINÁMICO) --- */}
      {/* `min-h-[600px]` fijo dejaba medio movil en negro en las secciones
          cortas (Modulos son ocho interruptores). */}
      <main className="animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-[40dvh]">
        {/* Usamos la 'key' para forzar remontaje si pulsamos Refrescar */}
        <div key={refreshKey}>
            <ModuleErrorBoundary moduleName={tabs.find(t => t.id === activeTab)?.label ?? 'La seccion'}>
                {activeTab === 'users' && <AdminUsers />}

                {activeTab === 'content' && <AdminContent />}

                {activeTab === 'bank' && <AdminBank />}

                {activeTab === 'moderation' && <AdminModeration />}

                {activeTab === 'academy' && <AdminAcademy />}
                {activeTab === 'modules' && <AdminModules />}
                {activeTab === 'activity' && <AdminActivity />}
            </ModuleErrorBoundary>
        </div>
      </main>
      
    </div>
  );
}
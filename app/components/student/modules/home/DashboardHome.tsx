'use client';

import { useState, useEffect } from 'react';
import { 
  Play, Trophy, Flame, Zap, Sparkles, 
  ArrowRight, Activity, Calendar 
} from 'lucide-react';
import { getUserStats, getStudentTopics } from '@/actions';
import { TabId } from '../../StudentDashboard';

interface DashboardHomeProps {
  user: any;
  onNavigate: (tab: TabId) => void;
}

export default function DashboardHome({ user, onNavigate }: DashboardHomeProps) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    // 1. Lógica de Saludo Temporal
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Buenos días');
    else if (hour < 20) setGreeting('Buenas tardes');
    else setGreeting('Buenas noches');

    // 2. Carga de Datos en Paralelo
    const loadData = async () => {
      try {
        const statsRes = await getUserStats(user.id);
        setStats(statsRes.success ? statsRes.stats : null);
      } catch (e) {
        console.error("Error cargando dashboard:", e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user.id]);

  // Manejador para "Inicio Rápido" de Test
  const handleQuickStart = async () => {
    // Aquí podríamos pre-cargar temas, pero por ahora solo redirigimos
    onNavigate('test');
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
        <div className="col-span-full h-64 bg-slate-200 dark:bg-slate-800 rounded-3xl"></div>
        <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
        <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
        <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      
      {/* 1. TARJETA HERO (INFORME DIARIO) */}
      <div className="w-full rounded-3xl bg-indigo-600 p-8 md:p-12 shadow-2xl shadow-indigo-600/20 text-white relative overflow-hidden group transition-all hover:shadow-indigo-600/30 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* Efectos de fondo */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-white/20 transition-all duration-1000"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4"></div>

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4 opacity-80">
            <Sparkles size={16} className="text-yellow-300"/> 
            <span className="text-[10px] font-bold uppercase tracking-widest border border-white/20 px-2 py-0.5 rounded-full">Informe Diario</span>
          </div>
          
          <h2 className="text-3xl md:text-5xl font-black mb-4 leading-tight tracking-tight">
            {greeting}, Agente.
          </h2>
          
          <p className="text-indigo-100 text-sm md:text-lg font-medium max-w-xl mb-8 leading-relaxed">
            El sistema detecta una oportunidad de mejora en <strong className="text-white border-b-2 border-indigo-400 pb-0.5">Derecho Penal</strong>. 
            Su rendimiento táctico ha aumentado un 12% esta semana.
          </p>
          
          <button 
            onClick={handleQuickStart} 
            className="bg-white text-indigo-600 px-8 py-4 rounded-xl font-bold hover:shadow-[0_0_20px_rgba(255,255,255,0.4)] hover:scale-105 transition-all flex items-center gap-3 text-sm group/btn"
          >
            <Play size={18} fill="currentColor" className="group-hover/btn:translate-x-1 transition-transform"/> 
            INICIAR SESIÓN QUIRÚRGICA
          </button>
        </div>
      </div>

      {/* 2. GRID DE ESTADÍSTICAS (KPIs) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 animate-in fade-in slide-in-from-bottom-8 duration-1000 fill-mode-backwards delay-100">
        
        {/* KPI: NIVEL / EFECTIVIDAD */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm hover:border-indigo-500/50 transition-colors group">
          <div className="flex justify-between items-center mb-4">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-2xl group-hover:scale-110 transition-transform">
              <Trophy size={24}/>
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Precisión Global</span>
          </div>
          <p className="text-4xl font-black text-slate-900 dark:text-white mb-1 tracking-tighter">
            {stats ? stats.winRate : 0}<span className="text-2xl text-slate-300">%</span>
          </p>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
             <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${stats?.winRate || 0}%` }}></div>
          </div>
        </div>

        {/* KPI: RACHA */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm hover:border-orange-500/50 transition-colors group">
          <div className="flex justify-between items-center mb-4">
            <div className="p-3 bg-orange-50 dark:bg-orange-900/20 text-orange-500 rounded-2xl group-hover:scale-110 transition-transform">
              <Flame size={24}/>
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Constancia</span>
          </div>
          <p className="text-4xl font-black text-slate-900 dark:text-white mb-1 tracking-tighter">
            1 <span className="text-lg font-bold text-slate-400">Día</span>
          </p>
          <p className="text-xs text-orange-500 font-bold mt-2">¡Mantén el fuego!</p>
        </div>

        {/* ACCIÓN RÁPIDA: REPASO */}
        <button 
            onClick={() => onNavigate('cards')} 
            className="p-6 bg-slate-50 dark:bg-slate-800 border border-transparent hover:border-purple-500 dark:hover:border-purple-500/50 rounded-3xl text-left flex flex-col justify-between group transition-all"
        >
          <div className="flex justify-between items-start w-full">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 text-purple-600 rounded-2xl group-hover:scale-110 transition-transform">
              <Zap size={24}/>
            </div>
            <div className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center group-hover:bg-purple-600 group-hover:border-purple-600 group-hover:text-white transition-colors">
                <ArrowRight size={16}/>
            </div>
          </div>
          <div>
            <p className="text-lg font-black text-slate-900 dark:text-white mb-1">Repaso Rápido</p>
            <p className="text-xs text-slate-500 font-medium">5 Flashcards pendientes</p>
          </div>
        </button>

      </div>

      {/* 3. ACTIVIDAD RECIENTE (Compacta) */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-3xl p-6 bg-white dark:bg-slate-900 animate-in fade-in slide-in-from-bottom-12 duration-1000 fill-mode-backwards delay-200">
        <div className="flex items-center gap-2 mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
            <Activity size={18} className="text-slate-400"/>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Actividad Reciente</h3>
        </div>
        
        <div className="space-y-3">
            {stats && stats.lastItems && stats.lastItems.length > 0 ? (
                stats.lastItems.map((item: any, i: number) => (
                    <div key={i} className="flex justify-between items-center py-2 group cursor-default">
                        <div className="flex items-center gap-4 overflow-hidden">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${item.is_correct ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}></div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate group-hover:text-indigo-500 transition-colors">
                                {item.question_text.replace('[FLASHCARD] ', '')}
                            </p>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 opacity-50">
                            {new Date(item.created_at).toLocaleDateString()}
                        </span>
                    </div>
                ))
            ) : (
                <div className="text-center py-8 text-slate-400 text-sm">
                    No hay registros de actividad.
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
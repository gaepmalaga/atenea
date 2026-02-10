'use client';

import { useState, useEffect } from 'react';
import { 
  BarChart2, TrendingUp, Shield, Crown, Medal, 
  Target, Calendar, Activity, RefreshCw, ChevronDown, 
  Dumbbell, Timer, HeartPulse 
} from 'lucide-react';
import { getUserStats, getPhysicalProfile } from '../../../../actions';

interface StatsPanelProps {
  user: any;
}

// Configuración de Rangos Académicos
const RANKS = [
  { id: 'cadet', label: 'Cadete', min: 0, icon: Shield, color: 'text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800' },
  { id: 'officer', label: 'Oficial', min: 40, icon: Medal, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
  { id: 'subinspector', label: 'Subinspector', min: 70, icon: Medal, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
  { id: 'inspector', label: 'Inspector Jefe', min: 90, icon: Crown, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
];

export default function StatsPanel({ user }: StatsPanelProps) {
  const [stats, setStats] = useState<any>(null);
  const [physProfile, setPhysProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      // Carga paralela de datos Académicos y Físicos
      const [statsRes, physRes] = await Promise.all([
        getUserStats(user.id),
        getPhysicalProfile(user.id)
      ]);

      if (statsRes.success) setStats(statsRes.stats);
      if (physRes.success) setPhysProfile(physRes.data);

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user.id]);

  // Calcular Rango Académico Actual
  const currentRank = stats 
    ? [...RANKS].reverse().find(r => stats.winRate >= r.min) || RANKS[0]
    : RANKS[0];
  
  const RankIcon = currentRank.icon;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 animate-pulse">
        <div className="w-24 h-24 bg-slate-200 dark:bg-slate-800 rounded-full mb-6"></div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Calculando métricas globales...</p>
      </div>
    );
  }

  if (!stats || stats.total === 0) {
      return (
        <div className="text-center py-20 animate-in fade-in slide-in-from-bottom-4">
            <div className="w-24 h-24 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-400">
                <BarChart2 size={40}/>
            </div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Sin Datos Operativos</h3>
            <p className="text-slate-500 max-w-sm mx-auto">El sistema necesita que realices al menos un test o entrenamiento para generar tu expediente.</p>
        </div>
      );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* 1. TARJETA DE RANGO ACADÉMICO (Principal - 2/3 ancho) */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl p-8 md:p-10 border border-slate-200 dark:border-slate-800 shadow-xl relative overflow-hidden flex flex-col justify-center">
             <div className={`absolute top-0 right-0 w-80 h-80 rounded-full blur-3xl opacity-10 -translate-y-1/2 translate-x-1/2 ${currentRank.id === 'inspector' ? 'bg-amber-500' : 'bg-indigo-500'}`}></div>

             <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                <div className={`w-32 h-32 rounded-full flex items-center justify-center shadow-2xl flex-shrink-0 ${currentRank.bg}`}>
                    <RankIcon size={56} className={`${currentRank.color} drop-shadow-md`}/>
                </div>

                <div className="text-center md:text-left flex-1">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border mb-3 inline-block ${currentRank.color.replace('text', 'border')} ${currentRank.bg}`}>
                        Nivel Teórico
                    </span>
                    <h2 className="text-4xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">
                        {currentRank.label}
                    </h2>
                    <p className="text-slate-500 font-medium text-sm max-w-sm">
                        Tu precisión operativa es del <strong className={currentRank.color}>{stats.winRate}%</strong>.
                        {currentRank.id !== 'inspector' && " Mantén la constancia para el ascenso."}
                    </p>
                </div>

                {/* KPI Circular */}
                <div className="relative w-24 h-24">
                    <svg className="w-full h-full transform -rotate-90">
                        <circle cx="48" cy="48" r="44" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-slate-100 dark:text-slate-800"/>
                        <circle cx="48" cy="48" r="44" stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray={276} strokeDashoffset={276 - (276 * stats.winRate) / 100} strokeLinecap="round" className={currentRank.color}/>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center font-black text-lg text-slate-900 dark:text-white">
                        {stats.winRate}%
                    </div>
                </div>
             </div>
          </div>

          {/* 2. TARJETA DE ESTADO FÍSICO (Lateral - 1/3 ancho) */}
          <div className="bg-slate-50 dark:bg-slate-950 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <div>
                  <div className="flex items-center gap-2 mb-4">
                      <HeartPulse size={20} className="text-emerald-500"/>
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Condición Física</h3>
                  </div>
                  
                  {physProfile ? (
                      <div className="space-y-4">
                          <div className="flex justify-between items-center p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                              <div className="flex items-center gap-3">
                                  <Dumbbell size={16} className="text-indigo-500"/>
                                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">Fuerza</span>
                              </div>
                              <span className="text-lg font-black text-slate-900 dark:text-white">{physProfile.baseline_test?.pullups || 0}</span>
                          </div>
                          
                          <div className="flex justify-between items-center p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                              <div className="flex items-center gap-3">
                                  <Timer size={16} className="text-red-500"/>
                                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">Resistencia</span>
                              </div>
                              <span className="text-lg font-black text-slate-900 dark:text-white">{physProfile.baseline_test?.run_1km || '-'}</span>
                          </div>

                          <div className="flex justify-between items-center p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                              <div className="flex items-center gap-3">
                                  <Activity size={16} className="text-orange-500"/>
                                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">Agilidad</span>
                              </div>
                              <span className="text-lg font-black text-slate-900 dark:text-white">{physProfile.baseline_test?.circuit || '-'}s</span>
                          </div>
                      </div>
                  ) : (
                      <div className="text-center py-6">
                          <p className="text-xs text-slate-400 mb-2">Sin perfil físico.</p>
                          <span className="text-[10px] font-bold text-emerald-500 uppercase">Ir a Prep. Física</span>
                      </div>
                  )}
              </div>
          </div>
      </div>

      {/* 3. GRID DE KPIs GLOBALES */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Ops. Totales</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{stats.total}</p>
          </div>
          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Aciertos</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{Math.round((stats.winRate * stats.total) / 100)}</p>
          </div>
          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Peso</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{physProfile?.weight || '-'} <span className="text-xs font-medium text-slate-400">kg</span></p>
          </div>
          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Altura</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{physProfile?.height || '-'} <span className="text-xs font-medium text-slate-400">cm</span></p>
          </div>
      </div>

      {/* 4. HISTORIAL DETALLADO */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center gap-2">
                  <Activity size={18} className="text-slate-400"/>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Actividad Reciente</h3>
              </div>
              <button onClick={loadData} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-400"><RefreshCw size={14}/></button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {stats.lastItems && stats.lastItems.length > 0 ? (
                  stats.lastItems.map((item: any, i: number) => (
                      <div key={i} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <div className="flex items-center gap-4 overflow-hidden">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${item.is_correct ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600' : 'bg-red-100 dark:bg-red-900/20 text-red-600'}`}>
                                  {item.is_correct ? <Target size={20}/> : <Activity size={20}/>}
                              </div>
                              <div className="min-w-0">
                                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate pr-4">{item.question_text.replace('[FLASHCARD] ', '')}</p>
                                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">{item.topic || 'General'} • {new Date(item.created_at).toLocaleDateString()}</p>
                              </div>
                          </div>
                          <div className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${item.is_correct ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{item.is_correct ? 'ÉXITO' : 'FALLO'}</div>
                      </div>
                  ))
              ) : (
                  <div className="p-8 text-center text-slate-400 text-sm">Sin registros recientes.</div>
              )}
          </div>
      </div>
    </div>
  );
}
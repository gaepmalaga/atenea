'use client';

import { useState, useEffect } from 'react';
import {
  Shield, Crown, Medal, Target, Activity, RefreshCw, HeartPulse, Brain, AlertTriangle, Zap, MousePointer2, Gauge
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getUserStats, getPhysicalProfile } from '@/actions';
import {
  rankFor,
  nextRankAfter,
  progressToNextRank,
  readMaxPullups,
  ERROR_TYPES,
  type StatsSummary,
  type TestResultRow,
  type PhysicalProfile,
  HESITATION_THRESHOLD,
  type Rank,
} from '@/app/lib/stats';

/** Fila del historial: lo que devuelve getUserStats tras aplanar el join. */
type RecentItem = TestResultRow & { created_at?: string | null };

type UserStats = StatsSummary & { lastItems: RecentItem[] };

interface StatsPanelProps {
  user: { id: string };
}

// Solo presentacion: los umbrales y el calculo de progreso viven en
// app/lib/stats.ts, donde se pueden testear.
const RANK_STYLE: Record<Rank['id'], { icon: LucideIcon; color: string; bg: string }> = {
  cadet:        { icon: Shield, color: 'text-slate-400',  bg: 'bg-slate-100 dark:bg-slate-800' },
  officer:      { icon: Medal,  color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
  subinspector: { icon: Medal,  color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
  inspector:    { icon: Crown,  color: 'text-amber-500',  bg: 'bg-amber-50 dark:bg-amber-900/20' },
};

const ERROR_LABEL: Record<string, string> = {
  olvido: 'Olvido',
  trampa: 'Trampas',
  desconocimiento: 'Lagunas',
  fallo_procesamiento: 'Lectura',
};

export default function StatsPanel({ user }: StatsPanelProps) {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [physProfile, setPhysProfile] = useState<PhysicalProfile>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, physRes] = await Promise.all([
        getUserStats(),
        getPhysicalProfile()
      ]);
      if (statsRes.success) setStats(statsRes.stats);
      if (physRes.success) setPhysProfile(physRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [user.id]);

  if (loading || !stats) return <div className="p-20 text-center animate-pulse text-slate-500">Sincronizando expediente...</div>;

  // Las metricas llegan ya agregadas del servidor, sobre la muestra completa.
  // Antes se calculaban aqui sobre las 5 ultimas preguntas y se dividian entre
  // el total de hasta 100: numerador y denominador de muestras distintas.
  const { winRate, total, avgTimeMs, timedCount, uncertaintyIndex, changesCount, errorBreakdown, taggedErrors } = stats;

  const currentRank = rankFor(winRate);
  const nextRank = nextRankAfter(currentRank);
  const rankStyle = RANK_STYLE[currentRank.id];
  const RankIcon = rankStyle.icon;
  const ascentProgress = progressToNextRank(winRate);

  const speedLabel = timedCount === 0
    ? 'Sin datos'
    : avgTimeMs < 10000 ? 'Francotirador' : avgTimeMs < 30000 ? 'Táctico' : 'Analista Lento';

  const maxPullups = readMaxPullups(physProfile);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in duration-700">
      
      {/* HEADER: RANGO Y STATUS QUO */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200 dark:border-slate-800 shadow-2xl relative overflow-hidden group">
            <div className={`absolute -right-20 -top-20 w-64 h-64 blur-[100px] opacity-20 rounded-full ${currentRank.id === 'inspector' ? 'bg-amber-500' : 'bg-indigo-600'}`}></div>
            
            <div className="flex flex-col md:flex-row items-center gap-10 relative z-10">
                <div className={`w-40 h-40 rounded-3xl flex items-center justify-center shadow-2xl rotate-3 group-hover:rotate-0 transition-transform duration-500 ${rankStyle.bg}`}>
                    <RankIcon size={80} className={`${rankStyle.color} drop-shadow-2xl`}/>
                </div>
                <div className="flex-1 text-center md:text-left">
                    <h2 className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter mb-2 italic">
                        {currentRank.label.toUpperCase()}
                    </h2>
                    <p className="text-slate-500 font-bold flex items-center justify-center md:justify-start gap-2 uppercase text-xs tracking-[0.2em]">
                        <Zap size={14} className="text-yellow-500"/> Efectividad: {winRate}% en {total} {total === 1 ? 'operación' : 'operaciones'}
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                        <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-[10px] font-black text-slate-500 border border-slate-200 dark:border-slate-700">
                            ID: {user.id.substring(0,8).toUpperCase()}
                        </div>
                        <div className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-[10px] font-black shadow-lg shadow-indigo-500/20">
                            {nextRank
                              ? `PROGRESO A ${nextRank.label.toUpperCase()}: ${ascentProgress}%`
                              : 'RANGO MÁXIMO ALCANZADO'}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* MÉTRICA DE VELOCIDAD (EL "TIEMPO ES VIDA") */}
        <div className="bg-slate-900 text-white rounded-[2.5rem] p-8 flex flex-col justify-center items-center text-center border-b-8 border-indigo-600 shadow-xl">
            <Gauge size={40} className="text-indigo-400 mb-4 animate-pulse" />
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Perfil de Respuesta</p>
            <h4 className="text-2xl font-black mb-2">{speedLabel}</h4>
            <div className="text-4xl font-black text-indigo-400">
                {timedCount === 0
                  ? <span className="text-lg text-slate-500">Sin medir</span>
                  : <>{(avgTimeMs / 1000).toFixed(1)}<span className="text-lg text-white">s</span></>}
            </div>
        </div>
      </div>

      {/* SECCIÓN 2: EL "CEREBRO" (ATENEA MIND ANALYTICS) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* INDICE DE INCERTIDUMBRE (DUDAS) */}
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-lg">
              <div className="flex justify-between items-start mb-6">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <MousePointer2 size={16} className="text-purple-500"/> Índice de Incertidumbre
                  </h3>
              </div>
              <div className="relative h-4 bg-slate-100 dark:bg-slate-800 rounded-full mb-4">
                  <div 
                    className="absolute h-full bg-gradient-to-r from-emerald-500 via-yellow-500 to-red-500 rounded-full transition-all duration-1000"
                    style={{ width: `${uncertaintyIndex}%` }}
                  ></div>
              </div>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                  {changesCount === 0
                    ? "Aún no hay datos de marcación. Se registran durante los tests."
                    : uncertaintyIndex < 20
                      ? `Decisión firme sobre ${changesCount} respuestas. Alta confianza al marcar.`
                      : `Inseguridad detectada en ${changesCount} respuestas. Tiendes a cambiar de opción antes de confirmar.`}
              </p>
          </div>

          {/* DIAGNÓSTICO DE ERRORES (TAXONOMÍA) */}
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-lg">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-6">
                  <Brain size={16} className="text-red-500"/> Origen de tus Fallos
              </h3>
              <div className="space-y-3">
                  {ERROR_TYPES.map(type => {
                      const count = errorBreakdown[type] ?? 0;
                      // Denominador: fallos ETIQUETADOS, que es lo que suma el
                      // desglose. Antes se dividia entre todos los fallos de las
                      // 5 ultimas y las barras no sumaban el 100%.
                      const percentage = taggedErrors === 0 ? 0 : (count / taggedErrors) * 100;
                      return (
                        <div key={type}>
                            <div className="flex justify-between text-[10px] font-black uppercase mb-1 text-slate-500">
                                <span>{ERROR_LABEL[type]}</span>
                                <span>{count}</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full">
                                <div className="h-full bg-slate-900 dark:bg-white rounded-full transition-all duration-700" style={{ width: `${percentage}%` }}></div>
                            </div>
                        </div>
                      );
                  })}
                  {taggedErrors === 0 && (
                    <p className="text-[11px] text-slate-400 pt-2">
                        Aún no has etiquetado ningún fallo. Se pide al fallar en modo entrenamiento.
                    </p>
                  )}
              </div>
          </div>

          {/* KPI FÍSICO RÁPIDO */}
          <div className="bg-indigo-600 text-white p-8 rounded-[2rem] shadow-xl flex flex-col justify-between">
              <div className="flex justify-between items-center">
                  <HeartPulse size={24}/>
                  <span className="text-[10px] font-black bg-white/20 px-2 py-1 rounded">ESTADO FÍSICO</span>
              </div>
              <div>
                  {maxPullups === null ? (
                    <>
                      <p className="text-2xl font-black mb-1 opacity-70">Sin datos</p>
                      <p className="text-xs font-bold opacity-80 uppercase">Haz el test en Prep. Física</p>
                    </>
                  ) : (
                    <>
                      <p className="text-4xl font-black mb-1">{maxPullups}</p>
                      <p className="text-xs font-bold opacity-80 uppercase">Dominadas Máximas</p>
                    </>
                  )}
              </div>
          </div>
      </div>

      {/* SECCIÓN 3: LOGS DE OPERACIONES (ESTILO TERMINAL) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
          <div className="p-6 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Activity size={16}/> Historial de Operaciones Recientes
              </h3>
              <button onClick={loadData} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-all">
                  <RefreshCw size={14} className="text-slate-400" />
              </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {stats.lastItems?.map((item: RecentItem, i: number) => (
                  <div key={i} className="p-5 flex items-center justify-between group hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 transition-transform group-hover:scale-110 ${
                              item.is_correct ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-red-50 border-red-100 text-red-600'
                          }`}>
                              {item.is_correct ? <Target size={20}/> : <AlertTriangle size={20}/>}
                          </div>
                          <div>
                              <p className="text-sm font-black text-slate-800 dark:text-slate-200 line-clamp-1">
                                  {(item.question_text ?? 'Pregunta no disponible').replace('[FLASHCARD] ', '')}
                              </p>
                              <div className="flex gap-3 mt-1">
                                  {item.topic && (
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{item.topic}</span>
                                  )}
                                  {(item.response_time_ms ?? 0) > 0 && (
                                      <span className="text-[10px] font-mono text-indigo-500 font-bold">{((item.response_time_ms ?? 0) / 1000).toFixed(1)}s</span>
                                  )}
                                  {(item.option_changes ?? 0) >= HESITATION_THRESHOLD && (
                                      <span className="text-[10px] font-bold text-amber-500 flex items-center gap-1">
                                          <MousePointer2 size={10}/> DUDÓ
                                      </span>
                                  )}
                              </div>
                          </div>
                      </div>
                      <div className="text-right">
                          <p className="text-[10px] font-black text-slate-400 uppercase">
                              {item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}
                          </p>
                          <p className={`text-xs font-black ${item.is_correct ? 'text-emerald-500' : 'text-red-500'}`}>
                              {item.is_correct ? '+10 XP' : 'FALLO'}
                          </p>
                      </div>
                  </div>
              ))}
          </div>
      </div>
    </div>
  );
}
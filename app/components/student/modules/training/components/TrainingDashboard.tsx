'use client';

import { Calendar, Activity, Dumbbell, Timer, Play, Settings, AlertTriangle, Lock, CheckCircle2, Loader2 } from 'lucide-react';
import { planProgress, type TrainingDay, type WeeklyPlan } from '@/app/lib/training-plan';

interface TrainingDashboardProps {
    plan: WeeklyPlan | null;
    onStartSession: (day: TrainingDay) => void;
    onReportIssue: (day: TrainingDay) => void;
    onReconfigure: () => void;
    onGenerateNextWeek: () => void;
    generating?: boolean;
    error?: string | null;
}

export default function TrainingDashboard({ plan, onStartSession, onReportIssue, onReconfigure, onGenerateNextWeek, generating, error }: TrainingDashboardProps) {
    if (!plan) return <div className="text-center p-10 opacity-50">Cargando plan...</div>;

    // 1. CÁLCULO DE PROGRESO EN TIEMPO REAL
    // La aritmética que ve el alumno vive en `app/lib/` (regla 8).
    const { total: totalDays, completed: completedDays, percentage: progressPercentage, isWeekComplete } =
        planProgress(plan);

    return (
        <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 pb-20">
            
            {/* HEADER */}
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Preparación Táctica</h2>
                    <p className="text-slate-500 mt-1">Tu hoja de ruta para el APTO.</p>
                </div>
                <button onClick={onReconfigure} className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-400 hover:text-emerald-500 transition-colors">
                    <Settings size={20}/>
                </button>
            </div>

            {/* GRID DE TARJETAS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                 {/* TARJETA OBJETIVO */}
                 <div className="col-span-full bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-6 rounded-3xl flex items-center gap-6 shadow-2xl shadow-indigo-600/20">
                     <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0 backdrop-blur-sm"><Calendar size={32}/></div>
                     <div>
                         <p className="text-xs font-bold opacity-70 uppercase tracking-widest mb-1">Objetivo del Microciclo</p>
                         <h3 className="text-2xl font-bold leading-tight">{plan.week_focus || "Adaptación y Base"}</h3>
                     </div>
                 </div>

                 {/* DÍAS DE LA SEMANA */}
                 {plan.days.map((day, idx) => (
                     <div key={idx} className={`relative group overflow-hidden flex flex-col border rounded-3xl p-6 transition-all ${day.isCompleted ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-500/30' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-500 hover:shadow-xl'}`}>
                         
                         {/* Marca de Completado */}
                         {day.isCompleted && (
                             <div className="absolute top-4 right-4 text-emerald-500 bg-white dark:bg-slate-950 rounded-full p-1 shadow-sm z-20">
                                 <CheckCircle2 size={20} fill="currentColor" className="text-emerald-500 bg-white dark:bg-slate-950"/>
                             </div>
                         )}

                         <div className="absolute -top-4 -right-4 opacity-5 group-hover:opacity-10 transition-all pointer-events-none">
                             {day.type === 'Fuerza' ? <Dumbbell size={140}/> : <Timer size={140}/>}
                         </div>
                         
                         <div className="relative z-10 flex flex-col h-full">
                            <div className="flex justify-between items-start mb-4">
                                <span className={`text-xs font-black uppercase tracking-widest ${day.isCompleted ? 'text-emerald-600' : 'text-slate-400'}`}>{day.day}</span>
                                <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded ${day.type === 'Fuerza' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20' : 'bg-orange-50 text-orange-600 dark:bg-orange-900/20'}`}>{day.type}</span>
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 leading-tight">{day.title}</h3>
                            <p className="text-xs text-slate-400 mb-6 line-clamp-2">{day.exercises.length} ejercicios</p>
                            
                            <div className="mt-auto flex gap-3">
                                {!day.isCompleted ? (
                                    <>
                                        <button onClick={(e) => { e.stopPropagation(); onReportIssue(day); }} className="p-3 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-900/10 dark:hover:bg-red-900/30 border border-red-100 dark:border-red-900/30 transition-colors"><AlertTriangle size={20}/></button>
                                        <button onClick={() => onStartSession(day)} className="flex-1 py-3 bg-slate-50 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-600 rounded-xl text-xs font-black uppercase transition-colors flex items-center justify-center gap-2 group-hover:bg-emerald-600 group-hover:text-white"><Play size={14} fill="currentColor"/> INICIAR</button>
                                    </>
                                ) : (
                                    <div className="w-full py-3 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 border border-emerald-200 dark:border-emerald-500/20">
                                        <CheckCircle2 size={16}/> COMPLETADO
                                    </div>
                                )}
                            </div>
                         </div>
                     </div>
                 ))}
            </div>

            {/* 2. FOOTER DE PROGRESO (LA META) */}
            <div className="sticky bottom-6 z-30">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl shadow-2xl flex flex-col md:flex-row items-center gap-6 md:gap-8 backdrop-blur-xl bg-opacity-90 dark:bg-opacity-90">
                    
                    {/* Barra de Progreso Circular o Lineal */}
                    <div className="flex-1 w-full">
                        <div className="flex justify-between items-end mb-2">
                            <div>
                                <h4 className="font-black text-slate-900 dark:text-white uppercase text-sm">Progreso del Microciclo</h4>
                                <p className="text-xs text-slate-500">
                                    {isWeekComplete 
                                        ? "¡Misión Cumplida! Análisis de datos listo." 
                                        : "Completa todas las sesiones para desbloquear la siguiente fase."}
                                </p>
                            </div>
                            <span className="font-mono font-bold text-slate-900 dark:text-white text-xl">{completedDays}/{totalDays}</span>
                        </div>
                        <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div 
                                className={`h-full transition-all duration-1000 ease-out ${isWeekComplete ? 'bg-emerald-500' : 'bg-indigo-600'}`} 
                                style={{ width: `${progressPercentage}%` }}
                            />
                        </div>
                    </div>

                    {/* Botón de Acción Final */}
                    <button 
                        onClick={onGenerateNextWeek}
                        disabled={!isWeekComplete || generating}
                        className={`
                            px-8 py-4 rounded-xl font-black uppercase tracking-widest flex items-center gap-3 transition-all
                            ${isWeekComplete 
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 scale-105 animate-pulse' 
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-70'}
                        `}
                    >
                        {generating ? <Loader2 size={20} className="animate-spin"/> : isWeekComplete ? <Activity size={20}/> : <Lock size={20}/>}
                        {/* El número de semana lo decide el servidor contando los planes
                            del alumno: aquí estaba fijo en "SEMANA 2" para siempre. */}
                        {generating ? "GENERANDO…" : isWeekComplete ? "GENERAR SIGUIENTE SEMANA" : "FASE BLOQUEADA"}
                    </button>
                </div>

                {error && (
                    <p className="mt-3 text-sm font-bold text-red-500 bg-red-50 dark:bg-red-900/20 rounded-2xl p-4 text-center">
                        {error}
                    </p>
                )}
            </div>

        </div>
    );
}
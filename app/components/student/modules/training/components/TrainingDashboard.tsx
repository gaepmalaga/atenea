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

    // El hueco para MobileNav ya lo reserva `<main>` en StudentDashboard.
    //
    // SIN CABECERA PROPIA: `Header` ya pone "PREP. FÍSICA · PREPARACIÓN
    // FÍSICA" encima, y aquí iba "PREPARACIÓN TÁCTICA" en `text-3xl`. Dos
    // cabeceras seguidas, como en Drills y en el hub de pruebas.
    return (
        <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 pb-4">

            {/* OBJETIVO DE LA SEMANA + reconfigurar */}
            <div className="flex items-stretch gap-2 mb-5">
                <div className="flex-1 min-w-0 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl flex items-center gap-4 shadow-xl shadow-indigo-600/20">
                    <div className="w-11 h-11 sm:w-16 sm:h-16 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0 backdrop-blur-sm">
                        <Calendar className="w-6 h-6 sm:w-8 sm:h-8"/>
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest mb-0.5">Objetivo de la semana</p>
                        <h3 className="text-base sm:text-2xl font-bold leading-tight">{plan.week_focus || "Adaptación y base"}</h3>
                    </div>
                </div>
                <button
                    onClick={onReconfigure}
                    aria-label="Volver a las pruebas físicas"
                    title="Volver a las pruebas físicas"
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400 hover:text-emerald-500 transition-colors shrink-0"
                >
                    <Settings size={20}/>
                </button>
            </div>

            {/* LOS DÍAS.

                Cada tarjeta media ~220px para decir "3 ejercicios" y nada mas,
                con un icono decorativo de 140px de fondo: cinco dias eran
                1.100px de scroll sin ver NI UN ejercicio. Ahora se leen desde
                aqui, que es lo que hace falta para saber si hoy toca algo que
                se pueda hacer. */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
                 {plan.days.map((day, idx) => {
                     const ejercicios = day.exercises ?? [];
                     const esDescanso = ejercicios.length === 0;

                     return (
                     <div key={idx} className={`relative group overflow-hidden flex flex-col border rounded-2xl sm:rounded-3xl p-4 sm:p-5 transition-all ${day.isCompleted ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-500/30' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}>

                         <div className="flex justify-between items-start gap-2 mb-2">
                             <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight min-w-0">{day.title}</h3>
                             {/* `day.type` puede no venir: el plan lo escribe el
                                 modelo y `normalizePlan` no lo inventa (regla 5).
                                 Sin esta guarda se pintaba una pastilla vacia. */}
                             {day.type && (
                                 <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded shrink-0 ${day.type === 'Fuerza' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20' : 'bg-orange-50 text-orange-600 dark:bg-orange-900/20'}`}>{day.type}</span>
                             )}
                             {day.isCompleted && <CheckCircle2 size={20} className="text-emerald-500 shrink-0"/>}
                         </div>

                         {esDescanso ? (
                             <p className="text-xs text-slate-400 mb-4">Descanso. No hay nada que hacer hoy.</p>
                         ) : (
                             <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1 mb-4 leading-snug">
                                 {ejercicios.slice(0, 4).map((e, i) => (
                                     <li key={i}>
                                         · {e.name}
                                         {(e.sets || e.reps) && (
                                             <span className="text-slate-400"> · {[e.sets, e.reps].filter(Boolean).join(' × ')}</span>
                                         )}
                                     </li>
                                 ))}
                                 {ejercicios.length > 4 && <li className="text-slate-400">…y {ejercicios.length - 4} más</li>}
                             </ul>
                         )}

                         <div className="mt-auto flex gap-2">
                            {day.isCompleted ? (
                                <div className="w-full min-h-[44px] bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 border border-emerald-200 dark:border-emerald-500/20">
                                    <CheckCircle2 size={16}/> Completado
                                </div>
                            ) : esDescanso ? (
                                // Un dia de descanso no se "inicia": ofrecerlo era
                                // un boton que empieza una sesion de cero ejercicios.
                                <div className="w-full min-h-[44px] bg-slate-50 dark:bg-slate-800/50 text-slate-400 rounded-xl text-xs font-black uppercase flex items-center justify-center border border-slate-100 dark:border-slate-800">
                                    Descanso
                                </div>
                            ) : (
                                <>
                                    <button onClick={() => onStartSession(day)} className="flex-1 min-h-[44px] bg-slate-50 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-600 dark:text-slate-300 rounded-xl text-xs font-black uppercase transition-colors flex items-center justify-center gap-2">
                                        <Play size={14} fill="currentColor"/> Iniciar
                                    </button>
                                    {/* Avisar de una molestia va DETRAS de empezar,
                                        y en gris: en rojo y a la izquierda pesaba
                                        lo mismo que la accion principal. */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onReportIssue(day); }}
                                        aria-label={`Avisar de una molestia en ${day.title}`}
                                        title="Avisar de una molestia"
                                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 border border-slate-200 dark:border-slate-800 transition-colors shrink-0"
                                    >
                                        <AlertTriangle size={18}/>
                                    </button>
                                </>
                            )}
                         </div>
                     </div>
                     );
                 })}
            </div>

            {/* EL PROGRESO.

                Era `sticky bottom-6` SIEMPRE, y en un movil `bottom-6` cae
                DENTRO de la barra de pestañas: la tarjeta del progreso se
                pintaba medio tapada por la navegacion, y encima ocupaba fija
                un tercio de la pantalla. En movil va donde le toca, al final;
                desde `md`, donde hay sitio de sobra, se queda pegada. */}
            <div className="md:sticky md:bottom-6 md:z-30">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col md:flex-row items-stretch md:items-center gap-4 md:gap-8">

                    <div className="flex-1 w-full">
                        <div className="flex justify-between items-end gap-3 mb-2">
                            <div className="min-w-0">
                                <h4 className="font-black text-slate-900 dark:text-white uppercase text-sm">Progreso de la semana</h4>
                                <p className="text-xs text-slate-500 leading-snug">
                                    {isWeekComplete
                                        ? "Semana completa. Ya se puede generar la siguiente."
                                        : "Completa todas las sesiones para desbloquear la siguiente."}
                                </p>
                            </div>
                            <span className="font-mono font-bold text-slate-900 dark:text-white text-xl shrink-0">{completedDays}/{totalDays}</span>
                        </div>
                        <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className={`h-full transition-all duration-1000 ease-out ${isWeekComplete ? 'bg-emerald-500' : 'bg-indigo-600'}`}
                                style={{ width: `${progressPercentage}%` }}
                            />
                        </div>
                    </div>

                    <button
                        onClick={onGenerateNextWeek}
                        disabled={!isWeekComplete || generating}
                        className={`
                            min-h-[44px] px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs sm:text-sm flex items-center justify-center gap-3 transition-all shrink-0
                            ${isWeekComplete
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-70'}
                        `}
                    >
                        {generating ? <Loader2 size={20} className="animate-spin"/> : isWeekComplete ? <Activity size={20}/> : <Lock size={20}/>}
                        {/* El número de semana lo decide el servidor contando los planes
                            del alumno: aquí estaba fijo en "SEMANA 2" para siempre. */}
                        {generating ? "Generando…" : isWeekComplete ? "Generar la siguiente" : "Aún bloqueada"}
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
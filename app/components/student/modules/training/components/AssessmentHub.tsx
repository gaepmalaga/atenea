'use client';

import { Dumbbell, Timer, Activity, CheckCircle2, Save, Loader2, Settings } from 'lucide-react';
import { isTestDone, readMaxPullups, type PhysicalProfile, type TestId } from '@/app/lib/physical';

interface AssessmentHubProps {
    profile?: PhysicalProfile | null;
    onSelectTest: (testId: TestId) => void;
    onGenerate: () => void;
    generating?: boolean;
    onEditBio?: () => void;
    error?: string | null;
}

export default function AssessmentHub({ profile, onSelectTest, onGenerate, generating, onEditBio, error }: AssessmentHubProps) {
    const metrics = profile?.baseline_metrics ?? {};
    // "Hecho" es "tiene una marca numerica". Antes bastaba con que la clave
    // existiera, asi que una cadena vacia guardada por el asistente daba la
    // prueba por superada.
    const isForceDone = isTestDone(metrics, 'force');
    const isCooperDone = isTestDone(metrics, 'cooper');
    const isAgilityDone = isTestDone(metrics, 'agility');
    const maxPullups = readMaxPullups(profile);

    const isComplete = isForceDone && isCooperDone; // Agilidad a veces es opcional, pero mejor pedir todo.

    return (
        <div className="max-w-5xl mx-auto animate-in fade-in py-8">
            <div className="flex justify-between items-end mb-10">
                <div>
                    <h2 className="text-4xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Centro de Evaluación</h2>
                    <p className="text-slate-500 mt-2 max-w-lg">Completa las tarjetas de misión para desbloquear tu plan operativo.</p>
                </div>
                {onEditBio && (
                    <button onClick={onEditBio} className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-emerald-500 transition-colors bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-lg">
                        <Settings size={16}/> Editar Datos
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                
                {/* TARJETA 1: FUERZA */}
                <div 
                    onClick={() => onSelectTest('force')} 
                    className={`p-8 rounded-3xl border cursor-pointer transition-all hover:-translate-y-2 hover:shadow-2xl group relative overflow-hidden ${isForceDone ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-500/50' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}
                >
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
                        <Dumbbell size={100} className={isForceDone ? 'text-emerald-500' : 'text-slate-400'}/>
                    </div>
                    
                    <div className="relative z-10">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${isForceDone ? 'bg-emerald-500 text-white' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-500'}`}>
                            {isForceDone ? <CheckCircle2 size={28}/> : <Dumbbell size={28}/>}
                        </div>
                        <h3 className="font-black text-2xl text-slate-900 dark:text-white mb-2">Fuerza</h3>
                        <p className="text-sm text-slate-500 font-medium">Dominadas estrictas o Suspensión.</p>
                        {isForceDone && <p className="mt-4 text-emerald-600 font-bold text-lg">{maxPullups} {metrics.pullups_method === 'suspension' ? 'Segs' : 'Reps'}</p>}
                    </div>
                </div>

                {/* TARJETA 2: RESISTENCIA */}
                <div 
                    onClick={() => onSelectTest('cooper')} 
                    className={`p-8 rounded-3xl border cursor-pointer transition-all hover:-translate-y-2 hover:shadow-2xl group relative overflow-hidden ${isCooperDone ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-500/50' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}
                >
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
                        <Timer size={100} className={isCooperDone ? 'text-emerald-500' : 'text-slate-400'}/>
                    </div>

                    <div className="relative z-10">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${isCooperDone ? 'bg-emerald-500 text-white' : 'bg-orange-100 dark:bg-orange-900/30 text-orange-500'}`}>
                            {isCooperDone ? <CheckCircle2 size={28}/> : <Timer size={28}/>}
                        </div>
                        <h3 className="font-black text-2xl text-slate-900 dark:text-white mb-2">Resistencia</h3>
                        <p className="text-sm text-slate-500 font-medium">Test Cooper (12 minutos).</p>
                        {isCooperDone && <p className="mt-4 text-emerald-600 font-bold text-lg">{metrics.cooper_distance} m</p>}
                    </div>
                </div>

                {/* TARJETA 3: AGILIDAD */}
                <div 
                    onClick={() => onSelectTest('agility')} 
                    className={`p-8 rounded-3xl border cursor-pointer transition-all hover:-translate-y-2 hover:shadow-2xl group relative overflow-hidden ${isAgilityDone ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-500/50' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}
                >
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
                        <Activity size={100} className={isAgilityDone ? 'text-emerald-500' : 'text-slate-400'}/>
                    </div>

                    <div className="relative z-10">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${isAgilityDone ? 'bg-emerald-500 text-white' : 'bg-red-100 dark:bg-red-900/30 text-red-500'}`}>
                            {isAgilityDone ? <CheckCircle2 size={28}/> : <Activity size={28}/>}
                        </div>
                        <h3 className="font-black text-2xl text-slate-900 dark:text-white mb-2">Agilidad</h3>
                        <p className="text-sm text-slate-500 font-medium">Circuito Policial.</p>
                        {isAgilityDone && <p className="mt-4 text-emerald-600 font-bold text-lg">{metrics.agility_time} s</p>}
                    </div>
                </div>
            </div>

            {error && (
                <p className="text-sm font-bold text-red-500 bg-red-50 dark:bg-red-900/20 rounded-xl p-4 text-center mb-4">
                    {error}
                </p>
            )}

            {/* BOTÓN GENERAR */}
            <button 
                onClick={onGenerate} 
                disabled={!isComplete || generating}
                className={`w-full py-6 rounded-2xl font-black uppercase tracking-widest text-lg flex items-center justify-center gap-3 transition-all ${isComplete ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-2xl shadow-emerald-600/30 hover:scale-[1.01]' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-50'}`}
            >
                {generating ? <Loader2 className="animate-spin"/> : <Save size={24}/>}
                {generating ? 'ANALIZANDO BIO-RITMOS...' : isComplete ? 'GENERAR PLAN ESTRATÉGICO' : 'COMPLETA LOS TESTS PARA CONTINUAR'}
            </button>
        </div>
    );
}
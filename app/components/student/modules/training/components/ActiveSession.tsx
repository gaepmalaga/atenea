'use client';

import { useState } from 'react';
import { X, CheckCircle2, AlertTriangle, Activity } from 'lucide-react';

// Los tipos del plan viven en `app/lib/training-plan.ts`: los escribe la IA y
// los lee tanto esta pantalla como el panel, asi que una sola definicion.
import type { TrainingDay } from '@/app/lib/training-plan';
import type { TrainingDayLog } from '@/app/lib/training-plan';

interface ActiveSessionProps {
    day: TrainingDay;
    onExit: () => void;
    onComplete: (logData: TrainingDayLog) => void;
    startInReportMode?: boolean;
}

export default function ActiveSession({ day, onExit, onComplete, startInReportMode = false }: ActiveSessionProps) {
    const [sessionFeedback, setSessionFeedback] = useState<Record<string, string>>({});
    const [sessionRPE, setSessionRPE] = useState(5); 
    const [reportIssue, setReportIssue] = useState(startInReportMode);
    const [issueType, setIssueType] = useState(''); 
    const [painLocation, setPainLocation] = useState('');

    const handleFinish = (status: 'completed' | 'skipped') => {
        const logData = {
            day_title: day.title,
            status,
            issue: issueType || null,
            pain_location: painLocation || null,
            rpe: sessionRPE,
            feedback: sessionFeedback,
            timestamp: new Date().toISOString()
        };
        onComplete(logData);
    };

    return (
        // CAMBIO: Fondo adaptativo (blanco día / negro noche)
        <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 flex flex-col animate-in slide-in-from-bottom-10 duration-300">
            
            {/* HEADER */}
            {/* CAMBIO: Bordes y fondos adaptativos */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900">
                <div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase">{day.title}</h2>
                    <p className="text-sm text-emerald-600 dark:text-emerald-500 font-bold uppercase tracking-widest">{day.type} • {day.day}</p>
                </div>
                <button onClick={onExit} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 dark:text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    <X size={24}/>
                </button>
            </div>

            {/* CONTENIDO PRINCIPAL */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-4xl mx-auto w-full space-y-6">
                
                {/* MODO REPORTE DE INCIDENCIA */}
                {reportIssue ? (
                    <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-500/50 rounded-2xl p-6 animate-in zoom-in">
                        <h3 className="text-red-600 dark:text-red-500 font-black text-xl mb-4 flex items-center gap-2">
                            <AlertTriangle/> REPORTE DE INCIDENCIA
                        </h3>
                        <p className="text-slate-600 dark:text-slate-300 mb-6">Si no has podido entrenar o te has lesionado, indícalo para que la IA ajuste el plan.</p>
                        
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            {/* Botones de Incidencia adaptados */}
                            <button onClick={() => setIssueType('sick')} className={`p-4 rounded-xl border font-bold transition-all ${issueType === 'sick' ? 'bg-red-600 text-white border-red-600' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500'}`}>🤒 ENFERMEDAD</button>
                            <button onClick={() => setIssueType('work')} className={`p-4 rounded-xl border font-bold transition-all ${issueType === 'work' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500'}`}>💼 TRABAJO</button>
                            <button onClick={() => setIssueType('injury')} className={`p-4 rounded-xl border font-bold transition-all ${issueType === 'injury' ? 'bg-red-600 text-white border-red-600' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500'}`}>🚑 LESIÓN</button>
                            <button onClick={() => setIssueType('tired')} className={`p-4 rounded-xl border font-bold transition-all ${issueType === 'tired' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500'}`}>😴 FATIGA</button>
                        </div>

                        {issueType === 'injury' && (
                            <div className="mb-6 animate-in fade-in">
                                <label className="text-xs font-bold text-slate-500 uppercase">¿Zona afectada?</label>
                                <input 
                                    type="text" 
                                    value={painLocation} 
                                    onChange={e => setPainLocation(e.target.value)} 
                                    className="w-full bg-white dark:bg-black border border-slate-200 dark:border-red-500/50 p-3 rounded-xl text-slate-900 dark:text-white mt-2 placeholder-slate-400" 
                                    placeholder="Ej: Hombro derecho, rodilla..."
                                />
                            </div>
                        )}

                        <div className="flex gap-4">
                            <button onClick={() => setReportIssue(false)} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-white rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700">CANCELAR</button>
                            <button onClick={() => handleFinish('skipped')} className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-black uppercase shadow-lg shadow-red-600/20">CONFIRMAR BAJA</button>
                        </div>
                    </div>
                ) : (
                    <>
                    {/* LISTA DE EJERCICIOS (MODO NORMAL) */}
                    {day.exercises.map((ex, idx) => (
                        // CAMBIO: Tarjeta blanca en día, oscura en noche
                        <div key={idx} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 relative overflow-hidden group hover:border-emerald-500 dark:hover:border-slate-700 transition-all shadow-sm">
                            <div className="absolute -right-4 -top-4 text-5xl sm:text-9xl font-black text-slate-100 dark:text-slate-800 opacity-50 dark:opacity-20 pointer-events-none select-none">
                                {idx + 1}
                            </div>

                            <div className="relative z-10">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{ex.name}</h3>
                                <div className="flex flex-wrap gap-4 text-sm text-slate-500 dark:text-slate-500 dark:text-slate-400 mb-4 font-mono">
                                    <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-700">SETS: {ex.sets}</span>
                                    <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-700">REPS: {ex.reps}</span>
                                    <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-700">REST: {ex.rest}</span>
                                </div>
                                
                                {ex.target && (
                                    <div className="mb-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-500/30 rounded-lg text-indigo-600 dark:text-indigo-300 text-xs font-medium flex gap-2">
                                        <Activity size={14} className="mt-0.5 flex-shrink-0"/>
                                        {ex.target}
                                    </div>
                                )}

                                {/* INPUT DE FEEDBACK */}
                                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                                    <input 
                                        type="text" 
                                        className="bg-slate-50 dark:bg-black border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white p-3 rounded-lg w-full outline-none focus:border-emerald-500 transition-colors text-sm placeholder-slate-400" 
                                        placeholder={
                                            ex.metric_type?.includes('weight') ? "Peso usado / Lastre..." :
                                            ex.metric_type?.includes('time') ? "Tiempo real..." :
                                            "Repeticiones reales / Notas..."
                                        }
                                        onChange={(e) => setSessionFeedback({...sessionFeedback, [ex.name]: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* RPE SLIDER */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-4 block flex justify-between">
                            <span>Esfuerzo Percibido (RPE)</span>
                            <span className="text-emerald-600 dark:text-emerald-500">{sessionRPE}/10</span>
                        </label>
                        <input 
                            type="range" min="1" max="10" step="1" 
                            value={sessionRPE} 
                            onChange={(e) => setSessionRPE(Number(e.target.value))} 
                            className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-2 font-bold uppercase">
                            <span>Paseo</span>
                            <span>Moderado</span>
                            <span>Muy Duro</span>
                            <span>Fallo</span>
                        </div>
                    </div>
                    </>
                )}
            </div>

            {/* FOOTER */}
            {!reportIssue && (
                <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex gap-4">
                    <button onClick={() => setReportIssue(true)} className="px-4 py-4 bg-red-50 dark:bg-red-900/10 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-xl font-bold border border-red-100 dark:border-red-900/30 transition-colors">
                        <AlertTriangle size={20}/>
                    </button>
                    <button onClick={() => handleFinish('completed')} className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest rounded-xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-transform hover:scale-[1.02]">
                        <CheckCircle2 size={20}/> COMPLETAR SESIÓN
                    </button>
                </div>
            )}
        </div>
    );
}
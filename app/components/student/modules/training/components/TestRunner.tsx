'use client';

import { useState, useEffect } from 'react';
import { Dumbbell, Timer, CheckCircle2, Activity, ChevronRight, Info } from 'lucide-react';
import TacticalTimer from './TacticalTimer';
import {
    toNumberOrNull,
    TEST_METRIC_FIELD,
    type BaselineMetrics,
    type TestId,
} from '@/app/lib/physical';

interface TestRunnerProps {
    testId: TestId;
    initialData?: BaselineMetrics | null;
    onSave: (data: BaselineMetrics) => void;
    onExit: () => void;
    saving?: boolean;
    error?: string | null;
}

export default function TestRunner({ testId, initialData, onSave, onExit, saving, error }: TestRunnerProps) {
    // `?? ''` y no `|| ''`: con `||`, un resultado guardado de 0 (cero
    // dominadas es un dato legitimo) volvia a salir como campo vacio.
    const getValueFromMetrics = () => {
        const guardado = initialData?.[TEST_METRIC_FIELD[testId]];
        return toNumberOrNull(guardado)?.toString() ?? '';
    };

    const [phase, setPhase] = useState<'setup' | 'countdown' | 'running'>('setup'); 
    const [startCount, setStartCount] = useState(5);
    const [result, setResult] = useState<string>(getValueFromMetrics());
    const [method, setMethod] = useState<'reps' | 'suspension'>(initialData?.pullups_method || 'reps'); 
    
    // Toggle para modo bolsillo
    const [usePocketMode, setUsePocketMode] = useState(false);

    // Audio Context para los pitidos de salida (Semáforo)
    const playCountdownBeep = (type: 'get_ready' | 'go') => {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        const now = ctx.currentTime;
        if (type === 'get_ready') {
            osc.frequency.setValueAtTime(600, now);
            gain.gain.setValueAtTime(0.1, now);
            osc.start(now);
            osc.stop(now + 0.2);
        } else {
            // El GO lo hará el TacticalTimer al arrancar, aquí solo gestionamos los PREVIOS
        }
    };

    // SECUENCIA DE SALIDA
    useEffect(() => {
        if (phase === 'countdown') {
            const timer = setInterval(() => {
                setStartCount((prev) => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        // NO HACEMOS BEEP AQUÍ, lo hará el TacticalTimer al montarse
                        setPhase('running');
                        return 0;
                    }
                    if (prev <= 5) playCountdownBeep('get_ready');
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [phase]);

    const startTest = () => {
        setStartCount(5);
        setPhase('countdown');
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (Number(val) < 0) return;
        setResult(val);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault();
    };

    // Sin esto, confirmar con el campo en blanco guardaba `Number('') === 0`:
    // el hub daba la prueba por hecha y el plan se generaba sobre un dato
    // inventado. "Sin medir" y "cero" no son lo mismo.
    const parsed = toNumberOrNull(result);
    const canConfirm = parsed !== null && parsed >= 0 && !saving;

    const confirm = (extra: BaselineMetrics = {}) => {
        if (parsed === null) return;
        onSave({ [TEST_METRIC_FIELD[testId]]: parsed, ...extra });
    };

    const confirmHint = (
        <>
            {error && (
                <p className="text-sm font-bold text-red-500 bg-red-50 dark:bg-red-900/20 rounded-xl p-4 text-center mb-4">
                    No se pudo guardar: {error}
                </p>
            )}
            {!error && parsed === null && (
                <p className="text-xs text-slate-400 text-center mb-4 font-medium">
                    Introduce tu marca para poder confirmarla.
                </p>
            )}
        </>
    );

    const confirmClass = (ok: boolean) =>
        `w-full py-5 font-black uppercase rounded-xl shadow-lg transition-colors ${
            ok ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
               : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
        }`;

    return (
        <div className="max-w-2xl mx-auto animate-in slide-in-from-bottom-10 py-8 pb-20">
            <button onClick={onExit} className="mb-6 flex items-center gap-2 text-slate-500 hover:text-white font-bold text-sm">
                <ChevronRight className="rotate-180" size={16}/> VOLVER AL HUB
            </button>

            {/* PANTALLA GIGANTE DE CUENTA ATRÁS */}
            {phase === 'countdown' && (
                <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col items-center justify-center select-none">
                    <div className="text-[200px] font-black text-white animate-pulse tabular-nums">
                        {startCount}
                    </div>
                    <p className="text-emerald-500 font-bold uppercase tracking-widest text-xl animate-bounce">PREPARADOS...</p>
                    {usePocketMode && <p className="text-slate-500 text-sm mt-8 opacity-75">Modo Bolsillo se activará al empezar</p>}
                </div>
            )}

            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl">
                 {/* HEADER COMÚN */}
                 <div className="flex items-start gap-4 mb-8">
                      <div className={`p-4 rounded-2xl flex-shrink-0 ${testId === 'force' ? 'bg-indigo-600' : testId === 'cooper' ? 'bg-orange-600' : 'bg-red-600'} text-white`}>
                          {testId === 'force' ? <Dumbbell size={32}/> : testId === 'cooper' ? <Timer size={32}/> : <Activity size={32}/>}
                      </div>
                      <div>
                          <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase leading-none mb-2">
                              {testId === 'force' ? 'TEST DE FUERZA' : testId === 'cooper' ? 'TEST DE COOPER' : 'TEST DE AGILIDAD'}
                          </h2>
                          <p className="text-slate-500 font-medium text-sm">Calibración oficial CNP.</p>
                      </div>
                  </div>

                {testId === 'force' ? (
                    // --- UI ESPECÍFICA DE FUERZA ---
                    <div className="space-y-8">
                        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-800">
                            <h3 className="text-sm font-black text-indigo-900 dark:text-indigo-100 uppercase mb-4 tracking-wider">Paso 1: Selecciona tu nivel</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <button onClick={() => { setMethod('reps'); setResult(''); }} className={`p-4 rounded-xl border-2 text-left transition-all relative ${method === 'reps' ? 'border-indigo-600 bg-white shadow-xl ring-1 ring-indigo-600' : 'border-transparent bg-white/60 hover:bg-white'}`}>
                                    <span className="font-black text-indigo-900 uppercase text-xs block mb-1">SÍ, PUEDO</span>
                                    <span className="text-[10px] text-slate-500">Dominadas estrictas</span>
                                    {method === 'reps' && <CheckCircle2 className="text-indigo-600 absolute top-4 right-4" size={18}/>}
                                </button>
                                <button onClick={() => { setMethod('suspension'); setResult(''); }} className={`p-4 rounded-xl border-2 text-left transition-all relative ${method === 'suspension' ? 'border-indigo-600 bg-white shadow-xl ring-1 ring-indigo-600' : 'border-transparent bg-white/60 hover:bg-white'}`}>
                                    <span className="font-black text-slate-600 uppercase text-xs block mb-1">NO, AÚN NO</span>
                                    <span className="text-[10px] text-slate-500">Suspensión isométrica</span>
                                    {method === 'suspension' && <CheckCircle2 className="text-indigo-600 absolute top-4 right-4" size={18}/>}
                                </button>
                            </div>
                        </div>
                        
                        <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
                            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase mb-2 tracking-wider">Paso 2: Protocolo</h3>
                            <div className="flex gap-3">
                                <Info size={18} className="flex-shrink-0 mt-0.5 text-indigo-500"/>
                                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                    {method === 'reps' 
                                        ? "Cuélgate de la barra con brazos totalmente estirados. Sube hasta pasar la barbilla. Baja controlado hasta estirar brazos de nuevo. Realiza todas las que puedas sin soltarte."
                                        : "Usa un banco para subir hasta que tu barbilla esté por encima de la barra. Quita los pies y aguanta en esa posición estática todo el tiempo posible."
                                    }
                                </p>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                            <label className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-4 block text-center">Paso 3: Introduce {method === 'reps' ? 'Repeticiones' : 'Segundos'}</label>
                            <input type="number" min="0" value={result} onChange={handleInputChange} onKeyDown={handleKeyDown} className="w-full text-7xl font-black text-center bg-transparent outline-none placeholder-slate-200 text-slate-900 dark:text-white p-2" placeholder="0"/>
                        </div>
                        {confirmHint}
                        <button onClick={() => confirm({ pullups_method: method })} disabled={!canConfirm} className={confirmClass(canConfirm)}>
                            {saving ? 'GUARDANDO…' : 'CONFIRMAR FUERZA'}
                        </button>
                    </div>

                ) : (
                    // --- UI DE COOPER Y AGILIDAD ---
                    <div className="space-y-8">
                        <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
                            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase mb-2 tracking-wider">Instrucciones de Misión</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed flex gap-2">
                                <Info size={16} className="flex-shrink-0 mt-0.5 text-indigo-500"/>
                                {testId === 'cooper' 
                                    ? "Corre la máxima distancia posible en 12 minutos. Busca un terreno llano o pista de atletismo, tú deberás medir la distancia. El asistente por voz te avisará del tiempo restante."
                                    : "Circuito de agilidad oficial (vallas y picas). Coloca el móvil en la salida. La cuenta atrás te dará 5 segundos para prepararte."
                                }
                            </p>
                        </div>

                        {/* =================================================================================
                            CORRECCIÓN AQUÍ: EL CRONÓMETRO SOLO SE RENDERIZA SI LA FASE ES 'RUNNING'
                            (Antes ponía phase !== 'setup', lo que incluía 'countdown')
                           ================================================================================= */}
                        {phase === 'running' && (
                            <TacticalTimer 
                                mode={testId === 'cooper' ? 'countdown' : 'stopwatch'} 
                                duration={720} 
                                autoStart={true}
                                startInPocketMode={usePocketMode} 
                            />
                        )}

                        {phase === 'setup' && (
                            <div className="p-6 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50">
                                {/* TOGGLE MODO BOLSILLO (SOLO COOPER) */}
                                {testId === 'cooper' && (
                                    <div onClick={() => setUsePocketMode(!usePocketMode)} className={`flex items-center justify-between p-4 mb-6 rounded-xl border cursor-pointer transition-all ${usePocketMode ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500'}`}>
                                        <div className="flex items-center gap-3">
                                            <Activity size={24}/>
                                            <div className="text-left">
                                                <p className="font-bold text-sm uppercase">Modo Bolsillo</p>
                                                <p className="text-[10px] opacity-80">Apagar pantalla al iniciar (Audio ON)</p>
                                            </div>
                                        </div>
                                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${usePocketMode ? 'border-white bg-white/20' : 'border-slate-300'}`}>
                                            {usePocketMode && <div className="w-3 h-3 bg-white rounded-full"/>}
                                        </div>
                                    </div>
                                )}

                                <p className="text-slate-500 mb-6 font-medium text-sm text-center">
                                    {testId === 'cooper' ? 'Prepárate. Tienes 5 segundos antes de la salida.' : 'Deja el móvil en la salida. Tienes 5 segundos.'}
                                </p>
                                <button onClick={startTest} className="w-full py-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-xl rounded-2xl hover:scale-[1.02] transition-transform uppercase shadow-xl flex items-center justify-center gap-3">
                                    <Timer size={24}/> INICIAR CUENTA ATRÁS
                                </button>
                            </div>
                        )}

                        <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                            <label className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-4 block text-center">Introduce {testId === 'cooper' ? 'Distancia (Metros)' : 'Tiempo (Segundos)'}</label>
                            <input type="number" min="0" value={result} onChange={handleInputChange} onKeyDown={handleKeyDown} className="w-full text-7xl font-black text-center bg-transparent outline-none p-2 placeholder-slate-200 focus:text-emerald-600 transition-colors" placeholder="0"/>
                            {testId === 'cooper' && <p className="text-center text-[10px] text-slate-400 mt-2">Ej: Si diste 6 vueltas a una pista de 400m = 2400m</p>}
                        </div>

                        {confirmHint}
                        <button onClick={() => confirm()} disabled={!canConfirm} className={confirmClass(canConfirm)}>
                            {saving ? 'GUARDANDO…' : 'CONFIRMAR RESULTADO'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
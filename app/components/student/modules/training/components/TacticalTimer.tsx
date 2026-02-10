'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Lock, Unlock, EyeOff, Volume2 } from 'lucide-react';

interface TacticalTimerProps {
    mode: 'countdown' | 'stopwatch';
    duration?: number; 
    onFinish?: () => void;
    autoStart?: boolean;
    startInPocketMode?: boolean; 
}

export default function TacticalTimer({ mode, duration = 0, onFinish, autoStart = false, startInPocketMode = false }: TacticalTimerProps) {
    const [time, setTime] = useState(mode === 'countdown' ? duration : 0);
    const [isActive, setIsActive] = useState(autoStart);
    const [pocketMode, setPocketMode] = useState(startInPocketMode && autoStart);
    const intervalRef = useRef<any>(null);
    const wakeLockRef = useRef<any>(null);

    // --- WAKE LOCK & AUDIO ---
    // (Esta lógica no cambia, es funcional)
    const toggleWakeLock = async (shouldLock: boolean) => {
        if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
            try {
                if (shouldLock && !wakeLockRef.current) {
                    wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
                } else if (!shouldLock && wakeLockRef.current) {
                    await wakeLockRef.current.release();
                    wakeLockRef.current = null;
                }
            } catch (err) { console.error('WakeLock Error:', err); }
        }
    };

    const speak = (text: string) => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.1; 
            utterance.pitch = 1;
            utterance.lang = 'es-ES';
            window.speechSynthesis.speak(utterance);
        }
    };

    const playBeep = (type: 'tick' | 'milestone' | 'end' | 'start') => {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        const now = ctx.currentTime;
        
        // Configuración de pitidos
        if (type === 'tick') { 
            osc.frequency.setValueAtTime(800, now); gain.gain.setValueAtTime(0.1, now); osc.start(now); osc.stop(now + 0.1);
        } else if (type === 'end') { 
            osc.frequency.setValueAtTime(300, now); gain.gain.setValueAtTime(0.3, now); osc.start(now); osc.frequency.linearRampToValueAtTime(100, now + 2); osc.stop(now + 2);
        } else if (type === 'start') {
            osc.frequency.setValueAtTime(1000, now); gain.gain.setValueAtTime(0.1, now); osc.start(now); osc.stop(now + 0.3);
        }
    };

    useEffect(() => {
        if (autoStart) {
            if (startInPocketMode) setPocketMode(true);
            setTimeout(() => playBeep('start'), 100); 
        }
    }, []);

    // --- LÓGICA CRONÓMETRO ---
    useEffect(() => {
        if (isActive) {
            toggleWakeLock(true); 
            intervalRef.current = setInterval(() => {
                setTime((prev) => {
                    if (mode === 'countdown') {
                        const minutesLeft = Math.floor(prev / 60);
                        const secondsLeft = prev % 60;
                        if (secondsLeft === 0) {
                            if (minutesLeft === 11) speak("Quedan 11 minutos");
                            if (minutesLeft === 6) speak("Mitad de tiempo. Mantén el ritmo.");
                            if (minutesLeft === 3) speak("Quedan 3 minutos. ¡Tú puedes!");
                            if (minutesLeft === 1) speak("¡Último minuto! ¡Dalo todo!");
                        }
                        if (prev <= 10 && prev > 0) playBeep('tick'); 
                        if (prev <= 1) {
                            clearInterval(intervalRef.current);
                            setIsActive(false);
                            setPocketMode(false); 
                            toggleWakeLock(false);
                            speak("Tiempo terminado. Detente.");
                            playBeep('end');
                            if (onFinish) onFinish();
                            return 0;
                        }
                        return prev - 1;
                    } else {
                        return prev + 1;
                    }
                });
            }, 1000);
        } else {
            clearInterval(intervalRef.current);
            toggleWakeLock(false);
        }
        return () => { clearInterval(intervalRef.current); toggleWakeLock(false); };
    }, [isActive, mode, duration]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    // --- RENDER: MODO BOLSILLO (ESTE SE QUEDA NEGRO POR BATERÍA) ---
    if (pocketMode) {
        return (
            <div className="fixed inset-0 z-[150] bg-black flex flex-col items-center justify-center text-white select-none touch-none">
                <div className="text-center mb-20 opacity-40 animate-pulse">
                    <EyeOff size={64} className="mx-auto mb-4"/>
                    <p className="uppercase font-black tracking-widest text-2xl">MODO BOLSILLO</p>
                    <p className="text-sm mt-2 font-mono">AUDIO ACTIVO • GPS SEGURO</p>
                </div>
                <div className="text-[100px] font-mono font-black tabular-nums leading-none mb-20 opacity-20">
                    {formatTime(time)}
                </div>
                <button onDoubleClick={() => setPocketMode(false)} className="w-72 h-32 border-2 border-white/20 rounded-full flex flex-col items-center justify-center gap-2 active:bg-white/10 transition-colors">
                    <Unlock size={32}/> 
                    <span className="text-xs font-bold uppercase tracking-widest">Doble Tap para Desbloquear</span>
                </button>
            </div>
        );
    }

    // --- RENDER: MODO VISUAL (ADAPTATIVO) ---
    return (
        <div className="bg-white dark:bg-slate-950 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center mb-8 shadow-xl relative overflow-hidden animate-in zoom-in">
            <div className="absolute top-4 right-4 text-emerald-500/50">
                <Volume2 size={20}/>
            </div>

            {/* Números: Gris oscuro en día, Gris claro en noche. Verde si está activo */}
            <div className={`text-7xl md:text-8xl font-black font-mono tabular-nums tracking-tighter mb-8 transition-colors ${isActive ? 'text-emerald-600 dark:text-emerald-500' : 'text-slate-900 dark:text-slate-600'}`}>
                {formatTime(time)}
            </div>
            
            <div className="flex gap-6 z-10">
                <button 
                    onClick={() => setIsActive(!isActive)} 
                    className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg ${isActive ? 'bg-orange-500 text-white' : 'bg-emerald-600 text-white hover:scale-105'}`}
                >
                    {isActive ? <Pause size={32} fill="currentColor"/> : <Play size={32} fill="currentColor" className="ml-1"/>}
                </button>
                
                <button onClick={() => { setIsActive(false); setTime(mode === 'countdown' ? duration : 0); }} className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                    <RotateCcw size={24}/>
                </button>
            </div>

            {isActive && (
                <button onClick={() => setPocketMode(true)} className="mt-8 flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-900/50 px-6 py-3 rounded-full border border-slate-200 dark:border-slate-800 transition-colors">
                    <Lock size={14}/> Activar Pantalla Negra
                </button>
            )}
        </div>
    );
}
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Lock, Unlock, EyeOff, Volume2 } from 'lucide-react';
import {
  elapsedSeconds,
  displaySeconds,
  formatTime,
  shouldTick,
  voiceCueFor,
  BEEPS,
  type BeepKind,
  type TimerMode,
} from '@/app/lib/timer';

interface TacticalTimerProps {
  mode: TimerMode;
  duration?: number;
  onFinish?: () => void;
  autoStart?: boolean;
  startInPocketMode?: boolean;
}

/** Cada cuánto se repinta. NO es lo que mide el tiempo: eso sale del reloj. */
const REPAINT_MS = 200;

export default function TacticalTimer({
  mode,
  duration = 0,
  onFinish,
  autoStart = false,
  startInPocketMode = false,
}: TacticalTimerProps) {
  const [isActive, setIsActive] = useState(autoStart);
  const [pocketMode, setPocketMode] = useState(autoStart && startInPocketMode);
  const [now, setNow] = useState(() => Date.now());

  // Marcas de reloj: el tiempo se DERIVA de aquí, no de contar intervalos.
  // Van en ESTADO, no en refs: se leen durante el render, y un ref no provoca
  // repintado cuando cambia. El inicializador perezoso evita además llamar a
  // `Date.now()` en el cuerpo del render.
  const [startedAt, setStartedAt] = useState<number | null>(() => (autoStart ? Date.now() : null));
  const [accumulated, setAccumulated] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  // Un solo AudioContext para toda la vida del componente. Antes se creaba uno
  // por pitido y no se cerraba nunca: en los últimos 10 segundos se llama una
  // vez por segundo, y el navegador limita los contextos simultáneos, así que
  // el audio se apagaba justo en el tramo que más importa.
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Avisos ya dados, para que un repintado no los repita.
  const announcedRef = useRef<Set<number>>(new Set());
  const finishedRef = useRef(false);

  // --- AUDIO ---
  const playBeep = useCallback((kind: BeepKind) => {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    if (!audioCtxRef.current) audioCtxRef.current = new Ctor();
    const ctx = audioCtxRef.current;
    // El navegador suspende el contexto si la pestaña pierde el foco.
    if (ctx.state === 'suspended') void ctx.resume();

    const { freq, gain, durationMs, slideTo } = BEEPS[kind];
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.connect(vol);
    vol.connect(ctx.destination);

    const t = ctx.currentTime;
    const seconds = durationMs / 1000;
    osc.frequency.setValueAtTime(freq, t);
    vol.gain.setValueAtTime(gain, t);
    if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, t + seconds);
    osc.start(t);
    osc.stop(t + seconds);
  }, []);

  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.1;
    u.lang = 'es-ES';
    window.speechSynthesis.speak(u);
  }, []);

  // --- WAKE LOCK ---
  const releaseWakeLock = useCallback(async () => {
    try {
      await wakeLockRef.current?.release();
    } catch {
      // La pantalla ya estaba liberada: no hay nada que hacer.
    }
    wakeLockRef.current = null;
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator) || wakeLockRef.current) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
    } catch {
      // Sin permiso o pestaña oculta: el cronómetro sigue funcionando igual.
    }
  }, []);

  // --- ARRANQUE Y LIMPIEZA ---
  useEffect(() => {
    if (autoStart) playBeep('start');
    return () => {
      void releaseWakeLock();
      window.speechSynthesis?.cancel();
      void audioCtxRef.current?.close();
      audioCtxRef.current = null;
    };
  }, [autoStart, playBeep, releaseWakeLock]);

  // --- RELOJ ---
  // El intervalo solo refresca `now`. Antes, cada tick restaba 1 al estado y
  // además llamaba a `speak`, `playBeep` y `onFinish` DENTRO del actualizador
  // de `setState`, que debe ser una función pura: en StrictMode se ejecuta dos
  // veces y sonaba todo por duplicado.
  const elapsed = elapsedSeconds(isActive ? startedAt : null, accumulated, now);
  const display = displaySeconds(mode, duration, elapsed);

  // "Terminado" y "en marcha" se DERIVAN del tiempo, no se guardan en estado.
  // Guardarlos obligaba a llamar a `setState` desde el efecto que vigila el
  // reloj, que es justo lo que provoca renders en cascada.
  const finished = mode === 'countdown' && duration > 0 && display <= 0;
  const running = isActive && !finished;

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => setNow(Date.now()), REPAINT_MS);
    void requestWakeLock();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      void releaseWakeLock();
    };
  }, [running, requestWakeLock, releaseWakeLock]);

  // --- SEÑALES ACÚSTICAS ---
  // En su propio efecto, fuera del actualizador de estado.
  useEffect(() => {
    if (!isActive || finishedRef.current) return;

    if (finished) {
      finishedRef.current = true;
      speak('Tiempo terminado. Detente.');
      playBeep('end');
      onFinish?.();
      return;
    }

    const cue = voiceCueFor(mode, display);
    if (cue && !announcedRef.current.has(display)) {
      announcedRef.current.add(display);
      speak(cue);
      playBeep('milestone');
    }

    if (shouldTick(mode, display) && !announcedRef.current.has(-display)) {
      announcedRef.current.add(-display);
      playBeep('tick');
    }
  }, [display, isActive, finished, mode, speak, playBeep, onFinish]);

  // --- CONTROLES ---
  const toggle = () => {
    const t = Date.now();
    if (finished) {
      // Tiempo agotado: el botón vuelve a empezar en vez de no hacer nada.
      setAccumulated(0);
      setStartedAt(t);
      announcedRef.current.clear();
      finishedRef.current = false;
      setIsActive(true);
      setNow(t);
      return;
    }
    if (isActive) {
      // Pausa: se acumula lo corrido y se suelta la marca de arranque.
      setAccumulated(prev => prev + (t - (startedAt ?? t)));
      setStartedAt(null);
      setIsActive(false);
    } else {
      setStartedAt(t);
      finishedRef.current = false;
      setIsActive(true);
    }
    setNow(t);
  };

  const reset = () => {
    setIsActive(false);
    setStartedAt(null);
    setAccumulated(0);
    announcedRef.current.clear();
    finishedRef.current = false;
    setNow(Date.now());
  };

  // --- RENDER: MODO BOLSILLO ---
  if (pocketMode && !finished) {
    return (
      <div className="fixed inset-0 z-[150] bg-black flex flex-col items-center justify-center text-white select-none touch-none">
        <div className="text-center mb-20 opacity-40 animate-pulse">
          <EyeOff size={64} className="mx-auto mb-4" />
          <p className="uppercase font-black tracking-widest text-2xl">MODO BOLSILLO</p>
          <p className="text-sm mt-2 font-mono">AUDIO ACTIVO · PANTALLA APAGADA</p>
        </div>
        <div className="text-[100px] font-mono font-black tabular-nums leading-none mb-20 opacity-20">
          {formatTime(display)}
        </div>
        <button
          onDoubleClick={() => setPocketMode(false)}
          className="w-72 h-32 border-2 border-white/20 rounded-full flex flex-col items-center justify-center gap-2 active:bg-white/10 transition-colors"
        >
          <Unlock size={32} />
          <span className="text-xs font-bold uppercase tracking-widest">Doble Tap para Desbloquear</span>
        </button>
      </div>
    );
  }

  // --- RENDER: MODO VISUAL ---
  return (
    <div className="bg-white dark:bg-slate-950 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center mb-8 shadow-xl relative overflow-hidden animate-in zoom-in">
      <div className="absolute top-4 right-4 text-emerald-500/50">
        <Volume2 size={20} />
      </div>

      <div className={`text-7xl md:text-8xl font-black font-mono tabular-nums tracking-tighter mb-8 transition-colors ${running ? 'text-emerald-600 dark:text-emerald-500' : 'text-slate-900 dark:text-slate-600'}`}>
        {formatTime(display)}
      </div>

      <div className="flex gap-6 z-10">
        <button
          onClick={toggle}
          aria-label={running ? 'Pausar' : 'Iniciar'}
          className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg ${running ? 'bg-orange-500 text-white' : 'bg-emerald-600 text-white hover:scale-105'}`}
        >
          {running ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
        </button>

        <button
          onClick={reset}
          aria-label="Reiniciar"
          className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          <RotateCcw size={24} />
        </button>
      </div>

      {running && (
        <button
          onClick={() => setPocketMode(true)}
          className="mt-8 flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-900/50 px-6 py-3 rounded-full border border-slate-200 dark:border-slate-800 transition-colors"
        >
          <Lock size={14} /> Activar Pantalla Negra
        </button>
      )}
    </div>
  );
}

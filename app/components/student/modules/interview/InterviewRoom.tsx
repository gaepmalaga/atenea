'use client';

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import {
  Mic, LogOut, Volume2, AlertTriangle,
  Wifi, Loader2, BrainCircuit, FileText, CheckCircle2, Target
} from 'lucide-react';
import { processInterviewTurn, evaluateInterview } from '@/actions';
import {
  canEvaluate,
  MIN_TURNS_FOR_REPORT,
  type InterviewTurn,
  type InterviewReport,
} from '@/app/lib/interview';

type InterviewPhase = 'intro' | 'speaking' | 'listening' | 'processing' | 'evaluating' | 'report';

interface InterviewRoomProps {
  onExit: () => void;
}

/** El reconocimiento de voz solo existe en navegadores basados en Chromium. */
function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | null;
}

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((e: { results: Array<Array<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

export default function InterviewRoom({ onExit }: InterviewRoomProps) {
  const [phase, setPhase] = useState<InterviewPhase>('intro');
  const [transcript, setTranscript] = useState('');
  const [history, setHistory] = useState<InterviewTurn[]>([]);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // El texto reconocido, leído desde `onend` sin depender del ciclo de render.
  // Antes se reasignaba el manejador `onend` en un efecto cada vez que cambiaba
  // el transcript, y el envío leía un `history` obsoleto del cierre.
  const transcriptRef = useRef('');
  // Espejo del historial. El actualizador de `setState` NO se ejecuta de forma
  // síncrona, así que leerlo justo después de llamarlo devolvería el valor
  // anterior y se perderían turnos de la conversación.
  const historyRef = useRef<InterviewTurn[]>([]);
  // Evita que un `onend` tardío reenvíe una respuesta ya procesada.
  const sendingRef = useRef(false);
  const finishedRef = useRef(false);

  // 1. SOPORTE DEL NAVEGADOR
  //
  // `useSyncExternalStore` en vez de comprobarlo dentro de un efecto: es una
  // capacidad del navegador, no estado de React, y así no hay render en cascada
  // ni desajuste de hidratación (en el servidor se asume soportado).
  // Antes esto era un `alert()` en mitad del flujo que dejaba la pantalla
  // congelada en "TRIBUNAL HABLANDO" sin forma de salir.
  const speechSupported = useSyncExternalStore(
    () => () => {},
    () => getSpeechRecognition() !== null,
    () => true
  );

  // 2. CARGA DE VOCES
  useEffect(() => {
    if (!speechSupported) return;

    const loadVoices = () => {
      if (window.speechSynthesis.getVoices().length > 0) setVoicesLoaded(true);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    const interval = setInterval(loadVoices, 500);

    return () => {
      clearInterval(interval);
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
      recognitionRef.current?.abort();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, [speechSupported]);

  // Las tres funciones se llaman entre sí, así que viven en refs para no
  // arrastrar cierres obsoletos ni recrearse en cada render.
  const speakRef = useRef<(text: string) => void>(() => {});
  const listenRef = useRef<() => void>(() => {});
  const respondRef = useRef<(text: string) => void>(() => {});

  const speak = useCallback((text: string) => {
    if (finishedRef.current) return;
    window.speechSynthesis.cancel();
    setPhase('speaking');

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.includes('es-ES')) || voices.find(v => v.lang.includes('es'));
    if (voice) utterance.voice = voice;
    utterance.rate = 1.0;

    utterance.onend = () => { if (!finishedRef.current) setTimeout(() => listenRef.current(), 400); };
    utterance.onerror = () => { if (!finishedRef.current) setTimeout(() => listenRef.current(), 1000); };

    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    }, 50);
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition || finishedRef.current) return;

    recognitionRef.current?.abort();

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'es-ES';

    recognition.onstart = () => {
      setPhase('listening');
      setTranscript('');
      transcriptRef.current = '';
      sendingRef.current = false;
    };

    recognition.onresult = (event) => {
      const t = event.results[0][0].transcript;
      setTranscript(t);
      transcriptRef.current = t;

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      // Silencio de 1,5 s = el aspirante ha terminado de hablar.
      silenceTimerRef.current = setTimeout(() => recognition.stop(), 1500);
    };

    // El envío se decide AQUÍ, leyendo el ref. Antes este manejador se
    // reasignaba desde un efecto en cada cambio de transcript.
    recognition.onend = () => {
      const text = transcriptRef.current.trim();
      if (finishedRef.current || sendingRef.current || text.length < 2) return;
      sendingRef.current = true;
      respondRef.current(text);
    };

    recognition.onerror = (e) => {
      if (e.error === 'no-speech' && !finishedRef.current) {
        speakRef.current('No le he escuchado. Repita.');
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  /** Añade un turno al historial y lo deja disponible de inmediato. */
  const pushTurn = useCallback((t: InterviewTurn) => {
    historyRef.current = [...historyRef.current, t];
    setHistory(historyRef.current);
  }, []);

  const handleUserResponse = useCallback(async (text: string) => {
    setPhase('processing');
    pushTurn({ speaker: 'candidato', text });

    try {
      const res = await processInterviewTurn(historyRef.current, text);
      if (res.success && res.response) {
        pushTurn({ speaker: 'inspector', text: res.response });
        speakRef.current(res.response);
      } else {
        speakRef.current('Fallo de comunicaciones. Repita.');
      }
    } catch {
      speakRef.current('Error del sistema.');
    }
  }, [pushTurn]);

  useEffect(() => {
    speakRef.current = speak;
    listenRef.current = startListening;
    respondRef.current = handleUserResponse;
  }, [speak, startListening, handleUserResponse]);

  // 2. INICIO
  const handleStartButton = () => {
    finishedRef.current = false;
    // Desbloquea el motor de audio en iOS/Chrome.
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    speak('Tome asiento. Soy el Inspector Jefe. He estado revisando su expediente. ¿Por qué cree que debería ser Policía Nacional?');
  };

  // 3. CIERRE CON INFORME
  const handleFinish = async () => {
    finishedRef.current = true;
    window.speechSynthesis.cancel();
    recognitionRef.current?.abort();
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    setPhase('evaluating');
    setReportError(null);

    const res = await evaluateInterview(historyRef.current);
    if (res.success) setReport(res.report);
    else setReportError(res.error);
    setPhase('report');
  };

  const respuestas = history.filter(t => t.speaker === 'candidato').length;
  const puedeEvaluar = canEvaluate(history);

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center font-sans text-white select-none">

      {/* FONDO */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_transparent_0%,_#000000_90%)] z-0"></div>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#4f46e5 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
      </div>

      {/* NAVEGADOR SIN RECONOCIMIENTO DE VOZ */}
      {!speechSupported && (
        <div className="relative z-10 text-center space-y-8 max-w-md px-6 animate-in fade-in">
          <div className="w-20 h-20 bg-amber-500/10 border border-amber-500/30 rounded-3xl flex items-center justify-center mx-auto text-amber-400">
            <AlertTriangle size={36} />
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl font-black tracking-tight">Este navegador no reconoce voz</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              La sala de entrevistas necesita reconocimiento de voz, que hoy solo funciona en
              Chrome, Edge y navegadores basados en Chromium. En Firefox y Safari no está disponible.
            </p>
          </div>
          <button onClick={onExit} className="px-6 py-3 rounded-xl border border-white/10 hover:bg-white/10 text-slate-300 transition-all uppercase tracking-widest text-xs font-bold">
            Volver al perfil
          </button>
        </div>
      )}

      {/* FASE 1: BOTÓN DE INICIO */}
      {speechSupported && phase === 'intro' && (
        <div className="relative z-10 text-center space-y-10 animate-in zoom-in duration-500">
          <div className="w-24 h-24 bg-red-600 rounded-full flex items-center justify-center mx-auto shadow-[0_0_50px_red] animate-pulse">
            <Mic size={40} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight">SALA DE INTERROGATORIOS</h1>
            <p className="text-slate-400 max-w-md mx-auto text-sm uppercase tracking-widest">
              Simulación de estrés nivel 4
            </p>
            <p className="text-slate-500 max-w-sm mx-auto text-xs pt-4">
              Al terminar recibirás un informe con tus contradicciones y qué preparar.
            </p>
          </div>

          <button
            onClick={handleStartButton}
            disabled={!voicesLoaded}
            className="group relative px-8 py-4 bg-white hover:bg-slate-200 text-black rounded-full font-bold text-lg tracking-wide transition-all hover:scale-105 disabled:opacity-50 overflow-hidden"
          >
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-slate-300 to-transparent -translate-x-full group-hover:animate-shimmer"></div>
            <span className="relative flex items-center gap-3">
              {voicesLoaded ? <Wifi size={20} /> : <Loader2 className="animate-spin" size={20} />}
              {voicesLoaded ? 'INICIAR SIMULACIÓN' : 'SINTONIZANDO...'}
            </span>
          </button>
        </div>
      )}

      {/* FASE 3: INFORME FINAL */}
      {speechSupported && (phase === 'evaluating' || phase === 'report') && (
        <div className="relative z-10 w-full max-w-2xl px-6 max-h-[90dvh] overflow-y-auto animate-in fade-in duration-500">
          {phase === 'evaluating' ? (
            <div className="text-center space-y-6 py-20">
              <BrainCircuit size={56} className="mx-auto text-indigo-400 animate-pulse" />
              <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Redactando informe</p>
            </div>
          ) : reportError || !report ? (
            <div className="text-center space-y-6 py-16">
              <AlertTriangle size={48} className="mx-auto text-amber-400" />
              <p className="text-slate-300 max-w-sm mx-auto text-sm">{reportError ?? 'No se pudo generar el informe.'}</p>
              <button onClick={onExit} className="px-6 py-3 rounded-xl border border-white/10 hover:bg-white/10 text-slate-300 uppercase tracking-widest text-xs font-bold">
                Salir
              </button>
            </div>
          ) : (
            <div className="space-y-8 py-10">
              <div className="text-center space-y-3">
                <FileText size={32} className="mx-auto text-indigo-400" />
                <h2 className="text-3xl font-black tracking-tight">Informe del Tribunal</h2>
                <div className="text-4xl sm:text-6xl font-black text-indigo-400 tabular-nums">{report.score}<span className="text-2xl text-slate-500">/100</span></div>
                <p className="text-slate-300 text-sm max-w-lg mx-auto leading-relaxed">{report.veredicto}</p>
              </div>

              {report.fortalezas.length > 0 && (
                <section className="bg-white/[0.03] border border-white/10 rounded-2xl p-6">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-4 flex items-center gap-2">
                    <CheckCircle2 size={14} /> Fortalezas
                  </h3>
                  <ul className="space-y-2 text-sm text-slate-300">
                    {report.fortalezas.map((f, i) => <li key={i} className="flex gap-3"><span className="text-emerald-500">·</span>{f}</li>)}
                  </ul>
                </section>
              )}

              {report.contradicciones.length > 0 && (
                <section className="bg-red-500/[0.04] border border-red-500/20 rounded-2xl p-6">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-red-400 mb-4 flex items-center gap-2">
                    <AlertTriangle size={14} /> Contradicciones detectadas
                  </h3>
                  <ul className="space-y-2 text-sm text-slate-300">
                    {report.contradicciones.map((c, i) => <li key={i} className="flex gap-3"><span className="text-red-500">·</span>{c}</li>)}
                  </ul>
                </section>
              )}

              {report.recomendaciones.length > 0 && (
                <section className="bg-white/[0.03] border border-white/10 rounded-2xl p-6">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-4 flex items-center gap-2">
                    <Target size={14} /> Qué preparar
                  </h3>
                  <ul className="space-y-2 text-sm text-slate-300">
                    {report.recomendaciones.map((r, i) => <li key={i} className="flex gap-3"><span className="text-indigo-400">·</span>{r}</li>)}
                  </ul>
                </section>
              )}

              <div className="flex justify-center pb-6">
                <button onClick={onExit} className="px-8 py-3 rounded-xl bg-white text-black font-black uppercase tracking-widest text-xs hover:scale-105 transition-transform">
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FASE 2: INTERFAZ ACTIVA */}
      {speechSupported && (phase === 'speaking' || phase === 'listening' || phase === 'processing') && (
        <div className="relative z-10 flex flex-col items-center w-full max-w-2xl">

          <div className={`mb-16 px-6 py-2 rounded-full border backdrop-blur-md flex items-center gap-3 transition-colors duration-500 ${
            phase === 'speaking' ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400' :
            phase === 'listening' ? 'bg-red-500/10 border-red-500 text-red-500' :
            'bg-slate-800/50 border-slate-700 text-slate-400'
          }`}>
            <div className={`w-2 h-2 rounded-full ${phase === 'speaking' ? 'bg-indigo-500 animate-pulse' : phase === 'listening' ? 'bg-red-500 animate-pulse' : 'bg-slate-500'}`}></div>
            <span className="text-xs font-black tracking-[0.2em] uppercase">
              {phase === 'speaking' ? 'TRIBUNAL HABLANDO' :
               phase === 'listening' ? 'ESCUCHANDO...' : 'PERFILANDO PSICOLOGÍA'}
            </span>
          </div>

          <div className="relative">
            <div className={`absolute inset-0 rounded-full border-2 border-current transition-all duration-1000 ${
              phase === 'speaking' ? 'text-indigo-600 scale-150 opacity-100' :
              phase === 'listening' ? 'text-red-600 scale-125 opacity-100' : 'scale-100 opacity-0'
            }`}></div>

            <div className={`w-48 h-48 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl ${
              phase === 'speaking' ? 'bg-indigo-600 shadow-indigo-600/50 scale-110' :
              phase === 'listening' ? 'bg-red-600 shadow-red-600/50 scale-100' :
              'bg-white shadow-white/20 scale-90'
            }`}>
              {phase === 'speaking' && <Volume2 size={64} className="text-white animate-pulse" />}
              {phase === 'listening' && <Mic size={64} className="text-white animate-bounce" />}
              {phase === 'processing' && <BrainCircuit size={64} className="text-black animate-pulse" />}
            </div>
          </div>

          <div className="mt-16 text-center h-24 px-6 w-full">
            <p className={`text-2xl md:text-3xl font-light leading-relaxed transition-all duration-300 ${
              phase === 'listening' ? 'text-white blur-0' : 'text-slate-500 blur-[0.5px]'
            }`}>
              {transcript ? `«${transcript}»` : phase === 'listening' ? '…' : ''}
            </p>
          </div>

          <div className="mt-8 flex flex-col items-center gap-3">
            <button
              onClick={handleFinish}
              disabled={!puedeEvaluar}
              className="px-6 py-3 rounded-xl bg-white text-black font-black uppercase tracking-widest text-xs hover:scale-105 transition-transform disabled:opacity-30 disabled:hover:scale-100 flex items-center gap-2"
            >
              <FileText size={14} /> Finalizar y ver informe
            </button>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest h-4">
              {puedeEvaluar
                ? `${respuestas} respuestas registradas`
                : `Faltan ${MIN_TURNS_FOR_REPORT - respuestas} respuestas para el informe`}
            </p>

            <button
              onClick={() => { finishedRef.current = true; window.speechSynthesis.cancel(); recognitionRef.current?.abort(); onExit(); }}
              className="mt-4 px-6 py-2 rounded-xl border border-white/10 hover:bg-white/10 text-slate-500 hover:text-white transition-all flex items-center gap-3 uppercase tracking-widest text-[10px] font-bold"
            >
              <LogOut size={14} /> Abandonar sin informe
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Mic, LogOut, Volume2, Activity, AlertTriangle, 
  Wifi, Loader2, BrainCircuit, VolumeX 
} from 'lucide-react';
import { processInterviewTurn } from '@/actions';

type InterviewPhase = 'intro' | 'speaking' | 'listening' | 'processing' | 'error';

interface InterviewRoomProps {
  user: any;
  onExit: () => void;
}

export default function InterviewRoom({ user, onExit }: InterviewRoomProps) {
  const [phase, setPhase] = useState<InterviewPhase>('intro');
  const [transcript, setTranscript] = useState('');
  const [history, setHistory] = useState<{ role: string; text: string }[]>([]);
  const [voicesLoaded, setVoicesLoaded] = useState(false);

  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. CARGA DE VOCES
  useEffect(() => {
    const loadVoices = () => {
      const vs = window.speechSynthesis.getVoices();
      if (vs.length > 0) setVoicesLoaded(true);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    // Fallback por si tarda
    const interval = setInterval(() => {
        if (window.speechSynthesis.getVoices().length > 0) {
            setVoicesLoaded(true);
            clearInterval(interval);
        }
    }, 500);

    return () => {
      clearInterval(interval);
      window.speechSynthesis.cancel();
      if (recognitionRef.current) recognitionRef.current.abort();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  // 2. TTS (HABLAR) - Versión Robusta
  const speak = useCallback((text: string) => {
    window.speechSynthesis.cancel();
    setPhase('speaking');

    const utterance = new SpeechSynthesisUtterance(text);
    synthesisRef.current = utterance;

    // Intentamos buscar una voz en español, si no, dejamos la default
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.includes('es-ES')) || 
                  voices.find(v => v.lang.includes('es'));
    
    if (voice) utterance.voice = voice;

    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onend = () => {
        // Pequeña pausa dramática antes de escuchar
        setTimeout(() => startListening(), 400);
    };

    utterance.onerror = () => {
        // Si falla el audio, avanzamos igual para no bloquear
        setTimeout(() => startListening(), 1000);
    };

    // Hack para despertar al motor de audio
    setTimeout(() => {
        window.speechSynthesis.speak(utterance);
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    }, 50);

  }, []);

  // 3. STT (ESCUCHAR)
  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) {
        alert("Navegador no compatible. Usa Chrome.");
        return;
    }

    if (recognitionRef.current) recognitionRef.current.abort();

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'es-ES';

    recognition.onstart = () => {
        setPhase('listening');
        setTranscript("");
    };

    recognition.onresult = (event: any) => {
        const t = event.results[0][0].transcript;
        setTranscript(t);
        
        // Reiniciar el timer de silencio
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        
        // Si el usuario deja de hablar 1.5s, asumimos que ha terminado
        silenceTimerRef.current = setTimeout(() => {
            recognition.stop();
        }, 1500);
    };

    recognition.onend = () => {
        // La lógica de envío se maneja en el watcher del transcript o manual
    };
    
    // Auto-reinicio si hubo error de no-speech (ruido)
    recognition.onerror = (e: any) => {
        if (e.error === 'no-speech') {
             speak("No le he escuchado. Repita.");
        }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  // 4. PROCESAR RESPUESTA (CEREBRO)
  const handleUserResponse = async (text: string) => {
      setPhase('processing');
      
      try {
          const newHistory = [...history, { role: 'user', text }];
          setHistory(newHistory);

          const res = await processInterviewTurn(newHistory, text);
          
          if (res.success && res.response) {
              setHistory(prev => [...prev, { role: 'ai', text: res.response }]);
              speak(res.response);
          } else {
              speak("Fallo de comunicaciones. Repita.");
          }
      } catch (e) {
          speak("Error del sistema.");
      }
  };

  // Watcher para enviar cuando el micro se detiene y tenemos texto
  useEffect(() => {
      if (recognitionRef.current) {
          recognitionRef.current.onend = () => {
              if (transcript.length > 1) {
                  handleUserResponse(transcript);
              }
          };
      }
  }, [transcript]);

  // 5. INICIO
  const handleStartButton = () => {
      // Truco para desbloquear el audio en iOS/Chrome
      const silent = new SpeechSynthesisUtterance("");
      window.speechSynthesis.speak(silent);

      speak("Tome asiento. Soy el Inspector Jefe. He estado revisando su expediente. ¿Por qué cree que debería ser Policía Nacional?");
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center font-sans text-white select-none">
      
      {/* FONDO */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_transparent_0%,_#000000_90%)] z-0"></div>
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#4f46e5 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
      </div>

      {/* FASE 1: BOTÓN DE INICIO */}
      {phase === 'intro' && (
        <div className="relative z-10 text-center space-y-10 animate-in zoom-in duration-500">
            <div className="w-24 h-24 bg-red-600 rounded-full flex items-center justify-center mx-auto shadow-[0_0_50px_red] animate-pulse">
                <Mic size={40} />
            </div>
            <div className="space-y-2">
                <h1 className="text-4xl font-black tracking-tight">SALA DE INTERROGATORIOS</h1>
                <p className="text-slate-400 max-w-md mx-auto text-sm uppercase tracking-widest">
                    Simulación de estrés nivel 4
                </p>
            </div>
            
            <button 
                onClick={handleStartButton}
                disabled={!voicesLoaded}
                className="group relative px-8 py-4 bg-white hover:bg-slate-200 text-black rounded-full font-bold text-lg tracking-wide transition-all hover:scale-105 disabled:opacity-50 overflow-hidden"
            >
                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-slate-300 to-transparent -translate-x-full group-hover:animate-shimmer"></div>
                <span className="relative flex items-center gap-3">
                   {voicesLoaded ? <Wifi size={20}/> : <Loader2 className="animate-spin" size={20}/>}
                   {voicesLoaded ? 'INICIAR SIMULACIÓN' : 'SINTONIZANDO...'}
                </span>
            </button>
        </div>
      )}

      {/* FASE 2: INTERFAZ ACTIVA */}
      {phase !== 'intro' && (
        <div className="relative z-10 flex flex-col items-center w-full max-w-2xl">
            
            {/* STATUS BADGE */}
            <div className={`mb-16 px-6 py-2 rounded-full border backdrop-blur-md flex items-center gap-3 transition-colors duration-500 ${
                phase === 'speaking' ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400' :
                phase === 'listening' ? 'bg-red-500/10 border-red-500 text-red-500' :
                'bg-slate-800/50 border-slate-700 text-slate-400'
            }`}>
                <div className={`w-2 h-2 rounded-full ${phase === 'speaking' ? 'bg-indigo-500 animate-pulse' : phase === 'listening' ? 'bg-red-500 animate-pulse' : 'bg-slate-500'}`}></div>
                <span className="text-xs font-black tracking-[0.2em] uppercase">
                    {phase === 'speaking' ? 'TRIBUNAL HABLANDO' : 
                     phase === 'listening' ? 'ESCUCHANDO...' : 
                     phase === 'processing' ? 'PERFILANDO PSICOLOGÍA' : 'EN ESPERA'}
                </span>
            </div>

            {/* ORBE CENTRAL ANIMADO */}
            <div className="relative">
                {/* Ondas */}
                <div className={`absolute inset-0 rounded-full border-2 border-current transition-all duration-1000 ${
                    phase === 'speaking' ? 'text-indigo-600 scale-150 opacity-100' : 
                    phase === 'listening' ? 'text-red-600 scale-125 opacity-100' : 'scale-100 opacity-0'
                }`}></div>

                <div className={`w-48 h-48 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl ${
                    phase === 'speaking' ? 'bg-indigo-600 shadow-indigo-600/50 scale-110' :
                    phase === 'listening' ? 'bg-red-600 shadow-red-600/50 scale-100' :
                    phase === 'processing' ? 'bg-white shadow-white/20 scale-90' :
                    'bg-slate-800'
                }`}>
                    {phase === 'speaking' && <Volume2 size={64} className="text-white animate-pulse"/>}
                    {phase === 'listening' && <Mic size={64} className="text-white animate-bounce"/>}
                    {phase === 'processing' && <BrainCircuit size={64} className="text-black animate-pulse"/>}
                </div>
            </div>

            {/* TRANSCRIPCIÓN */}
            <div className="mt-16 text-center h-24 px-6 w-full">
                <p className={`text-2xl md:text-3xl font-light leading-relaxed transition-all duration-300 ${
                    phase === 'listening' ? 'text-white blur-0' : 'text-slate-500 blur-[0.5px]'
                }`}>
                    "{transcript || (phase === 'listening' ? "..." : "")}"
                </p>
            </div>

            {/* BOTÓN SALIDA */}
            <button 
                onClick={() => { window.speechSynthesis.cancel(); onExit(); }} 
                className="mt-12 px-6 py-3 rounded-xl border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white transition-all flex items-center gap-3 uppercase tracking-widest text-xs font-bold"
            >
                <LogOut size={16}/> Finalizar Sesión
            </button>
        </div>
      )}
    </div>
  );
}
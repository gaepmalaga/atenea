'use client';

import { useState, useRef, useEffect } from 'react';
import type { AuthUser } from '@/app/lib/auth';
import {
  Send, Bot, User, FileText,
  Loader2, ShieldAlert, Target, Cpu
} from 'lucide-react';
import { askAtenea, getStudentSubjects } from '@/actions';
import type { ChatTurn } from '@/app/lib/chat';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Modal, Button } from '../../../ui';

interface IntelChatProps { user: AuthUser; }

type Message = {
  role: 'ai' | 'user';
  content: string;
  sources?: Array<{ filename: string; content_chunk: string; reference?: string | null }>;
  isError?: boolean;
  /** Banner de bienvenida: se pinta, pero no es parte de la conversación. */
  isSystem?: boolean;
  timestamp: Date;
};

export default function IntelChat({ user }: IntelChatProps) {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'ai', 
      content: '# SISTEMA ATENEA INTEL\nConexión segura establecida. Base legislativa sincronizada. Esperando entrada de datos para análisis táctico.',
      isSystem: true,
      timestamp: new Date() 
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [activeSource, setActiveSource] = useState<{ filename: string; content_chunk: string; reference?: string | null } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * El tema sobre el que se pregunta. Vacío = todo el temario.
   *
   * No es un filtro cosmético: elegir tema hace que se mande ESE documento
   * entero y que no haya que adivinar cuál. Adivinar ya fallaba con tres
   * documentos —"¿qué artículos comprende el Título I de la Constitución?"
   * escogía la Ley de Fuerzas y Cuerpos de Seguridad— y con 85 temas fallaría
   * a diario.
   */
  const [subjectId, setSubjectId] = useState<number | ''>('');
  const [subjects, setSubjects] = useState<{ id: number; title: string }[]>([]);

  useEffect(() => {
    let vivo = true;
    getStudentSubjects().then((res) => {
      if (vivo && res.success) setSubjects(res.subjects);
    });
    return () => { vivo = false; };
  }, []);

  useEffect(() => { 
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [messages, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    const userText = query.trim();
    setQuery('');
    setMessages(prev => [...prev, { role: 'user', content: userText, timestamp: new Date() }]);
    setLoading(true);

    try {
      // El historial viaja al servidor para que ATENEA entienda las
      // repreguntas ("¿y en ese caso?") y para que la BÚSQUEDA en el temario
      // sepa de qué se está hablando. Se toma antes de añadir el turno actual.
      const history: ChatTurn[] = messages
        .filter(m => !m.isError && !m.isSystem)
        .map(m => ({ role: m.role, content: m.content }));

      const res = await askAtenea(userText, history, subjectId === '' ? null : subjectId);
      setLoading(false);
      if (res.success) {
        // Limpiamos etiquetas <br> que la IA pueda inyectar por error
        const cleanAnswer = res.answer?.replace(/<br\s*\/?>/gi, '\n') || '';
        setMessages(prev => [...prev, { 
            role: 'ai', 
            content: cleanAnswer, 
            sources: res.sources, 
            timestamp: new Date() 
        }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', content: `⚠️ ERROR DE PROTOCOLO: ${res.error}`, isError: true, timestamp: new Date() }]);
      }
    } catch (error) {
      console.error('askAtenea:', error);
      setLoading(false);
      setMessages(prev => [...prev, { role: 'ai', content: "🚨 FALLO CRÍTICO DE TRANSMISIÓN.", isError: true, timestamp: new Date() }]);
    }
  };

  // `100vh` en un navegador movil es la altura CON la barra de direcciones
  // plegada: al cargar (barra visible) el chat se pasaba de alto y el input
  // quedaba fuera de la pantalla hasta hacer scroll. `100dvh` (dynamic
  // viewport height) se ajusta cuando la barra aparece/desaparece, que es
  // exactamente el caso de un chat con teclado en pantalla.
  return (
    <div className="flex flex-col h-[calc(100dvh-140px)] md:h-[calc(100dvh-160px)] max-w-6xl mx-auto font-sans">
      
      {/* HEADER TÁCTICO */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-x border-t border-slate-800 rounded-t-[2rem]">
          <div className="flex items-center gap-3">
              <div className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Cpu size={12} className="text-indigo-500"/> Atenea Intel v3.0
              </span>
          </div>
          <div className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-lg text-[10px] font-mono text-indigo-400">
                USR_{user.id?.substring(0,6).toUpperCase() || 'ROOT'}
          </div>
      </div>

      {/* ÁREA DE CHAT */}
      {/*
        `p-8` en cada burbuja + `space-y-10` entre mensajes estaban pensados
        para escritorio: en un movil de 360-400px, con la burbuja ya
        limitada a `max-w-[85%]` y el avatar restando otros 48px, ese
        relleno se comia la mayor parte del ancho util para el texto.
      */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-10 py-6 sm:py-10 space-y-6 sm:space-y-10 scrollbar-hide border-x border-slate-800 bg-white dark:bg-slate-950">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 sm:gap-6 animate-in fade-in slide-in-from-bottom-5 duration-500 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>

            <div className={`w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex-shrink-0 flex items-center justify-center shadow-lg ${
                m.role === 'ai' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
            }`}>
                {m.role === 'ai' ? <Bot size={18} className="sm:hidden"/> : <User size={18} className="sm:hidden"/>}
                {m.role === 'ai' ? <Bot size={24} className="hidden sm:block"/> : <User size={24} className="hidden sm:block"/>}
            </div>

            <div className={`max-w-[85%] md:max-w-[80%] space-y-2 ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                <div className={`p-4 sm:p-8 rounded-2xl sm:rounded-3xl shadow-sm relative overflow-hidden ${
                    m.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-none'
                        : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none'
                }`}>
                    
                    {/* RENDERIZADO MARKDOWN LIMPIO */}
                    <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none 
                        prose-p:leading-relaxed prose-p:text-slate-600 dark:prose-p:text-slate-300
                        prose-strong:text-indigo-600 dark:prose-strong:text-indigo-400 prose-strong:font-black
                        prose-table:w-full prose-table:my-6 prose-table:border-collapse
                        prose-th:bg-slate-100 dark:prose-th:bg-slate-800 prose-th:p-3 prose-th:text-[10px] prose-th:uppercase prose-th:tracking-widest prose-th:border prose-th:border-slate-200 dark:prose-th:border-slate-700
                        prose-td:p-3 prose-td:border prose-td:border-slate-100 dark:prose-td:border-slate-800 prose-td:text-sm">
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            // Detección visual de "FOCO EXAMEN"
                            strong: ({ ...props }) => {
                              if (props.children?.toString().includes("🎯 FOCO EXAMEN")) {
                                return (
                                  <span className="block my-6 p-6 bg-amber-50 dark:bg-amber-900/10 border-l-4 border-amber-500 rounded-r-2xl">
                                    <span className="flex items-center gap-2 text-amber-600 dark:text-amber-500 text-sm font-black uppercase tracking-tighter mb-2">
                                      <ShieldAlert size={18}/> Alerta de Tribunal
                                    </span>
                                    <span className="text-slate-700 dark:text-slate-200 font-bold italic">{props.children}</span>
                                  </span>
                                )
                              }
                              return <strong {...props} />
                            }
                          }}
                        >
                            {m.content}
                        </ReactMarkdown>
                    </div>

                    {/* FUENTES */}
                    {m.sources && m.sources.length > 0 && (
                        <div className="mt-4 sm:mt-8 pt-4 sm:pt-8 border-t border-slate-200 dark:border-slate-800">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                                <Target size={14} className="text-indigo-500" /> Evidencia Documental
                            </span>
                            <div className="flex flex-wrap gap-2">
                                {m.sources.map((s, idx) => (
                                    <button 
                                        key={idx} 
                                        onClick={() => setActiveSource(s)}
                                        className="px-3 py-1.5 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 text-[10px] font-black rounded-xl border border-indigo-100 dark:border-indigo-900/50 flex items-center gap-2 hover:scale-105 transition-all"
                                    >
                                        {/* El articulo por delante: es lo que le dice al opositor que releer. */}
                                        <FileText size={12}/> {s.reference?.trim() || s.filename}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-2">
                    {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
            </div>
          </div>
        ))}
        {loading && (
            <div className="flex gap-6 animate-pulse">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white"><Bot size={24} /></div>
                <div className="bg-slate-100 dark:bg-slate-900 p-5 rounded-3xl rounded-tl-none border border-slate-200 dark:border-slate-800 flex items-center gap-3">
                    <Loader2 size={18} className="animate-spin text-indigo-500" />
                    <span className="text-xs font-black text-indigo-500 uppercase tracking-widest">Analizando...</span>
                </div>
            </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* INPUT */}
      <div className="p-4 sm:p-8 bg-slate-50 dark:bg-slate-900 border-x border-b border-slate-200 dark:border-slate-800 rounded-b-[1.5rem] sm:rounded-b-[2.5rem] shadow-xl">
        <form onSubmit={handleSubmit} className="max-w-5xl mx-auto space-y-3">
            {/* Elegir tema es lo que quita la adivinación: se manda ese
                documento entero y no el que más se le parezca a la frase. */}
            {subjects.length > 0 && (
                <div className="flex items-center gap-2 px-2">
                    <label htmlFor="tema-chat" className="text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0">
                        Tema
                    </label>
                    <select
                        id="tema-chat"
                        value={subjectId}
                        onChange={(e) => setSubjectId(e.target.value ? Number(e.target.value) : '')}
                        className="flex-1 min-w-0 bg-transparent text-xs font-medium text-slate-600 dark:text-slate-300 outline-none cursor-pointer truncate"
                    >
                        <option value="">Todo el temario (lo busco yo)</option>
                        {subjects.map((s) => (
                            <option key={s.id} value={s.id}>{s.title}</option>
                        ))}
                    </select>
                </div>
            )}

          <div className="relative">
            <input 
                value={query} 
                onChange={e => setQuery(e.target.value)} 
                placeholder="Introduzca consulta..."
                className="w-full pl-4 sm:pl-6 pr-14 sm:pr-16 py-4 sm:py-5 bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition-all shadow-inner"
                disabled={loading}
            />
            <button 
                type="submit" 
                disabled={loading || !query.trim()} 
                className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-500 active:scale-95 transition-all shadow-lg"
            >
                <Send size={24}/>
            </button>
          </div>
        </form>
      </div>

      {/* MODAL FUENTE */}
      {/* El visor de la fuente citada. Era el cuarto modal escrito a mano de la
          aplicación, y como los otros tres usaba `max-h-[85vh]`: en un móvil,
          `vh` es la altura con la barra de direcciones plegada, así que al
          abrirlo el pie se quedaba fuera de la pantalla. El primitivo usa
          `dvh` y en móvil se apoya abajo, donde llega el pulgar. */}
      {activeSource && (
        <Modal
          accent
          width="lg"
          title={activeSource.reference?.trim() || activeSource.filename}
          subtitle={activeSource.reference?.trim() ? activeSource.filename : 'Consulta legislativa'}
          onClose={() => setActiveSource(null)}
          footer={
            <Button block variant="secondary" onClick={() => setActiveSource(null)}>
              Cerrar visor
            </Button>
          }
        >
          <blockquote className="bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-base sm:text-lg leading-relaxed italic">
            “{activeSource.content_chunk}”
          </blockquote>
        </Modal>
      )}
    </div>
  );
}
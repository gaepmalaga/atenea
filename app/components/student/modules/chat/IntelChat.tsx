'use client';

import { useState, useRef, useEffect } from 'react';
import type { AuthUser } from '@/app/lib/auth';
import {
  Send, Bot, User, FileText, X, BookOpen,
  Loader2, ShieldAlert, Target, Cpu
} from 'lucide-react';
import { askAtenea } from '@/actions';
import type { ChatTurn } from '@/app/lib/chat';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

      const res = await askAtenea(userText, history);
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

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-160px)] max-w-6xl mx-auto font-sans">
      
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
      <div className="flex-1 overflow-y-auto px-4 md:px-10 py-10 space-y-10 scrollbar-hide border-x border-slate-800 bg-white dark:bg-slate-950">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-6 animate-in fade-in slide-in-from-bottom-5 duration-500 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            
            <div className={`w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center shadow-lg ${
                m.role === 'ai' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
            }`}>
                {m.role === 'ai' ? <Bot size={24} /> : <User size={24} />}
            </div>

            <div className={`max-w-[85%] md:max-w-[80%] space-y-2 ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                <div className={`p-8 rounded-[2.5rem] shadow-sm relative overflow-hidden ${
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
                        <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-800">
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
                <div className="bg-slate-100 dark:bg-slate-900 p-5 rounded-[2.5rem] rounded-tl-none border border-slate-200 dark:border-slate-800 flex items-center gap-3">
                    <Loader2 size={18} className="animate-spin text-indigo-500" />
                    <span className="text-xs font-black text-indigo-500 uppercase tracking-widest">Analizando...</span>
                </div>
            </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* INPUT */}
      <div className="p-8 bg-slate-50 dark:bg-slate-900 border-x border-b border-slate-200 dark:border-slate-800 rounded-b-[2.5rem] shadow-xl">
        <form onSubmit={handleSubmit} className="relative max-w-5xl mx-auto">
            <input 
                value={query} 
                onChange={e => setQuery(e.target.value)} 
                placeholder="Introduzca consulta..." 
                className="w-full pl-6 pr-16 py-5 bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 rounded-[1.5rem] text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition-all shadow-inner"
                disabled={loading}
            />
            <button 
                type="submit" 
                disabled={loading || !query.trim()} 
                className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-500 active:scale-95 transition-all shadow-lg"
            >
                <Send size={24}/>
            </button>
        </form>
      </div>

      {/* MODAL FUENTE */}
      {activeSource && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white dark:bg-[#020617] w-full max-w-4xl rounded-[3rem] shadow-2xl border border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
                <div className="p-8 bg-indigo-600 text-white flex justify-between items-center">
                    <div className="flex items-center gap-5">
                        <BookOpen size={30}/>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Consulta Legislativa</p>
                            <h4 className="text-2xl font-black">{activeSource.reference?.trim() || activeSource.filename}</h4>
                            {activeSource.reference?.trim() && (
                                <p className="text-[10px] font-bold opacity-70 mt-1">{activeSource.filename}</p>
                            )}
                        </div>
                    </div>
                    <button onClick={() => setActiveSource(null)} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={28}/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-10 bg-slate-50 dark:bg-slate-950/50">
                    <div className="bg-white dark:bg-slate-900 p-10 rounded-[2rem] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-lg md:text-xl leading-relaxed italic shadow-inner">
                        “{activeSource.content_chunk}”
                    </div>
                </div>
                <div className="p-8 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-center">
                    <button onClick={() => setActiveSource(null)} className="px-12 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95">Cerrar Visor</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
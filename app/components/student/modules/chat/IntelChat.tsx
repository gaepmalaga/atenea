'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  Send, Bot, User, FileText, ChevronRight, 
  Search, AlertCircle, Copy 
} from 'lucide-react';
import { askAtenea } from '../../../../actions';

interface IntelChatProps {
  user: any;
}

type Message = {
  role: 'ai' | 'user';
  content: string;
  sources?: any[];
  isError?: boolean;
};

export default function IntelChat({ user }: IntelChatProps) {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', content: 'SISTEMA INTEL ONLINE.\nConectado a la Base Legislativa Oficial.\nEsperando órdenes...' }
  ]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al recibir mensajes
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    const userText = query.trim();
    setQuery('');
    
    // 1. Añadir mensaje usuario
    setMessages(prev => [...prev, { role: 'user', content: userText }]);
    setLoading(true);

    try {
      // 2. Llamada al Server Action (RAG)
      const res = await askAtenea(userText);
      
      setLoading(false);
      
      if (res.success) {
        setMessages(prev => [...prev, { 
            role: 'ai', 
            content: res.answer || '', 
            sources: res.sources 
        }]);
      } else {
        setMessages(prev => [...prev, { 
            role: 'ai', 
            content: `Error de Sistema: ${res.error}`,
            isError: true 
        }]);
      }

    } catch (error) {
      setLoading(false);
      setMessages(prev => [...prev, { 
          role: 'ai', 
          content: "Fallo crítico de conexión. Inténtelo de nuevo.",
          isError: true
      }]);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-160px)] max-w-5xl mx-auto">
      
      {/* 1. ÁREA DE CHAT (SCROLLABLE) */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 scrollbar-hide">
        {messages.map((m, i) => (
          <div 
            key={i} 
            className={`flex gap-4 animate-in slide-in-from-bottom-2 duration-300 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {/* AVATAR IA */}
            {m.role === 'ai' && (
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex-shrink-0 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
                <Bot size={20} />
              </div>
            )}

            {/* BURBUJA DE MENSAJE */}
            <div className={`max-w-[85%] md:max-w-[75%] p-5 rounded-2xl shadow-sm relative group ${
                m.role === 'user' 
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-tr-none' 
                : m.isError 
                    ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-600 rounded-tl-none'
                    : 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-tl-none'
            }`}>
                {/* Texto del mensaje (Markdown simple) */}
                <div className="whitespace-pre-wrap text-sm md:text-base leading-relaxed font-medium">
                    {m.content}
                </div>

                {/* FUENTES (CITAS) */}
                {m.sources && m.sources.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                            <Search size={10} /> Fuentes Oficiales
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {m.sources.map((s, idx) => (
                                <span 
                                    key={idx} 
                                    className="px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 text-[10px] font-bold rounded border border-indigo-100 dark:border-indigo-500/20 flex items-center gap-1"
                                    title={s.content} // Tooltip simple con el contenido
                                >
                                    <FileText size={10}/> 
                                    {s.article_ref.split(' - ')[0]} 
                                    {/* Muestra solo la parte relevante del nombre si es muy largo */}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* AVATAR USUARIO */}
            {m.role === 'user' && (
              <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700 flex-shrink-0 flex items-center justify-center text-slate-500 dark:text-slate-300">
                <User size={20} />
              </div>
            )}
          </div>
        ))}

        {/* INDICADOR DE CARGA (Thinking) */}
        {loading && (
            <div className="flex gap-4 animate-in fade-in duration-300">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex-shrink-0 flex items-center justify-center text-white">
                    <Bot size={20} />
                </div>
                <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 rounded-2xl rounded-tl-none flex items-center gap-3">
                    <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                    </div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider animate-pulse">Consultando Legislación...</span>
                </div>
            </div>
        )}
        
        {/* Ancla para scroll */}
        <div ref={scrollRef} />
      </div>

      {/* 2. ÁREA DE INPUT (TERMINAL) */}
      <div className="p-4 md:p-6 bg-slate-50/50 dark:bg-slate-950/50 backdrop-blur-sm border-t border-slate-200 dark:border-slate-800 rounded-b-3xl">
        <form onSubmit={handleSubmit} className="relative max-w-4xl mx-auto group">
            
            <input 
                value={query} 
                onChange={e => setQuery(e.target.value)} 
                placeholder="Pregunta sobre Artículos, Plazos o Procedimientos..." 
                className="w-full pl-6 pr-14 py-4 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl text-sm md:text-base outline-none focus:border-indigo-500 dark:focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all text-slate-900 dark:text-white shadow-sm placeholder:text-slate-400"
                disabled={loading}
            />
            
            <button 
                type="submit" 
                disabled={loading || !query.trim()} 
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors shadow-md shadow-indigo-500/20"
            >
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Send size={20}/>}
            </button>

            {/* Hint visual */}
            <div className="absolute -top-6 left-2 flex items-center gap-2 opacity-0 group-focus-within:opacity-100 transition-opacity duration-500">
                <div className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 text-[10px] font-bold rounded uppercase tracking-wider">
                    TIP
                </div>
                <span className="text-[10px] text-slate-400">Sé preciso con el artículo si lo conoces.</span>
            </div>
        </form>
      </div>
    </div>
  );
}

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
import { Modal, Button, useAltoDisponible } from '../../../ui';

interface IntelChatProps { user: AuthUser; }

/** Donde vive la conversacion mientras dura la sesion del navegador. */
const CLAVE_CONVERSACION = 'atenea:chat-en-curso';

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
  /** El contenedor que hace scroll. NO la ventana: ver el efecto de abajo. */
  const listaRef = useRef<HTMLDivElement>(null);
  /**
   * El chat ocupa lo que queda de pantalla, MEDIDO, no calculado a ojo.
   * Ver `useAltoDisponible`: el numero que habia aqui estaba 22px corto y
   * dejaba el recuadro de escribir por debajo de la barra de pestañas.
   */
  const marcoRef = useRef<HTMLDivElement>(null);
  const alto = useAltoDisponible(marcoRef);

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

  /**
   * Bajar al ultimo mensaje, SOLO dentro de la conversacion.
   *
   * Antes era `scrollRef.current?.scrollIntoView(...)`, y `scrollIntoView`
   * desplaza TODOS los contenedores con scroll que tenga por encima, la
   * ventana incluida. Efecto real: al entrar en el chat, o al recibir una
   * respuesta, la pagina entera se iba al fondo — parte del "siempre me lleva
   * al final de la pagina". Moviendo `scrollTop` del contenedor, la ventana no
   * se entera.
   */
  useEffect(() => {
    const lista = listaRef.current;
    if (!lista) return;
    lista.scrollTo({ top: lista.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  /**
   * La conversacion sobrevive a cambiar de pestaña.
   *
   * `StudentDashboard` monta cada modulo con `{activeTab === 'chat' && ...}`,
   * asi que salir del chat DESMONTA el componente y se llevaba la conversacion
   * entera: preguntabas algo, ibas a mirar el temario, volvias y no habia
   * nada. `sessionStorage` y no `localStorage`: es una conversacion de trabajo,
   * no un historial que deba quedarse en el movil para siempre.
   */
  useEffect(() => {
    try {
      const guardado = window.sessionStorage.getItem(CLAVE_CONVERSACION);
      if (!guardado) return;
      const datos: unknown = JSON.parse(guardado);
      if (!Array.isArray(datos) || datos.length === 0) return;
      setMessages(
        datos
          .filter((m): m is Message & { timestamp: string } =>
            typeof m === 'object' && m !== null && 'role' in m && 'content' in m)
          .map((m) => ({ ...m, timestamp: new Date(m.timestamp) })),
      );
    } catch {
      // JSON corrupto o almacenamiento bloqueado: se sigue con el saludo. No
      // poder recuperar la conversacion no puede impedir usar el chat.
    }
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(CLAVE_CONVERSACION, JSON.stringify(messages));
    } catch { /* ver arriba */ }
  }, [messages]);

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

  // El alto sale de `useAltoDisponible`: se mide el hueco real entre donde
  // empieza el chat y donde empieza la barra de pestañas. Mientras no se ha
  // medido se usa `100dvh` menos un margen generoso — pasarse de corto un
  // instante es preferible a pintar el recuadro de escribir fuera de la
  // pantalla, que es lo que hacia el numero fijo de antes.
  return (
    <div
      ref={marcoRef}
      style={alto === null ? undefined : { height: alto }}
      className="flex flex-col h-[calc(100dvh-220px)] max-w-6xl mx-auto font-sans"
    >
      
      {/* HEADER TÁCTICO */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-x border-t border-slate-800 rounded-t-[2rem]">
          <div className="flex items-center gap-3">
              <div className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </div>
              <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
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
      <div ref={listaRef} className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-10 py-6 sm:py-10 space-y-6 sm:space-y-10 scrollbar-hide border-x border-slate-800 bg-white dark:bg-slate-950">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 sm:gap-6 animate-in fade-in slide-in-from-bottom-5 duration-500 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>

            {/* El avatar solo desde `sm`. En un movil costaba 48px (icono + hueco)
                de los 390 que hay, y no aportaba nada que no diga ya la propia
                burbuja: la del alumno va a la derecha y en indigo, la de ATENEA
                a la izquierda y en claro. Medido: el texto pasa de 248px de
                ancho a ~280, de ~30 caracteres por linea a ~34. En una
                respuesta larga eso es bastante menos scroll. */}
            <div className={`hidden sm:flex w-12 h-12 rounded-2xl flex-shrink-0 items-center justify-center shadow-lg ${
                m.role === 'ai' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}>
                {m.role === 'ai' ? <Bot size={24}/> : <User size={24}/>}
            </div>

            <div className={`max-w-[92%] sm:max-w-[85%] md:max-w-[80%] min-w-0 space-y-2 ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                <div className={`p-3.5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-sm relative overflow-hidden ${
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
                            // LA TABLA VA DENTRO DE UNA CAJA QUE SE ARRASTRA.
                            // Sin esto, un cuadro comparativo de tres columnas
                            // se corta por la derecha en un movil y se pierde
                            // justo la columna que se queria comparar: se veia
                            // "Caracteristica | Proyecto de Ley | Propo..." y
                            // ahi se acababa. `w-full` no arregla nada cuando
                            // el contenido no cabe; lo que hace falta es poder
                            // arrastrarla.
                            table: ({ ...props }) => (
                              <div className="my-6 -mx-1 overflow-x-auto overscroll-x-contain">
                                <table {...props} className="min-w-full w-max text-left" />
                              </div>
                            ),
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
                            <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
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
                <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-2">
                    {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
            </div>
          </div>
        ))}
        {loading && (
            <div className="flex gap-3 sm:gap-6 animate-pulse">
                <div className="hidden sm:flex w-12 h-12 rounded-2xl bg-indigo-600 items-center justify-center text-white"><Bot size={24} /></div>
                <div className="bg-slate-100 dark:bg-slate-900 p-5 rounded-3xl rounded-tl-none border border-slate-200 dark:border-slate-800 flex items-center gap-3">
                    <Loader2 size={18} className="animate-spin text-indigo-500" />
                    <span className="text-xs font-black text-indigo-500 uppercase tracking-widest">Analizando...</span>
                </div>
            </div>
        )}

      </div>

      {/* INPUT */}
      <div className="p-4 sm:p-8 bg-slate-50 dark:bg-slate-900 border-x border-b border-slate-200 dark:border-slate-800 rounded-b-[1.5rem] sm:rounded-b-[2.5rem] shadow-xl">
        <form onSubmit={handleSubmit} className="max-w-5xl mx-auto space-y-3">
            {/* Elegir tema es lo que quita la adivinación: se manda ese
                documento entero y no el que más se le parezca a la frase. */}
            {subjects.length > 0 && (
                <div className="flex items-center gap-2 px-2">
                    <label htmlFor="tema-chat" className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 shrink-0">
                        Tema
                    </label>
                    {/* 44px de alto: era un desplegable de 16px, el control mas
                        pequeño de la pantalla, y es el que decide QUE documento
                        entero se le manda al modelo. */}
                    <select
                        id="tema-chat"
                        value={subjectId}
                        onChange={(e) => setSubjectId(e.target.value ? Number(e.target.value) : '')}
                        className="flex-1 min-w-0 min-h-[44px] bg-transparent text-sm font-medium text-slate-600 dark:text-slate-300 outline-none cursor-pointer truncate"
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
                /* `pr-20`, no `pr-14`. El boton de enviar mide 48px (p-3 +
                   icono de 24) y va a 12px del borde: ocupa los 60px de la
                   derecha. El hueco reservado eran 56, asi que las ultimas
                   letras de lo que se escribia pasaban POR DEBAJO de la
                   flecha. Ahora son 80px: los 60 del boton y 20 de aire, para
                   que el cursor tampoco toque el icono. */
                className="w-full pl-4 sm:pl-6 pr-20 sm:pr-24 py-4 sm:py-5 bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl text-base sm:text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition-all shadow-inner"
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
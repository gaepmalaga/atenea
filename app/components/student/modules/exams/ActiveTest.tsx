'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ChevronRight, CheckCircle2, XCircle, Brain,
  BookX, AlertTriangle, Eye, ArrowLeft, Clock, Layers,
  ThumbsUp, ThumbsDown, Flag, X, Send, MessageSquareWarning
} from 'lucide-react';
import { formatTime } from '@/app/lib/timer';
import { Question } from './ExamManager';
import { saveTestResult, setResultErrorType, voteQuestion, reportQuestion } from '@/actions';
import { countChange } from '@/app/lib/exam-results';

interface ActiveTestProps {
  questions: Question[];
  mode: 'practice' | 'exam';
  topicName: string;
  onFinish: (qs: Question[]) => void;
  onExit: () => void;
}

// Tipos de Reporte disponibles
const REPORT_TYPES = [
  { id: 'wrong_correct_answer', label: 'Respuesta Correcta Errónea' },
  { id: 'ambiguous_question', label: 'Pregunta Ambigua / Confusa' },
  { id: 'bad_explanation', label: 'Explicación Mala o Incompleta' },
  { id: 'out_of_syllabus', label: 'Fuera de Temario / Derogada' },
  { id: 'typo_or_format', label: 'Error Ortográfico / Formato' },
  { id: 'other', label: 'Otro' }
];

export default function ActiveTest({ questions, mode, topicName, onFinish, onExit }: ActiveTestProps) {
  const [localQuestions, setLocalQuestions] = useState<Question[]>(questions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [errorTagged, setErrorTagged] = useState(false); 

  // Métricas VIP (Tiempos y Dudas)
  const startTimeRef = useRef<number>(Date.now());
  // Un ref, no estado: se escribe y se lee dentro del mismo manejador. Con
  // `useState` el cierre devolvia el valor anterior, asi que en modo
  // entrenamiento se guardaba siempre 0 cambios.
  const optionChangesRef = useRef(0);
  // Id de la fila de `test_results` que guardo la respuesta actual. Etiquetar el
  // fallo actualiza ESA fila; antes se insertaba una segunda y cada error
  // etiquetado contaba doble en el porcentaje de acierto.
  const resultIdRef = useRef<string | null>(null);
  // El guardado en vuelo. Los botones de diagnóstico aparecen en cuanto se
  // marca la respuesta, mientras el insert sigue viajando: sin esperarlo, un
  // clic rápido leería `resultIdRef` a null y volvería a insertar.
  const savePromiseRef = useRef<Promise<{ success: boolean; id: string | null }> | null>(null);

  // --- CRONOMETRO DEL TEST ---
  // El tiempo se deriva de marcas de reloj; el intervalo solo decide cada
  // cuanto se repinta. Contar +1 por tick se desfasa con la pestania en
  // segundo plano y con el ahorro de bateria (regla 14).
  const testStartRef = useRef<number>(Date.now());
  const [ahora, setAhora] = useState<number>(Date.now());

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const segundosTest = Math.floor((ahora - testStartRef.current) / 1000);

  // Estados para Votos y Reportes
  const [votes, setVotes] = useState<Record<string, 'up' | 'down' | null>>({});
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportData, setReportData] = useState({ type: '', message: '' });
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  const currentQ = localQuestions[currentIndex];
  const isAnswered = !!currentQ.userAnswer;
  const isCorrect = currentQ.userAnswer === currentQ.correctOptionId;

  // Reiniciar cronómetro al cambiar de pregunta
  useEffect(() => {
      startTimeRef.current = Date.now();
      optionChangesRef.current = 0;
      resultIdRef.current = null;
      savePromiseRef.current = null;
  }, [currentIndex]);

  // --- MANEJO DE RESPUESTA ---
  const handleAnswer = useCallback(async (optionId: string) => {
    if (mode === 'practice' && isAnswered) return;

    // Solo cuenta como duda pasar a una opción DISTINTA habiendo marcado ya
    // una. Antes se sumaba en cada pulsación, así que se contaban respuestas,
    // no cambios, y la primera respuesta ya valía 1.
    if (countChange(currentQ.userAnswer, optionId)) {
        optionChangesRef.current += 1;
    }

    // Copia del objeto, no solo del array: la copia superficial mutaba la misma
    // pregunta que tiene el componente padre en su estado.
    const updated = localQuestions.map((q, i) =>
        i === currentIndex ? { ...q, userAnswer: optionId } : q
    );
    setLocalQuestions(updated);

    if (mode === 'practice') {
        const correct = optionId === currentQ.correctOptionId;
        setErrorTagged(correct);

        savePromiseRef.current = saveTestResult(
            topicName,
            currentQ.id,
            correct,
            {
                responseTimeMs: Date.now() - startTimeRef.current,
                optionChanges: optionChangesRef.current
            }
        );
        const saved = await savePromiseRef.current;
        resultIdRef.current = saved.id;
    }
  }, [currentIndex, currentQ, isAnswered, localQuestions, mode, topicName]);

  // --- MANEJO DE TAXONOMÍA DE ERROR ---
  const handleErrorTag = async (type: string) => {
      if (errorTagged) return;
      setLocalQuestions(prev => prev.map((q, i) =>
          i === currentIndex ? { ...q, errorType: type } : q
      ));
      setErrorTagged(true);
      
      // UNA fila por respuesta: se actualiza la que creó handleAnswer, no se
      // inserta otra. Solo se toca `error_type`; el tiempo y los cambios son
      // los de la respuesta, no los de esta pantalla de diagnóstico.
      // Esperamos al guardado de la respuesta antes de decidir si actualizar
      // o insertar. Sin esto, un clic rápido crearía la segunda fila.
      if (savePromiseRef.current) await savePromiseRef.current;
      const resultId = resultIdRef.current;

      if (resultId) {
          const res = await setResultErrorType(resultId, type);
          if (!res.success) console.error('No se pudo etiquetar el fallo:', res.error);
      } else {
          // El guardado de la respuesta falló, así que aquí no hay nada que
          // duplicar: se inserta la fila completa con la etiqueta incluida.
          const saved = await saveTestResult(topicName, currentQ.id, false, {
              errorType: type,
              responseTimeMs: Date.now() - startTimeRef.current,
              optionChanges: optionChangesRef.current,
          });
          resultIdRef.current = saved.id;
      }
  };

  // --- MANEJO DE VOTOS ---
  const handleVote = async (vote: 'up' | 'down') => {
    // Sin id no hay fila que votar: es una pregunta generada en vivo que no
    // llegó a guardarse. La variable local además deja claro al compilador que
    // ya está comprobado.
    const questionId = currentQ.id;
    if (!questionId) return;

    const currentVote = votes[questionId];
    const newVote = currentVote === vote ? null : vote;
    setVotes(prev => ({ ...prev, [questionId]: newVote }));

    await voteQuestion({
      questionId,
      vote: vote === 'up' ? 1 : -1
    });
  };

  // --- MANEJO DE REPORTES ---
  const submitReport = async () => {
    if (!reportData.type || !currentQ.id) return;
    setIsSubmittingReport(true);
    
    try {
      await reportQuestion({
        questionId: currentQ.id,
        reportType: reportData.type,
        message: reportData.message
      });
      setIsReportModalOpen(false);
      setReportData({ type: '', message: '' });
      alert("Reporte enviado. Gracias por ayudar a mejorar Atenea.");
    } catch {
      alert("Error enviando reporte.");
    } finally {
      setIsSubmittingReport(false);
    }
  };

const handleNext = useCallback(() => {
      // Empaquetamos las métricas de la pregunta actual antes de movernos.
      // `timeMs` y `changes` son campos del tipo Question, así que ya no hace
      // falta el @ts-ignore que ocultaba el desajuste con el servidor.
      const updated = localQuestions.map((q, i) =>
          i === currentIndex
              ? { ...q, timeMs: Date.now() - startTimeRef.current, changes: optionChangesRef.current }
              : q
      );
      setLocalQuestions(updated);

      if (currentIndex < localQuestions.length - 1) {
          setCurrentIndex(currentIndex + 1);
          setErrorTagged(false);
      } else {
          // 2. Enviamos el array completo con los datos de comportamiento incrustados
          onFinish(updated);
      }
  }, [currentIndex, localQuestions, onFinish]);

  // --- ATAJOS DE TECLADO ---
  // En un test de 100 preguntas ir a raton cansa. A/B/C o 1/2/3 responden,
  // Enter avanza.
  //
  // No dispara con el modal de reporte abierto ni escribiendo en un campo: si
  // no, teclear "la b esta mal" en el reporte marcaria la opcion B.
  const puedeAvanzar = mode === 'exam' || (isAnswered && (isCorrect || errorTagged));

  useEffect(() => {
    function alPulsar(e: KeyboardEvent) {
      if (isReportModalOpen) return;
      const dentroDeUnCampo = (e.target as HTMLElement)?.closest('input, textarea, [contenteditable]');
      if (dentroDeUnCampo) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'Enter') {
        if (puedeAvanzar) { e.preventDefault(); handleNext(); }
        return;
      }

      const tecla = e.key.toLowerCase();
      const porLetra = currentQ.options.findIndex((o) => o.id === tecla);
      const porNumero = /^[1-9]$/.test(tecla) ? Number(tecla) - 1 : -1;
      const indice = porLetra >= 0 ? porLetra : porNumero;

      const opcion = currentQ.options[indice];
      if (opcion) { e.preventDefault(); handleAnswer(opcion.id); }
    }

    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [currentQ, handleAnswer, handleNext, isReportModalOpen, puedeAvanzar]);

  return (
    // `justify-center` sobre `min-h-[80vh]` dejaba la tarjeta flotando en
    // medio de la pantalla con medio viewport vacio debajo. Ahora el contenido
    // se apoya arriba y la cabecera acompania al scroll.
    <div className="max-w-3xl mx-auto animate-in fade-in duration-300 relative pb-32">

      {/* ================= CABECERA ================= */}
      <div className="sticky top-0 z-30 -mx-4 px-4 pt-4 pb-4 mb-8 bg-slate-50/85 dark:bg-slate-950/85 backdrop-blur-xl border-b border-slate-200/70 dark:border-slate-800/70">

          <div className="flex items-center justify-between gap-4 mb-4">
              <button onClick={onExit} className="text-[11px] font-black text-slate-400 hover:text-red-500 uppercase tracking-wider flex items-center gap-1.5 transition-colors">
                  <ArrowLeft size={14}/> Abortar
              </button>

              {/* El tema y el modo: antes no habia forma de saber que estabas
                  haciendo ni de que iba. */}
              <div className="flex items-center gap-2 min-w-0 flex-1 justify-center">
                  <Layers size={13} className="text-slate-400 flex-shrink-0"/>
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                      {topicName}
                  </span>
                  <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0 ${
                      mode === 'exam'
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300'
                  }`}>
                      {mode === 'exam' ? 'Examen' : 'Entreno'}
                  </span>
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                  <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5 tabular-nums">
                      <Clock size={13} className="text-slate-400"/> {formatTime(segundosTest)}
                  </span>
                  <span className="text-[11px] font-black text-slate-900 dark:text-white font-mono tabular-nums">
                      {currentIndex + 1}<span className="text-slate-400">/{localQuestions.length}</span>
                  </span>
              </div>
          </div>

          {/* Un segmento por pregunta en vez de una barra lisa: de un vistazo
              se ve cuantas van y como. En examen NO se colorea el acierto —
              el alumno no debe saber si va bien hasta el final. */}
          <div className="flex gap-1">
              {localQuestions.map((q, i) => {
                  const respondida = !!q.userAnswer;
                  const esActual = i === currentIndex;

                  let color = 'bg-slate-200 dark:bg-slate-800';
                  if (mode === 'practice' && respondida) {
                      color = q.userAnswer === q.correctOptionId ? 'bg-emerald-500' : 'bg-red-500';
                  } else if (respondida) {
                      color = 'bg-indigo-500';
                  }

                  return (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${color} ${
                          esActual ? 'ring-2 ring-offset-2 ring-indigo-500 dark:ring-offset-slate-950' : ''
                        }`}
                      />
                  );
              })}
          </div>
      </div>

      {/* El cuerpo se centra en el hueco que dejan cabecera y pie.

          Sin esto, una pregunta corta sin feedback dejaba medio viewport
          vacio debajo. Es `min-h` y no `h`, asi que cuando el feedback del
          modo entrenamiento es largo el bloque crece hacia abajo en vez de
          recortarse. */}
      <div className="min-h-[calc(100vh-15rem)] flex flex-col justify-center">

      {/* TARJETA DE PREGUNTA */}
      <div className="bg-white dark:bg-slate-900 p-8 md:p-12 rounded-[2rem] shadow-2xl shadow-indigo-500/10 border border-slate-100 dark:border-slate-800 relative overflow-hidden group/card">
          
          {/* Marca de agua decorativa */}
          <div className="absolute top-0 right-0 p-32 bg-indigo-500/5 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>

          {/* TOOLBAR DE CALIDAD */}
          {/* Solo si la pregunta tiene fila en la base de datos: sin id, votar o
              reportar no puede llegar a ninguna parte, y unos botones que no
              hacen nada son peores que no tenerlos. */}
          {currentQ.id && (
            <div className="absolute top-6 right-6 flex items-center gap-2 opacity-100 md:opacity-0 group-hover/card:opacity-100 transition-opacity duration-300">
              <button onClick={() => handleVote('up')} className={`p-2 rounded-full transition-colors ${votes[currentQ.id] === 'up' ? 'bg-emerald-100 text-emerald-600' : 'hover:bg-slate-100 text-slate-300 hover:text-emerald-500'}`}><ThumbsUp size={18} /></button>
              <button onClick={() => handleVote('down')} className={`p-2 rounded-full transition-colors ${votes[currentQ.id] === 'down' ? 'bg-red-100 text-red-600' : 'hover:bg-slate-100 text-slate-300 hover:text-red-500'}`}><ThumbsDown size={18} /></button>
              <div className="w-px h-4 bg-slate-200 mx-1"></div>
              <button onClick={() => setIsReportModalOpen(true)} className="p-2 rounded-full hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"><Flag size={18} /></button>
            </div>
          )}

          {/* Etiqueta de Origen

              Hay TRES origenes y aqui solo se distinguian dos: `origin === 'live_ai'`
              o "todo lo demas". Como las recien generadas llegan con
              `origin: 'candidate'`, caian en el `else` y se le presentaban al
              alumno como "BANCO OFICIAL" — una pregunta que la IA acababa de
              inventar y que nadie habia revisado. En una oposicion eso no es un
              detalle: le estas diciendo que esta validada. */}
          <div className="mb-5">
             {currentQ.origin === 'bank' ? (
               <span className="text-[10px] font-mono uppercase px-2.5 py-1 rounded-md border bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
                 📚 Banco oficial
               </span>
             ) : (
               <span
                 className="text-[10px] font-mono uppercase px-2.5 py-1 rounded-md border bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
                 title="Generada por IA a partir del temario. Aún no la ha revisado un administrador."
               >
                 ⚠ Generada por IA · sin revisar
               </span>
             )}
          </div>

          <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white mb-10 leading-snug relative z-10">
              {currentQ.question}
          </h3>

          <div className="space-y-4 relative z-10">
              {currentQ.options.map((opt) => {
                  const isSelected = currentQ.userAnswer === opt.id;
                  const isCorrectOpt = opt.id === currentQ.correctOptionId;
                  
                  let style = "border-slate-200 dark:border-slate-800 hover:border-indigo-400 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300";
                  
                  if (mode === 'practice' && isAnswered) {
                      if (isCorrectOpt) style = "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500";
                      else if (isSelected) style = "border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 opacity-60";
                      else style = "border-slate-100 dark:border-slate-800 opacity-40";
                  } else if (isSelected) {
                      style = "border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-[1.02]";
                  }

                  return (
                      <button 
                          key={opt.id} 
                          onClick={() => handleAnswer(opt.id)}
                          disabled={mode === 'practice' && isAnswered}
                          className={`w-full text-left p-5 rounded-2xl border-2 font-bold transition-all duration-200 flex items-start gap-4 group ${style}`}
                      >
                          {/* La letra hace de tecla: es el atajo, no un adorno.
                              Con borde de teclado para que se lea como tal. */}
                          <kbd className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black uppercase border-b-2 flex-shrink-0 mt-0.5 transition-colors ${
                            isSelected || (mode === 'practice' && isCorrectOpt && isAnswered)
                              ? 'border-transparent bg-white/25 text-current'
                              : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-500 group-hover:border-indigo-400 group-hover:text-indigo-500'
                          }`}>
                              {opt.id}
                          </kbd>
                          <span className="text-sm md:text-base leading-relaxed">{opt.text}</span>
                      </button>
                  );
              })}
          </div>
      </div>

      {/* FEEDBACK (SOLO MODO PRÁCTICA) */}
      {mode === 'practice' && isAnswered && (
          <div className="mt-6 animate-in slide-in-from-bottom-4 fade-in duration-500">
              {isCorrect ? (
                  <div className="bg-emerald-500 text-white p-6 rounded-3xl shadow-lg flex items-start gap-4 relative overflow-hidden">
                      <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm"><CheckCircle2 size={28} /></div>
                      <div className="relative z-10">
                          <p className="font-black text-lg uppercase tracking-wide">¡Correcto!</p>
                          <p className="text-emerald-50 font-medium mt-1 leading-relaxed text-sm opacity-90">{currentQ.explanation}</p>
                      </div>
                  </div>
              ) : (
                  <div className="bg-white dark:bg-slate-900 border-2 border-red-100 dark:border-red-900/30 p-6 rounded-3xl shadow-xl">
                      <div className="flex items-start gap-4 mb-6">
                          <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-2xl"><XCircle size={28} /></div>
                          <div>
                              <p className="font-black text-red-500 uppercase tracking-wide text-sm">Respuesta Incorrecta</p>
                              <p className="text-slate-600 dark:text-slate-300 text-sm mt-2 font-medium leading-relaxed">{currentQ.explanation}</p>
                          </div>
                      </div>

                      {!errorTagged ? (
                        <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                            <p className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Diagnóstico del Error (Obligatorio)</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                    {id:'olvido',label:'OLVIDO',icon:Brain},
                                    {id:'desconocimiento',label:'LAGUNA',icon:BookX},
                                    {id:'trampa',label:'TRAMPA',icon:AlertTriangle},
                                    {id:'fallo_procesamiento',label:'LECTURA',icon:Eye}
                                ].map((e)=>(
                                    <button key={e.id} onClick={()=>handleErrorTag(e.id)} className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl flex flex-col items-center gap-2 transition-all group">
                                        <e.icon size={20} className="text-slate-400 group-hover:text-indigo-500 transition-colors"/>
                                        <span className="text-[10px] font-bold text-slate-500 group-hover:text-indigo-600 transition-colors">{e.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                      ) : (
                        <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl text-center border border-dashed border-slate-300 dark:border-slate-700">
                            <p className="text-xs font-bold text-slate-500 flex items-center justify-center gap-2"><CheckCircle2 size={14} className="text-indigo-500"/> Error archivado.</p>
                        </div>
                      )}
                  </div>
              )}
          </div>
      )}

      </div>

      {/* ================= PIE ================= */}
      {/* Fijo abajo: el boton de avanzar no deberia obligar a buscar con el
          raton ni a hacer scroll cuando el enunciado es largo. */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-slate-50/85 dark:bg-slate-950/85 backdrop-blur-xl border-t border-slate-200/70 dark:border-slate-800/70">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-4">

              {/* La pista de atajos, visible pero discreta. Un atajo que nadie
                  descubre es un atajo que no existe. */}
              <p className="hidden sm:flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <span className="flex items-center gap-1">
                      {currentQ.options.map((o) => (
                          <kbd key={o.id} className="px-1.5 py-0.5 rounded border border-b-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono uppercase">
                              {o.id}
                          </kbd>
                      ))}
                      responder
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded border border-b-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono">
                          Enter
                      </kbd>
                      avanzar
                  </span>
              </p>

              {/* En entrenamiento el boton solo aparece con la respuesta dada;
                  si es un fallo, hay que etiquetarlo antes (es obligatorio). */}
              {(mode === 'exam' || isAnswered) ? (
                  <button
                    onClick={handleNext}
                    disabled={!puedeAvanzar}
                    className="ml-auto bg-slate-900 dark:bg-white text-white dark:text-black px-8 py-3.5 rounded-xl font-black text-sm shadow-xl hover:scale-105 transition-transform disabled:opacity-40 disabled:scale-100 disabled:cursor-not-allowed flex items-center gap-3"
                  >
                      {currentIndex < localQuestions.length - 1 ? 'SIGUIENTE' : 'FINALIZAR'}
                      <ChevronRight size={16}/>
                  </button>
              ) : (
                  <span className="ml-auto text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Elige una respuesta
                  </span>
              )}
          </div>
      </div>

      {/* MODAL REPORTE */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2"><MessageSquareWarning className="text-amber-500"/> Reportar</h3>
              <button onClick={() => setIsReportModalOpen(false)} className="text-slate-400 hover:text-slate-900"><X size={20} /></button>
            </div>
            <div className="space-y-3 mb-6 max-h-48 overflow-y-auto">
                {REPORT_TYPES.map((type) => (
                  <button key={type.id} onClick={() => setReportData({ ...reportData, type: type.id })} className={`w-full text-left text-sm px-4 py-3 rounded-xl border transition-all ${reportData.type === type.id ? 'bg-amber-50 border-amber-500 text-amber-700 font-bold' : 'border-slate-100 hover:border-slate-300 text-slate-600'}`}>
                    {type.label}
                  </button>
                ))}
            </div>
            <textarea placeholder="Detalles (opcional)..." className="w-full p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none mb-6" rows={3} value={reportData.message} onChange={(e) => setReportData({ ...reportData, message: e.target.value })}/>
            <button onClick={submitReport} disabled={!reportData.type || isSubmittingReport} className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-amber-500/20 disabled:opacity-50 flex justify-center gap-2 items-center">
                {isSubmittingReport ? 'Enviando...' : 'Enviar Reporte'} {!isSubmittingReport && <Send size={14} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
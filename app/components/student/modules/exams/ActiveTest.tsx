'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  ChevronRight, CheckCircle2, XCircle, Brain, 
  BookX, AlertTriangle, Eye, ArrowLeft,
  ThumbsUp, ThumbsDown, Flag, X, Send, MessageSquareWarning
} from 'lucide-react';
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
  const handleAnswer = async (optionId: string) => {
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
  };

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

const handleNext = () => {
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
  };

  return (
    <div className="min-h-[80vh] flex flex-col justify-center max-w-3xl mx-auto animate-in fade-in zoom-in duration-300 relative">
      
      {/* BARRA DE PROGRESO */}
      <div className="mb-8 flex items-center gap-4">
          <button onClick={onExit} className="text-xs font-bold text-slate-400 hover:text-red-500 uppercase tracking-wider flex items-center gap-1">
              <ArrowLeft size={14}/> ABORTAR
          </button>
          <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-indigo-600 transition-all duration-500 ease-out"
                style={{ width: `${((currentIndex + 1) / localQuestions.length) * 100}%` }}
              ></div>
          </div>
          <span className="text-xs font-black text-slate-400 font-mono">
              {currentIndex + 1}/{localQuestions.length}
          </span>
      </div>

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

          {/* Etiqueta de Origen */}
          <div className="mb-4">
             <span className={`text-[10px] font-mono uppercase px-2 py-1 rounded border ${
               currentQ.origin === 'live_ai' 
                 ? 'bg-purple-50 text-purple-600 border-purple-200' 
                 : 'bg-slate-50 text-slate-400 border-slate-200'
             }`}>
               {currentQ.origin === 'live_ai' ? '🤖 GENERADA (AI)' : '📚 BANCO OFICIAL'}
             </span>
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
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] uppercase border flex-shrink-0 mt-0.5 ${isSelected || (mode === 'practice' && isCorrectOpt && isAnswered) ? 'border-transparent bg-white/20' : 'border-slate-300 dark:border-slate-600'}`}>
                              {opt.id}
                          </div>
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

      {/* BOTÓN SIGUIENTE */}
      <div className="mt-8 flex justify-end pb-12">
          {(mode === 'exam' || isAnswered) && (
              <button 
                onClick={handleNext} 
                disabled={mode === 'practice' && !errorTagged && !isCorrect} 
                className="bg-slate-900 dark:bg-white text-white dark:text-black px-8 py-4 rounded-xl font-black text-sm shadow-xl hover:scale-105 transition-transform disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed flex items-center gap-3"
              >
                  {currentIndex < localQuestions.length - 1 ? 'SIGUIENTE' : 'FINALIZAR'} 
                  <ChevronRight size={16}/>
              </button>
          )}
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
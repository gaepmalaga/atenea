'use client';

import { useState } from 'react';
import { 
  ChevronRight, CheckCircle2, XCircle, Brain, 
  BookX, AlertTriangle, Eye, ArrowLeft 
} from 'lucide-react';
import { Question } from './ExamManager';
import { saveTestResult } from '../../../../actions';

interface ActiveTestProps {
  questions: Question[];
  mode: 'practice' | 'exam';
  userId: string;
  topicName: string; // Para guardar resultado en modo práctica
  onFinish: (qs: Question[]) => void;
  onExit: () => void;
}

export default function ActiveTest({ questions, mode, userId, topicName, onFinish, onExit }: ActiveTestProps) {
  // Estado local para manejar las respuestas del usuario
  const [localQuestions, setLocalQuestions] = useState<Question[]>(questions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [errorTagged, setErrorTagged] = useState(false); // Evita doble tag

  const currentQ = localQuestions[currentIndex];
  const isAnswered = !!currentQ.userAnswer;
  const isCorrect = currentQ.userAnswer === currentQ.correctOptionId;

  // MANEJO DE RESPUESTA
  const handleAnswer = async (optionId: string) => {
    // Si ya respondió y es práctica, no hacer nada (o permitir cambiar si es examen)
    if (mode === 'practice' && isAnswered) return;
    
    const updated = [...localQuestions];
    updated[currentIndex].userAnswer = optionId;
    setLocalQuestions(updated);

    // En modo práctica, guardamos resultado inmediato
    if (mode === 'practice') {
        const correct = optionId === currentQ.correctOptionId;
        setErrorTagged(correct); // Si acierta, no necesita tag de error
        
        // Guardado silencioso
        await saveTestResult(
            userId, 
            topicName, 
            currentQ.question, 
            correct, 
            null
        );
    }
  };

  // MANEJO DE TAXONOMÍA DE ERROR (Solo Práctica)
  const handleErrorTag = async (type: string) => {
      if (errorTagged) return;
      
      const updated = [...localQuestions];
      updated[currentIndex].errorType = type;
      setLocalQuestions(updated);
      setErrorTagged(true);

      // Actualizar el registro en base de datos con el tipo de error
      await saveTestResult(
          userId, 
          topicName, 
          currentQ.question, 
          false, 
          type
      );
  };

  const handleNext = () => {
      if (currentIndex < localQuestions.length - 1) {
          setCurrentIndex(currentIndex + 1);
          setErrorTagged(false);
      } else {
          onFinish(localQuestions);
      }
  };

  return (
    <div className="min-h-[80vh] flex flex-col justify-center max-w-3xl mx-auto animate-in fade-in zoom-in duration-300">
      
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
      <div className="bg-white dark:bg-slate-900 p-8 md:p-12 rounded-[2rem] shadow-2xl shadow-indigo-500/10 border border-slate-100 dark:border-slate-800 relative overflow-hidden">
          
          {/* Marca de agua decorativa */}
          <div className="absolute top-0 right-0 p-32 bg-indigo-500/5 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>

          <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white mb-10 leading-snug relative z-10">
              {currentQ.question}
          </h3>

          <div className="space-y-4 relative z-10">
              {currentQ.options.map((opt) => {
                  const isSelected = currentQ.userAnswer === opt.id;
                  const isCorrectOpt = opt.id === currentQ.correctOptionId;
                  
                  // ESTILOS DINÁMICOS
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
                  // FEEDBACK POSITIVO
                  <div className="bg-emerald-500 text-white p-6 rounded-3xl shadow-lg flex items-start gap-4 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-16 bg-white/10 rounded-full blur-2xl translate-x-1/2 -translate-y-1/2"></div>
                      <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
                          <CheckCircle2 size={28} />
                      </div>
                      <div className="relative z-10">
                          <p className="font-black text-lg uppercase tracking-wide">¡Correcto!</p>
                          <p className="text-emerald-50 font-medium mt-1 leading-relaxed text-sm opacity-90">
                              {currentQ.explanation}
                          </p>
                      </div>
                  </div>
              ) : (
                  // FEEDBACK NEGATIVO + TAXONOMÍA
                  <div className="bg-white dark:bg-slate-900 border-2 border-red-100 dark:border-red-900/30 p-6 rounded-3xl shadow-xl">
                      <div className="flex items-start gap-4 mb-6">
                          <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-2xl">
                              <XCircle size={28} />
                          </div>
                          <div>
                              <p className="font-black text-red-500 uppercase tracking-wide text-sm">Respuesta Incorrecta</p>
                              <p className="text-slate-600 dark:text-slate-300 text-sm mt-2 font-medium leading-relaxed">
                                  {currentQ.explanation}
                              </p>
                          </div>
                      </div>

                      {/* SELECTOR DE TAXONOMÍA */}
                      {!errorTagged ? (
                        <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                            <p className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                                Diagnóstico del Error (Obligatorio)
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                    {id:'olvido',label:'OLVIDO',icon:Brain},
                                    {id:'desconocimiento',label:'LAGUNA',icon:BookX},
                                    {id:'trampa',label:'TRAMPA',icon:AlertTriangle},
                                    {id:'fallo_procesamiento',label:'LECTURA',icon:Eye}
                                ].map((e)=>(
                                    <button 
                                        key={e.id} 
                                        onClick={()=>handleErrorTag(e.id)} 
                                        className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl flex flex-col items-center gap-2 transition-all group"
                                    >
                                        <e.icon size={20} className="text-slate-400 group-hover:text-indigo-500 transition-colors"/>
                                        <span className="text-[10px] font-bold text-slate-500 group-hover:text-indigo-600 transition-colors">{e.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                      ) : (
                        <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl text-center border border-dashed border-slate-300 dark:border-slate-700">
                            <p className="text-xs font-bold text-slate-500 flex items-center justify-center gap-2">
                                <CheckCircle2 size={14} className="text-indigo-500"/> 
                                Error diagnosticado y archivado.
                            </p>
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
                disabled={mode === 'practice' && !errorTagged && !isCorrect} // Obligar a taggear error
                className="bg-slate-900 dark:bg-white text-white dark:text-black px-8 py-4 rounded-xl font-black text-sm shadow-xl hover:scale-105 transition-transform disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed flex items-center gap-3"
              >
                  {currentIndex < localQuestions.length - 1 ? 'SIGUIENTE' : 'FINALIZAR'} 
                  <ChevronRight size={16}/>
              </button>
          )}
      </div>

    </div>
  );
}
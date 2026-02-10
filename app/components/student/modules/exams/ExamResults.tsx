'use client';

import { Question } from './ExamManager';
import { CheckCircle2, XCircle, RotateCcw, Award } from 'lucide-react';

interface ExamResultsProps {
  questions: Question[];
  onRetry: () => void;
}

export default function ExamResults({ questions, onRetry }: ExamResultsProps) {
  const correctCount = questions.filter(q => q.userAnswer === q.correctOptionId).length;
  const total = questions.length;
  const percentage = Math.round((correctCount / total) * 100);
  const isPass = percentage >= 50;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in zoom-in duration-500">
      
      {/* TARJETA DE RESULTADOS */}
      <div className="relative bg-white dark:bg-slate-900 p-10 md:p-14 rounded-[3rem] shadow-2xl border border-slate-100 dark:border-slate-800 text-center max-w-md w-full overflow-hidden">
        
        {/* Confeti de fondo si aprueba */}
        {isPass && (
            <div className="absolute inset-0 pointer-events-none opacity-10" style={{ backgroundImage: 'radial-gradient(#10b981 2px, transparent 2px)', backgroundSize: '30px 30px' }}></div>
        )}

        <div className={`relative z-10 w-32 h-32 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_40px_rgba(0,0,0,0.1)] ${isPass ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400'}`}>
            {isPass ? <Award size={64}/> : <XCircle size={64}/>}
        </div>

        <h2 className="text-7xl font-black text-slate-900 dark:text-white mb-2 tracking-tighter">
            {percentage}<span className="text-3xl text-slate-300 dark:text-slate-600">%</span>
        </h2>
        
        <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-10">
            PRECISIÓN TÁCTICA
        </p>

        <div className="grid grid-cols-2 gap-4 mb-10 text-left">
             <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl">
                 <p className="text-[10px] font-bold text-emerald-600/60 uppercase">Aciertos</p>
                 <p className="text-2xl font-black text-emerald-600">{correctCount}</p>
             </div>
             <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-2xl">
                 <p className="text-[10px] font-bold text-red-600/60 uppercase">Fallos</p>
                 <p className="text-2xl font-black text-red-600">{total - correctCount}</p>
             </div>
        </div>

        <button 
            onClick={onRetry} 
            className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-bold uppercase tracking-wide flex items-center justify-center gap-3 hover:scale-105 transition-transform shadow-lg"
        >
            <RotateCcw size={18}/> 
            Nueva Operación
        </button>

      </div>
    </div>
  );
}
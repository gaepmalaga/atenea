'use client';

import { Question } from './ExamManager';
import { scoreExam, penaltyPerError, CNP_SCORING } from '@/app/lib/scoring';
import { XCircle, RotateCcw, Award, AlertTriangle } from 'lucide-react';

interface ExamResultsProps {
  questions: Question[];
  onRetry: () => void;
}

/** Dos decimales y coma, como lo publica un tribunal. */
const nota = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ExamResults({ questions, onRetry }: ExamResultsProps) {
  // La nota de la convocatoria, no `aciertos / total`. Ver app/lib/scoring.ts:
  // la de antes mentia hacia arriba y ademas enseñaba a contestar a todo.
  const { correct, wrong, blank, net, score, rawPercentage, passed } = scoreExam(questions);

  // Cuanto se ha dejado por el camino por fallar. Es el numero que explica la
  // diferencia entre lo que el alumno creia y lo que sacaria de verdad.
  const perdidoPorFallos = rawPercentage - Math.round(score * 10);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in zoom-in duration-500">

      {/* TARJETA DE RESULTADOS */}
      <div className="relative bg-white dark:bg-slate-900 p-10 md:p-14 rounded-[3rem] shadow-2xl border border-slate-100 dark:border-slate-800 text-center max-w-md w-full overflow-hidden">

        {/* Confeti de fondo si aprueba */}
        {passed && (
            <div className="absolute inset-0 pointer-events-none opacity-10" style={{ backgroundImage: 'radial-gradient(#10b981 2px, transparent 2px)', backgroundSize: '30px 30px' }}></div>
        )}

        <div className={`relative z-10 w-32 h-32 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_40px_rgba(0,0,0,0.1)] ${passed ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400'}`}>
            {passed ? <Award size={64}/> : <XCircle size={64}/>}
        </div>

        <h2 className="text-7xl font-black text-slate-900 dark:text-white mb-2 tracking-tighter">
            {nota(score)}
        </h2>

        <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-2">
            Nota con penalización
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-8">
            Sobre {CNP_SCORING.scale} · se aprueba con {CNP_SCORING.passMark}
        </p>

        <div className="grid grid-cols-3 gap-3 mb-6 text-left">
             <div className="p-3 bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl">
                 <p className="text-[10px] font-bold text-emerald-600/60 uppercase">Aciertos</p>
                 <p className="text-2xl font-black text-emerald-600">{correct}</p>
             </div>
             <div className="p-3 bg-red-50 dark:bg-red-900/10 rounded-2xl">
                 <p className="text-[10px] font-bold text-red-600/60 uppercase">Fallos</p>
                 <p className="text-2xl font-black text-red-600">{wrong}</p>
             </div>
             {/* El blanco es una DECISION, no un descuido: por eso tiene su
                 propia casilla y no se suma a los fallos. */}
             <div className="p-3 bg-slate-100 dark:bg-slate-800/50 rounded-2xl">
                 <p className="text-[10px] font-bold text-slate-500/70 uppercase">Blancos</p>
                 <p className="text-2xl font-black text-slate-500">{blank}</p>
             </div>
        </div>

        {/* LO QUE HAN COSTADO LOS FALLOS.
            Sin esto la penalizacion es solo un numero mas pequeño; con esto el
            alumno ve la estrategia. */}
        <div className="mb-8 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 text-left space-y-2">
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                Cada fallo resta <strong>{nota(penaltyPerError())}</strong> aciertos.
                Te quedan <strong>{nota(net)}</strong> aciertos netos de {questions.length}.
            </p>
            {perdidoPorFallos > 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-2 leading-relaxed">
                    <AlertTriangle size={13} className="mt-0.5 flex-shrink-0"/>
                    <span>
                        Sin penalización habrías visto un {rawPercentage} %.
                        Los {wrong} fallo{wrong !== 1 ? 's' : ''} te cuestan {nota(perdidoPorFallos / 10)} puntos.
                    </span>
                </p>
            )}
            {wrong === 0 && blank > 0 && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 leading-relaxed">
                    Ni un fallo: dejar en blanco lo que no sabías no te ha restado nada.
                </p>
            )}
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

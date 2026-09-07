'use client';

import { useState } from 'react';
import { Question } from './ExamManager';
import type { AdaptiveSession } from '@/app/actions/exams';
import { scoreExam, penaltyPerError, CNP_SCORING } from '@/app/lib/scoring';
import {
  XCircle, RotateCcw, Award, AlertTriangle, Target, Sparkles, CheckCircle2, Scale, Clock, X,
} from 'lucide-react';
import { Card, Button, StatTile, cx, TEXT } from '../../../ui';

interface ExamResultsProps {
  questions: Question[];
  mode: 'practice' | 'exam';
  onRetry: () => void;
  /** Ir al módulo de repaso. Opcional: la academia puede tenerlo apagado (P4). */
  onRepasarFallos?: () => void;
  /** Resumen de la sesión adaptativa (P10). `null` en simulacro. */
  sesion?: AdaptiveSession | null;
}

/** Dos decimales y coma, como lo publica un tribunal. */
const nota = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const segundos = (ms?: number | null) => (ms && ms > 0 ? `${(ms / 1000).toFixed(1)} s` : null);

// ============================================================
// ENTRENAMIENTO — sin nota
// ============================================================

function ResultadoEntrenamiento({
  questions, sesion, onRetry, onRepasarFallos,
}: Omit<ExamResultsProps, 'mode'>) {
  const contestadas = questions.filter((q) => q.userAnswer);
  const acertadas = contestadas.filter((q) => q.userAnswer === q.correctOptionId).length;
  const fallos = contestadas.length - acertadas;

  // De qué cajón venía cada pregunta (lo pone `getAdaptiveSession`).
  const deRepaso = questions.filter((q) => q.cajon && q.cajon !== 'nueva').length;
  const nuevas = questions.filter((q) => !q.cajon || q.cajon === 'nueva').length;

  return (
    <div className="flex justify-center animate-in fade-in duration-500">
      <Card pad="lg" elevation="floating" className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-5">
          <Sparkles className="w-8 h-8" />
        </div>

        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-1">
          {contestadas.length} {contestadas.length === 1 ? 'pregunta' : 'preguntas'}
        </h2>
        <p className={cx(TEXT.muted, 'mb-6')}>
          {acertadas} {acertadas === 1 ? 'acertada' : 'acertadas'}
          {fallos > 0 && ` · ${fallos} para volver`}
        </p>

        <Card tone="sunken" pad="sm" className="mb-5 text-left space-y-1.5">
          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
            {[
              deRepaso > 0 && `${deRepaso} de repaso`,
              nuevas > 0 && `${nuevas} ${nuevas === 1 ? 'nueva' : 'nuevas'}`,
            ].filter(Boolean).join(' · ')}.
          </p>
          {fallos > 0 && (
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
              Las que fallaste vuelven pronto.
            </p>
          )}
          {sesion?.atascadasTotales ? (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
              Tienes {sesion.atascadasTotales} que se te {sesion.atascadasTotales === 1 ? 'resiste' : 'resisten'} desde
              hace tiempo: relee el artículo o hazte una ficha, repetir el test no está funcionando.
            </p>
          ) : null}
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Vuelve mañana y te traigo el siguiente repaso.
          </p>
        </Card>

        <div className="space-y-2">
          {fallos > 0 && onRepasarFallos && (
            <Button block size="lg" onClick={onRepasarFallos} icon={<Target size={18} />}>
              Repasar {fallos === 1 ? 'el fallo' : `los ${fallos} fallos`}
            </Button>
          )}
          <Button
            block
            size="lg"
            variant={fallos > 0 && onRepasarFallos ? 'secondary' : 'primary'}
            onClick={onRetry}
            icon={<RotateCcw size={18} />}
          >
            Nueva sesión
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// SIMULACRO — nota + cuadrícula
// ============================================================

function ResultadoSimulacro({
  questions, onRetry, onRepasarFallos,
}: Omit<ExamResultsProps, 'mode' | 'sesion'>) {
  const { correct, wrong, blank, net, score, rawPercentage, passed } = scoreExam(questions);
  const perdidoPorFallos = rawPercentage - Math.round(score * 10);
  const [abierta, setAbierta] = useState<number | null>(null);

  const estadoDe = (q: Question): 'ok' | 'mal' | 'blanco' =>
    !q.userAnswer ? 'blanco' : q.userAnswer === q.correctOptionId ? 'ok' : 'mal';

  const q = abierta !== null ? questions[abierta] : null;
  const tuOpcion = q?.options.find((o) => o.id === q.userAnswer);
  const correcta = q?.options.find((o) => o.id === q.correctOptionId);

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in duration-500 pb-4">
      <Card pad="lg" elevation="floating" className="text-center relative overflow-hidden mb-4">
        {passed && (
          <div
            className="absolute inset-0 pointer-events-none opacity-10"
            style={{ backgroundImage: 'radial-gradient(#10b981 2px, transparent 2px)', backgroundSize: '30px 30px' }}
          />
        )}
        <div
          className={cx(
            'relative z-10 w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center mx-auto mb-4',
            passed
              ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
              : 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400',
          )}
        >
          {passed ? <Award className="w-10 h-10 sm:w-12 sm:h-12" /> : <XCircle className="w-10 h-10 sm:w-12 sm:h-12" />}
        </div>

        <h2 className={cx(TEXT.display, 'text-slate-900 dark:text-white mb-1')}>{nota(score)}</h2>
        <p className={cx(TEXT.label, 'text-slate-500 dark:text-slate-400 mb-1')}>Nota con penalización</p>
        <p className={cx(TEXT.muted, 'mb-5')}>Sobre {CNP_SCORING.scale} · se aprueba con {CNP_SCORING.passMark}</p>

        <div className="grid grid-cols-3 gap-2 mb-5 text-left">
          <StatTile label="Aciertos" value={correct} tone="success" />
          <StatTile label="Fallos" value={wrong} tone="danger" />
          <StatTile label="Blancos" value={blank} tone="neutral" />
        </div>

        <Card tone="sunken" pad="sm" className="text-left space-y-2">
          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
            Cada fallo resta <strong>{nota(penaltyPerError())}</strong> aciertos. Te quedan{' '}
            <strong>{nota(net)}</strong> aciertos netos de {questions.length}.
          </p>
          {perdidoPorFallos > 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-2 leading-relaxed">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>
                Sin penalización habrías visto un {rawPercentage} %. Los {wrong} fallo{wrong !== 1 ? 's' : ''} te
                cuestan {nota(perdidoPorFallos / 10)} puntos.
              </span>
            </p>
          )}
          {wrong === 0 && blank > 0 && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 leading-relaxed">
              Ni un fallo: dejar en blanco lo que no sabías no te ha restado nada.
            </p>
          )}
        </Card>
      </Card>

      {/* LA CUADRÍCULA. Verde acertada · rojo fallada · blanco sin contestar.
          Cada celda abre el detalle: qué marcaste, la correcta, por qué, el
          artículo y cuánto tardaste. */}
      <Card pad="sm" className="mb-4">
        <p className={cx(TEXT.label, 'text-slate-500 dark:text-slate-400 mb-3')}>Pregunta por pregunta</p>
        <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5">
          {questions.map((qq, i) => {
            const e = estadoDe(qq);
            return (
              <button
                key={i}
                onClick={() => setAbierta(abierta === i ? null : i)}
                aria-pressed={abierta === i}
                title={`Pregunta ${i + 1}`}
                className={cx(
                  'aspect-square rounded-lg text-[11px] font-black flex items-center justify-center border-2 transition-transform hover:scale-105 tabular-nums',
                  abierta === i && 'ring-2 ring-offset-1 ring-indigo-500 dark:ring-offset-slate-900',
                  e === 'ok' && 'bg-emerald-500 border-emerald-500 text-white',
                  e === 'mal' && 'bg-red-500 border-red-500 text-white',
                  e === 'blanco' && 'bg-white dark:bg-slate-950 border-dashed border-slate-300 dark:border-slate-700 text-slate-400',
                )}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </Card>

      {/* DETALLE de la pregunta abierta. */}
      {q && (
        <Card pad="sm" className="mb-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-start justify-between gap-3 mb-3">
            <p className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Pregunta {abierta! + 1}
              {segundos(q.timeMs) && (
                <span className="ml-2 inline-flex items-center gap-1 normal-case tracking-normal font-mono text-indigo-500">
                  <Clock size={11} /> {segundos(q.timeMs)}
                </span>
              )}
            </p>
            <button onClick={() => setAbierta(null)} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0">
              <X size={16} />
            </button>
          </div>

          <p className="text-sm font-bold text-slate-900 dark:text-white leading-snug mb-3">{q.question}</p>

          <div className="space-y-1.5 mb-3">
            {q.options.map((opt) => {
              const esCorrecta = opt.id === q.correctOptionId;
              const laMarco = opt.id === q.userAnswer;
              return (
                <div
                  key={opt.id}
                  className={cx(
                    'p-2.5 rounded-lg border-2 text-xs flex items-start gap-2',
                    esCorrecta
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300'
                      : laMarco
                        ? 'border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400'
                        : 'border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400',
                  )}
                >
                  <span className="font-black uppercase mt-0.5">{opt.id}</span>
                  <span className="flex-1">{opt.text}</span>
                  {esCorrecta && <CheckCircle2 size={14} className="shrink-0 mt-0.5" />}
                  {!esCorrecta && laMarco && (
                    <span className="text-[9px] font-black uppercase tracking-wider shrink-0 mt-1">la marcaste</span>
                  )}
                </div>
              );
            })}
          </div>

          {!q.userAnswer && (
            <p className={cx(TEXT.muted, 'mb-2')}>La dejaste en blanco. Un blanco no resta.</p>
          )}

          {q.explanation && (
            <div className="bg-slate-50 dark:bg-slate-950 rounded-lg p-3 border border-slate-100 dark:border-slate-800">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{q.explanation}</p>
              {q.legalReference && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                  <Scale size={12} /> {q.legalReference}
                </p>
              )}
            </div>
          )}
          {!q.explanation && tuOpcion && correcta && (
            <p className={cx(TEXT.muted)}>
              Correcta: <strong className="text-emerald-600 dark:text-emerald-400">{correcta.id.toUpperCase()}</strong>.
            </p>
          )}
        </Card>
      )}

      <div className="space-y-2">
        {wrong > 0 && onRepasarFallos && (
          <Button block size="lg" onClick={onRepasarFallos} icon={<Target size={18} />}>
            Repasar {wrong === 1 ? 'el fallo' : `los ${wrong} fallos`}
          </Button>
        )}
        <Button
          block
          size="lg"
          variant={wrong > 0 && onRepasarFallos ? 'secondary' : 'primary'}
          onClick={onRetry}
          icon={<RotateCcw size={18} />}
        >
          Nuevo simulacro
        </Button>
      </div>
    </div>
  );
}

export default function ExamResults({ questions, mode, onRetry, onRepasarFallos, sesion }: ExamResultsProps) {
  if (mode === 'practice') {
    return (
      <ResultadoEntrenamiento
        questions={questions}
        sesion={sesion}
        onRetry={onRetry}
        onRepasarFallos={onRepasarFallos}
      />
    );
  }
  return <ResultadoSimulacro questions={questions} onRetry={onRetry} onRepasarFallos={onRepasarFallos} />;
}

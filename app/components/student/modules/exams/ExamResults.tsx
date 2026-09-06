'use client';

import { Question } from './ExamManager';
import type { AdaptiveSession } from '@/app/actions/exams';
import { scoreExam, penaltyPerError, CNP_SCORING } from '@/app/lib/scoring';
import { XCircle, RotateCcw, Award, AlertTriangle, Target, Sparkles } from 'lucide-react';
import { Card, Button, StatTile, cx, TEXT } from '../../../ui';

interface ExamResultsProps {
  questions: Question[];
  onRetry: () => void;
  /**
   * Ir al modulo de repaso de fallos. Opcional: la academia puede tenerlo
   * apagado (P4), y entonces no se ofrece un camino que no existe.
   */
  onRepasarFallos?: () => void;
  /** Resumen de la sesión adaptativa (P10). `null` en simulacro o modo aleatorio. */
  sesion?: AdaptiveSession | null;
}

/** Dos decimales y coma, como lo publica un tribunal. */
const nota = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ExamResults({ questions, onRetry, onRepasarFallos, sesion }: ExamResultsProps) {
  // La nota de la convocatoria, no `aciertos / total`. Ver app/lib/scoring.ts:
  // la de antes mentia hacia arriba y ademas enseñaba a contestar a todo.
  const { correct, wrong, blank, net, score, rawPercentage, passed } = scoreExam(questions);

  // Cuanto se ha dejado por el camino por fallar. Es el numero que explica la
  // diferencia entre lo que el alumno creia y lo que sacaria de verdad.
  const perdidoPorFallos = rawPercentage - Math.round(score * 10);

  return (
    <div className="flex justify-center animate-in zoom-in duration-500">
      <Card pad="lg" elevation="floating" className="max-w-md w-full text-center relative overflow-hidden">

        {passed && (
          <div
            className="absolute inset-0 pointer-events-none opacity-10"
            style={{ backgroundImage: 'radial-gradient(#10b981 2px, transparent 2px)', backgroundSize: '30px 30px' }}
          />
        )}

        <div
          className={cx(
            'relative z-10 w-20 h-20 sm:w-28 sm:h-28 rounded-full flex items-center justify-center mx-auto mb-5 sm:mb-7',
            passed
              ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
              : 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400',
          )}
        >
          {passed ? <Award className="w-10 h-10 sm:w-14 sm:h-14" /> : <XCircle className="w-10 h-10 sm:w-14 sm:h-14" />}
        </div>

        {/* La nota escala con la pantalla: a 72px fijos casi tocaba los bordes
            en un móvil de 360px. */}
        <h2 className={cx(TEXT.display, 'text-slate-900 dark:text-white mb-2')}>{nota(score)}</h2>

        <p className={cx(TEXT.label, 'text-slate-500 dark:text-slate-400 mb-1')}>Nota con penalización</p>
        <p className={cx(TEXT.muted, 'mb-5 sm:mb-7')}>
          Sobre {CNP_SCORING.scale} · se aprueba con {CNP_SCORING.passMark}
        </p>

        <div className="grid grid-cols-3 gap-2 mb-5 text-left">
          <StatTile label="Aciertos" value={correct} tone="success" />
          <StatTile label="Fallos" value={wrong} tone="danger" />
          {/* El blanco es una DECISIÓN, no un descuido: por eso tiene su propia
              casilla y no se suma a los fallos (regla 24). */}
          <StatTile label="Blancos" value={blank} tone="neutral" />
        </div>

        {/* LO QUE HAN COSTADO LOS FALLOS.
            Sin esto la penalización es solo un número más pequeño; con esto el
            alumno ve la estrategia. */}
        <Card tone="sunken" pad="sm" className="mb-5 sm:mb-7 text-left space-y-2">
          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
            Cada fallo resta <strong>{nota(penaltyPerError())}</strong> aciertos. Te quedan{' '}
            <strong>{nota(net)}</strong> aciertos netos de {questions.length}.
          </p>
          {perdidoPorFallos > 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-2 leading-relaxed">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>
                Sin penalización habrías visto un {rawPercentage} %. Los {wrong} fallo
                {wrong !== 1 ? 's' : ''} te cuestan {nota(perdidoPorFallos / 10)} puntos.
              </span>
            </p>
          )}
          {wrong === 0 && blank > 0 && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 leading-relaxed">
              Ni un fallo: dejar en blanco lo que no sabías no te ha restado nada.
            </p>
          )}
        </Card>

        {/* QUÉ HIZO LA SESIÓN ADAPTATIVA (P10).
            Que el alumno vea que no son preguntas al azar: hay repaso de lo
            fallado, consolidación de lo aprendido y algo nuevo con medida. */}
        {sesion?.adaptativo && sesion.resumen && (
          <Card tone="sunken" pad="sm" className="mb-5 text-left space-y-1.5">
            <p className="text-[11px] font-black text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5 uppercase tracking-wide">
              <Sparkles size={12} /> Sesión a tu medida
            </p>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
              {[
                sesion.resumen.recaida > 0 && `${sesion.resumen.recaida} que fallaste`,
                sesion.resumen.repaso > 0 && `${sesion.resumen.repaso} de repaso`,
                sesion.resumen.consolidar > 0 && `${sesion.resumen.consolidar} para consolidar`,
                sesion.resumen.nueva > 0 && `${sesion.resumen.nueva} nuevas`,
                sesion.resumen.refuerzo > 0 && `${sesion.resumen.refuerzo} de refuerzo`,
              ].filter(Boolean).join(' · ')}.
            </p>
            {sesion.atascadasTotales > 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                Tienes {sesion.atascadasTotales} pregunta{sesion.atascadasTotales !== 1 ? 's' : ''} que se te
                resiste{sesion.atascadasTotales !== 1 ? 'n' : ''} desde hace tiempo: te vendría bien releer el
                artículo o hacerte una ficha.
              </p>
            )}
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Vuelve mañana y te traeré lo que toque repasar.
            </p>
          </Card>
        )}

        {/* DESPUES DE UN EXAMEN, LO QUE TOCA ES MIRAR LOS FALLOS.
            La pantalla terminaba en "Nueva operación" y nada mas: un alumno
            que acaba de fallar cinco preguntas se iba con la nota y sin ver
            NI UNA de las que fallo. El modulo de repaso existe desde P3 y era
            invisible justo en el momento en el que sirve para algo. Va
            primero, y "Nueva operación" pasa a secundario: repetir el test
            antes de mirar el error es repetir el error.
            Solo si hay fallos que repasar, y solo si la academia tiene el
            modulo encendido. */}
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
            Nueva operación
          </Button>
        </div>
      </Card>
    </div>
  );
}

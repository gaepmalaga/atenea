'use client';

import { Calendar, Dumbbell, Moon, User } from 'lucide-react';
import type { WeeklyPlan } from '@/app/lib/training-plan';

/**
 * LA VISTA DE QUIEN TIENE PREPARADOR DE VERDAD.
 *
 * Un alumno cuyo plan lo escribe una persona —el de su grupo de físicas, o uno
 * individual que le ha puesto la academia— NO necesita nada de lo que rodea al
 * plan generado por IA: ni test inicial, ni wizard de biometría, ni «iniciar
 * sesión», ni barra de progreso de la semana, ni «generar la siguiente». Todo
 * eso existe para alimentar al modelo; aquí el modelo no pinta nada.
 *
 * Lo único que necesita es SABER QUÉ LE TOCA HOY. Así que esto es un calendario
 * de la semana y se acabó: cada día con sus ejercicios, y el de hoy destacado.
 *
 * NO hay nada que marcar: un plan de grupo es compartido y marcarlo lo
 * reescribiría para todos (regla 53). Si la academia quiere llevar registro de
 * un alumno, le pone un plan individual.
 */

/** Los días como los escribe el plan, para poder ordenar y saber cuál es hoy. */
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/** Normaliza «Miércoles», «miercoles», «X» → índice 0-6, o `null`. */
function indiceDia(nombre: string | undefined | null): number | null {
  const n = (nombre ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  if (!n) return null;
  const i = DIAS.findIndex((d) =>
    d.normalize('NFD').replace(/[̀-ͯ]/g, '').startsWith(n.slice(0, 3)),
  );
  return i >= 0 ? i : null;
}

/** Índice del día de hoy (0 = lunes), en horario local. */
function hoyIndice(now: Date = new Date()): number {
  return (now.getDay() + 6) % 7;
}

interface CalendarioEntrenamientoProps {
  plan: WeeklyPlan | null;
  /** Quién lo escribe, para decirlo en una línea. */
  origen: 'grupo' | 'individual';
}

export default function CalendarioEntrenamiento({ plan, origen }: CalendarioEntrenamientoProps) {
  const hoy = hoyIndice();

  // Sin plan NO es un error ni una pantalla en blanco: es que el preparador
  // todavía no ha subido el de esta semana (regla 8).
  if (!plan || plan.days.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16 sm:py-24 animate-in fade-in duration-500">
        <Calendar className="mx-auto text-slate-400 mb-6" size={48} />
        <h2 className="text-xl font-black text-slate-900 dark:text-white mb-3">
          Aún no hay plan para esta semana
        </h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          Tu preparador lo publica desde la academia. En cuanto lo suba, aparecerá aquí
          el entrenamiento de cada día.
        </p>
      </div>
    );
  }

  const dias = [...plan.days].sort((a, b) => (indiceDia(a.day) ?? 99) - (indiceDia(b.day) ?? 99));

  return (
    <div className="max-w-4xl mx-auto pb-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Qué se busca esta semana, y quién lo escribe. Una línea, sin tarjeta
          de portada: el alumno viene a ver qué le toca hoy. */}
      <div className="mb-5 flex items-start gap-3">
        <span className="mt-0.5 w-9 h-9 shrink-0 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
          <Calendar size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
            {plan.week_focus || 'Tu semana'}
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
            <User size={11} className="shrink-0" />
            {origen === 'grupo' ? 'Plan de tu grupo' : 'Plan de tu preparador'}
          </p>
        </div>
      </div>

      <div className="space-y-2 sm:space-y-3">
        {dias.map((day, idx) => {
          const ejercicios = day.exercises ?? [];
          const descanso = ejercicios.length === 0;
          const esHoy = indiceDia(day.day) === hoy;

          return (
            <div
              key={idx}
              className={`rounded-2xl border overflow-hidden transition-colors ${
                esHoy
                  ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-900/15 ring-1 ring-indigo-500/30'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
              }`}
            >
              <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-100 dark:border-slate-800/70">
                <span
                  className={`text-[10px] font-black uppercase tracking-widest shrink-0 ${
                    esHoy ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {day.day}
                </span>
                {esHoy && (
                  <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-600 text-white shrink-0">
                    Hoy
                  </span>
                )}
                <span className="text-sm font-bold text-slate-900 dark:text-white truncate ml-auto text-right">
                  {descanso ? 'Descanso' : day.title}
                </span>
              </div>

              {descanso ? (
                <p className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <Moon size={13} className="shrink-0" /> Hoy no toca nada. El descanso es parte del plan.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {ejercicios.map((e, i) => (
                    <li key={i} className="px-4 py-2.5 flex items-start gap-3">
                      <Dumbbell size={13} className="text-slate-400 shrink-0 mt-1" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug">{e.name}</p>
                        {/* Series, repeticiones y descanso solo si constan: el
                            plan lo escribe una persona y puede dejarlos en
                            blanco (regla 5). */}
                        {(e.sets || e.reps || e.rest) && (
                          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                            {[e.sets && `${e.sets} series`, e.reps, e.rest && `descanso ${e.rest}`]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        )}
                        {e.target && (
                          <p className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-1 leading-snug">{e.target}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

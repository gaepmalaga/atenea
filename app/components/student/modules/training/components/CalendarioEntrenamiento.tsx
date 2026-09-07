'use client';

import { useState, useMemo } from 'react';
import { Calendar, Dumbbell, Moon, User, ChevronLeft, ChevronRight } from 'lucide-react';
import type { WeeklyPlan } from '@/app/lib/training-plan';
import { lunesDeSemana, sumaSemanas } from '@/app/lib/training-plan';

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
 * de la semana: cada día con su FECHA y sus ejercicios, y el de hoy destacado.
 * Si su grupo tiene semanas anteriores, puede mirar atrás (regla 54: las
 * semanas futuras preparadas por adelantado no se le enseñan todavía).
 *
 * NO hay nada que marcar: un plan de grupo es compartido y marcarlo lo
 * reescribiría para todos (regla 53). Si la academia quiere llevar registro de
 * un alumno, le pone un plan individual.
 */

/** Los días como los escribe el plan, para poder ordenar y saber cuál es hoy. */
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function sinTildes(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Normaliza «Miércoles», «miercoles», «X» → índice 0-6, o `null`. */
function indiceDia(nombre: string | undefined | null): number | null {
  const n = sinTildes(nombre ?? '');
  if (!n) return null;
  const i = DIAS.findIndex((d) => sinTildes(d).startsWith(n.slice(0, 3)));
  return i >= 0 ? i : null;
}

/** Índice del día de hoy (0 = lunes), en horario local. */
function hoyIndice(now: Date = new Date()): number {
  return (now.getDay() + 6) % 7;
}

/** `2026-09-08` (o un ISO) + offset de días → «Lun 8 sep». */
function fechaDelDia(lunesISO: string, offset: number): string {
  const iso = sumaSemanas(lunesDeSemana(new Date(lunesISO)), 0); // normaliza a lunes
  const [y, m, d] = iso.split('-').map(Number);
  const fecha = new Date(y, (m ?? 1) - 1, d ?? 1);
  fecha.setDate(fecha.getDate() + offset);
  return `${DIAS_CORTOS[offset] ?? ''} ${fecha.getDate()} ${MESES[fecha.getMonth()] ?? ''}`;
}

/** El título del día, salvo que sea el propio nombre del día o esté vacío. */
function tituloUtil(title: string | undefined | null, diaIdx: number | null): string | null {
  const t = (title ?? '').trim();
  if (!t) return null;
  const n = sinTildes(t);
  if (diaIdx !== null && sinTildes(DIAS[diaIdx]).startsWith(n)) return null;
  if (DIAS.some((d) => sinTildes(d) === n)) return null;
  return t;
}

export type SemanaCalendario = { weekStart: string; plan: WeeklyPlan };

interface CalendarioEntrenamientoProps {
  /** Todas las semanas visibles, de la más antigua a la vigente. */
  semanas: SemanaCalendario[];
  /** Quién lo escribe, para decirlo en una línea. */
  origen: 'grupo' | 'individual';
}

export default function CalendarioEntrenamiento({ semanas, origen }: CalendarioEntrenamientoProps) {
  // Por defecto, la última: es la vigente (todas vienen con week_start <= hoy).
  const [idx, setIdx] = useState(() => Math.max(0, semanas.length - 1));
  const hoy = hoyIndice();
  const lunesHoy = lunesDeSemana();

  const actual = semanas[Math.min(idx, semanas.length - 1)] ?? null;

  const dias = useMemo(() => {
    if (!actual) return [];
    return [...actual.plan.days].sort(
      (a, b) => (indiceDia(a.day) ?? 99) - (indiceDia(b.day) ?? 99),
    );
  }, [actual]);

  // Sin plan NO es un error ni una pantalla en blanco: es que el preparador
  // todavía no ha subido el de esta semana (regla 8).
  if (!actual || actual.plan.days.length === 0) {
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

  const esSemanaVigente = actual.weekStart >= lunesHoy;
  const hayVarias = semanas.length > 1;

  return (
    <div className="max-w-4xl mx-auto pb-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Qué se busca esta semana, y quién lo escribe. */}
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 w-9 h-9 shrink-0 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
          <Calendar size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
            {actual.plan.week_focus || 'Tu semana'}
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
            <User size={11} className="shrink-0" />
            {origen === 'grupo' ? 'Plan de tu grupo' : 'Plan de tu preparador'}
          </p>
        </div>
      </div>

      {/* Cambiar de semana — solo si hay más de una. La vigente no deja pasar
          «siguiente»: las semanas futuras no se enseñan (regla 54). */}
      {hayVarias && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5">
          <button
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx <= 0}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-500/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            aria-label="Semana anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 tabular-nums">
            Semana del {fechaDelDia(actual.weekStart, 0).replace(/^\S+ /, '')}
            {esSemanaVigente && <span className="ml-2 text-indigo-600 dark:text-indigo-400">· esta semana</span>}
          </span>
          <button
            onClick={() => setIdx((i) => Math.min(semanas.length - 1, i + 1))}
            disabled={idx >= semanas.length - 1}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-500/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            aria-label="Semana siguiente"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      <div className="space-y-2 sm:space-y-3">
        {dias.map((day, i) => {
          const diaIdx = indiceDia(day.day);
          const ejercicios = day.exercises ?? [];
          const descanso = ejercicios.length === 0;
          const esHoy = esSemanaVigente && diaIdx === hoy;
          const titulo = tituloUtil(day.title, diaIdx);

          return (
            <div
              key={i}
              className={`rounded-2xl border overflow-hidden transition-colors ${
                esHoy
                  ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-900/15 ring-1 ring-indigo-500/30'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
              }`}
            >
              <div className="px-4 py-3 flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800/70">
                <span
                  className={`text-[11px] font-black tabular-nums shrink-0 ${
                    esHoy ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {diaIdx !== null ? fechaDelDia(actual.weekStart, diaIdx) : day.day}
                </span>
                {esHoy && (
                  <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-600 text-white shrink-0">
                    Hoy
                  </span>
                )}
                {(titulo || descanso) && (
                  <span className="text-sm font-bold text-slate-900 dark:text-white truncate ml-auto text-right">
                    {descanso ? 'Descanso' : titulo}
                  </span>
                )}
              </div>

              {descanso ? (
                <p className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <Moon size={13} className="shrink-0" /> Hoy no toca nada. El descanso es parte del plan.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {ejercicios.map((e, j) => (
                    <li key={j} className="px-4 py-2.5 flex items-start gap-3">
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

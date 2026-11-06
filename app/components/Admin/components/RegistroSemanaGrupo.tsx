'use client';

import { useEffect, useState } from 'react';
import { Check, MessageSquare, Loader2 } from 'lucide-react';
import { getRegistroGrupo } from '@/actions';
import type { ResumenSemanaGrupo } from '@/app/lib/registro-fisico';
import { diaSemanaDe } from '@/app/lib/asistencia';
import { TEXT, cx } from '../../ui';

/**
 * QUIÉN HA ENTRENADO ESTA SEMANA (regla 84).
 *
 * Lo que el preparador miraba en la herramienta externa: de cada día del plan
 * del grupo, cuántos lo han hecho; de cada alumno, qué días ha marcado y con
 * qué esfuerzo; y lo que han escrito. Arriba, quién no ha apuntado nada de lo
 * que ya tocaba: es a quien hay que preguntar.
 *
 * Solo para la semana actual o pasadas: de una semana por venir no hay nada que
 * ver todavía.
 */

const DIAS_CORTOS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DIAS_LARGOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function etiqueta(fecha: string): string {
  const [, m, d] = fecha.split('-').map(Number);
  return `${DIAS_LARGOS[diaSemanaDe(fecha) - 1]} ${d} ${MESES[(m ?? 1) - 1]}`;
}

const rpeEnTexto = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 });

export default function RegistroSemanaGrupo({ groupId, weekStart }: { groupId: string; weekStart: string }) {
  const [estado, setEstado] = useState<
    { cargando: true } | { cargando: false; resumen: ResumenSemanaGrupo | null; error: string | null }
  >({ cargando: true });

  useEffect(() => {
    let vivo = true;
    getRegistroGrupo({ groupId, weekStart }).then((res) => {
      if (!vivo) return;
      setEstado(res.success
        ? { cargando: false, resumen: res.resumen, error: null }
        : { cargando: false, resumen: null, error: res.error });
    });
    return () => { vivo = false; };
  }, [groupId, weekStart]);

  if (estado.cargando) {
    return <p className={cx(TEXT.muted, 'flex items-center gap-2')}><Loader2 size={13} className="animate-spin" /> Cargando quién ha entrenado…</p>;
  }
  if (estado.error) return <p className="text-xs font-semibold text-red-600 dark:text-red-400">{estado.error}</p>;

  const r = estado.resumen;
  // Sin plan, o un plan sin un solo día de entrenamiento: no hay nada que apuntar.
  if (!r || r.dias.length === 0) return null;

  const vencidos = r.dias.filter((d) => d.vencido);
  const total = r.alumnos.length;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-3 bg-white dark:bg-slate-900">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h4 className="text-sm font-black text-slate-900 dark:text-white">Quién ha entrenado</h4>
        <span className={TEXT.muted}>
          {r.rpeMedio !== null ? <>Esfuerzo medio <b className="font-mono text-slate-700 dark:text-slate-200">{rpeEnTexto(r.rpeMedio)}/10</b></> : 'Nadie ha puesto aún el esfuerzo'}
        </span>
      </div>

      {total === 0 ? (
        <p className={TEXT.muted}>El grupo no tiene alumnos.</p>
      ) : vencidos.length === 0 ? (
        <p className={TEXT.muted}>Todavía no ha llegado ningún día de entrenamiento de esta semana.</p>
      ) : (
        <>
          {/* Cada día: cuántos lo han hecho. */}
          <div className="flex flex-wrap gap-1.5">
            {r.dias.map((d) => (
              <span
                key={d.fecha}
                className={cx(
                  'px-2 py-1 rounded-lg text-[11px] font-bold border tabular-nums',
                  !d.vencido
                    ? 'border-dashed border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500'
                    : d.hechos === total
                      ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200',
                )}
                title={d.titulo}
              >
                {etiqueta(d.fecha)} · {d.vencido ? `${d.hechos}/${total}` : 'aún no'}
              </span>
            ))}
          </div>

          {r.sinRegistrar.length > 0 && (
            <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-lg px-2.5 py-2 break-words">
              <b>Sin apuntar nada esta semana ({r.sinRegistrar.length}):</b> {r.sinRegistrar.join(', ')}
            </p>
          )}

          {/* Cada alumno: qué días ha marcado. Los que menos, arriba. */}
          <div className="overflow-hidden rounded-lg border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 dark:bg-slate-950/40 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span className="flex-1 min-w-0">Alumno</span>
              {r.dias.map((d) => (
                <span key={d.fecha} className="w-7 text-center shrink-0">{DIAS_CORTOS[diaSemanaDe(d.fecha) - 1]}</span>
              ))}
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {r.alumnos.map((a) => (
                <li key={a.userId} className="flex items-center gap-2 px-2 py-1.5">
                  <span className="flex-1 min-w-0 truncate text-xs text-slate-700 dark:text-slate-200">{a.email}</span>
                  {r.dias.map((d) => {
                    const reg = a.dias[d.fecha];
                    return (
                      <span
                        key={d.fecha}
                        className={cx(
                          'w-7 h-7 shrink-0 rounded-md flex items-center justify-center text-[11px] font-black',
                          reg
                            ? 'bg-emerald-600 text-white'
                            : d.vencido
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                              : 'text-slate-300 dark:text-slate-600',
                        )}
                        title={reg ? `Hecho${reg.rpe !== null ? ` · esfuerzo ${reg.rpe}/10` : ''}` : d.vencido ? 'Sin apuntar' : 'Aún no ha llegado'}
                      >
                        {reg ? (reg.rpe !== null ? reg.rpe : <Check size={13} />) : d.vencido ? '·' : ''}
                      </span>
                    );
                  })}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Verde = hecho; el número es el esfuerzo que ha puesto (1-10).
          </p>
        </>
      )}

      {r.comentarios.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <MessageSquare size={12} /> Lo que han escrito
          </p>
          <ul className="space-y-1.5">
            {r.comentarios.map((c, i) => (
              <li key={i} className="text-xs text-slate-700 dark:text-slate-200 break-words">
                <span className="text-slate-500 dark:text-slate-400">{etiqueta(c.fecha)} · {c.email}{c.rpe !== null && ` · ${c.rpe}/10`}:</span>{' '}
                «{c.comment}»
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

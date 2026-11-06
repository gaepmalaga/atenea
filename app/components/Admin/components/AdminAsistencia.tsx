'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarCheck, RefreshCw, ChevronDown, UserX } from 'lucide-react';
import { getAsistenciaAcademia } from '@/actions';
import type { DiaAcademia, SesionAcademia } from '@/app/actions/asistencia';
import { Card, EmptyState, TEXT, cx } from '../../ui';

/**
 * ASISTENCIA (regla 82): los próximos días con clase, sesión a sesión.
 *
 * Es la pantalla a la que se va cuando un alumno pide cambiarse de clase:
 * «¿dónde hay hueco el martes?». Por eso va por DÍA y no por grupo, y lo
 * primero que se lee de cada sesión son las plazas libres. Quién falta está
 * debajo, plegado: es el segundo dato, no el primero.
 */
export default function AdminAsistencia() {
  const [dias, setDias] = useState<DiaAcademia[]>([]);
  const [sinHorario, setSinHorario] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await getAsistenciaAcademia();
    if (res.success) { setDias(res.dias); setSinHorario(res.gruposSinHorario); setError(null); }
    else setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div className="space-y-4 animate-in fade-in pb-24">
      <Card tone="sunken" pad="md" className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-slate-700/10 dark:bg-white/5 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
            <CalendarCheck size={20} />
          </div>
          <div>
            <h3 className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-tight">Asistencia</h3>
            <p className={cx(TEXT.muted, 'mt-0.5')}>Las próximas clases, con quién ha avisado de que falta y las plazas libres.</p>
          </div>
        </div>
        <button onClick={() => { setLoading(true); cargar(); }} className="w-11 h-11 shrink-0 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400" aria-label="Recargar">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </Card>

      {error && (
        <Card tone="base" pad="md" className="border-red-500/30 text-red-700 dark:text-red-300">
          <p className="text-xs font-medium">{error}</p>
        </Card>
      )}

      {sinHorario.length > 0 && (
        <p className={cx(TEXT.muted, 'px-1')}>
          Sin horario puesto, y por eso no salen aquí: <strong className="text-slate-700 dark:text-slate-200">{sinHorario.join(', ')}</strong>.
          Se pone en «Grupos».
        </p>
      )}

      {!loading && !error && dias.length === 0 && (
        <EmptyState
          icon={<CalendarCheck size={40} />}
          title="No hay clases en las próximas semanas"
          hint="Pon los días, la hora y las plazas de cada grupo en «Grupos»."
          bordered
        />
      )}

      {dias.map((d) => (
        <section key={d.fecha} className="space-y-2">
          <h4 className="px-1 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{d.etiqueta}</h4>
          {d.sesiones.map((s) => <Sesion key={`${s.classId}|${d.fecha}`} s={s} />)}
        </section>
      ))}
    </div>
  );
}

function Sesion({ s }: { s: SesionAcademia }) {
  const [abierta, setAbierta] = useState(false);

  // Lo primero que se lee: las plazas libres. Sin aforo puesto no hay
  // «libres» (no es cero, regla 8): se dice cuántos faltan y ya.
  const libres =
    s.libres === null
      ? { texto: 'sin plazas puestas', clase: 'text-slate-500 dark:text-slate-400' }
      : s.sobreaforo
        ? { texto: `${-s.libres} por encima del aforo`, clase: 'text-red-700 dark:text-red-400' }
        : s.libres === 0
          ? { texto: 'completa', clase: 'text-slate-700 dark:text-slate-200' }
          : { texto: `${s.libres} ${s.libres === 1 ? 'plaza libre' : 'plazas libres'}`, clase: 'text-emerald-700 dark:text-emerald-400' };

  return (
    <Card tone="base" pad="sm">
      <button
        onClick={() => setAbierta((x) => !x)}
        disabled={s.faltan === 0}
        className="w-full min-h-[44px] flex items-center justify-between gap-3 text-left disabled:cursor-default"
      >
        <span className="min-w-0">
          <span className="block font-bold text-slate-900 dark:text-white truncate">
            {s.hora && <span className="font-mono text-slate-500 dark:text-slate-400 mr-2">{s.hora}</span>}
            {s.nombre}
          </span>
          <span className={cx(TEXT.muted, 'block')}>
            Van {s.asisten}{s.aforo !== null && ` de ${s.aforo}`}
            {s.faltan > 0 && ` · ${s.faltan} ${s.faltan === 1 ? 'falta' : 'faltan'}`}
          </span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <span className={cx('text-xs font-black', libres.clase)}>{libres.texto}</span>
          {s.faltan > 0 && <ChevronDown size={14} className={cx('text-slate-400 transition-transform', abierta && 'rotate-180')} />}
        </span>
      </button>
      {abierta && s.faltan > 0 && (
        <ul className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1">
          {s.quienesFaltan.map((q) => (
            <li key={q} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <UserX size={12} className="text-slate-400 shrink-0" /> <span className="truncate">{q}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

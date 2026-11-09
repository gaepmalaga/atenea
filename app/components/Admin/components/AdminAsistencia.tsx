'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarCheck, RefreshCw } from 'lucide-react';
import { getAsistenciaAcademia } from '@/actions';
import type { DiaAcademia, SesionAcademia } from '@/app/actions/asistencia';
import {
  PanelTitulo, Pulso, Filtros, FiltroChip, Hoja, Etiqueta, Dato, Boton, Aviso, EmptyState, cx,
} from '../../ui';

/**
 * ASISTENCIA (regla 82): los próximos días con clase, sesión a sesión.
 *
 * Es la pantalla a la que se va cuando un alumno pide cambiarse de clase:
 * «¿dónde hay hueco el martes?». Por eso va por DÍA y no por grupo, y lo
 * primero que se lee de cada sesión son las plazas libres. Quién falta está
 * debajo, plegado: es el segundo dato, no el primero.
 */
type Filtro = 'todas' | 'hueco' | 'completas' | 'faltas';

const hayHueco = (s: SesionAcademia) => s.libres !== null && s.libres > 0;
// Sin aforo puesto no hay «completa» ni «hueco»: no es cero (regla 8).
const estaLlena = (s: SesionAcademia) => s.libres !== null && s.libres <= 0;

export default function AdminAsistencia() {
  const [dias, setDias] = useState<DiaAcademia[]>([]);
  const [sinHorario, setSinHorario] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todas');

  const cargar = useCallback(async () => {
    const res = await getAsistenciaAcademia();
    if (res.success) { setDias(res.dias); setSinHorario(res.gruposSinHorario); setError(null); }
    else setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const todas = dias.flatMap((d) => d.sesiones);
  const cuenta = {
    todas: todas.length,
    hueco: todas.filter(hayHueco).length,
    completas: todas.filter(estaLlena).length,
    faltas: todas.filter((s) => s.faltan > 0).length,
  };
  const pasa = (s: SesionAcademia) => filtro === 'todas' || (filtro === 'hueco' ? hayHueco(s) : filtro === 'completas' ? estaLlena(s) : s.faltan > 0);

  return (
    <div className="space-y-5 animate-in fade-in pb-24">
      <PanelTitulo
        titulo="Asistencia"
        sub="Las próximas clases, con quién ha avisado de que falta y las plazas libres."
        acciones={<Boton variant="secondary" onClick={() => { setLoading(true); cargar(); }} icon={<RefreshCw size={15} className={loading ? 'animate-spin' : ''} />}>Recargar</Boton>}
      />

      {error && <Aviso tono="malo">{error}</Aviso>}

      {sinHorario.length > 0 && (
        <Aviso tono="info">
          <span>Sin horario puesto, y por eso no salen aquí: <strong>{sinHorario.join(', ')}</strong>. Se pone en «Grupos».</span>
        </Aviso>
      )}

      {!loading && !error && dias.length === 0 && (
        <EmptyState
          icon={<CalendarCheck size={40} />}
          title="No hay clases en las próximas semanas"
          hint="Pon los días, la hora y las plazas de cada grupo en «Grupos»."
          bordered
        />
      )}

      {dias.length > 0 && (
        <>
          <Pulso
            cifras={[
              { valor: cuenta.todas, etiqueta: 'clases en las próximas semanas' },
              { valor: cuenta.faltas, etiqueta: 'con faltas avisadas', tono: cuenta.faltas ? 'aviso' : 'neutro' },
              { valor: todas.reduce((n, s) => n + Math.max(0, s.libres ?? 0), 0), etiqueta: 'plazas libres en total', tono: 'ok' },
              { valor: cuenta.completas, etiqueta: 'clases completas', tono: cuenta.completas ? 'malo' : 'neutro' },
            ]}
          />

          <Filtros etiqueta="Qué clases ver">
            <FiltroChip activo={filtro === 'todas'} onClick={() => setFiltro('todas')} cuenta={cuenta.todas}>Todas</FiltroChip>
            <FiltroChip activo={filtro === 'hueco'} onClick={() => setFiltro('hueco')} cuenta={cuenta.hueco}>Con hueco</FiltroChip>
            <FiltroChip activo={filtro === 'completas'} onClick={() => setFiltro('completas')} cuenta={cuenta.completas}>Completas</FiltroChip>
            <FiltroChip activo={filtro === 'faltas'} onClick={() => setFiltro('faltas')} cuenta={cuenta.faltas}>Con faltas</FiltroChip>
          </Filtros>
        </>
      )}

      {dias.map((d) => {
        const visibles = d.sesiones.filter(pasa);
        if (!visibles.length) return null;
        return (
          <section key={d.fecha} className="space-y-2">
            <h3 className="font-titulo text-xl font-bold uppercase leading-none tracking-wider text-slate-900 dark:text-white">{d.etiqueta}</h3>
            <Hoja className="overflow-hidden">
              {visibles.map((s) => <Sesion key={`${s.classId}|${d.fecha}`} s={s} />)}
            </Hoja>
          </section>
        );
      })}
    </div>
  );
}

function Sesion({ s }: { s: SesionAcademia }) {
  const [abierta, setAbierta] = useState(false);

  // Lo primero que se lee: las plazas libres. Sin aforo puesto no hay
  // «libres» (no es cero, regla 8): se dice cuántos faltan y ya.
  const libres =
    s.libres === null
      ? <Etiqueta tono="apagado">Sin plazas puestas</Etiqueta>
      : s.sobreaforo
        ? <Etiqueta tono="malo">{-s.libres} por encima del aforo</Etiqueta>
        : s.libres === 0
          ? <Etiqueta tono="apagado">Completa</Etiqueta>
          : <Etiqueta tono={s.libres <= 2 ? 'aviso' : 'ok'}>{s.libres} {s.libres === 1 ? 'plaza libre' : 'plazas libres'}</Etiqueta>;

  const porcentaje = s.aforo ? Math.min(100, (s.asisten / s.aforo) * 100) : 0;

  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-2.5 border-b border-linea px-4 py-3 last:border-b-0 dark:border-noche-linea sm:grid-cols-[4.5rem_minmax(0,1.4fr)_minmax(8rem,1fr)_auto_7.5rem]">
      <div className="font-titulo text-xl font-bold leading-none tabular-nums text-slate-900 dark:text-white">{s.hora ?? '—'}</div>
      <p className="min-w-0 truncate font-semibold text-slate-900 dark:text-white">{s.nombre}</p>

      <div className="col-span-2 grid gap-1 text-xs text-slate-600 dark:text-slate-400 sm:col-span-1">
        {s.aforo !== null && (
          <div className="h-1.5 overflow-hidden rounded-full border border-linea bg-hundido dark:border-noche-linea dark:bg-noche-hondo">
            <div className={cx('h-full', s.sobreaforo ? 'bg-red-600 dark:bg-red-400' : 'bg-indigo-900 dark:bg-indigo-300')} style={{ width: `${porcentaje}%` }} />
          </div>
        )}
        <span className="tabular-nums">Van {s.asisten}{s.aforo !== null && ` de ${s.aforo}`}</span>
      </div>

      <div className="col-span-2 sm:col-span-1">{libres}</div>

      <button
        type="button"
        onClick={() => setAbierta((x) => !x)}
        disabled={s.faltan === 0}
        aria-expanded={abierta}
        className="col-span-2 min-h-[44px] rounded-lg border border-linea text-[12.5px] font-medium text-slate-800 hover:border-indigo-700 disabled:cursor-default disabled:border-transparent disabled:text-slate-600 dark:border-noche-linea dark:text-slate-200 dark:disabled:text-slate-400 sm:col-span-1"
      >
        {s.faltan === 0 ? 'Nadie falta' : `${s.faltan} ${s.faltan === 1 ? 'falta' : 'faltan'} ${abierta ? '▴' : '▾'}`}
      </button>

      {abierta && s.faltan > 0 && (
        <div className="col-span-2 flex flex-wrap gap-1.5 pb-1 sm:col-span-5 sm:pl-[5.5rem]">
          {s.quienesFaltan.map((q) => <Dato key={q}>{q}</Dato>)}
        </div>
      )}
    </div>
  );
}

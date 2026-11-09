'use client';

import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, SlidersHorizontal, Search, CalendarDays, Users, UserRound, Clock, AlertTriangle, RotateCcw } from 'lucide-react';
import { getCalendario } from '@/actions';
import type { DatosCalendario } from '@/app/actions/calendario';
import {
  filtraEventos, rangoDeVista, mueveVista, fechasEntre, lunesDeFecha, horaLegible, queEs,
  FILTRO_INICIAL, ETIQUETA_TIPO_EVENTO,
  type EventoCalendario, type FiltroCalendario, type VistaCalendario,
} from '@/app/lib/calendario';
import { ahoraEnZona, diaSemanaDe, DIAS_SEMANA } from '@/app/lib/asistencia';
import { etiquetaRango, nombreCorto } from '@/app/lib/cuadrante';
import {
  PanelTitulo, Hoja, Rotulo, Aviso, Boton, Campo, Estado, EmptyState, PanelLateral, cx,
} from '../../ui';

/**
 * «Calendario» (regla 105) — toda la programación de la academia de un
 * vistazo: las clases de cada grupo, la física del cuadrante, las sesiones
 * sueltas, el entreno de cada alumno, los días sin clase y el examen.
 *
 * Tres vistas (día, semana, mes) y filtros por qué es, por grupo y por
 * profesor, más una búsqueda. Los filtros y la vista se recuerdan en este
 * navegador. Un evento abre su ficha con lo que hace falta saber (quién lo
 * da, cuántos van, quién falta) y el camino a donde se cambia.
 */

const CLAVE_FILTRO = 'calendario:filtro';
const CLAVE_VISTA = 'calendario:vista';
const irAPestana = (id: string) => window.dispatchEvent(new CustomEvent('admin:pestana', { detail: id }));
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const fechaLarga = (f: string) => `${capital(DIAS_LARGOS[diaSemanaDe(f) - 1])} ${Number(f.slice(8, 10))} de ${MESES[Number(f.slice(5, 7)) - 1]}`;

function tituloVista(vista: VistaCalendario, fecha: string): string {
  if (vista === 'dia') return fechaLarga(fecha);
  if (vista === 'semana') { const l = lunesDeFecha(fecha); return capital(etiquetaRango(l, mueveVista('dia', l, 6))); }
  return capital(`${MESES[Number(fecha.slice(5, 7)) - 1]} de ${fecha.slice(0, 4)}`);
}

export default function AdminCalendario() {
  // Hoy, en la hora de la academia, una vez al abrir (no en cada pintado).
  const [hoy] = useState(() => ahoraEnZona(Date.now()).fecha);
  const [vista, setVistaEstado] = useState<VistaCalendario>('semana');
  const [fecha, setFecha] = useState(hoy);
  const [filtro, setFiltroEstado] = useState<FiltroCalendario>(FILTRO_INICIAL);
  const [datos, setDatos] = useState<DatosCalendario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<EventoCalendario | null>(null);
  const [verFiltros, setVerFiltros] = useState(false);
  const cache = useRef(new Map<string, DatosCalendario>());

  // La vista y los filtros de la última vez, en este navegador.
  useEffect(() => {
    let v: string | null = null;
    let f: string | null = null;
    try { v = localStorage.getItem(CLAVE_VISTA); f = localStorage.getItem(CLAVE_FILTRO); } catch { /* sin almacenamiento */ }
    queueMicrotask(() => {
      if (v === 'dia' || v === 'semana' || v === 'mes') setVistaEstado(v);
      if (f) {
        try {
          const x = JSON.parse(f) as Partial<FiltroCalendario>;
          setFiltroEstado({ ...FILTRO_INICIAL, ...x, busca: '' });
        } catch { /* filtro roto: el de siempre */ }
      }
    });
  }, []);
  const setVista = (v: VistaCalendario) => { setVistaEstado(v); try { localStorage.setItem(CLAVE_VISTA, v); } catch { /* */ } };
  const setFiltro = (f: FiltroCalendario) => {
    setFiltroEstado(f);
    try { localStorage.setItem(CLAVE_FILTRO, JSON.stringify({ ...f, busca: '' })); } catch { /* */ }
  };

  const { desde, hasta } = rangoDeVista(vista, fecha);
  useEffect(() => {
    let vivo = true;
    const clave = `${desde}|${hasta}`;
    const enCache = cache.current.get(clave);
    (async () => {
      if (enCache) { setDatos(enCache); setCargando(false); return; }
      setCargando(true);
      const res = await getCalendario({ desde, hasta });
      if (!vivo) return;
      if (res.success) { cache.current.set(clave, res.datos); setDatos(res.datos); setError(null); } else setError(res.error);
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [desde, hasta]);

  const todos = datos && datos.desde === desde && datos.hasta === hasta ? datos.eventos : [];
  const visibles = filtraEventos(todos, filtro);
  // Lo que se cuenta como «filtro puesto» es lo que cambia sobre el de
  // siempre (que ya esconde los entrenos de cada alumno).
  const queDistinto = filtro.ocultosQue.filter((x) => !FILTRO_INICIAL.ocultosQue.includes(x)).length
    + FILTRO_INICIAL.ocultosQue.filter((x) => !filtro.ocultosQue.includes(x)).length;
  const nFiltros = queDistinto + filtro.ocultosGrupos.length + filtro.ocultosProfesores.length + (filtro.busca ? 1 : 0);
  const sinEntrenos = filtro.ocultosQue.includes('entreno') && todos.some((e) => e.tipo === 'entreno');
  const abreDia = (f: string) => { setFecha(f); setVista('dia'); };

  return (
    <div className="space-y-5 animate-in fade-in pb-24">
      <PanelTitulo
        titulo="Calendario"
        sub={<span className="max-sm:hidden">Toda la programación: clases, física, sesiones sueltas, entrenos, días sin clase y el examen.</span>}
        acciones={
          <Boton variant="secondary" className="lg:hidden" icon={<SlidersHorizontal size={15} />} onClick={() => setVerFiltros((x) => !x)} aria-expanded={verFiltros}>
            Filtros{nFiltros ? ` (${nFiltros})` : ''}
          </Boton>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setFecha(mueveVista(vista, fecha, -1))} aria-label="Anterior" className="grid h-11 w-11 place-items-center rounded-lg border border-linea text-slate-700 hover:border-indigo-700 dark:border-noche-linea dark:text-slate-300"><ChevronLeft size={18} /></button>
          <Boton variant="secondary" onClick={() => setFecha(hoy)} disabled={rangoDeVista(vista, hoy).desde === desde}>Hoy</Boton>
          <button onClick={() => setFecha(mueveVista(vista, fecha, 1))} aria-label="Siguiente" className="grid h-11 w-11 place-items-center rounded-lg border border-linea text-slate-700 hover:border-indigo-700 dark:border-noche-linea dark:text-slate-300"><ChevronRight size={18} /></button>
          <h3 className="ml-1 font-titulo text-xl font-bold uppercase leading-tight tracking-wide text-slate-900 dark:text-white sm:text-2xl">{tituloVista(vista, fecha)}</h3>
        </div>
        <div role="tablist" aria-label="Vista del calendario" className="flex rounded-lg border border-linea p-0.5 dark:border-noche-linea">
          {(['dia', 'semana', 'mes'] as const).map((v) => (
            <button key={v} role="tab" aria-selected={vista === v} onClick={() => setVista(v)}
              className={cx('min-h-[40px] rounded-md px-4 text-sm font-semibold', vista === v ? 'bg-indigo-900 text-white dark:bg-indigo-300 dark:text-marino-hondo' : 'text-slate-700 dark:text-slate-300')}>
              {v === 'dia' ? 'Día' : v === 'semana' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>
      </div>

      {error && <Aviso tono="malo"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}</Aviso>}

      <div className="grid items-start gap-5 lg:grid-cols-[15.5rem_minmax(0,1fr)]">
        <div className={cx(!verFiltros && 'max-lg:hidden')}>
          {datos && <PanelFiltros datos={datos} eventos={todos} filtro={filtro} setFiltro={setFiltro} />}
        </div>

        <div className="min-w-0 space-y-3">
          {cargando && !datos && <p className="py-10 text-center text-sm text-slate-600 dark:text-slate-400">Cargando…</p>}
          {datos && (
            <>
              <p className="text-xs text-slate-600 dark:text-slate-400" aria-live="polite">
                {cargando ? 'Cargando…' : `${visibles.length} ${visibles.length === 1 ? 'evento' : 'eventos'}${nFiltros ? ` de ${todos.length}: hay filtros puestos` : ''}${sinEntrenos ? ' · sin los entrenos de cada alumno (se ven marcándolos en «Qué»)' : ''}`}
              </p>
              {vista === 'mes' && <VistaMes fecha={fecha} desde={desde} hasta={hasta} hoy={datos.hoy} eventos={visibles} onDia={abreDia} onEvento={setAbierto} />}
              {vista === 'semana' && <VistaSemana desde={desde} hasta={hasta} hoy={datos.hoy} eventos={visibles} onDia={abreDia} onEvento={setAbierto} />}
              {vista === 'dia' && <ListaDia fecha={fecha} eventos={visibles} onEvento={setAbierto} />}
            </>
          )}
        </div>
      </div>

      {abierto && <FichaEvento e={abierto} onCerrar={() => setAbierto(null)} />}
    </div>
  );
}

// ============================================================
// LOS FILTROS
// ============================================================

function PanelFiltros({ datos, eventos, filtro, setFiltro }: {
  datos: DatosCalendario; eventos: EventoCalendario[]; filtro: FiltroCalendario; setFiltro: (f: FiltroCalendario) => void;
}) {
  const cuenta = (pred: (e: EventoCalendario) => boolean) => eventos.filter(pred).length;
  const alterna = (lista: string[], id: string) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  const ques: { id: string; label: string }[] = [
    ...datos.tipos.filter((t) => eventos.some((e) => queEs(e) === t.id)),
    { id: 'entreno', label: 'Entrenos de alumnos' },
    { id: 'sin_clase', label: 'Días sin clase' },
    { id: 'examen', label: 'Examen' },
  ];
  const grupos = datos.grupos.filter((g) => !g.esMulti || eventos.some((e) => e.grupoId === g.id));
  const hayFiltros = filtro.ocultosQue.join() !== FILTRO_INICIAL.ocultosQue.join() || filtro.ocultosGrupos.length || filtro.ocultosProfesores.length || filtro.busca;

  return (
    <Hoja pad="md" className="space-y-5 lg:sticky lg:top-4">
      <Campo value={filtro.busca} onChange={(e) => setFiltro({ ...filtro, busca: e.target.value })} placeholder="Buscar: Boxeo, Juan, Alpha…"
        aria-label="Buscar en el calendario" trailing={<Search size={15} className="mr-2 text-slate-500" aria-hidden />} />

      <Bloque titulo="Qué">
        {ques.map((q) => (
          <Interruptor key={q.id} on={!filtro.ocultosQue.includes(q.id)} onClick={() => setFiltro({ ...filtro, ocultosQue: alterna(filtro.ocultosQue, q.id) })}
            cuenta={cuenta((e) => queEs(e) === q.id)}>{q.label}</Interruptor>
        ))}
      </Bloque>

      {grupos.length > 0 && (
        <Bloque titulo="Grupos" aside={
          <button className="min-h-[32px] text-xs font-semibold text-indigo-900 underline dark:text-indigo-200"
            onClick={() => setFiltro({ ...filtro, ocultosGrupos: filtro.ocultosGrupos.length ? [] : grupos.map((g) => g.id) })}>
            {filtro.ocultosGrupos.length ? 'Todos' : 'Ninguno'}
          </button>}>
          {grupos.map((g) => (
            <Interruptor key={g.id} on={!filtro.ocultosGrupos.includes(g.id)} color={g.color.fondo}
              onClick={() => setFiltro({ ...filtro, ocultosGrupos: alterna(filtro.ocultosGrupos, g.id) })}
              cuenta={cuenta((e) => e.grupoId === g.id)}>{g.nombre}</Interruptor>
          ))}
        </Bloque>
      )}

      <Bloque titulo="Profesores" aside={datos.profesores.length > 0 ? (
        <button className="min-h-[32px] text-xs font-semibold text-indigo-900 underline dark:text-indigo-200"
          onClick={() => setFiltro({ ...filtro, ocultosProfesores: filtro.ocultosProfesores.length ? [] : ['', ...datos.profesores.map((p) => p.id)] })}>
          {filtro.ocultosProfesores.length ? 'Todos' : 'Ninguno'}
        </button>) : undefined}>
        {datos.profesores.map((p) => (
          <Interruptor key={p.id} on={!filtro.ocultosProfesores.includes(p.id)} onClick={() => setFiltro({ ...filtro, ocultosProfesores: alterna(filtro.ocultosProfesores, p.id) })}
            cuenta={cuenta((e) => e.profesorIds.includes(p.id))}>{p.nombre}</Interruptor>
        ))}
        <Interruptor on={!filtro.ocultosProfesores.includes('')} onClick={() => setFiltro({ ...filtro, ocultosProfesores: alterna(filtro.ocultosProfesores, '') })}
          cuenta={cuenta((e) => e.tipo !== 'examen' && !e.profesorIds.length)}>Sin profesor</Interruptor>
      </Bloque>

      {hayFiltros && <Boton size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => setFiltro(FILTRO_INICIAL)}>Quitar los filtros</Boton>}
    </Hoja>
  );
}

function Bloque({ titulo, aside, children }: { titulo: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2"><Rotulo>{titulo}</Rotulo>{aside}</div>
      <div className="grid gap-0.5">{children}</div>
    </div>
  );
}

/** Una casilla de filtro: marcada, se ve; desmarcada, se esconde. */
function Interruptor({ on, onClick, cuenta, color, children }: { on: boolean; onClick: () => void; cuenta: number; color?: string; children: ReactNode }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} onClick={onClick}
      className={cx('flex min-h-[40px] w-full items-center gap-2.5 rounded-md px-1.5 text-left text-[13px] hover:bg-hundido dark:hover:bg-noche-hondo', !on && 'text-slate-500 dark:text-slate-500')}>
      <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded border-2', on ? 'border-indigo-900 bg-indigo-900 dark:border-indigo-300 dark:bg-indigo-300' : 'border-slate-400 dark:border-slate-600')}
        style={on && color ? { backgroundColor: color, borderColor: color } : undefined}>
        {on && <svg viewBox="0 0 12 12" className="h-3 w-3 text-white dark:text-marino-hondo" style={color ? { color: '#fff' } : undefined} aria-hidden><path d="M2 6.5 5 9l5-6" fill="none" stroke="currentColor" strokeWidth="2" /></svg>}
      </span>
      <span className={cx('min-w-0 flex-1 truncate', !on && 'line-through decoration-slate-400')}>{children}</span>
      <b className="shrink-0 text-xs font-semibold tabular-nums text-slate-500">{cuenta}</b>
    </button>
  );
}

// ============================================================
// LAS PIEZAS DE UN EVENTO
// ============================================================

const estiloDe = (e: EventoCalendario): CSSProperties =>
  e.tipo === 'sin_clase'
    ? { background: 'repeating-linear-gradient(135deg, transparent 0 5px, rgb(100 116 139 / 0.18) 5px 7px)', color: 'inherit' }
    : { backgroundColor: e.color.fondo, color: e.color.texto };

/** Lo que dice la pastilla: «Boxeo · Alpha». */
function textoCorto(e: EventoCalendario): string {
  if (e.tipo === 'entreno') return `${e.titulo} · ${e.alumno?.split('@')[0] ?? 'alumno'}`;
  if (e.tipo === 'sin_clase') return `Sin clase · ${e.grupo ? nombreCorto(e.grupo) : ''}`;
  if (e.tipo === 'fisica' || e.tipo === 'suelta') return `${e.titulo}${e.grupo ? ` · ${nombreCorto(e.grupo)}` : ''}`;
  return e.titulo;
}

/**
 * Un evento en una línea: «8:00 Boxeo · Alpha». `ajustada`: del ancho de su
 * texto (en el móvil van una tras otra) y más alta, para el dedo.
 */
function Pildora({ e, onClick, conHora = true, ajustada = false, doble = false }: { e: EventoCalendario; onClick: () => void; conHora?: boolean; ajustada?: boolean; doble?: boolean }) {
  // En la semana hay alto de sobra: dos líneas, «8:00 Boxeo» y «Alpha · Juan».
  if (doble) {
    const segunda = [e.grupo && e.tipo !== 'clase' ? nombreCorto(e.grupo) : null, e.tipo === 'entreno' ? e.alumno?.split('@')[0] : e.profesores.map((x) => x.split(' ')[0]).join(', ') || null]
      .filter(Boolean).join(' · ');
    return (
      <button type="button" onClick={(ev) => { ev.stopPropagation(); onClick(); }} title={`${horaLegible(e.inicio)} · ${textoCorto(e)}`}
        className={cx('block w-full min-w-0 overflow-hidden rounded px-1.5 py-1 text-left text-[11px] leading-tight', e.tipo === 'sin_clase' && 'border border-dashed border-slate-400 text-slate-600 dark:text-slate-400', e.tipo === 'entreno' && 'border border-slate-300')}
        style={estiloDe(e)}>
        <span className={cx('block truncate', e.sinPlanificar && 'italic opacity-80', e.tipo === 'sin_clase' && 'line-through')}>
          {e.inicio && <b className="tabular-nums">{horaLegible(e.inicio)} </b>}{e.tipo === 'sin_clase' ? 'Sin clase' : e.titulo}
        </span>
        {(segunda || e.tipo === 'sin_clase') && <span className="block truncate opacity-85">{e.tipo === 'sin_clase' ? [e.grupo && nombreCorto(e.grupo), e.motivo].filter(Boolean).join(' · ') : segunda}</span>}
      </button>
    );
  }
  return (
    <button type="button" onClick={(ev) => { ev.stopPropagation(); onClick(); }}
      className={cx('flex min-w-0 items-center gap-1 overflow-hidden rounded text-left leading-tight', ajustada ? 'min-h-[32px] max-w-full px-2 text-xs' : 'w-full px-1.5 py-0.5 text-[11px]', e.tipo === 'sin_clase' && 'border border-dashed border-slate-400 text-slate-600 dark:text-slate-400', e.tipo === 'entreno' && 'border border-slate-300')}
      style={estiloDe(e)} title={`${horaLegible(e.inicio)} · ${textoCorto(e)}`}>
      {conHora && e.inicio && <b className="shrink-0 tabular-nums">{horaLegible(e.inicio)}</b>}
      <span className={cx('truncate', e.sinPlanificar && 'italic opacity-80', e.tipo === 'sin_clase' && 'line-through')}>{textoCorto(e)}</span>
    </button>
  );
}

function lineaPlazas(e: EventoCalendario): string | null {
  const p = e.plazas;
  if (!p) return null;
  const partes = [p.aforo !== null ? `Van ${p.asisten} de ${p.aforo}` : `Van ${p.asisten}`];
  if (p.faltan) partes.push(`${p.faltan} ${p.faltan === 1 ? 'falta' : 'faltan'}`);
  const multis = p.asisten - (p.inscritos - p.faltan);
  if (multis > 0) partes.push(`${multis} ${multis === 1 ? 'multi' : 'multis'}`);
  if (p.libres !== null) partes.push(p.libres < 0 ? `${-p.libres} por encima del aforo` : p.libres === 0 ? 'completa' : `${p.libres} ${p.libres === 1 ? 'plaza libre' : 'plazas libres'}`);
  return partes.join(' · ');
}

// ============================================================
// LA VISTA DEL MES
// ============================================================

function VistaMes({ fecha, desde, hasta, hoy, eventos, onDia, onEvento }: {
  fecha: string; desde: string; hasta: string; hoy: string; eventos: EventoCalendario[]; onDia: (f: string) => void; onEvento: (e: EventoCalendario) => void;
}) {
  const mes = fecha.slice(0, 7);
  const porDia = new Map<string, EventoCalendario[]>();
  for (const e of eventos) porDia.set(e.fecha, [...(porDia.get(e.fecha) ?? []), e]);
  return (
    <Hoja className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-linea bg-hundido text-center text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:border-noche-linea dark:bg-noche-hondo dark:text-slate-400">
        {DIAS_SEMANA.map((d) => <div key={d.n} className="py-2"><span className="sm:hidden">{d.corto}</span><span className="hidden sm:inline">{d.largo.slice(0, 3)}</span></div>)}
      </div>
      <div className="grid grid-cols-7">
        {fechasEntre(desde, hasta).map((f) => {
          const es = porDia.get(f) ?? [];
          const fuera = !f.startsWith(mes);
          return (
            <div key={f} role="button" tabIndex={0} onClick={() => onDia(f)} onKeyDown={(ev) => { if (ev.key === 'Enter') onDia(f); }}
              aria-label={`${fechaLarga(f)}: ${es.length} ${es.length === 1 ? 'evento' : 'eventos'}`}
              className={cx('min-h-[64px] cursor-pointer border-b border-r border-linea p-1 text-left align-top hover:bg-hundido dark:border-noche-linea dark:hover:bg-noche-hondo sm:min-h-[112px] sm:p-1.5', fuera && 'bg-hundido/50 opacity-60 dark:bg-noche-hondo/40')}>
              <span className={cx('mb-1 inline-grid h-7 min-w-7 place-items-center rounded-full px-1 text-xs font-bold tabular-nums', f === hoy ? 'bg-oro text-marino-hondo' : 'text-slate-800 dark:text-slate-200')}>{Number(f.slice(8, 10))}</span>
              {/* Móvil: puntos de color y cuántos. */}
              <div className="flex flex-wrap gap-0.5 sm:hidden">
                {es.slice(0, 6).map((e) => <i key={e.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: e.tipo === 'sin_clase' ? '#94a3b8' : e.color.fondo }} />)}
                {es.length > 6 && <span className="text-[9px] leading-none text-slate-500">+{es.length - 6}</span>}
              </div>
              {/* Escritorio: las tres primeras y «+N más». */}
              <div className="hidden space-y-0.5 sm:block">
                {es.slice(0, 3).map((e) => <Pildora key={e.id} e={e} onClick={() => onEvento(e)} />)}
                {es.length > 3 && <span className="block px-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400">+{es.length - 3} más</span>}
              </div>
            </div>
          );
        })}
      </div>
    </Hoja>
  );
}

// ============================================================
// LA VISTA DE LA SEMANA: como el mes, una casilla por día
// ============================================================

/**
 * La semana se lee como una fila del mes: siete casillas con TODO lo de cada
 * día en una línea por evento, sin rejilla de horas que obligue a bajar. El
 * dueño lo pidió así: «que se vea claro de un vistazo qué hay esa semana».
 * En el móvil, una fila por día con sus eventos uno tras otro.
 */
function VistaSemana({ desde, hasta, hoy, eventos, onDia, onEvento }: {
  desde: string; hasta: string; hoy: string; eventos: EventoCalendario[]; onDia: (f: string) => void; onEvento: (e: EventoCalendario) => void;
}) {
  const dias = fechasEntre(desde, hasta);
  const porDia = new Map<string, EventoCalendario[]>();
  for (const e of eventos) porDia.set(e.fecha, [...(porDia.get(e.fecha) ?? []), e]);

  return (
    <>
      {/* TABLET Y ESCRITORIO: siete casillas. */}
      <Hoja className="hidden overflow-hidden md:block">
        <div className="grid grid-cols-7">
          {dias.map((f, i) => {
            const es = porDia.get(f) ?? [];
            return (
              <div key={f} className={cx('min-h-[14rem] min-w-0 border-r border-linea last:border-r-0 dark:border-noche-linea', f === hoy && 'bg-oro/5')}>
                <button onClick={() => onDia(f)} aria-label={`Abrir el ${fechaLarga(f).toLowerCase()}`}
                  className={cx('flex w-full items-center justify-between gap-1 border-b border-linea bg-hundido px-2 py-1.5 text-left dark:border-noche-linea dark:bg-noche-hondo', f === hoy && 'bg-oro/25 dark:bg-oro/15')}>
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-400">{DIAS_SEMANA[i].largo.slice(0, 3)}</span>
                  <span className={cx('grid h-7 min-w-7 place-items-center rounded-full px-1 font-titulo text-lg font-bold leading-none', f === hoy ? 'bg-oro text-marino-hondo' : 'text-slate-900 dark:text-white')}>{Number(f.slice(8, 10))}</span>
                </button>
                <div className="space-y-0.5 p-1">
                  {es.map((e) => <Pildora key={e.id} e={e} onClick={() => onEvento(e)} doble />)}
                  {!es.length && <p className="py-3 text-center text-[11px] text-slate-400 dark:text-slate-600">Nada</p>}
                </div>
              </div>
            );
          })}
        </div>
      </Hoja>

      {/* MÓVIL: una fila por día. */}
      <Hoja className="divide-y divide-linea dark:divide-noche-linea md:hidden">
        {dias.map((f, i) => {
          const es = porDia.get(f) ?? [];
          return (
            <div key={f} className={cx('grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2 px-2 py-2', f === hoy && 'bg-oro/10')}>
              <button onClick={() => onDia(f)} aria-label={`Abrir el ${fechaLarga(f).toLowerCase()}`} className="flex min-h-[44px] flex-col items-center justify-start">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-400">{DIAS_SEMANA[i].corto}</span>
                <span className={cx('grid h-8 w-8 place-items-center rounded-full font-titulo text-lg font-bold leading-none', f === hoy ? 'bg-oro text-marino-hondo' : 'text-slate-900 dark:text-white')}>{Number(f.slice(8, 10))}</span>
              </button>
              <div className="flex min-w-0 flex-wrap content-start gap-1 py-0.5">
                {es.length
                  ? es.map((e) => <Pildora key={e.id} e={e} onClick={() => onEvento(e)} ajustada />)
                  : <span className="self-center text-xs text-slate-400 dark:text-slate-600">Nada</span>}
              </div>
            </div>
          );
        })}
      </Hoja>
    </>
  );
}

// ============================================================
// LA VISTA DEL DÍA: el día entero en una pantalla
// ============================================================

type Franja = 'dia' | 'manana' | 'tarde' | 'noche';
const FRANJAS: [Franja, string][] = [['dia', 'Todo el día'], ['manana', 'Mañana'], ['tarde', 'Tarde'], ['noche', 'Noche']];
const franjaDe = (e: EventoCalendario): Franja => (!e.inicio ? 'dia' : e.inicio < '14:00' ? 'manana' : e.inicio < '20:00' ? 'tarde' : 'noche');

/** «29/30 · 2 faltan»: lo que hay que saber de las plazas, corto. */
function plazasCortas(e: EventoCalendario): string | null {
  const p = e.plazas;
  if (!p) return null;
  const base = p.aforo !== null ? `${p.asisten}/${p.aforo}` : `${p.asisten} van`;
  return `${base}${p.faltan ? ` · ${p.faltan} ${p.faltan === 1 ? 'falta' : 'faltan'}` : ''}${p.sobreaforo ? ' · ¡sobre aforo!' : ''}`;
}

/**
 * El día en tres columnas (mañana, tarde, noche) y una línea por evento: la
 * hora, el color del grupo, qué es, quién lo da y cuántos van. Lo de todo el
 * día (el examen, un entreno sin hora) va arriba. Cabe en una pantalla.
 */
function ListaDia({ fecha, eventos, onEvento }: { fecha: string; eventos: EventoCalendario[]; onEvento: (e: EventoCalendario) => void }) {
  const es = eventos.filter((e) => e.fecha === fecha);
  if (!es.length) return <EmptyState bordered icon={<CalendarDays size={36} />} title="Nada programado este día" hint="O lo esconden los filtros: mira cuántos hay arriba." />;
  const de = (f: Franja) => es.filter((e) => franjaDe(e) === f);
  const sinPlan = es.filter((e) => e.sinPlanificar).length;
  const faltas = es.reduce((n, e) => n + (e.plazas?.faltan ?? 0), 0);
  const conHora = FRANJAS.filter(([f]) => f !== 'dia' && de(f).length);

  return (
    <div className="space-y-3">
      {(sinPlan > 0 || faltas > 0) && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
          {sinPlan > 0 && <span className="font-semibold text-amber-700 dark:text-amber-300">{sinPlan} sin planificar</span>}
          {faltas > 0 && <span>{faltas} {faltas === 1 ? 'falta avisada' : 'faltas avisadas'}</span>}
        </p>
      )}
      {de('dia').length > 0 && (
        <Hoja pad="sm" className="space-y-1">
          <Rotulo>Todo el día</Rotulo>
          <div className="flex flex-wrap gap-1">{de('dia').map((e) => <Pildora key={e.id} e={e} onClick={() => onEvento(e)} ajustada />)}</div>
        </Hoja>
      )}
      <div className={cx('grid gap-3', conHora.length >= 3 ? 'md:grid-cols-3' : conHora.length === 2 ? 'md:grid-cols-2' : '')}>
        {conHora.map(([f, etiqueta]) => (
          <Hoja key={f} pad="sm" className="min-w-0">
            <Rotulo>{etiqueta} · {de(f).length}</Rotulo>
            <ul className="mt-1 divide-y divide-linea dark:divide-noche-linea">
              {de(f).map((e) => <LineaEvento key={e.id} e={e} onClick={() => onEvento(e)} />)}
            </ul>
          </Hoja>
        ))}
      </div>
    </div>
  );
}

function LineaEvento({ e, onClick }: { e: EventoCalendario; onClick: () => void }) {
  const plazas = plazasCortas(e);
  const quien = e.tipo === 'entreno' ? e.alumno?.split('@')[0] : e.profesores.join(', ');
  return (
    <li>
      <button type="button" onClick={onClick} className="flex min-h-[44px] w-full items-center gap-2 py-1 text-left hover:bg-hundido dark:hover:bg-noche-hondo">
        <span className="w-10 shrink-0 text-[13px] font-semibold tabular-nums text-slate-900 dark:text-white">{e.inicio ? horaLegible(e.inicio) : ''}</span>
        <i className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: e.tipo === 'sin_clase' ? '#94a3b8' : e.color.fondo }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className={cx('block truncate text-[13px] font-semibold text-slate-900 dark:text-white', e.tipo === 'sin_clase' && 'line-through', e.sinPlanificar && 'italic text-amber-800 dark:text-amber-300')}>
            {e.tipo === 'sin_clase' ? 'Sin clase' : e.titulo}
            {e.grupo && e.titulo !== e.grupo && <span className="font-normal text-slate-600 dark:text-slate-400"> · {nombreCorto(e.grupo)}</span>}
          </span>
          <span className="block truncate text-[11px] text-slate-600 dark:text-slate-400">
            {[quien || (e.tipo !== 'sin_clase' && e.tipo !== 'examen' ? 'Sin profesor' : ''), e.motivo, plazas].filter(Boolean).join(' · ')}
          </span>
        </span>
      </button>
    </li>
  );
}

// ============================================================
// LA FICHA DE UN EVENTO
// ============================================================

function FichaEvento({ e, onCerrar }: { e: EventoCalendario; onCerrar: () => void }) {
  const ir = (id: string) => { onCerrar(); irAPestana(id); };
  const p = e.plazas;
  const titulo = e.tipo === 'sin_clase' ? 'Sin clase' : e.titulo;
  return (
    <PanelLateral titulo={titulo} sub={`${fechaLarga(e.fecha)} · ${e.inicio ? `${horaLegible(e.inicio)}${e.fin ? `–${horaLegible(e.fin)}` : ''}` : 'todo el día'}`} onCerrar={onCerrar}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: e.tipo === 'sin_clase' ? '#94a3b8' : e.color.fondo }} aria-hidden />
        <Estado tono={e.tipo === 'sin_clase' ? 'apagado' : e.sinPlanificar ? 'aviso' : e.tipo === 'examen' ? 'oro' : 'ok'}>
          {e.tipo === 'clase' ? `Clase de ${e.kindLabel?.toLowerCase() ?? 'grupo'}` : ETIQUETA_TIPO_EVENTO[e.tipo]}{e.sinPlanificar ? ' · sin planificar' : ''}
        </Estado>
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        {e.grupo && <><dt className="text-slate-600 dark:text-slate-400"><Users size={14} className="mr-1 inline" />Grupo</dt><dd className="font-medium">{e.grupo}</dd></>}
        {e.alumno && <><dt className="text-slate-600 dark:text-slate-400"><UserRound size={14} className="mr-1 inline" />Alumno</dt><dd className="font-medium break-all">{e.alumno}</dd></>}
        <dt className="text-slate-600 dark:text-slate-400"><UserRound size={14} className="mr-1 inline" />Profesor</dt>
        <dd className="font-medium">{e.profesores.length ? e.profesores.join(', ') : <span className="text-amber-700 dark:text-amber-300">Sin profesor</span>}</dd>
        <dt className="text-slate-600 dark:text-slate-400"><Clock size={14} className="mr-1 inline" />Hora</dt>
        <dd className="font-medium">{e.inicio ? `${horaLegible(e.inicio)}${e.fin ? ` a ${horaLegible(e.fin)}` : ''}` : 'Todo el día'}</dd>
        {e.motivo && <><dt className="text-slate-600 dark:text-slate-400">Motivo</dt><dd className="font-medium">{e.motivo}</dd></>}
      </dl>

      {p && (
        <Hoja tone="sunken" pad="md" className="space-y-1">
          <Rotulo>Quién va</Rotulo>
          <p className="font-titulo text-3xl font-bold leading-none tabular-nums">{p.asisten}{p.aforo !== null && <span className="text-lg text-slate-500"> / {p.aforo}</span>}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">{lineaPlazas(e)}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">{p.inscritos} del grupo{p.faltan ? `, ${p.faltan} han avisado de que faltan` : ''}.</p>
        </Hoja>
      )}

      <div className="flex flex-wrap gap-2">
        {(e.tipo === 'fisica' || e.tipo === 'suelta' || e.tipo === 'entreno' || (e.tipo === 'sin_clase' && e.kind === 'fisicas')) && (
          <Boton onClick={() => ir('physical')}>{e.tipo === 'entreno' ? 'Abrir «Planificar»' : 'Abrir el cuadrante'}</Boton>
        )}
        {e.plazas && <Boton variant="secondary" onClick={() => ir('attendance')}>Ver en Asistencia</Boton>}
        {e.grupoId && <Boton variant="secondary" onClick={() => ir('groups')}>Horario del grupo</Boton>}
        {e.tipo === 'examen' && <Boton variant="secondary" onClick={() => ir('modules')}>Cambiar la fecha</Boton>}
      </div>
    </PanelLateral>
  );
}

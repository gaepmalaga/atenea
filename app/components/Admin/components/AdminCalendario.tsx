'use client';

import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, SlidersHorizontal, Search, CalendarDays, Users, UserRound, Clock, AlertTriangle, RotateCcw } from 'lucide-react';
import { getCalendario } from '@/actions';
import type { DatosCalendario } from '@/app/actions/calendario';
import {
  filtraEventos, rangoDeVista, mueveVista, fechasEntre, lunesDeFecha, horaLegible, aHoras, queEs,
  FILTRO_INICIAL, ETIQUETA_TIPO_EVENTO,
  type EventoCalendario, type FiltroCalendario, type VistaCalendario,
} from '@/app/lib/calendario';
import { ahoraEnZona, diaSemanaDe, DIAS_SEMANA } from '@/app/lib/asistencia';
import { etiquetaRango, nombreCorto } from '@/app/lib/cuadrante';
import { enCarriles, tramosDeHoras } from '@/app/lib/groups';
import {
  PanelTitulo, Hoja, Rotulo, Aviso, Boton, Campo, Etiqueta, Estado, EmptyState, PanelLateral, cx,
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
        sub="Toda la programación: clases, física, sesiones sueltas, entrenos, días sin clase y el examen."
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

function Pildora({ e, onClick, conHora = true }: { e: EventoCalendario; onClick: () => void; conHora?: boolean }) {
  return (
    <button type="button" onClick={(ev) => { ev.stopPropagation(); onClick(); }}
      className={cx('flex w-full min-w-0 items-center gap-1 overflow-hidden rounded px-1.5 py-0.5 text-left text-[11px] leading-tight', e.tipo === 'sin_clase' && 'border border-dashed border-slate-400 text-slate-600 dark:text-slate-400', e.tipo === 'entreno' && 'border border-slate-300')}
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
// LA VISTA DE LA SEMANA
// ============================================================

const PX_HORA = 52;
const SALTO = 24;

function VistaSemana({ desde, hasta, hoy, eventos, onDia, onEvento }: {
  desde: string; hasta: string; hoy: string; eventos: EventoCalendario[]; onDia: (f: string) => void; onEvento: (e: EventoCalendario) => void;
}) {
  const dias = fechasEntre(desde, hasta);
  const conHora = eventos.filter((e) => e.inicio);
  const sinHora = eventos.filter((e) => !e.inicio);
  const tramos = conHora.length ? tramosDeHoras(conHora.map((e) => ({ ini: aHoras(e.inicio!), fin: aHoras(e.fin ?? e.inicio!) || aHoras(e.inicio!) + 1 }))) : [];
  const yDe = (h: number) => {
    let y = 4;
    for (const t of tramos) {
      if (h <= t.hasta) return y + (Math.max(h, t.desde) - t.desde) * PX_HORA;
      y += (t.hasta - t.desde) * PX_HORA + SALTO;
    }
    return y - SALTO;
  };
  const alto = tramos.length ? yDe(tramos[tramos.length - 1].hasta) + 4 : 0;

  return (
    <>
      {/* ESCRITORIO: la rejilla de la semana, con las horas. */}
      <Hoja className="hidden overflow-hidden lg:block">
        <div className="grid" style={{ gridTemplateColumns: `3.25rem repeat(7, minmax(0, 1fr))` }}>
          <div className="border-b border-linea bg-hundido dark:border-noche-linea dark:bg-noche-hondo" />
          {dias.map((f, i) => (
            <button key={f} onClick={() => onDia(f)} className={cx('border-b border-l border-linea bg-hundido py-2 text-center dark:border-noche-linea dark:bg-noche-hondo', f === hoy && 'bg-oro/25 dark:bg-oro/15')}>
              <span className="block text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-400">{DIAS_SEMANA[i].largo.slice(0, 3)}</span>
              <span className="font-titulo text-xl font-bold leading-none text-slate-900 dark:text-white">{Number(f.slice(8, 10))}</span>
            </button>
          ))}
          {sinHora.length > 0 && (
            <>
              <div className="border-b border-linea px-1 py-1 text-right text-[10px] text-slate-500 dark:border-noche-linea">Día</div>
              {dias.map((f) => (
                <div key={f} className="space-y-0.5 border-b border-l border-linea p-1 dark:border-noche-linea">
                  {sinHora.filter((e) => e.fecha === f).map((e) => <Pildora key={e.id} e={e} onClick={() => onEvento(e)} />)}
                </div>
              ))}
            </>
          )}
          {tramos.length === 0 ? (
            <div className="col-span-8 p-8 text-center text-sm text-slate-600 dark:text-slate-400">Nada con hora esta semana.</div>
          ) : (
            <>
              <div className="relative" style={{ height: alto }}>
                {tramos.flatMap((t) => Array.from({ length: t.hasta - t.desde + 1 }, (_, i) => t.desde + i)).map((h, i) => (
                  <span key={`${h}-${i}`} className="absolute right-1.5 -translate-y-1/2 text-[11px] tabular-nums text-slate-600 dark:text-slate-400" style={{ top: yDe(h) }}>{String(h).padStart(2, '0')}:00</span>
                ))}
              </div>
              {dias.map((f) => (
                <div key={f} className={cx('relative border-l border-linea dark:border-noche-linea', f === hoy && 'bg-oro/5')} style={{ height: alto }}>
                  {tramos.slice(0, -1).map((t) => (
                    <div key={t.hasta} className="absolute inset-x-0 border-y border-dashed border-linea bg-hundido/60 dark:border-noche-linea dark:bg-noche-hondo/60" style={{ top: yDe(t.hasta) + 2, height: SALTO - 4 }} aria-hidden />
                  ))}
                  {enCarriles(conHora.filter((e) => e.fecha === f).map((e) => ({ e, ini: aHoras(e.inicio!), fin: Math.max(aHoras(e.fin ?? e.inicio!), aHoras(e.inicio!) + 0.5) }))).map(({ e, ini, fin, carril, carriles }) => (
                    <button key={e.id} type="button" onClick={() => onEvento(e)} title={`${horaLegible(e.inicio)} · ${textoCorto(e)}`}
                      className={cx('absolute overflow-hidden rounded-md px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm', e.tipo === 'sin_clase' && 'border border-dashed border-slate-400 text-slate-600 dark:text-slate-400', e.tipo === 'entreno' && 'border border-slate-300')}
                      style={{ ...estiloDe(e), top: yDe(ini) + 1, height: Math.max(yDe(fin) - yDe(ini) - 2, 22), left: `calc(${(carril / carriles) * 100}% + 2px)`, width: `calc(${100 / carriles}% - 4px)` }}>
                      {/* En un carril estrecho, solo lo que toca («Boxeo»): el grupo lo dice el color, y la ficha lo dice entero. */}
                      <b className={cx('block truncate', e.tipo === 'sin_clase' && 'line-through')}>{carriles > 1 ? (e.tipo === 'clase' || !e.grupo ? e.titulo : e.tipo === 'sin_clase' ? nombreCorto(e.grupo) : e.titulo) : textoCorto(e)}</b>
                      <span className="block truncate tabular-nums opacity-90">{horaLegible(e.inicio)}{e.fin ? `–${horaLegible(e.fin)}` : ''}</span>
                    </button>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      </Hoja>

      {/* MÓVIL Y TABLET: la semana como agenda, día a día. */}
      <div className="space-y-4 lg:hidden">
        {dias.map((f) => {
          const es = eventos.filter((e) => e.fecha === f);
          return (
            <section key={f} className="space-y-2">
              <button onClick={() => onDia(f)} className={cx('flex min-h-[40px] w-full items-center justify-between gap-2 border-b border-linea text-left dark:border-noche-linea', f === hoy && 'border-oro')}>
                <span className="font-titulo text-lg font-bold uppercase tracking-wide text-slate-900 dark:text-white">{fechaLarga(f)}{f === hoy && <Etiqueta tono="oro" className="ml-2 align-middle">Hoy</Etiqueta>}</span>
                <span className="text-xs text-slate-600 dark:text-slate-400">{es.length || 'Nada'}</span>
              </button>
              {es.map((e) => <TarjetaEvento key={e.id} e={e} onClick={() => onEvento(e)} />)}
            </section>
          );
        })}
      </div>
    </>
  );
}

// ============================================================
// LA VISTA DEL DÍA
// ============================================================

function ListaDia({ fecha, eventos, onEvento }: { fecha: string; eventos: EventoCalendario[]; onEvento: (e: EventoCalendario) => void }) {
  const es = eventos.filter((e) => e.fecha === fecha);
  if (!es.length) return <EmptyState bordered icon={<CalendarDays size={36} />} title="Nada programado este día" hint="O lo esconden los filtros: mira cuántos hay arriba." />;
  return <div className="space-y-2">{es.map((e) => <TarjetaEvento key={e.id} e={e} onClick={() => onEvento(e)} grande />)}</div>;
}

function TarjetaEvento({ e, onClick, grande }: { e: EventoCalendario; onClick: () => void; grande?: boolean }) {
  const plazas = lineaPlazas(e);
  return (
    <button type="button" onClick={onClick}
      className="grid w-full grid-cols-[4rem_minmax(0,1fr)] gap-3 rounded-lg border border-linea bg-white p-3 text-left hover:border-indigo-700 dark:border-noche-linea dark:bg-noche-2 dark:hover:border-indigo-300"
      style={{ borderLeft: `5px solid ${e.tipo === 'sin_clase' ? '#94a3b8' : e.color.fondo}` }}>
      <span className="font-titulo text-lg font-bold leading-none tabular-nums text-slate-900 dark:text-white">
        {e.inicio ? horaLegible(e.inicio) : 'Día'}
        {e.fin && <small className="mt-1 block font-sans text-xs font-normal text-slate-600 dark:text-slate-400">{horaLegible(e.fin)}</small>}
      </span>
      <span className="min-w-0 space-y-1">
        <span className={cx('block font-semibold text-slate-900 dark:text-white', grande ? 'text-base' : 'text-sm', e.tipo === 'sin_clase' && 'line-through', e.sinPlanificar && 'italic')}>
          {e.tipo === 'sin_clase' ? `Sin clase · ${e.grupo}` : e.tipo === 'entreno' ? `${e.titulo} · ${e.alumno ?? 'alumno'}` : e.titulo}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          {e.grupo && e.tipo !== 'sin_clase' && e.titulo !== e.grupo && <Etiqueta>{e.grupo}</Etiqueta>}
          <span>{e.tipo === 'clase' ? e.kindLabel : ETIQUETA_TIPO_EVENTO[e.tipo]}</span>
          {e.profesores.length > 0 && <span className="inline-flex items-center gap-1"><UserRound size={12} /> {e.profesores.join(', ')}</span>}
          {e.sinPlanificar && <Etiqueta tono="aviso">Sin planificar</Etiqueta>}
          {e.motivo && <span>{e.motivo}</span>}
        </span>
        {plazas && <span className={cx('block text-xs', e.plazas?.sobreaforo ? 'font-semibold text-red-700 dark:text-red-300' : 'text-slate-600 dark:text-slate-400')}>{plazas}</span>}
      </span>
    </button>
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

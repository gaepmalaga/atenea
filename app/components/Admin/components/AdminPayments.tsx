'use client';

import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Search, Download, AlertTriangle, Check, RefreshCw, Printer, X, Tag } from 'lucide-react';
import { getPagos, registraCobro, anulaCobro, setCuotaMes, setCuotaPropia } from '@/actions';
import type { PagosVista } from '@/app/actions/payments';
import {
  eur, sumaMeses, mesCorto, mesEnTexto, fechaEnTexto, csvHistorico, csvCaja, cajaDelMes, htmlRecibo, etiquetaEstado,
  leeImporte, listaY, METODOS_PAGO, ETIQUETA_METODO, esMetodo,
  type AlumnoMes, type EstadoPago, type CeldaCuota, type AlumnoHistorico, type MesHistorico, type Cobro, type MetodoPago,
} from '@/app/lib/cuotas';
import { MARCA } from '@/app/lib/marca';
import {
  PanelTitulo, Pestanas, Pulso, Filtros, FiltroChip, Hoja, BloqueTitulo, Rotulo, Aviso, Atras, Boton, Etiqueta, Estado,
  Avatar, inicialesDeCorreo, nombreDeCorreo, TablaDual, Campo, CampoSelect, EmptyState, cx, type Tono,
} from '../../ui';
import { confirmar } from '@/app/lib/dialogos';

/**
 * «Pagos» (P8 · rediseño del panel, regla 101 · cuotas y libro de cobros, regla 104).
 *
 * La cuota de cada alumno sale de sus grupos y de los precios de «Grupos»; el
 * mes en curso se abre solo con lo que debe cada uno. Cada cobro es un apunte
 * del libro con su recibo, su método y su fecha. Tres vistas del mismo dinero:
 *  - COBRAR: a quién cobrar, con un toque («Cobrar 50 €»), lo previsto, lo
 *    cobrado y lo pendiente; los pagos a medias, y quién debe meses atrás.
 *  - HISTÓRICO: doce meses de un vistazo (gráfico y rejilla) y quién debe.
 *  - CAJA: lo que entró en un mes por fecha y método, recibo a recibo, y el
 *    CSV para el gestor.
 * La ficha de un alumno se abre a pantalla completa: cobrar cualquier mes, sus
 * recibos, anular, cambiar la cuota de un mes o la suya de siempre.
 */

const irAPestana = (id: string) => window.dispatchEvent(new CustomEvent('admin:pestana', { detail: id }));
const CLAVE_METODO = 'pagos:metodo';

type Vista = 'mes' | 'historico' | 'caja';
type Ficha = { userId: string; periodo: string };
type AvisoCobro = { texto: string; deshacer?: { userId: string; periodo: string; cobroId?: string } };

export default function AdminPayments() {
  const [vista, setVista] = useState<Vista>('mes');
  const [periodo, setPeriodo] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<PagosVista | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [aviso, setAviso] = useState<AvisoCobro | null>(null);
  const [metodo, setMetodoEstado] = useState<MetodoPago>('efectivo');

  useEffect(() => {
    let vivo = true;
    (async () => {
      const res = await getPagos(periodo ?? undefined);
      if (!vivo) return;
      if (res.success) { setData(res.data); setError(null); } else setError(res.error);
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [periodo, version]);

  // El método con el que se cobra de un toque: se recuerda en este navegador.
  useEffect(() => {
    let m: string | null = null;
    try { m = localStorage.getItem(CLAVE_METODO); } catch { /* sin almacenamiento: efectivo */ }
    if (esMetodo(m)) queueMicrotask(() => setMetodoEstado(m as MetodoPago));
  }, []);
  const setMetodo = (m: MetodoPago) => {
    setMetodoEstado(m);
    try { localStorage.setItem(CLAVE_METODO, m); } catch { /* sin almacenamiento */ }
  };

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 7000);
    return () => clearTimeout(t);
  }, [aviso]);

  const recargar = () => setVersion((v) => v + 1);

  async function haz<R extends { success: boolean; error?: string }>(clave: string, fn: () => Promise<R>, ok?: (r: R) => AvisoCobro | null) {
    setOcupado(clave);
    const res = await fn();
    if (!res.success) setError(res.error ?? 'No se pudo guardar.');
    else { setError(null); const a = ok?.(res); if (a) setAviso(a); }
    recargar();
    setOcupado(null);
  }

  const acciones: Acciones = {
    ocupado,
    metodo,
    cobrar: (a, p, cantidad, m) =>
      haz(`${a.userId}:${p}`, () => registraCobro({ studentId: a.userId, period: p, cantidad: cantidad ?? null, metodo: m ?? metodo }), (r) => ({
        texto: `Cobrado a ${nombreDeCorreo(a.email) || 'el alumno'} · ${mesCorto(p)}${'recibo' in r && r.recibo ? ` · recibo nº ${r.recibo}` : ''}`,
        deshacer: { userId: a.userId, periodo: p },
      })),
    anular: (userId, p, cobroId) => haz(`${userId}:${p}`, () => anulaCobro({ studentId: userId, period: p, cobroId }), () => ({ texto: cobroId ? 'Cobro anulado' : 'Cobros del mes anulados' })),
    cuotaMes: (userId, p, cuota, nota) => haz(`${userId}:${p}`, () => setCuotaMes({ studentId: userId, period: p, cuota, nota }), () => ({ texto: 'Cuota del mes guardada' })),
    cuotaPropia: (userId, cuota, nota) => haz(`${userId}:propia`, () => setCuotaPropia({ studentId: userId, cuota, nota }), () => ({ texto: cuota ? 'Cuota propia guardada' : 'Vuelve a la cuota de sus grupos' })),
    abrir: (userId, p) => { setFicha({ userId, periodo: p }); window.scrollTo({ top: 0 }); },
  };

  // «Deshacer» un cobro de un toque: anula el último cobro de ese mes (el que
  // se acaba de hacer), no todos.
  const deshacer = (d: NonNullable<AvisoCobro['deshacer']>) => {
    setAviso(null);
    const ultimo = data?.cobros.filter((c) => c.userId === d.userId && c.periodo === d.periodo && !c.anulado).sort((a, b) => b.recibo - a.recibo)[0];
    acciones.anular(d.userId, d.periodo, d.cobroId ?? ultimo?.id);
  };

  if (data && ficha) {
    return (
      <div className="space-y-5 animate-in fade-in pb-24">
        <FichaAlumno data={data} ficha={ficha} acciones={acciones} cambiaMes={(p) => setFicha({ ...ficha, periodo: p })} onVolver={() => setFicha(null)} />
        {error && <Aviso tono="malo"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}</Aviso>}
        <Tostada aviso={aviso} onDeshacer={deshacer} />
      </div>
    );
  }

  const porCobrar = data ? data.mes.filas.filter((f) => f.pendiente > 0 || f.estado === 'sin_cuota').length : undefined;

  return (
    <div className="space-y-5 animate-in fade-in pb-24">
      <PanelTitulo
        titulo="Pagos"
        sub="La cuota de cada alumno sale de sus grupos. Cada cobro lleva su recibo."
        acciones={<Boton variant="secondary" icon={<RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />} onClick={() => { setCargando(true); recargar(); }}>Recargar</Boton>}
      />
      <Pestanas
        etiqueta="Vistas de pagos"
        activa={vista}
        onCambia={setVista}
        items={[
          { id: 'mes', etiqueta: 'Cobrar', cuenta: porCobrar },
          { id: 'historico', etiqueta: 'Histórico' },
          { id: 'caja', etiqueta: 'Caja' },
        ]}
      />

      {error && (
        <Aviso tono="malo">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} aria-label="Cerrar el error" className="shrink-0"><X size={15} /></button>
        </Aviso>
      )}

      {!data && cargando && <p className="py-10 text-center text-sm text-slate-600 dark:text-slate-400">Cargando…</p>}

      {data && vista === 'mes' && (
        <VistaMes data={data} acciones={acciones} setMetodo={setMetodo} cargando={cargando}
          cambiaPeriodo={(p) => { setCargando(true); setPeriodo(p); }} />
      )}
      {data && vista === 'historico' && <VistaHistorico data={data} acciones={acciones} />}
      {data && vista === 'caja' && <VistaCaja data={data} />}

      <Tostada aviso={aviso} onDeshacer={deshacer} />
    </div>
  );
}

type Acciones = {
  ocupado: string | null;
  metodo: MetodoPago;
  /** Sin cantidad: lo que falta. Con cantidad (tal como la escribe): un cobro de esa cantidad. */
  cobrar: (a: { userId: string; email: string | null }, periodo: string, cantidad?: string, metodo?: MetodoPago) => Promise<void>;
  anular: (userId: string, periodo: string, cobroId?: string) => Promise<void>;
  cuotaMes: (userId: string, periodo: string, cuota: string | null, nota: string | null) => Promise<void>;
  cuotaPropia: (userId: string, cuota: string | null, nota: string | null) => Promise<void>;
  abrir: (userId: string, periodo: string) => void;
};

// ============================================================
// PIEZAS COMUNES
// ============================================================

const TONO_ESTADO: Record<EstadoPago, Tono> = { pagado: 'ok', parcial: 'aviso', debe: 'malo', no_paga: 'apagado', sin_cuota: 'aviso' };

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Lo que añade la línea a la palabra del estado; `null` si no añade nada. */
function detalleEstado(a: Pick<CeldaCuota, 'estado' | 'debido' | 'cobrado' | 'pendiente' | 'pagadoEl' | 'nota'>): string | null {
  if (a.estado === 'debe' || a.estado === 'sin_cuota') return null;
  if (a.estado === 'no_paga') return a.nota;
  return lineaEstado(a);
}

/** «Debe 50 €», «Pagó 30 de 50 € · faltan 20 €»… */
function lineaEstado(a: Pick<CeldaCuota, 'estado' | 'debido' | 'cobrado' | 'pendiente' | 'pagadoEl' | 'nota'>): string {
  switch (a.estado) {
    case 'debe': return `Debe ${eur(a.pendiente)}`;
    case 'parcial': return `Pagó ${eur(a.cobrado)} de ${eur(a.debido)} · faltan ${eur(a.pendiente)}`;
    case 'pagado': return `Pagado ${eur(a.cobrado)}${a.pagadoEl ? ` el ${Number(a.pagadoEl.slice(8, 10))} ${mesCorto(a.pagadoEl.slice(0, 7))}` : ''}`;
    case 'no_paga': return `Este mes no paga${a.nota ? `: ${a.nota}` : ''}`;
    case 'sin_cuota': return 'Sin cuota: no se sabe cuánto debe';
  }
}

function Alumno({ email, sub }: { email: string | null; sub?: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar iniciales={inicialesDeCorreo(email)} size="sm" />
      <span className="min-w-0">
        <span className="block truncate font-semibold text-slate-900 dark:text-white">{email ? nombreDeCorreo(email) : 'Alumno que ya no está'}</span>
        {sub ?? <span className="block truncate text-xs text-slate-600 dark:text-slate-400">{email}</span>}
      </span>
    </span>
  );
}

/** El selector del mes: ‹ NOVIEMBRE DE 2026 ›. */
function NavMes({ periodo, sub, onCambia, min, max, deshabilitado }: {
  periodo: string; sub?: ReactNode; onCambia: (p: string) => void; min?: string; max?: string; deshabilitado?: boolean;
}) {
  const boton = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-linea text-slate-700 hover:border-indigo-700 disabled:opacity-30 dark:border-noche-linea dark:text-slate-300';
  return (
    <div className="flex items-center justify-between gap-2">
      <button onClick={() => onCambia(sumaMeses(periodo, -1))} disabled={deshabilitado || (min !== undefined && periodo <= min)} className={boton} aria-label="Mes anterior">
        <ChevronLeft size={18} />
      </button>
      <div className="min-w-0 text-center">
        <p className="whitespace-nowrap font-titulo text-xl font-bold uppercase leading-none tracking-wide text-slate-900 dark:text-white sm:text-2xl">{mesEnTexto(periodo)}</p>
        {sub && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{sub}</p>}
      </div>
      <button onClick={() => onCambia(sumaMeses(periodo, 1))} disabled={deshabilitado || (max !== undefined && periodo >= max)} className={boton} aria-label="Mes siguiente">
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

function Buscador({ valor, onCambia, etiqueta }: { valor: string; onCambia: (v: string) => void; etiqueta: string }) {
  return (
    <Campo value={valor} onChange={(e) => onCambia(e.target.value)} placeholder="Buscar por correo" aria-label={etiqueta}
      trailing={<Search size={15} className="mr-2 text-slate-500" aria-hidden />} />
  );
}

function SelectorMetodo({ valor, onCambia, label }: { valor: MetodoPago; onCambia: (m: MetodoPago) => void; label?: string }) {
  return (
    <CampoSelect label={label} value={valor} onChange={(e) => { if (esMetodo(e.target.value)) onCambia(e.target.value); }} aria-label="Método de cobro">
      {METODOS_PAGO.map((m) => <option key={m} value={m}>{ETIQUETA_METODO[m]}</option>)}
    </CampoSelect>
  );
}

/** Abre el recibo en una ventana para imprimirlo o guardarlo en PDF. */
function imprimeRecibo(c: Cobro) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.open();
  w.document.write(htmlRecibo(c, MARCA.nombre));
  w.document.close();
}

function descarga(nombre: string, contenido: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

function Tostada({ aviso, onDeshacer }: { aviso: AvisoCobro | null; onDeshacer: (d: NonNullable<AvisoCobro['deshacer']>) => void }) {
  if (!aviso) return null;
  return (
    <div role="status" className="fixed inset-x-4 bottom-20 z-[250] flex items-center justify-between gap-3 rounded-lg bg-marino px-4 py-3 text-white shadow-2xl animate-in fade-in slide-in-from-bottom-2 lg:inset-x-auto lg:bottom-6 lg:right-6 lg:min-w-[24rem]">
      <span className="flex items-center gap-2 text-sm font-semibold"><Check size={16} className="shrink-0 text-oro" /> {aviso.texto}</span>
      {aviso.deshacer && (
        <button onClick={() => onDeshacer(aviso.deshacer!)} className="min-h-[44px] shrink-0 px-2 text-sm font-bold text-oro">Deshacer</button>
      )}
    </div>
  );
}

// ============================================================
// COBRAR: EL MES
// ============================================================

type Filtro = 'cobrar' | 'aldia' | 'todos';

function VistaMes({ data, acciones, setMetodo, cambiaPeriodo, cargando }: {
  data: PagosVista; acciones: Acciones; setMetodo: (m: MetodoPago) => void; cambiaPeriodo: (p: string) => void; cargando: boolean;
}) {
  const { mes, actual, periodo, esPrevision } = data;
  const [busca, setBusca] = useState('');
  const porCobrar = mes.filas.filter((f) => f.pendiente > 0 || f.estado === 'sin_cuota');
  const [filtroElegido, setFiltro] = useState<Filtro | null>(null);
  const filtro: Filtro = filtroElegido ?? (porCobrar.length ? 'cobrar' : 'todos');
  const visibles = mes.filas.filter((f) => {
    if (busca.trim() && !(f.email ?? '').toLowerCase().includes(busca.trim().toLowerCase())) return false;
    if (filtro === 'cobrar') return f.pendiente > 0 || f.estado === 'sin_cuota';
    if (filtro === 'aldia') return f.estado === 'pagado' || f.estado === 'no_paga';
    return true;
  });

  return (
    <div className="space-y-5">
      <NavMes periodo={periodo} onCambia={cambiaPeriodo} deshabilitado={cargando} min={sumaMeses(actual, -24)} max={sumaMeses(actual, 1)}
        sub={<>
          {periodo === actual ? 'Este mes' : esPrevision ? 'El mes que viene · previsión' : 'Mes cerrado'}
          {periodo !== actual && <> · <button className="font-semibold text-indigo-900 underline dark:text-indigo-200" onClick={() => cambiaPeriodo(actual)}>volver a este mes</button></>}
        </>} />

      {esPrevision ? (
        <Pulso cifras={[
          { valor: mes.previsto > 0 ? eur(mes.previsto) : null, etiqueta: 'se prevé cobrar', tono: 'oro' },
          { valor: mes.alumnos, etiqueta: 'alumnos con cuota' },
          { valor: mes.sinCuota, etiqueta: 'sin cuota calculada', tono: mes.sinCuota ? 'aviso' : 'neutro' },
        ]} />
      ) : (
        <Pulso cifras={[
          {
            valor: mes.alumnos ? eur(mes.cobrado) : null, etiqueta: `cobrado de ${eur(mes.previsto)}`, tono: 'ok',
            extra: mes.porcentaje !== null && (
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-hundido dark:bg-noche-hondo" role="progressbar" aria-valuenow={mes.porcentaje} aria-valuemin={0} aria-valuemax={100} aria-label="Cobrado de lo previsto">
                <span className="block h-full rounded-full bg-emerald-600 dark:bg-emerald-400" style={{ width: `${mes.porcentaje}%` }} />
              </span>
            ),
          },
          { valor: mes.alumnos ? eur(mes.pendiente) : null, etiqueta: 'pendiente', tono: mes.pendiente > 0 ? 'aviso' : 'neutro' },
          { valor: mes.alumnos ? `${mes.pagados + mes.noPagan}/${mes.alumnos}` : null, etiqueta: 'al día' },
          { valor: mes.alumnos ? mes.parciales + mes.deben : null, etiqueta: mes.parciales ? `por cobrar (${mes.parciales} a medias)` : 'por cobrar', tono: mes.parciales + mes.deben ? 'malo' : 'neutro' },
        ]} />
      )}

      <Avisos data={data} />

      {periodo === actual && data.historico.deudores.length > 0 && (
        <DeudasAnteriores deudores={data.historico.deudores} acciones={acciones} actual={actual} />
      )}

      {mes.alumnos === 0 ? (
        <EmptyState bordered icon={<Tag size={36} />}
          title={periodo < actual ? 'Nadie en la lista de ese mes' : 'No hay alumnos que paguen'}
          hint={periodo < actual
            ? 'En un mes cerrado salen los alumnos que tenían cuota ese mes.'
            : 'Entran los alumnos con acceso activo, menos los exentos. Se da acceso en «Alumnos».'} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <Buscador valor={busca} onCambia={setBusca} etiqueta="Buscar alumno" />
            <SelectorMetodo valor={acciones.metodo} onCambia={setMetodo} />
          </div>
          <Filtros etiqueta="Qué alumnos ver">
            <FiltroChip activo={filtro === 'cobrar'} onClick={() => setFiltro('cobrar')} cuenta={porCobrar.length}>Por cobrar</FiltroChip>
            <FiltroChip activo={filtro === 'aldia'} onClick={() => setFiltro('aldia')} cuenta={mes.pagados + mes.noPagan}>Al día</FiltroChip>
            <FiltroChip activo={filtro === 'todos'} onClick={() => setFiltro('todos')} cuenta={mes.alumnos}>Todos</FiltroChip>
          </Filtros>
          <TablaDual<AlumnoMes>
            filas={visibles}
            clave={(f) => f.userId}
            onFila={(f) => acciones.abrir(f.userId, periodo)}
            vacio={filtro === 'cobrar' && !busca ? 'Nadie por cobrar este mes: todo al día.' : 'Nadie con ese filtro.'}
            columnas={[
              { id: 'alumno', titulo: 'Alumno', celda: (f) => <Alumno email={f.email} /> },
              {
                id: 'cuota', titulo: 'Cuota', celda: (f) => (
                  <span className="block">
                    <span className="font-semibold tabular-nums">{eur(f.debido)}</span>
                    <span className="block max-w-[16rem] truncate text-xs text-slate-600 dark:text-slate-400">{origenCuota(f)}</span>
                  </span>
                ),
              },
              { id: 'estado', titulo: 'Estado', celda: (f) => <span className="block"><Estado tono={TONO_ESTADO[f.estado]}>{etiquetaEstado(f.estado)}</Estado>{detalleEstado(f) && <span className="block text-xs text-slate-600 dark:text-slate-400">{detalleEstado(f)}</span>}</span> },
              {
                id: 'accion', titulo: '', acciones: true, derecha: true, celda: (f) => f.pendiente > 0 ? (
                  <Boton size="sm" disabled={!!acciones.ocupado} onClick={(e) => { e.stopPropagation(); acciones.cobrar(f, periodo); }} className="tabular-nums max-lg:flex-1">
                    {acciones.ocupado === `${f.userId}:${periodo}` ? 'Cobrando…' : `Cobrar ${eur(f.pendiente)}`}
                  </Boton>
                ) : (
                  <Boton size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); acciones.abrir(f.userId, periodo); }} className="max-lg:flex-1">
                    {f.estado === 'sin_cuota' ? 'Anotar' : 'Ver'}
                  </Boton>
                ),
              },
            ]}
          />
          <p className="text-xs text-slate-600 dark:text-slate-400">«Cobrar» anota lo que falta del mes en {ETIQUETA_METODO[acciones.metodo].toLowerCase()}, con su recibo. Para un pago a medias o con otro método, abre la ficha del alumno.</p>
        </>
      )}
    </div>
  );
}

function origenCuota(f: AlumnoMes): string {
  if (f.manual) return `A mano este mes${f.nota ? ` · ${f.nota}` : ''}`;
  if (f.cuota?.origen === 'propia') return 'Cuota propia';
  return `${f.cuota?.detalle ?? ''}${!f.activo ? ' · ya no tiene acceso' : ''}`;
}

function Avisos({ data }: { data: PagosVista }) {
  const { avisos } = data;
  if (avisos.tarifaVacia) {
    return (
      <Aviso tono="aviso">
        <Tag size={16} className="mt-0.5 shrink-0" />
        <span className="flex flex-1 flex-wrap items-center justify-between gap-3">
          <span><b>Aún no hay precios.</b> Pon en «Grupos» lo que cuesta al mes cada tipo (Teoría, Físicas, Inglés…) y los packs: aquí saldrá lo que debe cada alumno.</span>
          <Boton size="sm" onClick={() => irAPestana('groups')}>Poner los precios</Boton>
        </span>
      </Aviso>
    );
  }
  if (!avisos.sinPrecio.length && !avisos.sinGrupos.length) return null;
  return (
    <Aviso tono="aviso">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span className="flex-1 space-y-1">
        <b className="block">Alumnos sin cuota calculada</b>
        {avisos.sinPrecio.map((s) => (
          <span key={s.tipo} className="block">Falta el precio de <b>{s.tipo}</b> ({s.alumnos} {s.alumnos === 1 ? 'alumno' : 'alumnos'}).</span>
        ))}
        {avisos.sinGrupos.length > 0 && (
          <span className="block">Sin ningún grupo: {listaY(avisos.sinGrupos.slice(0, 4).map(nombreDeCorreo))}{avisos.sinGrupos.length > 4 ? ` y ${avisos.sinGrupos.length - 4} más` : ''}. Asígnales sus grupos en «Alumnos» o ponles una cuota propia.</span>
        )}
        {avisos.sinPrecio.length > 0 && <Boton size="sm" variant="secondary" className="mt-1" onClick={() => irAPestana('groups')}>Ir a los precios</Boton>}
      </span>
    </Aviso>
  );
}

function DeudasAnteriores({ deudores, acciones, actual }: { deudores: AlumnoHistorico[]; acciones: Acciones; actual: string }) {
  const [todos, setTodos] = useState(false);
  const total = deudores.reduce((s, d) => s + d.deudaAnterior, 0);
  return (
    <Hoja pad="md" className="space-y-3">
      <BloqueTitulo aside={<span className="font-titulo text-xl font-bold tabular-nums text-red-700 dark:text-red-300">{eur(total)}</span>}>Deben de meses anteriores</BloqueTitulo>
      <ul className="divide-y divide-linea dark:divide-noche-linea">
        {(todos ? deudores : deudores.slice(0, 4)).map((d) => (
          <li key={d.userId}>
            <button onClick={() => acciones.abrir(d.userId, d.mesesDebe[0] ?? actual)} className="flex min-h-[52px] w-full items-center justify-between gap-3 py-2 text-left">
              <Alumno email={d.email} sub={<span className="block text-xs text-slate-600 dark:text-slate-400">{listaY(d.mesesDebe.map((p) => mesCorto(p, true)))}</span>} />
              <span className="flex shrink-0 items-center gap-1 font-semibold tabular-nums text-red-700 dark:text-red-300">{eur(d.deudaAnterior)} <ChevronRight size={15} className="text-slate-500" /></span>
            </button>
          </li>
        ))}
      </ul>
      {deudores.length > 4 && <Boton size="sm" variant="ghost" onClick={() => setTodos((x) => !x)}>{todos ? 'Ver menos' : `Ver los ${deudores.length}`}</Boton>}
    </Hoja>
  );
}

// ============================================================
// LA FICHA DE UN ALUMNO
// ============================================================

function FichaAlumno({ data, ficha, acciones, cambiaMes, onVolver }: {
  data: PagosVista; ficha: Ficha; acciones: Acciones; cambiaMes: (p: string) => void; onVolver: () => void;
}) {
  const { userId, periodo } = ficha;
  const deMes = data.periodo === periodo ? data.mes.filas.find((f) => f.userId === userId) : undefined;
  const hist = data.historico.alumnos.find((a) => a.userId === userId);
  const cuotaHoy = data.cuotas.find((c) => c.userId === userId) ?? null;
  const email = deMes?.email ?? hist?.email ?? cuotaHoy?.email ?? null;
  const celda: CeldaCuota | null = deMes ?? hist?.celdas[periodo] ?? null;
  const cobrosMes = data.cobros.filter((c) => c.userId === userId && c.periodo === periodo).sort((a, b) => b.recibo - a.recibo);
  const ocupado = acciones.ocupado === `${userId}:${periodo}`;
  const [cantidad, setCantidad] = useState('');
  const [metodo, setMetodo] = useState<MetodoPago>(acciones.metodo);
  const [cuotaMes, setCuotaMesTxt] = useState('');
  const [notaMes, setNotaMes] = useState('');
  const [propia, setPropia] = useState(cuotaHoy?.cuota.origen === 'propia' && cuotaHoy.cuota.importe !== null ? String(cuotaHoy.cuota.importe).replace('.', ',') : '');
  const [notaPropia, setNotaPropia] = useState(cuotaHoy?.notaPropia ?? '');
  const lectura = leeImporte(cantidad);
  const meses = hist ? data.historico.periodos.filter((p) => hist.celdas[p]).reverse() : [];
  const puedeCobrar = lectura.ok && (lectura.valor !== null ? lectura.valor > 0 : !!celda && celda.pendiente > 0);

  return (
    <div className="space-y-5">
      <Atras onClick={onVolver}>Pagos</Atras>
      <div className="flex items-center gap-3">
        <Avatar iniciales={inicialesDeCorreo(email)} size="lg" />
        <div className="min-w-0">
          <h2 className="truncate font-titulo text-3xl font-bold uppercase leading-none tracking-wide text-slate-900 dark:text-white">{email ? nombreDeCorreo(email) : 'Alumno'}</h2>
          <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-400">{email}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* EL MES */}
        <Hoja pad="md" className="space-y-4">
          <NavMes periodo={periodo} onCambia={cambiaMes} max={sumaMeses(data.actual, 1)} />
          {celda ? (
            <div className="space-y-1">
              <Estado tono={TONO_ESTADO[celda.estado]}>{etiquetaEstado(celda.estado)}</Estado>
              <p className="text-base font-semibold text-slate-900 dark:text-white">{lineaEstado(celda)}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Cuota del mes {eur(celda.debido)}{celda.manual && ' (puesta a mano)'}{celda.cobrado > 0 && <> · cobrado {eur(celda.cobrado)}</>}
              </p>
            </div>
          ) : (
            <Aviso tono="info">Ese mes no estaba en la lista. Si pagó, anótalo abajo: se le pone su cuota de hoy.</Aviso>
          )}

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <Campo label={celda && celda.cobrado > 0 ? 'Otra cantidad (se suma)' : 'Cantidad'} value={cantidad} onChange={(e) => setCantidad(e.target.value)}
              inputMode="decimal" autoComplete="off" placeholder={celda && celda.pendiente > 0 ? String(celda.pendiente).replace('.', ',') : '50'}
              hint={!lectura.ok ? lectura.error : 'Vacío: lo que falta del mes. Un pago a medias queda «faltan X €».'} />
            <SelectorMetodo label="Método" valor={metodo} onCambia={setMetodo} />
          </div>
          <Boton disabled={!!acciones.ocupado || !puedeCobrar}
            onClick={() => { acciones.cobrar({ userId, email }, periodo, cantidad.trim() || undefined, metodo); setCantidad(''); }}>
            {ocupado ? 'Guardando…' : lectura.ok && lectura.valor ? `Cobrar ${eur(lectura.valor)}` : celda && celda.pendiente > 0 ? `Cobrar lo que falta · ${eur(celda.pendiente)}` : 'Cobrar'}
          </Boton>

          {cobrosMes.length > 0 && (
            <div className="space-y-2">
              <Rotulo>Cobros de {mesCorto(periodo)}</Rotulo>
              <ul className="divide-y divide-linea rounded-lg border border-linea dark:divide-noche-linea dark:border-noche-linea">
                {cobrosMes.map((c) => (
                  <li key={c.id} className={cx('flex flex-wrap items-center justify-between gap-2 px-3 py-2', c.anulado && 'opacity-60')}>
                    <span className="min-w-0 text-sm">
                      <b className={cx('tabular-nums', c.anulado && 'line-through')}>{eur(c.importe)}</b>
                      <span className="text-slate-600 dark:text-slate-400"> · {ETIQUETA_METODO[c.metodo]} · {fechaEnTexto(c.fecha)} · recibo nº {c.recibo}</span>
                      {c.anulado && <Etiqueta tono="malo" className="ml-2">Anulado</Etiqueta>}
                    </span>
                    <span className="flex gap-1.5">
                      <Boton size="sm" variant="ghost" icon={<Printer size={14} />} onClick={() => imprimeRecibo(c)}>Recibo</Boton>
                      {!c.anulado && (
                        <Boton size="sm" variant="danger" disabled={!!acciones.ocupado}
                          onClick={async () => { if ((await confirmar(`¿Anular el recibo nº ${c.recibo} (${eur(c.importe)})? Queda en el libro como anulado.`))) acciones.anular(userId, periodo, c.id); }}>
                          Anular
                        </Boton>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details className="rounded-lg border border-linea p-3 dark:border-noche-linea">
            <summary className="min-h-[28px] cursor-pointer text-sm font-semibold text-slate-900 dark:text-white">Cambiar la cuota de este mes</summary>
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
                <Campo label="Cuota (€)" value={cuotaMes} onChange={(e) => setCuotaMesTxt(e.target.value)} inputMode="decimal" autoComplete="off" placeholder={celda?.debido != null ? String(celda.debido) : '50'} />
                <Campo label="Por qué" value={notaMes} onChange={(e) => setNotaMes(e.target.value)} maxLength={200} placeholder="Opcional" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Boton size="sm" disabled={!!acciones.ocupado || !cuotaMes.trim()} onClick={() => { acciones.cuotaMes(userId, periodo, cuotaMes, notaMes); setCuotaMesTxt(''); setNotaMes(''); }}>Guardar</Boton>
                <Boton size="sm" variant="secondary" disabled={!!acciones.ocupado} onClick={() => acciones.cuotaMes(userId, periodo, '0', notaMes || 'Este mes no paga')}>No cobrar este mes</Boton>
                {celda?.manual && <Boton size="sm" variant="ghost" disabled={!!acciones.ocupado} onClick={() => acciones.cuotaMes(userId, periodo, null, null)}>Volver a su cuota</Boton>}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">Solo cambia este mes. Los demás meses no se tocan.</p>
            </div>
          </details>
        </Hoja>

        <div className="space-y-5">
          {/* SU CUOTA DE SIEMPRE */}
          {cuotaHoy && (
            <Hoja pad="md" className="space-y-3">
              <BloqueTitulo>Su cuota</BloqueTitulo>
              <p className="text-sm">
                <b className="font-titulo text-2xl tabular-nums text-slate-900 dark:text-white">{cuotaHoy.cuota.importe !== null ? `${eur(cuotaHoy.cuota.importe)}/mes` : 'Sin calcular'}</b>
                <span className="block text-slate-600 dark:text-slate-400">{cuotaHoy.cuota.detalle}{cuotaHoy.notaPropia ? ` (${cuotaHoy.notaPropia})` : ''}</span>
              </p>
              {cuotaHoy.grupos.length > 0 && <p className="text-xs text-slate-600 dark:text-slate-400">Grupos: {cuotaHoy.grupos.join(', ')}</p>}
              <details className="rounded-lg border border-linea p-3 dark:border-noche-linea">
                <summary className="min-h-[28px] cursor-pointer text-sm font-semibold text-slate-900 dark:text-white">Ponerle una cuota propia</summary>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Para todos los meses, en vez de la de sus grupos (un descuento, un hermano…). Se aplica desde este mes si aún no se le ha cobrado; los meses anteriores no cambian.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
                  <Campo label="€/mes" value={propia} onChange={(e) => setPropia(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="80" />
                  <Campo label="Por qué" value={notaPropia} onChange={(e) => setNotaPropia(e.target.value)} maxLength={120} placeholder="Opcional" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Boton size="sm" disabled={!!acciones.ocupado || !propia.trim()} onClick={() => acciones.cuotaPropia(userId, propia, notaPropia)}>Guardar</Boton>
                  {cuotaHoy.cuota.origen === 'propia' && (
                    <Boton size="sm" variant="ghost" disabled={!!acciones.ocupado} onClick={() => { setPropia(''); setNotaPropia(''); acciones.cuotaPropia(userId, null, null); }}>Quitar: la de sus grupos</Boton>
                  )}
                </div>
              </details>
            </Hoja>
          )}

          {/* SUS MESES */}
          {meses.length > 0 && hist && (
            <Hoja pad="md" className="space-y-2">
              <BloqueTitulo aside={hist.deudaAnterior > 0 ? <Etiqueta tono="malo">Debe {eur(hist.deudaAnterior)}</Etiqueta> : undefined}>Sus meses</BloqueTitulo>
              <ul className="divide-y divide-linea dark:divide-noche-linea">
                {meses.map((p) => {
                  const c = hist.celdas[p];
                  return (
                    <li key={p}>
                      <button onClick={() => cambiaMes(p)} aria-current={p === periodo}
                        className={cx('flex min-h-[46px] w-full items-center gap-3 rounded px-2 text-left', p === periodo && 'bg-hundido dark:bg-noche-hondo')}>
                        <span className="w-16 shrink-0 text-sm font-semibold capitalize text-slate-900 dark:text-white">{mesCorto(p, true)}</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-600 dark:text-slate-400">{lineaEstado(c)}</span>
                        <Estado tono={TONO_ESTADO[c.estado]}>{etiquetaEstado(c.estado)}</Estado>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Hoja>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// EL HISTÓRICO
// ============================================================

function VistaHistorico({ data, acciones }: { data: PagosVista; acciones: Acciones }) {
  const h = data.historico;
  const [busca, setBusca] = useState('');
  const [soloDeuda, setSoloDeuda] = useState(false);
  const conCobro = h.meses.filter((m) => m.cobrado > 0);
  const mejor = conCobro.reduce<MesHistorico | null>((b, m) => (!b || m.cobrado > b.cobrado ? m : b), null);
  const media = conCobro.length ? conCobro.reduce((s, m) => s + m.cobrado, 0) / conCobro.length : null;

  const alumnos = h.alumnos
    .filter((a) => !busca.trim() || (a.email ?? '').toLowerCase().includes(busca.trim().toLowerCase()))
    .filter((a) => !soloDeuda || a.deudaAnterior + a.pendienteActual > 0)
    .sort((a, b) => (b.deudaAnterior + b.pendienteActual) - (a.deudaAnterior + a.pendienteActual) || (a.email ?? '').localeCompare(b.email ?? '', 'es'));

  if (!h.meses.some((m) => m.alumnos > 0)) {
    return <EmptyState bordered icon={<Tag size={36} />} title="Aún no hay meses con cuotas" hint="El histórico se llena solo: cada mes, al abrir «Pagos», queda anotado lo que debe cada alumno y lo que paga." />;
  }

  return (
    <div className="space-y-5">
      <Pulso cifras={[
        { valor: eur(h.totales.cobrado), etiqueta: 'cobrado en 12 meses', tono: 'ok' },
        { valor: media === null ? null : eur(Math.round(media)), etiqueta: 'media al mes' },
        { valor: mejor ? eur(mejor.cobrado) : null, etiqueta: mejor ? `mejor mes (${mesCorto(mejor.periodo, true)})` : 'mejor mes' },
        { valor: eur(h.totales.deudaAnterior), etiqueta: 'deuda de meses cerrados', tono: h.totales.deudaAnterior > 0 ? 'malo' : 'neutro' },
      ]} />

      <Hoja pad="md" className="space-y-3">
        <BloqueTitulo>Mes a mes</BloqueTitulo>
        <Grafico meses={h.meses} actual={h.actual} prevision={data.prevision} />
      </Hoja>

      {h.deudores.length > 0 && <DeudasAnteriores deudores={h.deudores} acciones={acciones} actual={h.actual} />}

      <Hoja pad="md" className="space-y-3">
        <BloqueTitulo aside={<Boton size="sm" variant="secondary" icon={<Download size={14} />} onClick={() => descarga(`pagos-${h.periodos[0]}-a-${h.actual}.csv`, csvHistorico(h))}>Excel (CSV)</Boton>}>
          Alumno a alumno
        </BloqueTitulo>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <Buscador valor={busca} onCambia={setBusca} etiqueta="Buscar alumno en el histórico" />
          <Filtros etiqueta="Filtro del histórico">
            <FiltroChip activo={!soloDeuda} onClick={() => setSoloDeuda(false)} cuenta={h.alumnos.length}>Todos</FiltroChip>
            <FiltroChip activo={soloDeuda} onClick={() => setSoloDeuda(true)} cuenta={h.alumnos.filter((a) => a.deudaAnterior + a.pendienteActual > 0).length}>Deben algo</FiltroChip>
          </Filtros>
        </div>
        <Rejilla h={h} alumnos={alumnos} acciones={acciones} />
        <Leyenda />
      </Hoja>
    </div>
  );
}

/**
 * Previsto, cobrado y pendiente de cada mes: barras apiladas desde la base
 * (cobrado abajo, lo pendiente encima con rayas, para que no dependa solo del
 * color), y el mes que viene en hueco: es previsión. Un toque o el ratón
 * enseñan las cifras; la rejilla de abajo es la tabla con todo.
 */
function Grafico({ meses, actual, prevision }: { meses: MesHistorico[]; actual: string; prevision: PagosVista['prevision'] }) {
  const [activo, setActivo] = useState<string | null>(null);
  const max = Math.max(1, ...meses.map((m) => Math.max(m.previsto, m.cobrado)), prevision.previsto);
  const barras = [...meses.map((m) => ({ ...m, prev: false })), {
    periodo: prevision.periodo, previsto: prevision.previsto, cobrado: 0, pendiente: 0, porcentaje: null, alumnos: prevision.alumnos, pagados: 0, prev: true,
  }];
  const alto = (v: number) => `${(v / max) * 100}%`;
  const ultimo = meses[meses.length - 1];
  return (
    <figure className="m-0 min-w-0">
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700 dark:text-slate-300">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-emerald-600" /> Cobrado</span>
        <span className="flex items-center gap-1.5"><span className="rayas h-3 w-3 rounded-sm bg-amber-600" /> Pendiente</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-2 border-dashed border-slate-400" /> Previsión</span>
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-44">
          <div className="absolute inset-x-0 top-0 border-t border-dashed border-linea dark:border-noche-linea" />
          <span className="absolute -top-4 right-0 text-[10px] tabular-nums text-slate-500">{eur(max)}</span>
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-linea dark:border-noche-linea" />
        </div>
        <div className="flex h-44 items-end gap-1 border-b border-slate-300 dark:border-noche-linea sm:gap-2">
          {barras.map((b) => {
            const esActivo = activo === b.periodo;
            const base = Math.max(b.previsto, b.cobrado) || 1;
            const cobrado = Math.min(b.cobrado, b.previsto || b.cobrado);
            return (
              <button key={b.periodo} type="button"
                onMouseEnter={() => setActivo(b.periodo)} onMouseLeave={() => setActivo(null)}
                onFocus={() => setActivo(b.periodo)} onBlur={() => setActivo(null)}
                onClick={() => setActivo(esActivo ? null : b.periodo)}
                aria-label={b.prev ? `${mesEnTexto(b.periodo)}, previsión: ${eur(b.previsto)}` : `${mesEnTexto(b.periodo)}: cobrado ${eur(b.cobrado)} de ${eur(b.previsto)}, pendiente ${eur(b.pendiente)}`}
                className="relative flex h-full flex-1 flex-col items-center justify-end outline-none">
                {esActivo && (
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 w-40 -translate-x-1/2 rounded-lg bg-marino p-2.5 text-left text-[11px] leading-snug text-white shadow-xl">
                    <span className="mb-1 block font-bold">{capital(mesEnTexto(b.periodo))}{b.prev && ' · previsión'}</span>
                    <span className="flex justify-between"><span>Previsto</span><b className="tabular-nums">{eur(b.previsto)}</b></span>
                    {!b.prev && <>
                      <span className="flex justify-between"><span>Cobrado</span><b className="tabular-nums">{eur(b.cobrado)}</b></span>
                      <span className="flex justify-between"><span>Pendiente</span><b className="tabular-nums">{eur(b.pendiente)}</b></span>
                      <span className="flex justify-between"><span>Al día</span><b className="tabular-nums">{b.pagados} de {b.alumnos}</b></span>
                    </>}
                  </span>
                )}
                {b.prev ? (
                  <span className="w-full max-w-[28px] rounded-t-[4px] border-2 border-b-0 border-dashed border-slate-400 dark:border-slate-500" style={{ height: alto(b.previsto) }} />
                ) : (
                  <span className="flex w-full max-w-[28px] flex-col justify-end gap-[2px]" style={{ height: alto(Math.max(b.previsto, b.cobrado)) }}>
                    {b.pendiente > 0 && <span className="rayas w-full rounded-t-[4px] bg-amber-600" style={{ height: `${(b.pendiente / base) * 100}%` }} />}
                    {cobrado > 0 && <span className={cx('w-full bg-emerald-600', b.pendiente > 0 ? '' : 'rounded-t-[4px]')} style={{ height: `${(cobrado / base) * 100}%` }} />}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-1 sm:gap-2">
          {barras.map((b, i) => (
            <span key={b.periodo} className={cx('flex-1 text-center text-[10px] tabular-nums', b.periodo === actual ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400')}>
              {mesCorto(b.periodo, i === 0 || b.periodo.endsWith('-01'))}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="mt-3 text-xs text-slate-600 dark:text-slate-400">
        Este mes: {eur(ultimo?.cobrado ?? 0)} cobrados de {eur(ultimo?.previsto ?? 0)}. El que viene se prevén {eur(prevision.previsto)} ({prevision.alumnos} {prevision.alumnos === 1 ? 'alumno' : 'alumnos'}{prevision.sinCuota > 0 ? `, ${prevision.sinCuota} sin cuota` : ''}).
      </figcaption>
    </figure>
  );
}

const CELDA: Record<EstadoPago, string> = {
  pagado: 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-marino-hondo',
  parcial: 'bg-amber-100 text-amber-900 ring-1 ring-amber-500/60 dark:bg-amber-500/15 dark:text-amber-200',
  debe: 'bg-red-100 text-red-800 ring-1 ring-red-500/40 dark:bg-red-500/15 dark:text-red-200',
  no_paga: 'bg-hundido text-slate-600 dark:bg-noche-hondo dark:text-slate-400',
  sin_cuota: 'border border-dashed border-amber-600 text-amber-800 dark:text-amber-300',
};

function textoCelda(c: CeldaCuota): ReactNode {
  switch (c.estado) {
    case 'pagado': return <Check size={13} strokeWidth={3} />;
    case 'parcial':
    case 'debe': return Math.round(c.pendiente);
    case 'no_paga': return '0';
    case 'sin_cuota': return '?';
  }
}

/** Alumnos × meses. Cada celda abre la ficha en ese mes. En el móvil se desliza de lado con el nombre fijo. */
function Rejilla({ h, alumnos, acciones }: { h: PagosVista['historico']; alumnos: AlumnoHistorico[]; acciones: Acciones }) {
  // Los meses del principio sin nadie no se pintan (una academia que empieza
  // vería ocho columnas vacías), y en el móvil la rejilla se abre por el final:
  // lo que importa es lo reciente.
  const desde = h.meses.findIndex((m) => m.alumnos > 0);
  const periodos = desde > 0 ? h.periodos.slice(desde) : h.periodos;
  const meses = desde > 0 ? h.meses.slice(desde) : h.meses;
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => { if (caja.current) caja.current.scrollLeft = caja.current.scrollWidth; }, [periodos.length]);
  if (!alumnos.length) return <p className="py-6 text-center text-sm text-slate-600 dark:text-slate-400">Nadie con ese filtro.</p>;
  return (
    <div ref={caja} className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
      <table className="border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-[1] min-w-[8.5rem] bg-white pb-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:bg-noche-2 dark:text-slate-400">Alumno</th>
            {periodos.map((p, i) => (
              <th key={p} className={cx('min-w-[44px] px-0.5 pb-2 text-center text-[11px] font-semibold capitalize', p === h.actual ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400')}>
                {mesCorto(p, i === 0 || p.endsWith('-01'))}
              </th>
            ))}
            <th className="pb-2 pl-3 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-400">Debe</th>
          </tr>
        </thead>
        <tbody>
          {alumnos.map((a) => {
            const debe = a.deudaAnterior + a.pendienteActual;
            return (
              <tr key={a.userId}>
                <th className="sticky left-0 z-[1] max-w-[10rem] bg-white py-0.5 pr-3 text-left font-semibold text-slate-900 dark:bg-noche-2 dark:text-white">
                  <button onClick={() => acciones.abrir(a.userId, a.mesesDebe[0] ?? h.actual)} className="block min-h-[44px] max-w-[10rem] truncate text-left text-[13px]">
                    {a.email ? nombreDeCorreo(a.email) : 'Ya no está'}{!a.activo && <span className="font-normal text-slate-500"> · baja</span>}
                  </button>
                </th>
                {periodos.map((p) => {
                  const c = a.celdas[p];
                  return (
                    <td key={p} className="px-0.5 py-0.5 text-center">
                      {c ? (
                        <button onClick={() => acciones.abrir(a.userId, p)} title={`${mesEnTexto(p)}: ${lineaEstado(c)}`} aria-label={`${nombreDeCorreo(a.email)}, ${mesEnTexto(p)}: ${lineaEstado(c)}`}
                          className={cx('inline-flex h-11 w-11 items-center justify-center rounded-lg font-bold tabular-nums', CELDA[c.estado])}>
                          {textoCelda(c)}
                        </button>
                      ) : <span className="inline-block h-11 w-11 leading-[2.75rem] text-slate-300 dark:text-slate-700" aria-label="No estaba">·</span>}
                    </td>
                  );
                })}
                <td className={cx('whitespace-nowrap pl-3 text-right font-semibold tabular-nums', debe > 0 ? 'text-red-700 dark:text-red-300' : 'text-slate-400 dark:text-slate-600')}>
                  {debe > 0 ? eur(debe) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th className="sticky left-0 z-[1] bg-white pr-3 pt-2 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:bg-noche-2 dark:text-slate-400">Cobrado</th>
            {meses.map((m) => (
              <td key={m.periodo} className="whitespace-nowrap px-0.5 pt-2 text-center text-[11px] font-semibold tabular-nums text-slate-700 dark:text-slate-300">{m.alumnos ? Math.round(m.cobrado) : '—'}</td>
            ))}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Leyenda() {
  const items: [EstadoPago, string][] = [['pagado', 'Pagado'], ['parcial', 'A medias (lo que falta)'], ['debe', 'Debe (lo que falta)'], ['no_paga', 'No paga ese mes'], ['sin_cuota', 'Sin cuota']];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-700 dark:text-slate-300">
      {items.map(([e, t]) => (
        <span key={e} className="flex items-center gap-1.5">
          <span className={cx('inline-flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold', CELDA[e])}>{e === 'pagado' ? <Check size={10} strokeWidth={3} /> : e === 'no_paga' ? '0' : e === 'sin_cuota' ? '?' : '50'}</span>
          {t}
        </span>
      ))}
      <span className="flex items-center gap-1.5"><span className="inline-flex h-5 w-5 items-center justify-center text-slate-400">·</span> No estaba</span>
    </div>
  );
}

// ============================================================
// LA CAJA
// ============================================================

function VistaCaja({ data }: { data: PagosVista }) {
  const [mes, setMes] = useState(data.actual);
  const [verAnulados, setVerAnulados] = useState(true);
  const caja = useMemo(() => cajaDelMes(mes, data.cobros), [mes, data.cobros]);
  const lineas = verAnulados ? caja.lineas : caja.lineas.filter((c) => !c.anulado);

  return (
    <div className="space-y-5">
      <NavMes periodo={mes} onCambia={setMes} min={data.historico.periodos[0]} max={data.actual} sub="Lo que entró en el mes, por la fecha de cada cobro" />
      <Pulso cifras={[
        { valor: eur(caja.total), etiqueta: 'entró en caja', tono: 'ok' },
        { valor: caja.cobros, etiqueta: caja.cobros === 1 ? 'cobro' : 'cobros' },
        ...caja.porMetodo.slice(0, 2).map((t) => ({ valor: eur(t.importe), etiqueta: `${ETIQUETA_METODO[t.metodo].toLowerCase()} (${t.cobros})` })),
      ]} />

      {caja.lineas.length === 0 ? (
        <EmptyState bordered icon={<Tag size={36} />} title="Ningún cobro en ese mes" hint="Cada cobro que se anota en «Cobrar» o en la ficha de un alumno sale aquí con su recibo." />
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <Hoja pad="md" className="space-y-3">
              <BloqueTitulo>Por método</BloqueTitulo>
              <ul className="space-y-2.5">
                {caja.porMetodo.map((t) => (
                  <li key={t.metodo} className="text-sm">
                    <span className="flex justify-between gap-3"><span>{ETIQUETA_METODO[t.metodo]} <span className="text-slate-600 dark:text-slate-400">· {t.cobros}</span></span><b className="tabular-nums">{eur(t.importe)}</b></span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-hundido dark:bg-noche-hondo"><span className="block h-full rounded-full bg-indigo-900 dark:bg-indigo-300" style={{ width: `${caja.total ? (t.importe / caja.total) * 100 : 0}%` }} /></span>
                  </li>
                ))}
              </ul>
            </Hoja>
            <Hoja pad="md" className="space-y-3">
              <BloqueTitulo>Por día</BloqueTitulo>
              <ul className="max-h-60 divide-y divide-linea overflow-y-auto text-sm dark:divide-noche-linea">
                {[...caja.porDia].reverse().map((d) => (
                  <li key={d.fecha} className="flex justify-between gap-3 py-1.5"><span>{fechaEnTexto(d.fecha)} <span className="text-slate-600 dark:text-slate-400">· {d.cobros} {d.cobros === 1 ? 'cobro' : 'cobros'}</span></span><b className="tabular-nums">{eur(d.importe)}</b></li>
                ))}
              </ul>
            </Hoja>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Filtros etiqueta="Qué cobros ver">
              <FiltroChip activo={verAnulados} onClick={() => setVerAnulados(true)} cuenta={caja.lineas.length}>Todos</FiltroChip>
              <FiltroChip activo={!verAnulados} onClick={() => setVerAnulados(false)} cuenta={caja.cobros}>Sin anulados</FiltroChip>
            </Filtros>
            <Boton variant="secondary" icon={<Download size={15} />} onClick={() => descarga(`caja-${mes}.csv`, csvCaja(caja))}>Descargar para el gestor (CSV)</Boton>
          </div>

          <TablaDual<Cobro>
            filas={lineas}
            clave={(c) => c.id}
            columnas={[
              { id: 'recibo', titulo: 'Recibo', celda: (c) => <span className="font-semibold tabular-nums">nº {c.recibo}{c.anulado && <Etiqueta tono="malo" className="ml-2">Anulado</Etiqueta>}</span> },
              { id: 'fecha', titulo: 'Fecha', celda: (c) => fechaEnTexto(c.fecha) },
              { id: 'alumno', titulo: 'Alumno', celda: (c) => <span className="block max-w-[16rem] truncate">{c.alumno}</span> },
              { id: 'concepto', titulo: 'Mensualidad', celda: (c) => capital(mesEnTexto(c.periodo)) },
              { id: 'metodo', titulo: 'Método', celda: (c) => ETIQUETA_METODO[c.metodo] },
              { id: 'importe', titulo: 'Importe', derecha: true, celda: (c) => <b className={cx('tabular-nums', c.anulado && 'line-through opacity-60')}>{eur(c.importe)}</b> },
              { id: 'acc', titulo: '', acciones: true, derecha: true, celda: (c) => <Boton size="sm" variant="ghost" icon={<Printer size={14} />} onClick={() => imprimeRecibo(c)}>Recibo</Boton> },
            ]}
          />
          {caja.anulados > 0 && <p className="text-xs text-slate-600 dark:text-slate-400">Los anulados salen con su número para que el talonario no tenga huecos, pero no suman.</p>}
        </>
      )}
    </div>
  );
}

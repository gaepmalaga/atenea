'use client';

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import {
  BadgeEuro, RefreshCw, ChevronLeft, ChevronRight, Search, Download, AlertTriangle, Check,
  CalendarDays, Table2, Tag, Undo2, ChevronRight as Flecha, X,
} from 'lucide-react';
import { getPagos, registraCobro, anulaCobro, setCuotaMes, setCuotaPropia } from '@/actions';
import type { PagosVista } from '@/app/actions/payments';
import {
  eur, sumaMeses, mesCorto, csvHistorico, etiquetaEstado, leeImporte, listaY,
  type AlumnoMes, type EstadoPago, type CeldaCuota, type AlumnoHistorico, type MesHistorico,
} from '@/app/lib/cuotas';
import { formateaPeriodo } from '@/app/lib/payments';
import { Card, EmptyState, StatTile, Button, Modal, SectionLabel, TEXT, cx } from '../../ui';

/**
 * «Pagos» (P8, rehecho en la regla 102) — las cuotas y el cobro en efectivo.
 *
 * La cuota de cada alumno sale de sus grupos y de los precios de «Grupos»; el
 * mes en curso se abre solo con lo que debe cada uno. Dos vistas:
 *  - MES: a quién cobrar, con un toque («Cobrar 50 €»), lo previsto, lo
 *    cobrado y lo pendiente; los pagos a medias, y quién debe meses atrás.
 *  - HISTÓRICO: doce meses de un vistazo (gráfico y rejilla), quién debe, y
 *    la hoja para Excel.
 * La ficha de un alumno lo tiene todo de él: cobrar cualquier mes, deshacer,
 * cambiar la cuota de un mes o la suya de siempre.
 */

const irAPestana = (id: string) => window.dispatchEvent(new CustomEvent('admin:pestana', { detail: id }));

type Ficha = { userId: string; periodo: string };
type Aviso = { texto: string; deshacer?: { userId: string; periodo: string } };

export default function AdminPayments() {
  const [vista, setVista] = useState<'mes' | 'historico'>('mes');
  const [periodo, setPeriodo] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<PagosVista | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const res = await getPagos(periodo ?? undefined);
      if (!vivo) return;
      if (res.success) { setData(res.data); setError(null); } else setError(res.error);
      setLoading(false);
    })();
    return () => { vivo = false; };
  }, [periodo, version]);

  // El aviso de «cobrado» se va solo.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  const recargar = () => setVersion((v) => v + 1);

  /** Una acción sobre un alumno y un mes: bloquea ese botón, avisa y recarga. */
  async function haz(clave: string, fn: () => Promise<{ success: boolean; error?: string }>, ok?: Aviso) {
    setOcupado(clave);
    const res = await fn();
    if (!res.success) setError(res.error ?? 'No se pudo guardar.');
    else { setError(null); if (ok) setAviso(ok); }
    recargar();
    setOcupado(null);
  }

  const acciones: Acciones = {
    ocupado,
    cobrar: (a, p, cantidad) => {
      const antes = a.cobrado;
      return haz(`${a.userId}:${p}`, () => registraCobro({ studentId: a.userId, period: p, cantidad: cantidad ?? null }), {
        texto: `Cobrado a ${nombre(a.email)} (${mesLargo(p)})`,
        deshacer: antes === 0 ? { userId: a.userId, periodo: p } : undefined,
      });
    },
    anular: (userId, p) => haz(`${userId}:${p}`, () => anulaCobro({ studentId: userId, period: p }), { texto: 'Cobro deshecho' }),
    cuotaMes: (userId, p, cuota, nota) => haz(`${userId}:${p}`, () => setCuotaMes({ studentId: userId, period: p, cuota, nota })),
    cuotaPropia: (userId, cuota, nota) => haz(`${userId}:propia`, () => setCuotaPropia({ studentId: userId, cuota, nota })),
    abrir: (userId, p) => setFicha({ userId, periodo: p }),
  };

  return (
    <div className="space-y-4 animate-in fade-in pb-24">
      <Card tone="sunken" pad="md" className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-slate-700/10 dark:bg-white/5 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
            <BadgeEuro size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-tight">Pagos</h3>
            <p className={cx(TEXT.muted, 'mt-0.5')}>La cuota de cada alumno sale de sus grupos. Cobro en efectivo.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1" role="tablist">
            {([['mes', 'Mes', CalendarDays], ['historico', 'Histórico', Table2]] as const).map(([id, label, Icono]) => (
              <button key={id} role="tab" aria-selected={vista === id} onClick={() => setVista(id)}
                className={cx('min-h-[40px] px-3 rounded-lg text-xs font-bold flex items-center gap-1.5',
                  vista === id ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400')}>
                <Icono size={14} /> {label}
              </button>
            ))}
          </div>
          <button onClick={() => { setLoading(true); recargar(); }} className="w-11 h-11 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400" aria-label="Recargar">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </Card>

      {error && (
        <Card tone="base" pad="md" className="border-red-500/30 flex items-start justify-between gap-3">
          <p className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 shrink-0" aria-label="Cerrar el error"><X size={14} /></button>
        </Card>
      )}

      {!data && loading && <p className={cx(TEXT.muted, 'text-center py-10')}>Cargando…</p>}

      {data && vista === 'mes' && (
        <VistaMes data={data} acciones={acciones} cambiaPeriodo={(p) => { setLoading(true); setPeriodo(p); }} cargando={loading} />
      )}
      {data && vista === 'historico' && <VistaHistorico data={data} acciones={acciones} />}

      {data && ficha && (
        <FichaAlumno data={data} ficha={ficha} acciones={acciones} cambiaMes={(p) => setFicha({ ...ficha, periodo: p })} onClose={() => setFicha(null)} />
      )}

      {aviso && (
        <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-6 sm:bottom-6 z-[250] flex items-center justify-between gap-3 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xl px-4 py-3 sm:min-w-[22rem] animate-in fade-in slide-in-from-bottom-2" role="status">
          <span className="text-sm font-semibold flex items-center gap-2"><Check size={16} className="text-emerald-400 dark:text-emerald-600 shrink-0" /> {aviso.texto}</span>
          {aviso.deshacer && (
            <button onClick={() => { const d = aviso.deshacer!; setAviso(null); acciones.anular(d.userId, d.periodo); }}
              className="min-h-[44px] px-2 text-sm font-black text-oro dark:text-indigo-700 shrink-0">Deshacer</button>
          )}
        </div>
      )}
    </div>
  );
}

type Acciones = {
  ocupado: string | null;
  /** Sin cantidad: lo que falta. Con cantidad (texto tal como lo escribe): se suma. */
  cobrar: (a: { userId: string; email: string | null; cobrado: number }, periodo: string, cantidad?: string) => Promise<void>;
  anular: (userId: string, periodo: string) => Promise<void>;
  cuotaMes: (userId: string, periodo: string, cuota: string | null, nota: string | null) => Promise<void>;
  cuotaPropia: (userId: string, cuota: string | null, nota: string | null) => Promise<void>;
  abrir: (userId: string, periodo: string) => void;
};

// ============================================================
// PIEZAS COMUNES
// ============================================================

/** «ana.garcia@gmail.com» → «ana.garcia». */
const nombre = (email: string | null) => (email ? email.split('@')[0] : 'Alumno sin correo');
const mesLargo = (p: string) => formateaPeriodo(p);
const diaDe = (fecha: string | null) => (fecha ? `${Number(fecha.slice(8, 10))} ${mesCorto(fecha.slice(0, 7))}` : null);

const ESTILO_ESTADO: Record<EstadoPago, { pill: string; punto: string }> = {
  pagado: { pill: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', punto: 'bg-emerald-600' },
  parcial: { pill: 'bg-amber-500/15 text-amber-800 dark:text-amber-300', punto: 'bg-amber-600' },
  debe: { pill: 'bg-rose-500/10 text-rose-700 dark:text-rose-400', punto: 'bg-rose-600' },
  no_paga: { pill: 'bg-slate-500/10 text-slate-600 dark:text-slate-300', punto: 'bg-slate-400' },
  sin_cuota: { pill: 'bg-amber-500/10 text-amber-800 dark:text-amber-300', punto: 'bg-amber-400' },
};

function Estado({ estado }: { estado: EstadoPago }) {
  return (
    <span className={cx('inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded', ESTILO_ESTADO[estado].pill)}>
      {estado === 'pagado' && <Check size={10} />}{etiquetaEstado(estado)}
    </span>
  );
}

/** La línea que dice cómo está un mes: «Debe 50 €», «Pagó 30 de 50 € · faltan 20 €»… */
function lineaEstado(a: Pick<CeldaCuota, 'estado' | 'debido' | 'cobrado' | 'pendiente' | 'pagadoEl' | 'nota'>): string {
  switch (a.estado) {
    case 'debe': return `Debe ${eur(a.pendiente)}`;
    case 'parcial': return `Pagó ${eur(a.cobrado)} de ${eur(a.debido)} · faltan ${eur(a.pendiente)}`;
    case 'pagado': return `Pagado ${eur(a.cobrado)}${a.pagadoEl ? ` el ${diaDe(a.pagadoEl)}` : ''}`;
    case 'no_paga': return `Este mes no paga${a.nota ? `: ${a.nota}` : ''}`;
    case 'sin_cuota': return 'Sin cuota: no se sabe cuánto debe';
  }
}

function Correo({ email, sub }: { email: string | null; sub?: ReactNode }) {
  const [local, dominio] = email ? email.split('@') : [null, null];
  return (
    <span className="min-w-0 block">
      <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">
        {local ?? 'Alumno que ya no está'}{dominio && <span className="font-normal text-slate-400 dark:text-slate-500">@{dominio}</span>}
      </span>
      {sub}
    </span>
  );
}

// ============================================================
// EL MES
// ============================================================

type Filtro = 'cobrar' | 'pagados' | 'todos';

function VistaMes({ data, acciones, cambiaPeriodo, cargando }: {
  data: PagosVista; acciones: Acciones; cambiaPeriodo: (p: string) => void; cargando: boolean;
}) {
  const { mes, actual, periodo, esPrevision } = data;
  const [busca, setBusca] = useState('');
  const porCobrar = mes.filas.filter((f) => f.pendiente > 0 || f.estado === 'sin_cuota');
  const [filtroElegido, setFiltro] = useState<Filtro | null>(null);
  const filtro: Filtro = filtroElegido ?? (porCobrar.length ? 'cobrar' : 'todos');

  const visibles = mes.filas.filter((f) => {
    if (busca.trim() && !(f.email ?? '').toLowerCase().includes(busca.trim().toLowerCase())) return false;
    if (filtro === 'cobrar') return f.pendiente > 0 || f.estado === 'sin_cuota';
    if (filtro === 'pagados') return f.estado === 'pagado' || f.estado === 'no_paga';
    return true;
  });
  const minimo = sumaMeses(actual, -24);

  return (
    <div className="space-y-4">
      {/* El mes que se mira */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => cambiaPeriodo(sumaMeses(periodo, -1))} disabled={cargando || periodo <= minimo}
          className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30" aria-label="Mes anterior">
          <ChevronLeft size={20} />
        </button>
        <div className="text-center min-w-0">
          <p className="font-titulo uppercase text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-wide">{mesLargo(periodo)}</p>
          <p className={TEXT.muted}>
            {periodo === actual ? 'Este mes' : esPrevision ? 'El mes que viene · previsión' : periodo < actual ? 'Mes cerrado' : ''}
            {periodo !== actual && <> · <button className="underline font-semibold" onClick={() => cambiaPeriodo(actual)}>volver a este mes</button></>}
          </p>
        </div>
        <button onClick={() => cambiaPeriodo(sumaMeses(periodo, 1))} disabled={cargando || esPrevision}
          className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30" aria-label="Mes siguiente">
          <ChevronRight size={20} />
        </button>
      </div>

      <Resumen data={data} />

      <Avisos data={data} />

      {periodo === actual && data.historico.deudores.length > 0 && (
        <DeudasAnteriores deudores={data.historico.deudores} acciones={acciones} actual={actual} />
      )}

      {mes.alumnos === 0 ? (
        <EmptyState icon={<BadgeEuro size={40} />} bordered
          title={periodo < actual ? 'Nadie en la lista de ese mes' : 'No hay alumnos que paguen'}
          hint={periodo < actual
            ? 'En un mes cerrado salen los alumnos que tenían cuota ese mes.'
            : 'Entran los alumnos con acceso activo, menos los exentos. Se da acceso en «Alumnos».'} />
      ) : (
        <Card tone="base" pad="md" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
              {([['cobrar', `Por cobrar · ${porCobrar.length}`], ['pagados', `Al día · ${mes.pagados + mes.noPagan}`], ['todos', `Todos · ${mes.alumnos}`]] as const).map(([id, label]) => (
                <button key={id} onClick={() => setFiltro(id)} aria-pressed={filtro === id}
                  className={cx('min-h-[40px] px-3 rounded-lg text-xs font-bold',
                    filtro === id ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400')}>
                  {label}
                </button>
              ))}
            </div>
            <label className="flex-1 min-w-[12rem] flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3">
              <Search size={14} className="text-slate-400 shrink-0" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar alumno" aria-label="Buscar alumno"
                className="w-full bg-transparent py-2 text-base sm:text-sm outline-none" />
            </label>
          </div>

          {visibles.length === 0 ? (
            <p className={cx(TEXT.muted, 'text-center py-6')}>
              {filtro === 'cobrar' && !busca ? 'Nadie por cobrar este mes. Todo al día.' : 'Nadie con ese filtro.'}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 -mx-1">
              {visibles.map((f) => <FilaMes key={f.userId} f={f} periodo={periodo} acciones={acciones} />)}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function Resumen({ data }: { data: PagosVista }) {
  const { mes, esPrevision } = data;
  if (esPrevision) {
    return (
      <Card tone="base" pad="md" className="space-y-2">
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <StatTile label="Previsto" value={mes.previsto > 0 ? eur(mes.previsto) : null} tone="brand" />
          <StatTile label="Alumnos" value={mes.alumnos} />
        </div>
        <p className={TEXT.muted}>Lo que se cobraría con los alumnos y los precios de hoy.{mes.sinCuota > 0 && ` ${mes.sinCuota} sin cuota calculada: no suman.`}</p>
      </Card>
    );
  }
  const pct = mes.porcentaje;
  return (
    <Card tone="base" pad="md" className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatTile label="Previsto" value={mes.alumnos ? eur(mes.previsto) : null} />
        <StatTile label="Cobrado" value={mes.alumnos ? eur(mes.cobrado) : null} tone="success" />
        <StatTile label="Pendiente" value={mes.alumnos ? eur(mes.pendiente) : null} tone={mes.pendiente > 0 ? 'warning' : 'neutral'} />
      </div>
      {pct !== null && (
        <div>
          <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Cobrado de lo previsto">
            <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className={cx(TEXT.muted, 'mt-1.5 flex flex-wrap gap-x-3')}>
            <span className="font-bold text-slate-700 dark:text-slate-200">{pct} % cobrado</span>
            <span>{mes.pagados} {mes.pagados === 1 ? 'pagado' : 'pagados'}</span>
            {mes.parciales > 0 && <span>{mes.parciales} a medias</span>}
            {mes.deben > 0 && <span>{mes.deben} sin pagar</span>}
            {mes.noPagan > 0 && <span>{mes.noPagan} no pagan este mes</span>}
            {mes.sinCuota > 0 && <span className="text-amber-700 dark:text-amber-300">{mes.sinCuota} sin cuota</span>}
          </p>
        </div>
      )}
    </Card>
  );
}

function Avisos({ data }: { data: PagosVista }) {
  const { avisos } = data;
  if (avisos.tarifaVacia) {
    return (
      <Card tone="base" pad="md" className="border-amber-500/40 space-y-2">
        <p className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2"><Tag size={15} className="text-amber-600" /> Aún no hay precios</p>
        <p className={TEXT.muted}>Pon en «Grupos» lo que cuesta al mes cada tipo (Teoría, Físicas, Inglés…) y los packs. Con eso, aquí sale lo que debe cada alumno según sus grupos.</p>
        <Button size="sm" onClick={() => irAPestana('groups')}>Poner los precios</Button>
      </Card>
    );
  }
  if (!avisos.sinPrecio.length && !avisos.sinGrupos.length) return null;
  return (
    <Card tone="base" pad="md" className="border-amber-500/40 space-y-2">
      <p className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2"><AlertTriangle size={15} className="text-amber-600" /> Alumnos sin cuota calculada</p>
      <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
        {avisos.sinPrecio.map((s) => (
          <li key={s.tipo}>Falta el precio de <b>{s.tipo}</b> ({s.alumnos} {s.alumnos === 1 ? 'alumno' : 'alumnos'}).</li>
        ))}
        {avisos.sinGrupos.length > 0 && (
          <li>Sin ningún grupo: {listaY(avisos.sinGrupos.slice(0, 4).map(nombre))}{avisos.sinGrupos.length > 4 ? ` y ${avisos.sinGrupos.length - 4} más` : ''}. Métele en sus grupos en «Alumnos», o ponle una cuota propia.</li>
        )}
      </ul>
      {avisos.sinPrecio.length > 0 && <Button size="sm" variant="secondary" onClick={() => irAPestana('groups')}>Ir a los precios</Button>}
    </Card>
  );
}

function DeudasAnteriores({ deudores, acciones, actual }: { deudores: AlumnoHistorico[]; acciones: Acciones; actual: string }) {
  const [abierto, setAbierto] = useState(false);
  const total = deudores.reduce((s, d) => s + d.deudaAnterior, 0);
  const lista = abierto ? deudores : deudores.slice(0, 3);
  return (
    <Card tone="base" pad="md" className="border-rose-500/30 space-y-2">
      <SectionLabel aside={<span className="text-sm font-black text-rose-700 dark:text-rose-400 tabular-nums">{eur(total)}</span>}>
        Deben de meses anteriores
      </SectionLabel>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {lista.map((d) => (
          <li key={d.userId}>
            <button onClick={() => acciones.abrir(d.userId, d.mesesDebe[0] ?? actual)} className="w-full flex items-center justify-between gap-3 py-2 text-left min-h-[44px]">
              <Correo email={d.email} sub={<span className={cx(TEXT.muted, 'block')}>{listaY(d.mesesDebe.map((p) => mesCorto(p)))}</span>} />
              <span className="flex items-center gap-1 shrink-0 text-sm font-black tabular-nums text-rose-700 dark:text-rose-400">{eur(d.deudaAnterior)} <Flecha size={14} className="text-slate-400" /></span>
            </button>
          </li>
        ))}
      </ul>
      {deudores.length > 3 && (
        <button onClick={() => setAbierto((x) => !x)} className="text-xs font-bold text-indigo-600 dark:text-indigo-400 min-h-[44px]">
          {abierto ? 'Ver menos' : `Ver los ${deudores.length}`}
        </button>
      )}
    </Card>
  );
}

function FilaMes({ f, periodo, acciones }: { f: AlumnoMes; periodo: string; acciones: Acciones }) {
  const ocupado = acciones.ocupado === `${f.userId}:${periodo}`;
  const origen = f.manual
    ? `Cuota de este mes puesta a mano${f.nota ? ` · ${f.nota}` : ''}`
    : f.cuota?.origen === 'propia' ? 'Cuota propia' : f.cuota && f.cuota.importe !== null ? f.cuota.detalle : f.cuota?.detalle ?? null;
  const tono = f.estado === 'debe' ? 'text-rose-700 dark:text-rose-400' : f.estado === 'parcial' || f.estado === 'sin_cuota' ? 'text-amber-700 dark:text-amber-300' : f.estado === 'pagado' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400';
  return (
    <li className="flex items-center gap-3 py-2.5 px-1">
      <span className={cx('w-2.5 h-2.5 rounded-full shrink-0', ESTILO_ESTADO[f.estado].punto)} aria-hidden />
      <button onClick={() => acciones.abrir(f.userId, periodo)} className="flex-1 min-w-0 text-left min-h-[44px]" aria-label={`Ficha de ${nombre(f.email)}`}>
        <Correo email={f.email} sub={<>
          <span className={cx('block text-xs font-semibold', tono)}>{lineaEstado(f)}</span>
          {origen && <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate">{origen}{!f.activo && ' · ya no tiene acceso'}</span>}
        </>} />
      </button>
      {f.pendiente > 0 ? (
        <Button size="sm" disabled={!!acciones.ocupado} onClick={() => acciones.cobrar(f, periodo)} className="shrink-0 tabular-nums">
          {ocupado ? '…' : `Cobrar ${eur(f.pendiente)}`}
        </Button>
      ) : f.estado === 'sin_cuota' ? (
        <Button size="sm" variant="secondary" onClick={() => acciones.abrir(f.userId, periodo)} className="shrink-0">Anotar</Button>
      ) : (
        <button onClick={() => acciones.abrir(f.userId, periodo)} className="shrink-0 w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white" aria-label={`Más de ${nombre(f.email)}`}>
          <Flecha size={16} />
        </button>
      )}
    </li>
  );
}

// ============================================================
// LA FICHA DE UN ALUMNO
// ============================================================

function FichaAlumno({ data, ficha, acciones, cambiaMes, onClose }: {
  data: PagosVista; ficha: Ficha; acciones: Acciones; cambiaMes: (p: string) => void; onClose: () => void;
}) {
  const { userId, periodo } = ficha;
  const deMes = data.periodo === periodo ? data.mes.filas.find((f) => f.userId === userId) : undefined;
  const hist = data.historico.alumnos.find((a) => a.userId === userId);
  const cuotaHoy = data.cuotas.find((c) => c.userId === userId) ?? null;
  const email = deMes?.email ?? hist?.email ?? cuotaHoy?.email ?? null;
  const celda: CeldaCuota | null = deMes ?? hist?.celdas[periodo] ?? null;
  const ocupado = acciones.ocupado === `${userId}:${periodo}`;
  const [cantidad, setCantidad] = useState('');
  const [cuotaMes, setCuotaMesTxt] = useState('');
  const [notaMes, setNotaMes] = useState('');
  const [propia, setPropia] = useState(cuotaHoy?.cuota.origen === 'propia' && cuotaHoy.cuota.importe !== null ? String(cuotaHoy.cuota.importe).replace('.', ',') : '');
  const [notaPropia, setNotaPropia] = useState(cuotaHoy?.notaPropia ?? '');
  const lecturaCantidad = leeImporte(cantidad);
  const meses = useMemo(
    () => (hist ? data.historico.periodos.filter((p) => hist.celdas[p]).reverse() : []),
    [hist, data.historico.periodos],
  );
  const inp = 'text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2';

  return (
    <Modal title={nombre(email)} subtitle={email ?? undefined} onClose={onClose} width="sm"
      footer={<Button variant="secondary" block onClick={onClose}>Cerrar</Button>}>
      <div className="space-y-5">
        {/* EL MES */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => cambiaMes(sumaMeses(periodo, -1))} className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Mes anterior"><ChevronLeft size={18} /></button>
            <p className="font-black text-slate-900 dark:text-white capitalize">{mesLargo(periodo)}</p>
            <button onClick={() => cambiaMes(sumaMeses(periodo, 1))} disabled={periodo >= sumaMeses(data.actual, 1)} className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30" aria-label="Mes siguiente"><ChevronRight size={18} /></button>
          </div>
          {celda ? (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2"><Estado estado={celda.estado} />{celda.manual && <span className="text-[10px] font-bold text-slate-500">cuota a mano</span>}</div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{lineaEstado(celda)}</p>
              <p className={TEXT.muted}>Cuota del mes: {eur(celda.debido)}{celda.cobrado > 0 && <> · cobrado {eur(celda.cobrado)}</>}</p>
            </div>
          ) : (
            <p className={cx(TEXT.muted, 'rounded-xl bg-slate-50 dark:bg-slate-800/40 p-3')}>Ese mes no estaba en la lista. Si pagó, anótalo abajo: se le pone su cuota de hoy.</p>
          )}

          {celda && celda.pendiente > 0 && (
            <Button block disabled={!!acciones.ocupado} onClick={() => acciones.cobrar({ userId, email, cobrado: celda.cobrado }, periodo)}>
              {ocupado ? 'Guardando…' : `Cobrar lo que falta · ${eur(celda.pendiente)}`}
            </Button>
          )}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 flex-1">
              {celda && celda.cobrado > 0 ? 'Trae' : 'Pagó'}
              <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="30" aria-label="Cantidad que ha pagado" className={cx(inp, 'w-24 text-right tabular-nums font-bold')} /> €
            </label>
            <Button size="sm" variant="secondary" disabled={!!acciones.ocupado || !lecturaCantidad.ok || lecturaCantidad.valor === null || lecturaCantidad.valor <= 0}
              onClick={() => { acciones.cobrar({ userId, email, cobrado: celda?.cobrado ?? 0 }, periodo, cantidad); setCantidad(''); }}>Anotar</Button>
          </div>
          {!lecturaCantidad.ok && <p className="text-xs text-red-600 dark:text-red-400">{lecturaCantidad.error}</p>}
          <p className={TEXT.muted}>Un pago a medias se anota aquí y queda «faltan X €»; lo que traiga después se suma.</p>
          {celda && celda.cobrado > 0 && (
            <button onClick={() => { if (confirm(`¿Deshacer lo cobrado en ${mesLargo(periodo)} (${eur(celda.cobrado)})?`)) acciones.anular(userId, periodo); }}
              disabled={!!acciones.ocupado} className="text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1.5 min-h-[44px]">
              <Undo2 size={13} /> Deshacer lo cobrado este mes
            </button>
          )}

          <details className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
            <summary className="text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer min-h-[28px]">Cambiar la cuota de este mes</summary>
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input value={cuotaMes} onChange={(e) => setCuotaMesTxt(e.target.value)} inputMode="decimal" autoComplete="off" placeholder={celda?.debido != null ? String(celda.debido) : '50'} aria-label="Cuota de este mes" className={cx(inp, 'w-24 text-right tabular-nums')} />
                <span className="text-xs">€</span>
                <input value={notaMes} onChange={(e) => setNotaMes(e.target.value)} maxLength={200} placeholder="Por qué (opcional)" className={cx(inp, 'flex-1 min-w-[9rem]')} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={!!acciones.ocupado || !cuotaMes.trim()} onClick={() => { acciones.cuotaMes(userId, periodo, cuotaMes, notaMes); setCuotaMesTxt(''); setNotaMes(''); }}>Guardar</Button>
                <Button size="sm" variant="secondary" disabled={!!acciones.ocupado} onClick={() => acciones.cuotaMes(userId, periodo, '0', notaMes || 'Este mes no paga')}>No cobrar este mes</Button>
                {celda?.manual && <Button size="sm" variant="ghost" disabled={!!acciones.ocupado} onClick={() => acciones.cuotaMes(userId, periodo, null, null)}>Volver a su cuota</Button>}
              </div>
            </div>
          </details>
        </section>

        {/* SU CUOTA DE SIEMPRE */}
        {cuotaHoy && (
          <section className="space-y-2">
            <SectionLabel>Su cuota</SectionLabel>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {cuotaHoy.cuota.importe !== null ? `${eur(cuotaHoy.cuota.importe)}/mes` : 'Sin calcular'}
              <span className="font-normal text-slate-500 dark:text-slate-400"> · {cuotaHoy.cuota.detalle}{cuotaHoy.notaPropia ? ` (${cuotaHoy.notaPropia})` : ''}</span>
            </p>
            {cuotaHoy.grupos.length > 0 && <p className={TEXT.muted}>Grupos: {cuotaHoy.grupos.join(', ')}</p>}
            <details className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <summary className="text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer min-h-[28px]">Ponerle una cuota propia</summary>
              <p className={cx(TEXT.muted, 'mt-2')}>Para todos los meses, en vez de la de sus grupos (un descuento, un hermano…). Se aplica desde el mes en curso si aún no se le ha cobrado.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input value={propia} onChange={(e) => setPropia(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="80" aria-label="Cuota propia" className={cx(inp, 'w-24 text-right tabular-nums')} />
                <span className="text-xs">€/mes</span>
                <input value={notaPropia} onChange={(e) => setNotaPropia(e.target.value)} maxLength={120} placeholder="Por qué (opcional)" className={cx(inp, 'flex-1 min-w-[9rem]')} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" disabled={!!acciones.ocupado || !propia.trim()} onClick={() => acciones.cuotaPropia(userId, propia, notaPropia)}>Guardar</Button>
                {cuotaHoy.cuota.origen === 'propia' && (
                  <Button size="sm" variant="ghost" disabled={!!acciones.ocupado} onClick={() => { setPropia(''); setNotaPropia(''); acciones.cuotaPropia(userId, null, null); }}>Quitar: la de sus grupos</Button>
                )}
              </div>
            </details>
          </section>
        )}

        {/* SUS MESES */}
        {meses.length > 0 && hist && (
          <section className="space-y-1">
            <SectionLabel aside={hist.deudaAnterior > 0 ? <span className="text-xs font-black text-rose-700 dark:text-rose-400">debe {eur(hist.deudaAnterior)}</span> : undefined}>Sus meses</SectionLabel>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {meses.map((p) => {
                const c = hist.celdas[p];
                return (
                  <li key={p}>
                    <button onClick={() => cambiaMes(p)} aria-current={p === periodo}
                      className={cx('w-full flex items-center justify-between gap-3 py-2 px-2 rounded-lg text-left min-h-[44px]', p === periodo && 'bg-indigo-500/10')}>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 capitalize w-16 shrink-0">{mesCorto(p, true)}</span>
                      <span className="flex-1 min-w-0 text-xs text-slate-500 dark:text-slate-400 truncate">{lineaEstado(c)}</span>
                      <Estado estado={c.estado} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}

// ============================================================
// EL HISTÓRICO
// ============================================================

function VistaHistorico({ data, acciones }: { data: PagosVista; acciones: Acciones }) {
  const h = data.historico;
  const [busca, setBusca] = useState('');
  const [soloDeuda, setSoloDeuda] = useState(false);
  const conDatos = h.meses.some((m) => m.alumnos > 0);

  const alumnos = h.alumnos
    .filter((a) => !busca.trim() || (a.email ?? '').toLowerCase().includes(busca.trim().toLowerCase()))
    .filter((a) => !soloDeuda || a.deudaAnterior + a.pendienteActual > 0)
    .sort((a, b) => (b.deudaAnterior + b.pendienteActual) - (a.deudaAnterior + a.pendienteActual) || (a.email ?? '').localeCompare(b.email ?? '', 'es'));

  function exportar() {
    const blob = new Blob([csvHistorico(h)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pagos-${h.periodos[0]}-a-${h.actual}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!conDatos) {
    return (
      <EmptyState icon={<Table2 size={40} />} bordered title="Aún no hay meses con cuotas"
        hint="El histórico se llena solo: cada mes, al abrir «Pagos», queda anotado lo que debe cada alumno y lo que paga." />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatTile label="Cobrado en 12 meses" value={eur(h.totales.cobrado)} tone="success" />
        <StatTile label="Deuda de meses cerrados" value={eur(h.totales.deudaAnterior)} tone={h.totales.deudaAnterior > 0 ? 'danger' : 'neutral'} />
        <StatTile label="Cobrado de lo previsto" value={h.totales.porcentaje} suffix=" %" tone="brand" />
      </div>

      <Card tone="base" pad="md" className="space-y-3">
        <SectionLabel>Mes a mes</SectionLabel>
        <Grafico meses={h.meses} actual={h.actual} prevision={data.prevision} />
      </Card>

      {h.deudores.length > 0 && <DeudasAnteriores deudores={h.deudores} acciones={acciones} actual={h.actual} />}

      <Card tone="base" pad="md" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex-1 min-w-[12rem] flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar alumno" aria-label="Buscar alumno en el histórico"
              className="w-full bg-transparent py-2 text-base sm:text-sm outline-none" />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 min-h-[44px] cursor-pointer">
            <input type="checkbox" className="w-5 h-5" checked={soloDeuda} onChange={(e) => setSoloDeuda(e.target.checked)} /> Solo los que deben
          </label>
          <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={exportar}>Excel (CSV)</Button>
        </div>
        <Rejilla h={h} alumnos={alumnos} acciones={acciones} />
        <Leyenda />
      </Card>
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
  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-[11px] text-slate-600 dark:text-slate-300">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-600" /> Cobrado</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-600 rayas" /> Pendiente</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border-2 border-dashed border-slate-400" /> Previsión</span>
      </div>
      <div className="relative">
        {/* Rejilla de fondo: la mitad y el tope, recesiva. */}
        <div className="absolute inset-x-0 top-0 h-40 pointer-events-none">
          <div className="absolute inset-x-0 top-0 border-t border-dashed border-slate-200 dark:border-slate-800" />
          <span className="absolute right-0 -top-4 text-[10px] text-slate-400 tabular-nums">{eur(max)}</span>
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-100 dark:border-slate-800/60" />
        </div>
        <div className="flex items-end gap-1 sm:gap-2 h-40 border-b border-slate-300 dark:border-slate-700">
          {barras.map((b) => {
            const esActivo = activo === b.periodo;
            const cobrado = Math.min(b.cobrado, b.previsto || b.cobrado);
            return (
              <button key={b.periodo} type="button"
                onMouseEnter={() => setActivo(b.periodo)} onMouseLeave={() => setActivo(null)}
                onFocus={() => setActivo(b.periodo)} onBlur={() => setActivo(null)}
                onClick={() => setActivo(esActivo ? null : b.periodo)}
                aria-label={b.prev
                  ? `${mesLargo(b.periodo)}, previsión: ${eur(b.previsto)}`
                  : `${mesLargo(b.periodo)}: cobrado ${eur(b.cobrado)} de ${eur(b.previsto)}, pendiente ${eur(b.pendiente)}`}
                className="relative flex-1 h-full flex flex-col justify-end items-center outline-none group">
                {esActivo && (
                  <span className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-10 w-40 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xl p-2.5 text-left text-[11px] leading-snug pointer-events-none">
                    <span className="block font-black capitalize mb-1">{mesLargo(b.periodo)}{b.prev && ' · previsión'}</span>
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
                  <span className={cx('w-full max-w-[28px] flex flex-col justify-end gap-[2px]', esActivo && 'opacity-90')} style={{ height: alto(Math.max(b.previsto, b.cobrado)) }}>
                    {b.pendiente > 0 && <span className={cx('w-full bg-amber-600 rayas', 'rounded-t-[4px]')} style={{ height: `${(b.pendiente / Math.max(b.previsto, b.cobrado)) * 100}%` }} />}
                    {cobrado > 0 && <span className={cx('w-full bg-emerald-600', b.pendiente > 0 ? '' : 'rounded-t-[4px]')} style={{ height: `${(cobrado / Math.max(b.previsto, b.cobrado)) * 100}%` }} />}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex gap-1 sm:gap-2 mt-1">
          {barras.map((b, i) => (
            <span key={b.periodo} className={cx('flex-1 text-center text-[10px] tabular-nums', b.periodo === actual ? 'font-black text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400')}>
              {mesCorto(b.periodo, i === 0 || b.periodo.endsWith('-01'))}
            </span>
          ))}
        </div>
      </div>
      <p className={cx(TEXT.muted, 'mt-3')}>
        Este mes: {eur(meses[meses.length - 1]?.cobrado ?? 0)} cobrados de {eur(meses[meses.length - 1]?.previsto ?? 0)}.
        {' '}El que viene se prevén {eur(prevision.previsto)} ({prevision.alumnos} {prevision.alumnos === 1 ? 'alumno' : 'alumnos'}{prevision.sinCuota > 0 ? `, ${prevision.sinCuota} sin cuota` : ''}).
      </p>
    </div>
  );
}

const CELDA: Record<EstadoPago, string> = {
  pagado: 'bg-emerald-600 text-white',
  parcial: 'bg-amber-500/20 text-amber-800 dark:text-amber-300 ring-1 ring-amber-500/50',
  debe: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/40',
  no_paga: 'bg-slate-500/10 text-slate-500 dark:text-slate-400',
  sin_cuota: 'border border-dashed border-amber-500 text-amber-700 dark:text-amber-300',
};

function textoCelda(c: CeldaCuota): ReactNode {
  switch (c.estado) {
    case 'pagado': return <Check size={13} strokeWidth={3} />;
    case 'parcial': return Math.round(c.pendiente);
    case 'debe': return Math.round(c.pendiente);
    case 'no_paga': return '0';
    case 'sin_cuota': return '?';
  }
}

/** Alumnos × meses. Cada celda abre la ficha en ese mes. En el móvil se desliza de lado con el nombre fijo. */
function Rejilla({ h, alumnos, acciones }: { h: PagosVista['historico']; alumnos: AlumnoHistorico[]; acciones: Acciones }) {
  if (!alumnos.length) return <p className={cx(TEXT.muted, 'text-center py-6')}>Nadie con ese filtro.</p>;
  return (
    <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
      <table className="border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-[1] bg-white dark:bg-slate-900 text-left font-black uppercase tracking-wide text-[10px] text-slate-500 pr-3 pb-2 min-w-[8.5rem]">Alumno</th>
            {h.periodos.map((p, i) => (
              <th key={p} className={cx('font-bold text-[10px] pb-2 px-0.5 text-center min-w-[44px]', p === h.actual ? 'text-slate-900 dark:text-white' : 'text-slate-500')}>
                {mesCorto(p, i === 0 || p.endsWith('-01'))}
              </th>
            ))}
            <th className="text-right font-black uppercase tracking-wide text-[10px] text-slate-500 pl-3 pb-2">Debe</th>
          </tr>
        </thead>
        <tbody>
          {alumnos.map((a) => {
            const debe = a.deudaAnterior + a.pendienteActual;
            return (
              <tr key={a.userId}>
                <th className="sticky left-0 z-[1] bg-white dark:bg-slate-900 text-left font-semibold text-slate-800 dark:text-slate-100 pr-3 py-0.5 max-w-[10rem]">
                  <button onClick={() => acciones.abrir(a.userId, a.mesesDebe[0] ?? h.actual)} className="block truncate max-w-[10rem] text-left min-h-[44px]">
                    {nombre(a.email)}{!a.activo && <span className="text-slate-400 font-normal"> · baja</span>}
                  </button>
                </th>
                {h.periodos.map((p) => {
                  const c = a.celdas[p];
                  return (
                    <td key={p} className="px-0.5 py-0.5 text-center">
                      {c ? (
                        <button onClick={() => acciones.abrir(a.userId, p)}
                          title={`${mesLargo(p)}: ${lineaEstado(c)}`} aria-label={`${nombre(a.email)}, ${mesLargo(p)}: ${lineaEstado(c)}`}
                          className={cx('w-10 h-10 rounded-lg inline-flex items-center justify-center font-black tabular-nums', CELDA[c.estado])}>
                          {textoCelda(c)}
                        </button>
                      ) : <span className="inline-block w-10 h-10 leading-10 text-slate-300 dark:text-slate-700" aria-label="No estaba">·</span>}
                    </td>
                  );
                })}
                <td className={cx('pl-3 text-right font-black tabular-nums whitespace-nowrap', debe > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-slate-300 dark:text-slate-600')}>
                  {debe > 0 ? eur(debe) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th className="sticky left-0 z-[1] bg-white dark:bg-slate-900 text-left text-[10px] font-black uppercase tracking-wide text-slate-500 pr-3 pt-2">Cobrado</th>
            {h.meses.map((m) => (
              <td key={m.periodo} className="pt-2 text-center text-[10px] font-bold tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap px-0.5">
                {m.alumnos ? Math.round(m.cobrado) : '—'}
              </td>
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
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
      {items.map(([e, t]) => (
        <span key={e} className="flex items-center gap-1.5">
          <span className={cx('w-5 h-5 rounded inline-flex items-center justify-center text-[9px] font-black', CELDA[e])}>{e === 'pagado' ? <Check size={10} strokeWidth={3} /> : e === 'no_paga' ? '0' : e === 'sin_cuota' ? '?' : '50'}</span>
          {t}
        </span>
      ))}
      <span className="flex items-center gap-1.5"><span className="w-5 h-5 inline-flex items-center justify-center text-slate-300">·</span> No estaba</span>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Download, Check } from 'lucide-react';
import { getMonthlyPayments, getPaymentsHistory, setPayment } from '@/actions';
import type { MonthlyPaymentsOverview } from '@/app/actions/payments';
import type { HistoricoPagos, MetodoPago } from '@/app/lib/payments';
import {
  formateaPeriodo, formateaEUR, periodoActual, METODOS_PAGO, ETIQUETA_METODO,
  ingresosPorMes, resumenAnual, lineasCaja, totalesPorMetodo, csvCaja,
} from '@/app/lib/payments';
import {
  PanelTitulo, Pestanas, Pulso, Filtros, FiltroChip, Hoja, BloqueTitulo, Aviso, Boton, Etiqueta,
  Avatar, inicialesDeCorreo, nombreDeCorreo, TablaDual, Barras, EmptyState, TEXT, cx,
} from '../../ui';

/**
 * «Pagos» (P8 · rediseñado en noviembre 2026 · contabilidad, regla 102).
 *
 * Cuatro vistas del mismo dinero:
 *  - REJILLA: alumnos × meses. Un vistazo a quién va al día; un toque marca el pago.
 *  - UN MES: el cobro del día a día, con importe, método y recibo.
 *  - RESUMEN: los ingresos mes a mes, la media y lo que falta por cobrar.
 *  - CAJA: el cierre de un mes, lo cobrado por método, y su descarga para el gestor.
 */
type Vista = 'rejilla' | 'mes' | 'resumen' | 'caja';

const mesCorto = (p: string) => formateaPeriodo(p).split(' de ')[0].slice(0, 3);
const mesLargo = (p: string) => { const m = formateaPeriodo(p); return m.charAt(0).toUpperCase() + m.slice(1); };

export default function AdminPayments() {
  const [vista, setVista] = useState<Vista>('rejilla');

  return (
    <div className="space-y-5 animate-in fade-in pb-24">
      <PanelTitulo titulo="Pagos" sub="Cobro de las mensualidades: quién ha pagado, cuánto ha entrado y cómo." />
      <Pestanas
        etiqueta="Vistas de pagos"
        activa={vista}
        onCambia={setVista}
        items={[
          { id: 'rejilla', etiqueta: 'Rejilla' },
          { id: 'mes', etiqueta: 'Un mes' },
          { id: 'resumen', etiqueta: 'Resumen' },
          { id: 'caja', etiqueta: 'Caja' },
        ]}
      />
      {vista === 'rejilla' && <VistaRejilla />}
      {vista === 'mes' && <VistaMes />}
      {vista === 'resumen' && <VistaResumen />}
      {vista === 'caja' && <VistaCaja />}
    </div>
  );
}

// ============================================================
// REJILLA — alumnos × meses
// ============================================================

function VistaRejilla() {
  const [data, setData] = useState<HistoricoPagos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'debe' | 'exentos'>('todos');

  const cargar = useCallback(async () => {
    const res = await getPaymentsHistory();
    if (res.success) setData(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // El mes en curso es la última columna. Sin esto, la rejilla abre por
  // octubre del año pasado y hay que arrastrarla 12 meses para llegar a hoy.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (data && scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [data, filtro]);

  async function alterna(userId: string, period: string, paidAhora: boolean) {
    const clave = `${userId} ${period}`;
    setBusy(clave);
    const res = await setPayment({ studentId: userId, period, paid: !paidAhora, amount: '' });
    if (!res.success) setError(res.error ?? 'No se pudo guardar.');
    await cargar();
    setBusy(null);
  }

  if (loading) return <p className={cx(TEXT.muted, 'py-8 text-center')}>Cargando el histórico…</p>;
  if (error && !data) return <Aviso tono="malo">{error}</Aviso>;
  if (!data) return null;
  if (data.filas.length === 0) {
    return <EmptyState icon={<Check size={40} />} title="Ningún alumno con acceso activo" hint="El histórico son los alumnos activos. Dales acceso en «Alumnos»." bordered />;
  }

  const mesActual = periodoActual();
  const debeEsteMes = (f: HistoricoPagos['filas'][number]) => !f.exempt && f.celdas[mesActual]?.paid !== true;
  const cuenta = { todos: data.filas.length, debe: data.filas.filter(debeEsteMes).length, exentos: data.filas.filter((f) => f.exempt).length };
  const filas = data.filas.filter((f) => filtro === 'todos' || (filtro === 'debe' ? debeEsteMes(f) : f.exempt));

  return (
    <>
      {error && <Aviso tono="malo">{error}</Aviso>}
      <Filtros etiqueta="Qué alumnos ver">
        <FiltroChip activo={filtro === 'todos'} onClick={() => setFiltro('todos')} cuenta={cuenta.todos}>Todos</FiltroChip>
        <FiltroChip activo={filtro === 'debe'} onClick={() => setFiltro('debe')} cuenta={cuenta.debe}>Deben {mesCorto(mesActual)}</FiltroChip>
        <FiltroChip activo={filtro === 'exentos'} onClick={() => setFiltro('exentos')} cuenta={cuenta.exentos}>Exentos</FiltroChip>
      </Filtros>
      <p className={TEXT.muted}>Un toque marca o desmarca el pago (sin importe). Para anotar importe, método y recibo, usa «Un mes».</p>

      <Hoja className="overflow-hidden">
        <div ref={scrollRef} className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[11rem] border-b border-linea bg-hundido px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:border-noche-linea dark:bg-noche-hondo dark:text-slate-400">Alumno</th>
                {data.columnas.map((c) => (
                  <th key={c.period} className={cx('whitespace-nowrap border-b border-linea bg-hundido px-1 py-2 text-center dark:border-noche-linea dark:bg-noche-hondo', c.period === mesActual && 'shadow-[inset_0_-3px_0_var(--color-oro)]')}>
                    <span className={cx('block font-titulo text-sm font-semibold uppercase tracking-wider', c.period === mesActual ? 'text-indigo-900 dark:text-indigo-200' : 'text-slate-700 dark:text-slate-300')}>{mesCorto(c.period)}</span>
                    <span className="block text-[11px] font-normal tabular-nums text-slate-600 dark:text-slate-400">{c.pagados}/{c.total}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.userId}>
                  <td className="sticky left-0 z-10 border-b border-r border-linea bg-white px-3 py-1.5 dark:border-noche-linea dark:bg-noche-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar size="sm" iniciales={inicialesDeCorreo(f.email)} />
                      <div className="min-w-0"><p className="max-w-[10rem] truncate font-semibold">{nombreDeCorreo(f.email) || f.userId.slice(0, 8)}</p>{f.exempt && <Etiqueta tono="oro">Exento</Etiqueta>}</div>
                    </div>
                  </td>
                  {f.exempt ? (
                    <td colSpan={data.columnas.length} className="border-b border-linea px-2 text-center text-xs italic text-slate-600 dark:border-noche-linea dark:text-slate-400">exento de pago</td>
                  ) : data.columnas.map((c) => {
                    const paid = f.celdas[c.period]?.paid === true;
                    const clave = `${f.userId} ${c.period}`;
                    return (
                      <td key={c.period} className="border-b border-linea px-1 py-1 text-center dark:border-noche-linea">
                        <button
                          type="button"
                          onClick={() => alterna(f.userId, c.period, paid)}
                          disabled={busy === clave}
                          aria-label={paid ? `${f.email} pagó ${c.period}, quitar` : `marcar ${f.email} como pagado ${c.period}`}
                          title={paid ? 'Pagado — toca para quitar' : 'Sin pagar — toca para marcar'}
                          className={cx(
                            'mx-auto grid h-11 w-11 place-items-center rounded-lg border-[1.5px] transition-colors',
                            busy === clave && 'opacity-50',
                            paid
                              ? 'border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800 dark:border-emerald-500 dark:bg-emerald-500 dark:text-marino-hondo'
                              : 'border-dashed border-slate-300 text-slate-300 hover:border-emerald-600 hover:text-emerald-600 dark:border-noche-linea dark:text-noche-linea dark:hover:border-emerald-400 dark:hover:text-emerald-400',
                          )}
                        >
                          <Check size={16} strokeWidth={3} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td className="sticky left-0 z-10 bg-hundido px-3 py-3 text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:bg-noche-hondo dark:text-slate-400">Cobrado</td>
                {data.columnas.map((c) => (
                  <td key={c.period} className="whitespace-nowrap bg-hundido px-1 py-3 text-center font-titulo text-[15px] font-bold tabular-nums dark:bg-noche-hondo">
                    {c.cobrado > 0 ? formateaEUR(c.cobrado) : <span className="text-slate-500">—</span>}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Hoja>
    </>
  );
}

// ============================================================
// UN MES — el cobro, con importe, método y recibo
// ============================================================

/** Los meses para elegir: una tira que se desplaza en móvil. */
function TiraMeses({ periodos, activo, onElige }: { periodos: string[]; activo: string; onElige: (p: string) => void }) {
  return (
    <Filtros etiqueta="Mes">
      {periodos.map((p) => <FiltroChip key={p} activo={p === activo} onClick={() => onElige(p)}>{mesLargo(p)}</FiltroChip>)}
    </Filtros>
  );
}

function VistaMes() {
  const [period, setPeriod] = useState(periodoActual());
  const [data, setData] = useState<MonthlyPaymentsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importes, setImportes] = useState<Record<string, string>>({});
  const [metodos, setMetodos] = useState<Record<string, MetodoPago>>({});
  const [busca, setBusca] = useState('');

  const cargar = useCallback(async () => {
    const res = await getMonthlyPayments(period);
    if (res.success) { setData(res.data); setError(null); }
    else setError(res.error);
    setLoading(false);
  }, [period]);
  useEffect(() => { cargar(); }, [cargar]);

  async function marcar(userId: string, paid: boolean) {
    setBusy(true);
    const conta = !!data?.contabilidad;
    const res = await setPayment({
      studentId: userId, period, paid, amount: importes[userId] ?? '',
      ...(paid && conta ? { method: metodos[userId] ?? 'efectivo', emitirRecibo: true } : {}),
    });
    if (!res.success) setError(res.error ?? 'No se pudo guardar.');
    await cargar();
    setBusy(false);
  }

  const q = busca.trim().toLowerCase();
  const filas = (data?.filas ?? []).filter((f) => !q || (f.email ?? '').toLowerCase().includes(q));
  const porCobrar = filas.filter((f) => !f.exempt && !f.paid);
  const cobrados = filas.filter((f) => !f.exempt && f.paid);
  const exentos = filas.filter((f) => f.exempt);

  return (
    <>
      <TiraMeses periodos={data?.periodos ?? [period]} activo={period} onElige={(p) => { setLoading(true); setPeriod(p); }} />
      {error && <Aviso tono="malo">{error}</Aviso>}
      {loading && !data && <p className={cx(TEXT.muted, 'py-8 text-center')}>Cargando…</p>}

      {data && (
        <>
          <Pulso
            cifras={[
              { valor: `${data.pagados}/${data.total}`, etiqueta: 'pagados' },
              { valor: data.porPagar, etiqueta: 'por pagar', tono: data.porPagar ? 'aviso' : 'ok' },
              { valor: formateaEUR(data.cobrado), etiqueta: 'cobrado' },
              { valor: data.pagados > 0 && data.cobrado > 0 ? formateaEUR((data.cobrado / data.pagados) * data.porPagar) : null, etiqueta: 'pendiente (estimado)' },
            ]}
          />

          {data.filas.length === 0 ? (
            <EmptyState icon={<Check size={40} />} title="Ningún alumno con acceso activo" hint="La lista del mes son los alumnos activos. Dales acceso en «Alumnos»." bordered />
          ) : (
            <>
              <div className="max-w-md">
                <input
                  type="search"
                  aria-label="Buscar por correo"
                  placeholder="Buscar por correo"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="min-h-[46px] w-full rounded-lg border border-linea bg-white px-3 text-base outline-none focus:border-indigo-700 dark:border-noche-linea dark:bg-noche-2 dark:focus:border-indigo-300 sm:text-sm"
                />
              </div>

              <div className="space-y-2">
                <BloqueTitulo aside={<span className={TEXT.muted}>{porCobrar.length}</span>}>Por cobrar</BloqueTitulo>
                {porCobrar.length === 0 ? (
                  <Hoja pad="md" className="text-sm text-slate-600 dark:text-slate-400">{q ? 'Nadie con ese correo.' : 'Todos han pagado este mes.'}</Hoja>
                ) : (
                  <Hoja className="overflow-hidden">
                    {porCobrar.map((f) => (
                      <div key={f.userId} className="grid items-center gap-x-4 gap-y-2 border-b border-linea px-4 py-3 last:border-b-0 dark:border-noche-linea sm:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar iniciales={inicialesDeCorreo(f.email)} />
                          <div className="min-w-0"><p className="truncate font-semibold">{nombreDeCorreo(f.email) || f.userId.slice(0, 8)}</p><p className={cx(TEXT.muted, 'truncate')}>{f.email}</p></div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="number" inputMode="decimal" placeholder="€" aria-label={`Importe de ${f.email}`}
                            value={importes[f.userId] ?? ''}
                            onChange={(e) => setImportes({ ...importes, [f.userId]: e.target.value })}
                            className="min-h-[44px] w-24 rounded-lg border border-linea bg-crema px-3 text-right text-base outline-none focus:border-indigo-700 dark:border-noche-linea dark:bg-noche dark:focus:border-indigo-300 sm:text-sm"
                          />
                          {data.contabilidad && (
                            <select
                              aria-label={`Método de ${f.email}`}
                              value={metodos[f.userId] ?? 'efectivo'}
                              onChange={(e) => setMetodos({ ...metodos, [f.userId]: e.target.value as MetodoPago })}
                              className="min-h-[44px] rounded-lg border border-linea bg-crema px-2 text-base outline-none dark:border-noche-linea dark:bg-noche sm:text-sm"
                            >
                              {METODOS_PAGO.map((m) => <option key={m} value={m}>{ETIQUETA_METODO[m]}</option>)}
                            </select>
                          )}
                          <Boton disabled={busy} icon={<Check size={14} />} onClick={() => marcar(f.userId, true)}>Pagó</Boton>
                        </div>
                      </div>
                    ))}
                  </Hoja>
                )}
              </div>

              <div className="space-y-2">
                <BloqueTitulo aside={<span className={TEXT.muted}>{cobrados.length}</span>}>Pagados</BloqueTitulo>
                <Hoja className="overflow-hidden">
                  {cobrados.length === 0 && <p className="px-4 py-5 text-sm text-slate-600 dark:text-slate-400">Nadie todavía.</p>}
                  {cobrados.map((f) => (
                    <div key={f.userId} className="flex flex-wrap items-center justify-between gap-3 border-b border-linea px-4 py-3 last:border-b-0 dark:border-noche-linea">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar iniciales={inicialesDeCorreo(f.email)} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{nombreDeCorreo(f.email) || f.userId.slice(0, 8)}</p>
                          <p className={TEXT.muted}>{f.paidOn ?? ''}{f.method ? ` · ${ETIQUETA_METODO[f.method]}` : ''}{f.receiptNo !== null ? ` · recibo ${String(f.receiptNo).padStart(5, '0')}` : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <b className="font-titulo text-xl tabular-nums text-emerald-700 dark:text-emerald-300">{formateaEUR(f.amount)}</b>
                        <Boton size="sm" variant="secondary" disabled={busy} onClick={() => marcar(f.userId, false)}>Deshacer</Boton>
                      </div>
                    </div>
                  ))}
                </Hoja>
              </div>

              {exentos.length > 0 && <p className={TEXT.muted}>Exentos de pago: {exentos.map((f) => nombreDeCorreo(f.email)).join(', ')}.</p>}
              {!data.contabilidad && (
                <Aviso tono="info">
                  <span>Para anotar el método de pago y emitir recibos numerados falta ejecutar <code className="rounded bg-black/10 px-1 font-mono dark:bg-white/10">docs/sql/pagos-contabilidad.sql</code> en Supabase.</span>
                </Aviso>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

// ============================================================
// RESUMEN — los ingresos mes a mes
// ============================================================

function VistaResumen() {
  const [data, setData] = useState<HistoricoPagos | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    getPaymentsHistory().then((res) => {
      if (!vivo) return;
      if (res.success) setData(res.data); else setError(res.error);
    });
    return () => { vivo = false; };
  }, []);

  if (error) return <Aviso tono="malo">{error}</Aviso>;
  if (!data) return <p className={cx(TEXT.muted, 'py-8 text-center')}>Calculando…</p>;

  const meses = ingresosPorMes(data);
  const r = resumenAnual(meses);
  const actual = meses[meses.length - 1];
  if (!meses.some((m) => m.cobrado > 0)) {
    return <EmptyState icon={<Check size={40} />} title="Todavía no hay importes anotados" hint="Anota el importe al marcar un pago en «Un mes» y aquí aparecerán los ingresos." bordered />;
  }

  return (
    <div className="space-y-5">
      <Pulso
        cifras={[
          { valor: formateaEUR(r.cobrado), etiqueta: `cobrado en ${meses.length} meses` },
          { valor: r.mediaMensual === null ? null : formateaEUR(r.mediaMensual), etiqueta: 'media de los meses con cobro' },
          { valor: r.mejorMes ? formateaEUR(r.mejorMes.cobrado) : null, etiqueta: r.mejorMes ? `mejor mes: ${mesLargo(r.mejorMes.period).split(' de ')[0]}` : 'mejor mes' },
          { valor: actual?.pendienteEstimado === null || actual?.pendienteEstimado === undefined ? null : formateaEUR(actual.pendienteEstimado), etiqueta: `pendiente de ${mesCorto(actual?.period ?? '')} (estimado)`, tono: 'aviso' },
        ]}
      />
      <Hoja pad="md" className="space-y-4">
        <BloqueTitulo>Ingresos por mes</BloqueTitulo>
        <Barras
          datos={meses.map((m) => ({ etiqueta: mesCorto(m.period), valor: m.cobrado }))}
          formato={(v) => (v > 0 ? `${Math.round(v)} €` : '—')}
          resumen={`Ingresos por mes: ${meses.map((m) => `${mesLargo(m.period)} ${formateaEUR(m.cobrado)}`).join(', ')}`}
        />
      </Hoja>
      <TablaDual
        soloLectura
        clave={(m) => m.period}
        filas={[...meses].reverse()}
        columnas={[
          { id: 'mes', titulo: 'Mes', celda: (m) => <b className="font-semibold">{mesLargo(m.period)}</b> },
          { id: 'pagaron', titulo: 'Pagaron', derecha: true, celda: (m) => <span className="tabular-nums">{m.pagados} de {m.total}</span> },
          { id: 'cobrado', titulo: 'Cobrado', derecha: true, celda: (m) => <b className="font-semibold tabular-nums">{m.cobrado > 0 ? formateaEUR(m.cobrado) : '—'}</b> },
          { id: 'pendiente', titulo: 'Pendiente (est.)', derecha: true, celda: (m) => <span className="tabular-nums">{m.pendienteEstimado === null ? '—' : formateaEUR(m.pendienteEstimado)}</span> },
        ]}
      />
      <p className={TEXT.muted}>El pendiente es una estimación: lo que falta por cobrar a razón del importe medio de quienes ya han pagado ese mes.</p>
    </div>
  );
}

// ============================================================
// CAJA — el cierre de un mes
// ============================================================

function VistaCaja() {
  const [period, setPeriod] = useState(periodoActual());
  const [data, setData] = useState<MonthlyPaymentsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    getMonthlyPayments(period).then((res) => {
      if (!vivo) return;
      if (res.success) { setData(res.data); setError(null); } else setError(res.error);
    });
    return () => { vivo = false; };
  }, [period]);

  const lineas = data ? lineasCaja(data) : [];
  const porMetodo = totalesPorMetodo(lineas);
  const total = lineas.reduce((s, l) => s + (l.importe ?? 0), 0);

  function descargar() {
    const blob = new Blob([csvCaja(period, lineas)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caja-${period}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <TiraMeses periodos={data?.periodos ?? [period]} activo={period} onElige={setPeriod} />
      {error && <Aviso tono="malo">{error}</Aviso>}
      {!data && !error && <p className={cx(TEXT.muted, 'py-8 text-center')}>Cargando…</p>}
      {data && (
        <>
          <Pulso
            cifras={[
              { valor: formateaEUR(total), etiqueta: `en caja en ${mesLargo(period).split(' de ')[0].toLowerCase()}` },
              { valor: lineas.length, etiqueta: lineas.length === 1 ? 'cobro' : 'cobros' },
              { valor: lineas.filter((l) => l.recibo !== null).length, etiqueta: 'recibos emitidos' },
              { valor: data.porPagar, etiqueta: 'sin cobrar todavía', tono: data.porPagar ? 'aviso' : 'ok' },
            ]}
          />

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {porMetodo.map((t) => (
                <span key={t.metodo}>{t.metodo === 'sin_metodo' ? 'Sin método anotado' : ETIQUETA_METODO[t.metodo]}: <b className="tabular-nums">{formateaEUR(t.importe)}</b> <span className={TEXT.muted}>({t.cobros})</span></span>
              ))}
            </div>
            <Boton variant="secondary" icon={<Download size={15} />} disabled={lineas.length === 0} onClick={descargar}>Exportar CSV</Boton>
          </div>

          {!data.contabilidad && (
            <Aviso tono="info">
              <span>Sin método ni recibos: falta ejecutar <code className="rounded bg-black/10 px-1 font-mono dark:bg-white/10">docs/sql/pagos-contabilidad.sql</code> en Supabase. Mientras tanto, la caja y la exportación salen con fecha, alumno e importe.</span>
            </Aviso>
          )}

          <TablaDual
            soloLectura
            clave={(l) => l.userId}
            filas={lineas}
            vacio="Nadie ha pagado este mes todavía."
            columnas={[
              { id: 'alumno', titulo: 'Alumno', celda: (l) => <div className="flex min-w-0 items-center gap-3"><Avatar iniciales={inicialesDeCorreo(l.email)} /><div className="min-w-0"><p className="truncate font-semibold">{nombreDeCorreo(l.email)}</p><p className={cx(TEXT.muted, 'truncate')}>{l.email}</p></div></div> },
              { id: 'fecha', titulo: 'Fecha', celda: (l) => <span className="tabular-nums">{l.fecha ?? '—'}</span> },
              { id: 'importe', titulo: 'Importe', derecha: true, celda: (l) => <b className="font-semibold tabular-nums">{formateaEUR(l.importe)}</b> },
              { id: 'metodo', titulo: 'Método', celda: (l) => (l.metodo ? ETIQUETA_METODO[l.metodo] : <span className="text-slate-500">—</span>) },
              { id: 'recibo', titulo: 'Recibo', derecha: true, celda: (l) => (l.recibo !== null ? <span className="tabular-nums">{String(l.recibo).padStart(5, '0')}</span> : <span className="text-slate-500">—</span>) },
            ]}
          />
        </>
      )}
    </>
  );
}

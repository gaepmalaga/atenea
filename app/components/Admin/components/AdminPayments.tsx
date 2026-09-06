'use client';

import { useState, useEffect, useCallback } from 'react';
import { BadgeEuro, RefreshCw, Check, Table2, CalendarDays } from 'lucide-react';
import { getMonthlyPayments, getPaymentsHistory, setPayment } from '@/actions';
import type { MonthlyPaymentsOverview } from '@/app/actions/payments';
import type { HistoricoPagos } from '@/app/lib/payments';
import { formateaPeriodo, formateaEUR, periodoActual } from '@/app/lib/payments';
import { Card, EmptyState, StatTile, Button, TEXT, cx } from '../../ui';

/**
 * «Pagos» (P8) — cobro en efectivo.
 *
 * Dos vistas:
 *  - HISTÓRICO: rejilla alumnos × meses. Un vistazo a quién va al día. Se marca
 *    una celda con un toque (pagado, sin importe).
 *  - MES: un mes a fondo, con importe por alumno y el resumen de lo cobrado.
 */
export default function AdminPayments() {
  const [vista, setVista] = useState<'historico' | 'mes'>('historico');

  return (
    <div className="space-y-4 animate-in fade-in pb-24">
      <Card tone="sunken" pad="md" className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-slate-700/10 dark:bg-white/5 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
            <BadgeEuro size={20} />
          </div>
          <div>
            <h3 className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-tight">Pagos</h3>
            <p className={cx(TEXT.muted, 'mt-0.5')}>Cobro en efectivo. Marca quién ha pagado cada mes.</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
          <button
            onClick={() => setVista('historico')}
            className={cx('min-h-[36px] px-3 rounded-lg text-xs font-bold flex items-center gap-1.5',
              vista === 'historico' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400')}
          >
            <Table2 size={14} /> Histórico
          </button>
          <button
            onClick={() => setVista('mes')}
            className={cx('min-h-[36px] px-3 rounded-lg text-xs font-bold flex items-center gap-1.5',
              vista === 'mes' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400')}
          >
            <CalendarDays size={14} /> Un mes
          </button>
        </div>
      </Card>

      {vista === 'historico' ? <VistaHistorico /> : <VistaMes />}
    </div>
  );
}

// ============================================================
// HISTÓRICO — la rejilla
// ============================================================

function VistaHistorico() {
  const [data, setData] = useState<HistoricoPagos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await getPaymentsHistory();
    if (res.success) setData(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function alterna(userId: string, period: string, paidAhora: boolean) {
    const clave = `${userId} ${period}`;
    setBusy(clave);
    const res = await setPayment({ studentId: userId, period, paid: !paidAhora, amount: '' });
    if (!res.success) setError(res.error ?? 'No se pudo guardar.');
    await cargar();
    setBusy(null);
  }

  if (loading) return <p className={cx(TEXT.muted, 'py-8 text-center')}>Cargando el histórico…</p>;
  if (error && !data) return <Card tone="base" pad="md" className="border-red-500/30 text-red-700 dark:text-red-300"><p className="text-xs">{error}</p></Card>;
  if (!data) return null;

  if (data.filas.length === 0) {
    return (
      <EmptyState
        icon={<BadgeEuro size={40} />}
        title="Ningún alumno con acceso activo"
        hint="El histórico son los alumnos activos. Dales acceso en «Alumnos»."
        bordered
      />
    );
  }

  const mesActual = periodoActual();

  return (
    <>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <p className={TEXT.muted}>Un toque marca o desmarca el pago (sin importe). Para anotar importes, usa «Un mes».</p>
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-950 text-left font-bold text-slate-500 dark:text-slate-400 px-2 py-2 min-w-[8rem]">Alumno</th>
              {data.columnas.map((c) => (
                <th key={c.period} className={cx('px-2 py-2 font-bold text-center whitespace-nowrap',
                  c.period === mesActual ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400')}>
                  <span className="capitalize">{formateaPeriodo(c.period).replace(' de ', ' ')}</span>
                  <span className="block font-mono text-[10px] font-normal text-slate-400">{c.pagados}/{c.total}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.filas.map((f) => (
              <tr key={f.userId}>
                <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 font-mono text-[11px] text-slate-700 dark:text-slate-200 px-2 py-1.5 border-t border-slate-100 dark:border-slate-800 max-w-[10rem] truncate">
                  {f.email ?? f.userId.slice(0, 8)}
                </td>
                {data.columnas.map((c) => {
                  const celda = f.celdas[c.period];
                  const paid = celda?.paid === true;
                  const clave = `${f.userId} ${c.period}`;
                  return (
                    <td key={c.period} className="text-center border-t border-slate-100 dark:border-slate-800 px-1 py-1">
                      <button
                        onClick={() => alterna(f.userId, c.period, paid)}
                        disabled={busy === clave}
                        aria-label={paid ? `${f.email} pagó ${c.period}, quitar` : `marcar ${f.email} como pagado ${c.period}`}
                        className={cx('w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                          paid
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/25'
                            : 'bg-slate-100 dark:bg-slate-800 text-transparent hover:bg-slate-200 dark:hover:bg-slate-700')}
                      >
                        <Check size={15} />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-950 px-2 py-2 font-bold text-slate-500 dark:text-slate-400 border-t-2 border-slate-200 dark:border-slate-700">Cobrado</td>
              {data.columnas.map((c) => (
                <td key={c.period} className="text-center px-2 py-2 font-mono font-bold text-slate-700 dark:text-slate-200 border-t-2 border-slate-200 dark:border-slate-700 whitespace-nowrap">
                  {c.cobrado > 0 ? formateaEUR(c.cobrado) : <span className="text-slate-400">—</span>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

// ============================================================
// UN MES — con importes
// ============================================================

function VistaMes() {
  const [period, setPeriod] = useState(periodoActual());
  const [data, setData] = useState<MonthlyPaymentsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importes, setImportes] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    const res = await getMonthlyPayments(period);
    if (res.success) setData(res.data);
    else setError(res.error);
    setLoading(false);
  }, [period]);

  useEffect(() => { cargar(); }, [cargar]);

  async function marcar(userId: string, paid: boolean) {
    setBusy(true);
    const res = await setPayment({ studentId: userId, period, paid, amount: importes[userId] ?? '' });
    if (!res.success) setError(res.error ?? 'No se pudo guardar.');
    await cargar();
    setBusy(false);
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <select value={period} onChange={(e) => { setLoading(true); setPeriod(e.target.value); }}
          className="text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 font-semibold capitalize">
          {(data?.periodos ?? [period]).map((p) => <option key={p} value={p}>{formateaPeriodo(p)}</option>)}
        </select>
        <button onClick={() => { setLoading(true); cargar(); }} className="w-11 h-11 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400" aria-label="Recargar">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <Card tone="base" pad="md" className="border-red-500/30 text-red-700 dark:text-red-300">
          <p className="text-xs font-medium">{error}</p>
        </Card>
      )}

      {!error && data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <StatTile label="Pagados" value={`${data.pagados}/${data.total}`} tone="success" />
            <StatTile label="Por pagar" value={data.porPagar} tone={data.porPagar ? 'warning' : 'neutral'} />
            <StatTile label="Cobrado" value={formateaEUR(data.cobrado)} tone="brand" />
            <StatTile
              label="Pendiente (est.)"
              value={data.pagados > 0 ? formateaEUR((data.cobrado / data.pagados) * data.porPagar) : null}
              tone="neutral"
            />
          </div>

          {data.filas.length === 0 ? (
            <EmptyState
              icon={<BadgeEuro size={40} />}
              title="Ningún alumno con acceso activo"
              hint="La lista del mes son los alumnos activos. Dales acceso en «Alumnos»."
              bordered
            />
          ) : (
            <Card tone="base" pad="md">
              <div className="space-y-1">
                {data.filas.map((f) => (
                  <div key={f.userId} className={cx('flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm', f.paid && 'bg-emerald-500/5')}>
                    <span className="font-mono text-xs text-slate-700 dark:text-slate-200 min-w-0 truncate flex-1">{f.email ?? f.userId.slice(0, 8)}</span>
                    {f.paid ? (
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400">{formateaEUR(f.amount)}</span>
                        {f.paidOn && <span className={TEXT.muted}>{f.paidOn}</span>}
                        <button onClick={() => marcar(f.userId, false)} disabled={busy} className="text-xs text-slate-400 hover:text-red-500 hover:underline">deshacer</button>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 shrink-0">
                        <input type="number" inputMode="decimal" value={importes[f.userId] ?? ''} placeholder="€"
                          onChange={(e) => setImportes({ ...importes, [f.userId]: e.target.value })}
                          className="w-20 text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1" />
                        <Button size="sm" disabled={busy} icon={<Check size={13} />} onClick={() => marcar(f.userId, true)}>Pagó</Button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}

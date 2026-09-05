'use client';

import { useState, useEffect, useCallback } from 'react';
import { BadgeEuro, RefreshCw, Check } from 'lucide-react';
import { getMonthlyPayments, setPayment } from '@/actions';
import type { MonthlyPaymentsOverview } from '@/app/actions/payments';
import { formateaPeriodo, formateaEUR, periodoActual } from '@/app/lib/payments';
import { Card, EmptyState, StatTile, Button, TEXT, cx } from '../../ui';

/**
 * «Pagos» (P8) — la rejilla mensual.
 *
 * Elige un mes → salen los alumnos con acceso activo → vas marcando quién ha
 * pagado (con importe opcional) → arriba el recuento y lo cobrado.
 */
export default function AdminPayments() {
  const [period, setPeriod] = useState(periodoActual());
  const [data, setData] = useState<MonthlyPaymentsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** importe que se está escribiendo, por alumno. */
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
        <div className="flex items-center gap-2">
          <select value={period} onChange={(e) => { setLoading(true); setPeriod(e.target.value); }}
            className="text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 font-semibold capitalize">
            {(data?.periodos ?? [period]).map((p) => <option key={p} value={p}>{formateaPeriodo(p)}</option>)}
          </select>
          <button onClick={() => { setLoading(true); cargar(); }} className="w-11 h-11 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400" aria-label="Recargar">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </Card>

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
    </div>
  );
}

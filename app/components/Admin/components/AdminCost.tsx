'use client';

import { useState, useEffect, useCallback } from 'react';
import { Coins, RefreshCw, Route, CalendarDays, Users } from 'lucide-react';
import { getAiCostOverview } from '@/actions';
import type { AiCostOverview } from '@/app/actions/ai-cost';
import { etiquetaRuta, formateaUSD } from '@/app/lib/ai-cost';
import { Card, EmptyState, SectionLabel, StatTile, TEXT, cx } from '../../ui';

/**
 * "Consumo IA": cuánto va gastado en Gemini, en qué y por quién (P6).
 *
 * Solo lectura. No cobra nada ni toca cuotas — es el dato que el plan de
 * producto dice tener listo antes de poner precio: cuánto cuesta servir a un
 * alumno.
 */
export default function AdminCost() {
  const [data, setData] = useState<AiCostOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await getAiCostOverview();
    if (res.success) {
      setData(res.data);
      setError(null);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function recargar() {
    setLoading(true);
    cargar();
  }

  const mes = (m: string) => {
    const [a, n] = m.split('-');
    const fecha = new Date(Number(a), Number(n) - 1, 1);
    return fecha.toLocaleDateString([], { month: 'long', year: 'numeric' });
  };

  const rango =
    data?.desde && data?.hasta
      ? `${new Date(data.desde).toLocaleDateString()} – ${new Date(data.hasta).toLocaleDateString()}`
      : null;

  return (
    <div className="space-y-4 animate-in fade-in pb-24">
      <Card tone="sunken" pad="md" className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-slate-700/10 dark:bg-white/5 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
            <Coins size={20} />
          </div>
          <div>
            <h3 className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-tight">Consumo IA</h3>
            <p className={cx(TEXT.muted, 'mt-0.5')}>
              Lo que va gastado en Gemini{rango ? ` · ${rango}` : ''}. Solo lectura: no cobra nada.
            </p>
          </div>
        </div>
        <button
          onClick={recargar}
          className="w-11 h-11 shrink-0 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          aria-label="Recargar"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </Card>

      {error && (
        <Card tone="base" pad="md" className="border-red-500/30 text-red-700 dark:text-red-300">
          <p className="text-xs font-medium">{error}</p>
        </Card>
      )}

      {!loading && !error && (!data || data.total.llamadas === 0) && (
        <EmptyState
          icon={<Coins size={40} />}
          title="Todavía no hay gasto registrado"
          hint="En cuanto un alumno use el chat o se generen preguntas o fichas, el coste aparece aquí."
          bordered
        />
      )}

      {!error && data && data.total.llamadas > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <StatTile label="Total gastado" value={formateaUSD(data.total.coste)} tone="brand" />
            <StatTile label="Llamadas" value={data.total.llamadas.toLocaleString()} />
            <StatTile
              label="Coste medio / alumno"
              value={data.costeMedioPorAlumno === null ? null : formateaUSD(data.costeMedioPorAlumno)}
              tone="brand"
            />
            <StatTile
              label="Tokens de entrada"
              value={data.total.entrada.toLocaleString()}
            />
          </div>

          <Card tone="base" pad="md">
            <SectionLabel icon={<Route size={13} />}>Por ruta</SectionLabel>
            <div className="space-y-2">
              {data.porRuta.map((r) => (
                <div key={r.ruta} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-bold text-slate-900 dark:text-white min-w-0 truncate">
                    {etiquetaRuta(r.ruta)}
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className={TEXT.muted}>{r.llamadas.toLocaleString()} llam.</span>
                    <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                      {formateaUSD(r.coste)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {data.porMes.length > 0 && (
            <Card tone="base" pad="md">
              <SectionLabel icon={<CalendarDays size={13} />}>Por mes</SectionLabel>
              <div className="space-y-2">
                {data.porMes.map((m) => (
                  <div key={m.mes} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-bold text-slate-900 dark:text-white capitalize min-w-0 truncate">
                      {mes(m.mes)}
                    </span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className={TEXT.muted}>{m.llamadas.toLocaleString()} llam.</span>
                      <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                        {formateaUSD(m.coste)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {data.porAlumno.length > 0 && (
            <Card tone="base" pad="md">
              <SectionLabel icon={<Users size={13} />} aside={<span className={TEXT.muted}>{data.porAlumno.length}</span>}>
                Por alumno
              </SectionLabel>
              <div className="space-y-2">
                {data.porAlumno.slice(0, 30).map((a) => (
                  <div key={a.userId} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-mono text-xs text-slate-600 dark:text-slate-300 min-w-0 truncate">
                      {a.email ?? a.userId.slice(0, 8)}
                    </span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className={TEXT.muted}>{a.llamadas.toLocaleString()} llam.</span>
                      <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                        {formateaUSD(a.coste)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              {data.porAlumno.length > 30 && (
                <p className={cx(TEXT.muted, 'mt-3')}>Se muestran los 30 de más gasto.</p>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

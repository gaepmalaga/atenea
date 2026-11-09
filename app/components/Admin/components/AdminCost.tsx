'use client';

import { useState, useEffect, useCallback } from 'react';
import { Coins, RefreshCw, Route, CalendarDays, Users } from 'lucide-react';
import { getAiCostOverview } from '@/actions';
import type { AiCostOverview } from '@/app/actions/ai-cost';
import { etiquetaRuta, formateaUSD } from '@/app/lib/ai-cost';
import { PanelTitulo, Pulso, Hoja, BloqueTitulo, Aviso, Boton, Barras, TablaDual, Avatar, inicialesDeCorreo, EmptyState, TEXT } from '../../ui';

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

  const mesCorto = (m: string) => {
    const [a, n] = m.split('-');
    return new Date(Number(a), Number(n) - 1, 1).toLocaleDateString([], { month: 'short' });
  };

  return (
    <div className="space-y-5 animate-in fade-in pb-24">
      <PanelTitulo
        titulo="Consumo IA"
        sub={`Lo que va gastado en Gemini${rango ? ` · ${rango}` : ''}. Solo lectura: no cobra nada.`}
        acciones={<Boton variant="secondary" onClick={recargar} icon={<RefreshCw size={15} className={loading ? 'animate-spin' : ''} />}>Recargar</Boton>}
      />

      {error && <Aviso tono="malo">{error}</Aviso>}

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
          <Pulso
            cifras={[
              { valor: formateaUSD(data.total.coste), etiqueta: 'gastado en total' },
              { valor: data.total.llamadas.toLocaleString(), etiqueta: 'llamadas' },
              { valor: data.costeMedioPorAlumno === null ? null : formateaUSD(data.costeMedioPorAlumno), etiqueta: 'coste medio por alumno' },
              { valor: data.total.entrada.toLocaleString(), etiqueta: 'tokens de entrada' },
            ]}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            {data.porMes.length > 0 && (
              <Hoja pad="md" className="space-y-4">
                <BloqueTitulo icon={<CalendarDays size={15} />}>Por mes</BloqueTitulo>
                <Barras
                  datos={data.porMes.map((m) => ({ etiqueta: mesCorto(m.mes), valor: m.coste }))}
                  formato={formateaUSD}
                  resumen={`Gasto por mes: ${data.porMes.map((m) => `${mes(m.mes)} ${formateaUSD(m.coste)}`).join(', ')}`}
                />
              </Hoja>
            )}

            <Hoja pad="md" className="space-y-3">
              <BloqueTitulo icon={<Route size={15} />}>Por ruta</BloqueTitulo>
              {data.porRuta.map((r) => (
                <div key={r.ruta} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-semibold text-slate-900 dark:text-white">{etiquetaRuta(r.ruta)}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-900 dark:text-white">{formateaUSD(r.coste)}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full border border-linea dark:border-noche-linea bg-hundido dark:bg-noche-hondo">
                    <div className="h-full bg-indigo-900 dark:bg-indigo-300" style={{ width: `${data.total.coste > 0 ? (r.coste / data.total.coste) * 100 : 0}%` }} />
                  </div>
                  <p className={TEXT.muted}>{r.llamadas.toLocaleString()} llamadas</p>
                </div>
              ))}
            </Hoja>
          </div>

          {data.porAlumno.length > 0 && (
            <div className="space-y-3">
              <BloqueTitulo icon={<Users size={15} />} aside={<span className={TEXT.muted}>{data.porAlumno.length}</span>}>Por alumno</BloqueTitulo>
              <TablaDual
                soloLectura
                clave={(a) => a.userId}
                filas={data.porAlumno.slice(0, 30)}
                columnas={[
                  { id: 'alumno', titulo: 'Alumno', celda: (a) => <div className="flex min-w-0 items-center gap-3"><Avatar iniciales={inicialesDeCorreo(a.email)} /><span className="min-w-0 truncate font-semibold">{a.email ?? a.userId.slice(0, 8)}</span></div> },
                  { id: 'llamadas', titulo: 'Llamadas', derecha: true, celda: (a) => <span className="tabular-nums">{a.llamadas.toLocaleString()}</span> },
                  { id: 'coste', titulo: 'Coste', derecha: true, celda: (a) => <span className="font-semibold tabular-nums">{formateaUSD(a.coste)}</span> },
                ]}
              />
              {data.porAlumno.length > 30 && <p className={TEXT.muted}>Se muestran los 30 de más gasto.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

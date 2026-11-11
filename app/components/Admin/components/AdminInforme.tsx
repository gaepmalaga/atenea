'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Copy, FileDown, LineChart, Phone, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { getInformeSemanal } from '@/actions';
import { resumenEnTexto, tituloSemana, type FilaInforme, type InformeSemanal, type NivelRiesgo } from '@/app/lib/informe-semanal';
import { MARCA } from '@/app/lib/marca';
import { PanelTitulo, BloqueTitulo, Aviso, Boton, Filtros, FiltroChip, TablaDual, Etiqueta, Pulso, EmptyState } from '../../ui';

/**
 * EL INFORME SEMANAL (regla 116): cómo ha ido la semana y a quién hay que llamar.
 *
 * Arriba, el pulso de la academia. Debajo, los alumnos ordenados por riesgo de
 * abandono, cada uno con el MOTIVO en una frase: no un número, sino lo que le
 * dirías por teléfono («venías haciendo 200 a la semana y esta llevas 30»).
 */

const TONO: Record<NivelRiesgo, 'malo' | 'aviso' | 'ok'> = { alto: 'malo', medio: 'aviso', bajo: 'ok' };
const TEXTO: Record<NivelRiesgo, string> = { alto: 'Llamar', medio: 'Vigilar', bajo: 'Bien' };

export default function AdminInforme() {
  const [informe, setInforme] = useState<InformeSemanal | null>(null);
  const [semanas, setSemanas] = useState<{ actual: string; anterior: string } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | NivelRiesgo>('todos');
  const [copiado, setCopiado] = useState(false);
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async (semana?: string) => {
    setCargando(true);
    const res = await getInformeSemanal(semana ? { semana } : undefined);
    if (res.success) {
      setInforme(res.informe);
      setSemanas(res.semanas);
      setError(null);
    } else {
      setError(res.error);
    }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function copiar() {
    if (!informe) return;
    try {
      await navigator.clipboard.writeText(resumenEnTexto(informe, MARCA.nombre));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setError('Este navegador no deja copiar. Descarga el PDF.');
    }
  }

  async function descargar() {
    if (!informe) return;
    setCreando(true);
    try {
      const [{ pdfInforme }, logo] = await Promise.all([
        import('@/app/lib/informe-pdf'),
        fetch('/examen/alphapol-logotipo.png').then((r) => r.arrayBuffer()),
      ]);
      const datos = await pdfInforme(informe, MARCA.nombre, new Uint8Array(logo));
      const url = URL.createObjectURL(new Blob([datos as BlobPart], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `informe-semanal-${informe.semana}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      setError('No se ha podido crear el PDF.');
    }
    setCreando(false);
  }

  const a = informe?.academia;
  const filas = (informe?.filas ?? []).filter((f) => filtro === 'todos' || f.riesgo.nivel === filtro);
  const variacion = a && a.contestadasAnterior > 0 ? Math.round(((a.contestadas - a.contestadasAnterior) / a.contestadasAnterior) * 100) : null;

  return (
    <div className="space-y-5 animate-in fade-in pb-24">
      <PanelTitulo
        titulo="Informe semanal"
        sub={informe ? `${tituloSemana(informe.semana)}${informe.enCurso ? ' · en curso: las comparaciones van a prorrata' : ''}` : 'Cómo ha ido la semana y a quién hay que llamar.'}
        acciones={(
          <>
            <Boton variant="secondary" onClick={copiar} disabled={!informe} icon={<Copy size={15} />}>{copiado ? 'Copiado' : 'Copiar resumen'}</Boton>
            <Boton onClick={descargar} disabled={!informe || creando} icon={<FileDown size={15} />}>{creando ? 'Creando…' : 'PDF'}</Boton>
          </>
        )}
      />

      {semanas && informe && (
        <Filtros etiqueta="Qué semana ver">
          <FiltroChip activo={informe.semana === semanas.actual} onClick={() => cargar(semanas.actual)}>Esta semana</FiltroChip>
          <FiltroChip activo={informe.semana === semanas.anterior} onClick={() => cargar(semanas.anterior)}>La semana pasada</FiltroChip>
        </Filtros>
      )}

      {error && <Aviso tono="malo"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}</Aviso>}

      {cargando && (
        <div className="flex items-center justify-center gap-2 px-1 py-8 text-slate-600 dark:text-slate-400">
          <RefreshCw size={15} className="animate-spin" />
          <span className="text-xs font-semibold">Cargando…</span>
        </div>
      )}

      {informe && a && !cargando && (
        <>
          <Pulso
            cifras={[
              { valor: `${a.activos}/${a.alumnos}`, etiqueta: 'han entrenado', tono: a.activos === 0 ? 'malo' : 'neutro' },
              {
                valor: a.contestadas,
                etiqueta: 'preguntas',
                extra: variacion === null ? undefined : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold">
                    {variacion >= 0 ? <TrendingUp size={13} aria-hidden /> : <TrendingDown size={13} aria-hidden />}
                    {variacion > 0 ? '+' : ''}{variacion} % {informe.enCurso ? 'por ahora' : 'que la anterior'}
                  </span>
                ),
              },
              { valor: a.acierto === null ? null : `${a.acierto} %`, etiqueta: 'de acierto' },
              { valor: a.riesgoAlto, etiqueta: 'para llamar', tono: a.riesgoAlto ? 'malo' : 'ok' },
              { valor: a.riesgoMedio, etiqueta: 'para vigilar', tono: a.riesgoMedio ? 'aviso' : 'ok' },
            ]}
          />

          <section className="space-y-3">
            <BloqueTitulo icon={<LineChart size={15} />}>Alumno por alumno</BloqueTitulo>
            <Filtros etiqueta="Qué alumnos ver">
              <FiltroChip activo={filtro === 'todos'} onClick={() => setFiltro('todos')} cuenta={informe.filas.length}>Todos</FiltroChip>
              <FiltroChip activo={filtro === 'alto'} onClick={() => setFiltro('alto')} cuenta={a.riesgoAlto}>Para llamar</FiltroChip>
              <FiltroChip activo={filtro === 'medio'} onClick={() => setFiltro('medio')} cuenta={a.riesgoMedio}>Para vigilar</FiltroChip>
              <FiltroChip activo={filtro === 'bajo'} onClick={() => setFiltro('bajo')} cuenta={informe.filas.length - a.riesgoAlto - a.riesgoMedio}>Bien</FiltroChip>
            </Filtros>

            {informe.filas.length === 0 ? (
              <EmptyState icon={<LineChart size={40} />} title="Todavía no hay alumnos" hint="Cuando haya alumnos con acceso, aquí verás su semana." bordered />
            ) : (
              <TablaDual<FilaInforme>
                soloLectura
                clave={(f) => f.id}
                filas={filas}
                vacio="Nadie en este grupo."
                columnas={[
                  { id: 'alumno', titulo: 'Alumno', celda: (f) => (
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900 dark:text-white">{f.nombre}</p>
                      {f.email && <p className="truncate text-xs text-slate-600 dark:text-slate-400">{f.email}</p>}
                    </div>
                  ) },
                  { id: 'estado', titulo: 'Estado', celda: (f) => (
                    <Etiqueta tono={TONO[f.riesgo.nivel]}>
                      {f.riesgo.nivel === 'alto' && <Phone size={11} className="mr-1 inline" aria-hidden />}{TEXTO[f.riesgo.nivel]}
                    </Etiqueta>
                  ) },
                  { id: 'motivo', titulo: 'Por qué', celda: (f) => (
                    f.riesgo.motivos.length
                      ? <ul className="space-y-0.5 text-sm">{f.riesgo.motivos.map((m) => <li key={m}>{m}</li>)}</ul>
                      : <span className="text-sm text-slate-600 dark:text-slate-400">Sin señales</span>
                  ) },
                  { id: 'preguntas', titulo: 'Preguntas', celda: (f) => (
                    <span><b className="font-semibold tabular-nums">{f.contestadas}</b> <span className="text-xs text-slate-600 dark:text-slate-400">· antes {f.anteriores}</span></span>
                  ) },
                  { id: 'acierto', titulo: 'Acierto', celda: (f) => (f.acierto === null ? <span className="text-slate-600 dark:text-slate-400">—</span> : <span className="tabular-nums">{f.acierto} %</span>) },
                  { id: 'dias', titulo: 'Días', sinTarjeta: true, celda: (f) => <span className="tabular-nums">{f.diasActivos}</span> },
                ]}
              />
            )}
          </section>

          <p className="text-xs text-slate-600 dark:text-slate-400">
            Las señales comparan a cada alumno con lo que él mismo venía haciendo las cuatro semanas anteriores. «Días» son los días distintos en que contestó alguna pregunta.
          </p>
        </>
      )}
    </div>
  );
}

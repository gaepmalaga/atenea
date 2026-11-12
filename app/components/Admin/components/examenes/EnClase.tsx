'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, ChevronLeft, RotateCcw, Trash2, Users } from 'lucide-react';
import { borraAplicacion, getAplicacion, getAplicaciones, reiniciaEntrega, setCierreAplicacion, setResultadoProfesor } from '@/actions';
import type { Aplicacion, DetalleAplicacion, FilaParticipante } from '@/app/actions/examenes-clase';
import { LETRAS_CLASE, type EstadoEntrega } from '@/app/lib/examen-clase';
import { Hoja, BloqueTitulo, Aviso, Boton, Campo, EmptyState, Etiqueta, Filtros, FiltroChip, Pulso, TablaDual } from '../../../ui';

const fechaLarga = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const num = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });

const ESTADO: Record<EstadoEntrega, { texto: string; tono: 'ok' | 'aviso' | 'malo' | 'apagado' | 'neutro' }> = {
  entregado: { texto: 'Entregó', tono: 'ok' },
  pendiente: { texto: 'Sin entregar', tono: 'aviso' },
  proximo: { texto: 'Aún no es el día', tono: 'apagado' },
  ausente: { texto: 'No se presentó', tono: 'malo' },
  cerrado: { texto: 'Plazo cerrado', tono: 'malo' },
};

/**
 * LOS EXÁMENES PUESTOS EN CLASE (regla 118): quién ha metido sus respuestas,
 * las notas y qué preguntas han fallado más.
 *
 * Las respuestas las mete cada alumno; el profesor no teclea nada. Lo único
 * que se puede escribir aquí es la nota oficial del papel (si se quiere que
 * mande sobre la calculada) y marcar a quien no se presentó.
 */
export default function EnClase({ abrirId, onAbierto }: { abrirId: string | null; onAbierto: () => void }) {
  const [lista, setLista] = useState<Aplicacion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(abrirId);

  const carga = useCallback(async () => {
    const res = await getAplicaciones();
    if (res.success) { setLista(res.aplicaciones); setError(null); } else { setError(res.error); setLista([]); }
  }, []);
  useEffect(() => { carga(); }, [carga]);
  useEffect(() => { if (abrirId) { setAbierta(abrirId); onAbierto(); } }, [abrirId, onAbierto]);

  if (abierta) return <Detalle id={abierta} onVolver={() => { setAbierta(null); carga(); }} />;

  return (
    <div className="space-y-4">
      {error && <Aviso tono="malo">{error}</Aviso>}
      {lista === null && <p className="text-sm text-slate-600 dark:text-slate-400">Cargando…</p>}
      {lista !== null && lista.length === 0 && !error && (
        <EmptyState icon={<CalendarClock size={40} />} title="Todavía no has puesto ningún examen a un turno" hint="En «Guardados», pulsa «Ponerlo a un turno». Los alumnos lo verán en «Exámenes en clase» y meterán ellos sus respuestas." bordered />
      )}
      {lista?.map((a) => (
        <Hoja key={a.id} pad="lg" className="space-y-2">
          <button type="button" onClick={() => setAbierta(a.id)} className="block min-h-[44px] w-full text-left">
            <p className="font-titulo text-xl font-bold uppercase text-marino dark:text-oro-claro">{a.titulo}</p>
            <p className="text-sm text-slate-700 dark:text-slate-300">{a.etiqueta} · {fechaLarga(a.fecha)}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">{a.grupos.length ? a.grupos.join(', ') : 'Toda la academia'}</p>
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <Etiqueta tono={a.entregados === a.participantes && a.participantes > 0 ? 'ok' : 'aviso'}>{a.entregados} de {a.participantes} han entregado</Etiqueta>
            {a.ausentes > 0 && <Etiqueta tono="malo">{a.ausentes} no se presentaron</Etiqueta>}
            {a.media !== null && <Etiqueta tono="neutro">Media {num(a.media)}</Etiqueta>}
          </div>
        </Hoja>
      ))}
    </div>
  );
}

function Detalle({ id, onVolver }: { id: string; onVolver: () => void }) {
  const [d, setD] = useState<DetalleAplicacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | EstadoEntrega>('todos');
  const [cierre, setCierre] = useState('');

  const carga = useCallback(async () => {
    const res = await getAplicacion(id);
    if (res.success) { setD(res.detalle); setCierre(res.detalle.aplicacion.cierre ?? ''); setError(null); } else setError(res.error);
  }, [id]);
  useEffect(() => { carga(); }, [carga]);

  async function accion(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    const res = await fn();
    if (!res.success) setError(res.error ?? 'No se ha podido guardar.');
    await carga();
  }

  async function borra() {
    if (!d || !confirm(`¿Borrar esta aplicación y todas las notas? No se puede deshacer.`)) return;
    const res = await borraAplicacion(id);
    if (!res.success) { setError(res.error ?? 'No se ha podido borrar.'); return; }
    onVolver();
  }

  if (!d) {
    return (
      <div className="space-y-3">
        <Boton variant="secondary" onClick={onVolver} icon={<ChevronLeft size={15} />}>Volver</Boton>
        {error ? <Aviso tono="malo">{error}</Aviso> : <p className="text-sm text-slate-600 dark:text-slate-400">Cargando…</p>}
      </div>
    );
  }

  const { aplicacion: a, resumen: r } = d;
  const filas = d.participantes.filter((p) => filtro === 'todos' || p.estado === filtro);
  const cuenta = (e: EstadoEntrega) => d.participantes.filter((p) => p.estado === e).length;
  const mas = d.preguntas
    .filter((p) => p.contestadas >= 3 && p.tasaFallo !== null)
    .slice().sort((x, y) => (y.tasaFallo ?? 0) - (x.tasaFallo ?? 0)).slice(0, 10);
  const maxCubo = Math.max(1, ...r.distribucion);

  return (
    <div className="space-y-5">
      <Boton variant="secondary" onClick={onVolver} icon={<ChevronLeft size={15} />}>Todas las aplicaciones</Boton>

      <Hoja pad="lg" className="space-y-1">
        <p className="font-titulo text-2xl font-bold uppercase text-marino dark:text-oro-claro">{a.titulo}</p>
        <p className="text-sm text-slate-700 dark:text-slate-300">{a.etiqueta} · {fechaLarga(a.fecha)} · {a.total} preguntas</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">{a.grupos.length ? a.grupos.join(', ') : 'Toda la academia'}</p>
      </Hoja>

      {error && <Aviso tono="malo"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}</Aviso>}

      <Pulso cifras={[
        { valor: `${r.entregados}/${r.participantes}`, etiqueta: 'han entregado', tono: r.entregados === 0 ? 'aviso' : 'ok' },
        { valor: r.media === null ? null : num(r.media), etiqueta: 'nota media' },
        { valor: r.mediaProfesor === null ? null : num(r.mediaProfesor), etiqueta: 'media oficial' },
        { valor: r.ausentes, etiqueta: 'no se presentaron', tono: r.ausentes ? 'malo' : 'neutro' },
      ]} />

      {r.entregados > 0 && (
        <Hoja pad="lg" className="space-y-3">
          <BloqueTitulo>Cómo ha ido</BloqueTitulo>
          {/* Las barras miden en píxeles: un porcentaje de la altura no se resuelve dentro de un flex sin altura propia. */}
          <div className="flex items-end gap-2" role="img" aria-label={`Notas por tramos: ${r.distribucion.join(', ')}`}>
            {r.distribucion.map((n, i) => (
              <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
                <span className="text-xs font-semibold tabular-nums">{n}</span>
                <div className="w-full rounded-t bg-indigo-600 dark:bg-indigo-400" style={{ height: n ? Math.max(6, Math.round((n / maxCubo) * 88)) : 0 }} />
                <span className="text-[11px] text-slate-600 dark:text-slate-400">{i * 2}-{i * 2 + 2}</span>
              </div>
            ))}
          </div>
        </Hoja>
      )}

      <Hoja pad="lg" className="space-y-3">
        <BloqueTitulo icon={<Users size={15} />}>Alumno por alumno</BloqueTitulo>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          La nota <b>calculada</b> sale de las respuestas que ha metido el alumno. Si pones la nota <b>oficial</b> del papel, esa manda y es la que cuenta. Solo tienes que escribirla si quieres que prevalezca.
        </p>
        <Filtros etiqueta="Qué alumnos ver">
          <FiltroChip activo={filtro === 'todos'} onClick={() => setFiltro('todos')} cuenta={d.participantes.length}>Todos</FiltroChip>
          <FiltroChip activo={filtro === 'pendiente'} onClick={() => setFiltro('pendiente')} cuenta={cuenta('pendiente')}>Sin entregar</FiltroChip>
          <FiltroChip activo={filtro === 'entregado'} onClick={() => setFiltro('entregado')} cuenta={cuenta('entregado')}>Entregaron</FiltroChip>
          <FiltroChip activo={filtro === 'ausente'} onClick={() => setFiltro('ausente')} cuenta={cuenta('ausente')}>No se presentaron</FiltroChip>
        </Filtros>
        <TablaDual<FilaParticipante>
          soloLectura
          clave={(p) => p.id}
          filas={filas}
          vacio="Nadie en este grupo."
          columnas={[
            { id: 'alumno', titulo: 'Alumno', celda: (p) => (
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900 dark:text-white">{p.nombre}</p>
                {p.email && <p className="truncate text-xs text-slate-600 dark:text-slate-400">{p.email}</p>}
              </div>
            ) },
            { id: 'estado', titulo: 'Estado', celda: (p) => <Etiqueta tono={ESTADO[p.estado].tono}>{ESTADO[p.estado].texto}</Etiqueta> },
            { id: 'calculada', titulo: 'Calculada', celda: (p) => (
              p.nota === null ? <span className="text-slate-600 dark:text-slate-400">—</span>
                : <span className="tabular-nums"><b>{num(p.nota)}</b> <span className="text-xs text-slate-600 dark:text-slate-400">· {p.aciertos}/{p.fallos}/{p.blancos}</span></span>
            ) },
            { id: 'oficial', titulo: 'Oficial', celda: (p) => <NotaOficial key={`${p.id}:${p.notaProfesor ?? ''}`} p={p} onGuarda={(nota) => accion(() => setResultadoProfesor({ aplicacionId: id, alumnoId: p.id, nota }))} /> },
            { id: 'acciones', titulo: '', acciones: true, celda: (p) => (
              <div className="flex flex-wrap gap-2">
                <Boton size="sm" variant="secondary" onClick={() => accion(() => setResultadoProfesor({ aplicacionId: id, alumnoId: p.id, ausente: p.estado !== 'ausente' }))}>
                  {p.estado === 'ausente' ? 'Sí se presentó' : 'No se presentó'}
                </Boton>
                {p.estado === 'entregado' && (
                  <Boton size="sm" variant="secondary" icon={<RotateCcw size={13} />}
                    onClick={() => { if (confirm(`¿Dejar que ${p.nombre} vuelva a meter sus respuestas? Se borra lo que entregó.`)) accion(() => reiniciaEntrega({ aplicacionId: id, alumnoId: p.id })); }}>
                    Que repita
                  </Boton>
                )}
              </div>
            ) },
          ]}
        />
      </Hoja>

      {mas.length > 0 && (
        <Hoja pad="lg" className="space-y-3">
          <BloqueTitulo>Las preguntas que más han fallado</BloqueTitulo>
          <p className="text-sm text-slate-600 dark:text-slate-400">Para repasarlas en clase. Entre las que contestaron, el porcentaje que falló y qué marcaron (la correcta, en negrita).</p>
          <ol className="space-y-3">
            {mas.map((p) => (
              <li key={p.n} className="rounded-lg border border-linea p-3 dark:border-noche-linea">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Pregunta {p.n} · {p.tema}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{p.enunciado}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <Etiqueta tono="malo">Falló el {Math.round((p.tasaFallo ?? 0) * 100)} %</Etiqueta>
                  {p.porOpcion.map((n, k) => (
                    <span key={k} className={k === p.correcta ? 'font-bold text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-300'}>{LETRAS_CLASE[k]}: {n}</span>
                  ))}
                  <span className="text-slate-600 dark:text-slate-400">· en blanco: {p.blancos}</span>
                </p>
              </li>
            ))}
          </ol>
        </Hoja>
      )}

      <Hoja pad="lg" className="space-y-3">
        <BloqueTitulo>Plazo y borrado</BloqueTitulo>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem]">
            <Campo label="Pueden meter sus respuestas hasta" type="date" value={cierre} onChange={(e) => setCierre(e.target.value)} hint="Vacío = sin límite." />
          </div>
          <Boton variant="secondary" onClick={() => accion(() => setCierreAplicacion({ aplicacionId: id, cierre: cierre || null }))}>Guardar el plazo</Boton>
          <Boton variant="secondary" onClick={borra} icon={<Trash2 size={15} />}>Borrar esta aplicación</Boton>
        </div>
      </Hoja>
    </div>
  );
}

/** La nota oficial de un alumno: se escribe y se guarda al salir del campo, si ha cambiado. */
function NotaOficial({ p, onGuarda }: { p: FilaParticipante; onGuarda: (nota: string) => void }) {
  const [v, setV] = useState(p.notaProfesor === null ? '' : String(p.notaProfesor).replace('.', ','));
  return (
    <div className="w-24">
      <Campo
        aria-label={`Nota oficial de ${p.nombre}`}
        inputMode="decimal"
        placeholder="—"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { const antes = p.notaProfesor === null ? '' : String(p.notaProfesor).replace('.', ','); if (v.trim() !== antes) onGuarda(v); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
    </div>
  );
}

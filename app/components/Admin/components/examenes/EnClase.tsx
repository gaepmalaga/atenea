'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, ChevronLeft, ClipboardPaste, RotateCcw, Trash2, UserX, Users } from 'lucide-react';
import { borraAplicacion, getAplicacion, getAplicaciones, reiniciaEntrega, setCierreAplicacion, setResultadoProfesor, setResultadosProfesor } from '@/actions';
import type { Aplicacion, DetalleAplicacion, FilaParticipante } from '@/app/actions/examenes-clase';
import { LETRAS_CLASE, leeNotasPegadas, nombreDeAplicacion, resumenDeNotas, variacionDeMedia, type EstadoEntrega } from '@/app/lib/examen-clase';
import { CNP_SCORING } from '@/app/lib/scoring';
import { Hoja, BloqueTitulo, Aviso, Boton, Campo, CampoArea, EmptyState, Etiqueta, Filtros, FiltroChip, PanelLateral, Pestanas, Pulso, TONO_PUNTO, cx } from '../../../ui';

const fechaLarga = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const num = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });
const fechaCorta = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

/** El nombre que se puso a mano. El de siempre («Promo 44 · 13 nov») repite el grupo y el día, y no se enseña. */
const esNombrePropio = (a: { etiqueta: string; grupos: string[]; fecha: string }) => a.etiqueta !== nombreDeAplicacion(a.grupos, a.fecha);

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
 *
 * Cuatro pestañas (regla 124) para no tener una página de siete pantallas:
 * Notas (una fila por alumno, y «Pegar notas» para meter una columna de golpe),
 * Resumen, Preguntas y Ajustes.
 */
type Pestana = 'notas' | 'resumen' | 'preguntas' | 'ajustes';
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
            <p className="text-sm text-slate-700 dark:text-slate-300">{fechaLarga(a.fecha)}{esNombrePropio(a) ? ` · ${a.etiqueta}` : ''}</p>
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
  const [pestana, setPestana] = useState<Pestana>('notas');
  const [filtro, setFiltro] = useState<'todos' | EstadoEntrega>('todos');
  const [busca, setBusca] = useState('');
  const [pegando, setPegando] = useState(false);
  const [cierre, setCierre] = useState('');
  // Sube tras cada cambio: los campos de nota vuelven a lo guardado, también si lo escrito era inválido.
  const [recarga, setRecarga] = useState(0);

  const carga = useCallback(async () => {
    const res = await getAplicacion(id);
    if (res.success) { setD(res.detalle); setCierre(res.detalle.aplicacion.cierre ?? ''); setError(null); } else setError(res.error);
  }, [id]);
  useEffect(() => { carga(); }, [carga]);

  async function accion(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    const res = await fn();
    // Recargar primero: `carga` limpia el error al salir bien, y se llevaba por delante el mensaje de este fallo.
    await carga();
    setRecarga((n) => n + 1);
    if (!res.success) setError(res.error ?? 'No se ha podido guardar.');
  }

  async function borra() {
    if (!d || !confirm('¿Borrar este examen puesto y todas sus notas? No se puede deshacer.')) return;
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
  const cuenta = (e: EstadoEntrega) => d.participantes.filter((p) => p.estado === e).length;
  const mas = d.preguntas
    .filter((p) => p.contestadas >= 3 && p.tasaFallo !== null)
    .slice().sort((x, y) => (y.tasaFallo ?? 0) - (x.tasaFallo ?? 0)).slice(0, 10);
  const maxCubo = Math.max(1, ...r.distribucion);
  const mirada = resumenDeNotas(d.participantes, CNP_SCORING.passMark);

  return (
    <div className="space-y-4">
      <Boton variant="secondary" onClick={onVolver} icon={<ChevronLeft size={15} />}>Exámenes puestos a un turno</Boton>

      <Hoja pad="md" className="space-y-1">
        <p className="font-titulo text-2xl font-bold uppercase text-marino dark:text-oro-claro">{a.titulo}</p>
        <p className="text-sm text-slate-700 dark:text-slate-300">{fechaLarga(a.fecha)} · {a.total} preguntas</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">{a.grupos.length ? a.grupos.join(', ') : 'Toda la academia'}{esNombrePropio(a) ? ` · «${a.etiqueta}»` : ''}</p>
      </Hoja>

      {error && <Aviso tono="malo"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}</Aviso>}

      <Pulso cifras={[
        { valor: `${r.entregados}/${r.participantes}`, etiqueta: 'han entregado', tono: r.entregados === 0 ? 'aviso' : 'ok' },
        { valor: r.media === null ? null : num(r.media), etiqueta: 'nota media' },
        { valor: r.mediaProfesor === null ? null : num(r.mediaProfesor), etiqueta: 'media oficial' },
        { valor: r.ausentes, etiqueta: 'no vinieron', tono: r.ausentes ? 'malo' : 'neutro' },
      ]} />

      <Pestanas<Pestana>
        etiqueta="Secciones del examen puesto"
        compacta
        activa={pestana}
        onCambia={setPestana}
        items={[
          { id: 'notas', etiqueta: 'Notas' },
          { id: 'resumen', etiqueta: 'Resumen' },
          { id: 'preguntas', etiqueta: 'Preguntas' },
          { id: 'ajustes', etiqueta: 'Ajustes' },
        ]}
      />

      {pestana === 'notas' && (
        <Notas
          d={d} id={id} filtro={filtro} setFiltro={setFiltro} busca={busca} setBusca={setBusca} cuenta={cuenta}
          recarga={recarga} accion={accion} onPegar={() => setPegando(true)}
        />
      )}

      {pestana === 'resumen' && (
        mirada.conNota > 0 ? (
          <div className="space-y-4">
            {/* De un vistazo: la nota más alta, la más baja y cuántos aprueban. */}
            <Hoja pad="lg" className="space-y-4">
              <BloqueTitulo>De un vistazo</BloqueTitulo>
              <div className="grid grid-cols-3 gap-3">
                <div className="min-w-0"><p className="text-2xl font-bold tabular-nums text-emerald-800 dark:text-emerald-300">{num(mirada.maxima!.nota)}</p><p className="text-xs text-slate-600 dark:text-slate-400">Más alta</p><p className="line-clamp-2 break-words text-xs font-semibold text-slate-800 dark:text-slate-200" title={mirada.maxima!.nombre}>{mirada.maxima!.nombre}</p></div>
                <div className="min-w-0"><p className="text-2xl font-bold tabular-nums text-red-700 dark:text-red-300">{num(mirada.minima!.nota)}</p><p className="text-xs text-slate-600 dark:text-slate-400">Más baja</p><p className="line-clamp-2 break-words text-xs font-semibold text-slate-800 dark:text-slate-200" title={mirada.minima!.nombre}>{mirada.minima!.nombre}</p></div>
                <div className="min-w-0"><p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{mirada.aprobados}<span className="text-base font-semibold text-slate-600 dark:text-slate-400"> de {mirada.conNota}</span></p><p className="text-xs text-slate-600 dark:text-slate-400">Aprueban</p><p className="text-xs text-slate-600 dark:text-slate-400">mínimo {num(CNP_SCORING.passMark)}</p></div>
              </div>
              {d.anterior && (
                <p className="rounded-lg bg-hundido px-3 py-2 text-sm text-slate-800 dark:bg-noche-hondo dark:text-slate-200">
                  {d.anterior.media === null || r.media === null
                    ? <>Examen anterior: <b>{d.anterior.titulo}</b> ({fechaCorta(d.anterior.fecha)}). Aún no hay medias que comparar.</>
                    : <>Media del examen anterior (<b>{d.anterior.titulo}</b>, {fechaCorta(d.anterior.fecha)}): <b>{num(d.anterior.media)}</b>. Ahora: <b>{num(r.media)}</b>{' '}
                      {(() => {
                        const v = variacionDeMedia(r.media, d.anterior.media);
                        return v === null || v === 0
                          ? <span className="font-semibold text-slate-600 dark:text-slate-400">(igual)</span>
                          : <span className={cx('font-bold', v > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>({v > 0 ? '▲ +' : '▼ −'}{num(Math.abs(v))})</span>;
                      })()}</>}
                </p>
              )}
            </Hoja>

            {mirada.suspensos.length > 0 && (
              <Hoja pad="lg" className="space-y-2">
                <BloqueTitulo>Por debajo del aprobado</BloqueTitulo>
                <p className="text-sm text-slate-600 dark:text-slate-400">Con menos de {num(CNP_SCORING.passMark)}: a quién mirar esta semana. De la nota más baja a la más alta.</p>
                <ul className="divide-y divide-linea dark:divide-noche-linea">
                  {mirada.suspensos.map((x) => (
                    <li key={x.nombre} className="flex min-h-[40px] items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-slate-900 dark:text-white">{x.nombre}</span>
                      <b className="shrink-0 tabular-nums text-red-700 dark:text-red-300">{num(x.nota)}</b>
                    </li>
                  ))}
                </ul>
              </Hoja>
            )}

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
          </div>
        ) : (
          <EmptyState icon={<Users size={36} />} title="Todavía no ha entregado nadie" hint="Cuando los alumnos metan sus respuestas, aquí verás la nota más alta y la más baja, cuántos aprueban, a quién mirar y cómo se reparten las notas. Si hay un examen anterior de este grupo, también cómo ha cambiado la media." bordered />
        )
      )}

      {pestana === 'preguntas' && (
        mas.length > 0 ? (
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
        ) : (
          <EmptyState icon={<Users size={36} />} title="Aún no hay preguntas que mirar" hint="Salen cuando al menos tres alumnos han entregado: las diez que más se han fallado, con el porcentaje que falló y qué opción marcó cada uno, para repasarlas en clase." bordered />
        )
      )}

      {pestana === 'ajustes' && (
        <Hoja pad="lg" className="space-y-3">
          <BloqueTitulo>Plazo y borrado</BloqueTitulo>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[14rem]">
              <Campo label="Pueden meter sus respuestas hasta" type="date" value={cierre} onChange={(e) => setCierre(e.target.value)} hint="Vacío = sin límite." />
            </div>
            <Boton variant="secondary" onClick={() => accion(() => setCierreAplicacion({ aplicacionId: id, cierre: cierre || null }))}>Guardar el plazo</Boton>
          </div>
          <div className="border-t border-linea pt-3 dark:border-noche-linea">
            <Boton variant="secondary" onClick={borra} icon={<Trash2 size={15} />}>Borrar este examen puesto</Boton>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Se borran también todas sus notas y las respuestas de los alumnos.</p>
          </div>
        </Hoja>
      )}

      {pegando && (
        <PegarNotas
          alumnos={d.participantes.map((p) => ({ id: p.id, nombre: p.nombre }))}
          onCerrar={() => setPegando(false)}
          onGuardar={async (filas) => {
            await accion(() => setResultadosProfesor({ aplicacionId: id, filas }));
            setPegando(false);
          }}
        />
      )}
    </div>
  );
}

/** La pestaña «Notas»: una fila por alumno, con la nota oficial a un toque. */
function Notas({ d, id, filtro, setFiltro, busca, setBusca, cuenta, recarga, accion, onPegar }: {
  d: DetalleAplicacion; id: string;
  filtro: 'todos' | EstadoEntrega; setFiltro: (f: 'todos' | EstadoEntrega) => void;
  busca: string; setBusca: (b: string) => void;
  cuenta: (e: EstadoEntrega) => number; recarga: number;
  accion: (fn: () => Promise<{ success: boolean; error?: string }>) => Promise<void>;
  onPegar: () => void;
}) {
  const q = busca.trim().toLowerCase();
  const filas = d.participantes
    .filter((p) => filtro === 'todos' || p.estado === filtro)
    .filter((p) => !q || `${p.nombre} ${p.email ?? ''}`.toLowerCase().includes(q));

  return (
    <Hoja pad="sm" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Boton onClick={onPegar} icon={<ClipboardPaste size={15} />}>Pegar notas</Boton>
        <div className="min-w-[10rem] flex-1">
          <Campo type="search" aria-label="Buscar alumno" placeholder="Buscar alumno" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>
      <p className="text-[13px] text-slate-600 dark:text-slate-400">
        La nota <b>calculada</b> sale de las respuestas del alumno. La <b>oficial</b>, la del papel, manda si la escribes.
      </p>
      <Filtros etiqueta="Qué alumnos ver" enHoja>
        <FiltroChip activo={filtro === 'todos'} onClick={() => setFiltro('todos')} cuenta={d.participantes.length}>Todos</FiltroChip>
        <FiltroChip activo={filtro === 'pendiente'} onClick={() => setFiltro('pendiente')} cuenta={cuenta('pendiente')}>Sin entregar</FiltroChip>
        <FiltroChip activo={filtro === 'entregado'} onClick={() => setFiltro('entregado')} cuenta={cuenta('entregado')}>Entregaron</FiltroChip>
        <FiltroChip activo={filtro === 'ausente'} onClick={() => setFiltro('ausente')} cuenta={cuenta('ausente')}>No vinieron</FiltroChip>
      </Filtros>

      {filas.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-600 dark:text-slate-400">{d.participantes.length === 0 ? 'Nadie en este grupo.' : 'Ningún alumno coincide.'}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-linea dark:border-noche-linea">
          <div className="flex items-center gap-2 bg-hundido px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:bg-noche-hondo dark:text-slate-400">
            <span className="min-w-0 flex-1">Alumno</span>
            <span className="w-11 text-center">Calc.</span>
            <span className="w-[4.25rem] text-center">Oficial</span>
            <span className="w-11" aria-hidden />
          </div>
          <ul>
            {filas.map((p, i) => {
              const ausente = p.estado === 'ausente';
              return (
                <li key={p.id} className={cx('flex items-center gap-2 border-t border-linea px-3 py-1.5 dark:border-noche-linea', i % 2 === 1 && 'bg-black/[0.02] dark:bg-white/[0.02]')}>
                  <i className={cx('h-2.5 w-2.5 shrink-0 rounded-full', TONO_PUNTO[ESTADO[p.estado].tono])} title={ESTADO[p.estado].texto} aria-label={ESTADO[p.estado].texto} />
                  <div className="min-w-0 flex-1" title={p.email ?? undefined}>
                    {/* El nombre manda: dos líneas antes que «Lucí…». */}
                    <p className={cx('line-clamp-2 break-words text-[13px] font-medium leading-snug', ausente ? 'text-slate-500 line-through dark:text-slate-500' : 'text-slate-900 dark:text-white')}>{p.nombre}</p>
                    {p.estado === 'entregado' && (
                      <button type="button" className="mt-0.5 min-h-[28px] text-[11.5px] font-semibold text-indigo-900 underline underline-offset-2 dark:text-indigo-200"
                        aria-label={`${p.nombre}: que repita`}
                        onClick={() => { if (confirm(`¿Dejar que ${p.nombre} vuelva a meter sus respuestas? Se borra lo que entregó.`)) accion(() => reiniciaEntrega({ aplicacionId: id, alumnoId: p.id })); }}>
                        Que repita
                      </button>
                    )}
                  </div>
                  <span className="w-11 shrink-0 text-center text-sm tabular-nums">
                    {p.nota === null ? <span className="text-slate-500 dark:text-slate-500">—</span> : <b className="text-emerald-800 dark:text-emerald-300" title={`${p.aciertos}/${p.fallos}/${p.blancos}`}>{num(p.nota)}</b>}
                  </span>
                  <span className="w-[4.25rem] min-w-0 shrink-0">
                    {ausente
                      ? <span className="block text-center text-[11px] font-bold uppercase text-red-700 dark:text-red-300">No vino</span>
                      : <NotaOficial key={`${p.id}:${p.notaProfesor ?? ''}:${recarga}`} p={p} onGuarda={(nota) => accion(() => setResultadoProfesor({ aplicacionId: id, alumnoId: p.id, nota }))} />}
                  </span>
                  <Boton size="sm" variant={ausente ? 'primary' : 'secondary'} aria-label={ausente ? `${p.nombre}: sí se presentó` : `${p.nombre}: no se presentó`}
                    title={ausente ? 'Sí se presentó' : 'No se presentó'} icon={<UserX size={16} />} className="!px-0 w-11 shrink-0"
                    onClick={() => accion(() => setResultadoProfesor({ aplicacionId: id, alumnoId: p.id, ausente: !ausente }))} />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Hoja>
  );
}

/**
 * «Pegar notas»: se pega una columna del Excel o del chat y se ve, ANTES de
 * guardar, a quién ha reconocido y a quién no. No guarda nada hasta pulsar.
 */
function PegarNotas({ alumnos, onCerrar, onGuardar }: {
  alumnos: { id: string; nombre: string }[];
  onCerrar: () => void;
  onGuardar: (filas: { alumnoId: string; nota: number | null; ausente: boolean }[]) => Promise<void>;
}) {
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const r = useMemo(() => leeNotasPegadas(texto, alumnos), [texto, alumnos]);
  const problemas = r.ambiguas.length + r.sinCoincidencia.length + r.invalidas.length;

  async function guarda() {
    setGuardando(true);
    await onGuardar(r.reconocidas.map((x) => ({ alumnoId: x.alumnoId, nota: x.nota, ausente: x.ausente })));
    setGuardando(false);
  }

  return (
    <PanelLateral titulo="Pegar notas" sub="Una línea por alumno: nombre y nota" onCerrar={onCerrar}>
      <p className="text-sm text-slate-700 dark:text-slate-300">
        Pega una columna de tu Excel o del chat: <b>nombre, nota</b>. Los reconozco por el apellido, sin mirar acentos. Para quien no vino, escribe «no vino».
      </p>
      <CampoArea
        aria-label="Notas pegadas"
        rows={8}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={'Álvarez Gil;7,5\nBeltrán Ruiz;5\nDomínguez;no vino'}
      />

      {texto.trim() && (
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-emerald-800 dark:text-emerald-300">✓ {r.reconocidas.length} {r.reconocidas.length === 1 ? 'reconocido' : 'reconocidos'}</p>
          {r.ambiguas.map((x, i) => (
            <Aviso key={`a${i}`}><span><b>«{x.linea}»</b> encaja con varios: {x.candidatos.join(', ')}. Escribe un apellido más.</span></Aviso>
          ))}
          {r.sinCoincidencia.map((x, i) => (
            <Aviso key={`s${i}`}><span><b>«{x.linea}»</b> no coincide con ningún alumno{x.sugerencia ? ` (¿${x.sugerencia}?)` : ''}.</span></Aviso>
          ))}
          {r.invalidas.map((x, i) => (
            <Aviso key={`i${i}`} tono="malo"><span><b>«{x.linea}»</b>: {x.motivo}</span></Aviso>
          ))}
          {r.repetidas.length > 0 && <Aviso><span>Salen dos veces: {r.repetidas.join(', ')}. Vale la última.</span></Aviso>}
          {problemas > 0 && r.reconocidas.length > 0 && (
            <p className="text-xs text-slate-600 dark:text-slate-400">Las líneas con aviso no se guardan. Puedes guardar las reconocidas y corregir el resto después.</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Boton onClick={guarda} disabled={guardando || r.reconocidas.length === 0}>
          {guardando ? 'Guardando…' : r.reconocidas.length ? `Guardar ${r.reconocidas.length} ${r.reconocidas.length === 1 ? 'nota' : 'notas'}` : 'Guardar'}
        </Boton>
        <Boton variant="secondary" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
      </div>
    </PanelLateral>
  );
}

/** La nota oficial de un alumno: se escribe y se guarda al salir del campo, si ha cambiado. */
function NotaOficial({ p, onGuarda }: { p: FilaParticipante; onGuarda: (nota: string) => void }) {
  const [v, setV] = useState(p.notaProfesor === null ? '' : String(p.notaProfesor).replace('.', ','));
  return (
    <div className="w-full min-w-0">
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

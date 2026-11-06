'use client';

import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Library, Copy, StickyNote, Loader2, MessageSquare, Check, X, Pencil, Trash2,
} from 'lucide-react';
import {
  getDestinosFisica, getPlanificador, getPlantillas, moverSesion, saveSesion, copiarSemanaFisica, setNotaSemana,
  deletePlantilla,
} from '@/actions';
import type { DestinoGrupo, DestinoAlumno, ApunteConCorreo, NotaSemana, RMVigente } from '@/app/actions/fisica';
import {
  TIPOS_SESION, ETIQUETA_TIPO, diasDeSemana, semanasDelMes, sumaMeses, mesDe, etiquetaMes, etiquetaSemana,
  etiquetaDia, porDia, resumenSemana, estadoSesion, formateaMinutos, formateaKm, lunesDe,
  type Destino, type Sesion, type Plantilla,
} from '@/app/lib/sesiones';
import { sumaDias } from '@/app/lib/asistencia';
import { ESTILO_TIPO } from '@/app/components/fisica/estiloTipo';
import { Button, EmptyState, Modal, SelectField, TextField, TEXT, cx } from '../../../ui';
import EditorSesion from './EditorSesion';

/**
 * EL PLANIFICADOR DEL PREPARADOR (regla 86).
 *
 * Hecho a imagen de la herramienta con la que Alphapol mandaba la física, para
 * que el salto no cueste: un calendario por semanas —una, dos o el mes—, con
 * las sesiones como tarjetas del color de su tipo, un «+» en cada día, la
 * biblioteca de plantillas, copiar la semana y la nota de cada semana. Se
 * planifica para un GRUPO entero o para UN alumno.
 *
 * En el ordenador las tarjetas y las plantillas se ARRASTRAN a otro día (con
 * Alt o Ctrl, se copian). En el móvil los días se apilan y todo va con toques.
 */

type Vista = 'semana' | '2semanas' | 'mes';
type Datos = {
  sesiones: Sesion[];
  apuntes: ApunteConCorreo[];
  miembros: { id: string; email: string }[];
  notas: NotaSemana[];
  nombresGrupo: Record<string, string>;
  rm: RMVigente;
  hoy: string;
};

function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const claveDestino = (d: Destino | null) => (d ? `${d.tipo}:${d.id}` : '');
const leeDestino = (v: string): Destino | null => {
  const [tipo, id] = v.split(':');
  return (tipo === 'grupo' || tipo === 'alumno') && id ? { tipo, id } : null;
};

export default function Planificador() {
  const [grupos, setGrupos] = useState<DestinoGrupo[] | null>(null);
  const [alumnos, setAlumnos] = useState<DestinoAlumno[]>([]);
  const [destino, setDestino] = useState<Destino | null>(null);
  // En el ordenador se empieza viendo dos semanas, como en la herramienta de
  // antes; en el móvil, una. El panel solo se pinta en el navegador.
  const [vista, setVista] = useState<Vista>(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches ? '2semanas' : 'semana');
  const [ancla, setAncla] = useState(() => lunesDe(hoyLocal()));
  const [mes, setMes] = useState(() => mesDe(hoyLocal()));
  const [datos, setDatos] = useState<Datos | null>(null);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ sesion: Sesion | null; fecha: string } | null>(null);
  const [biblioteca, setBiblioteca] = useState(false);
  const [copiando, setCopiando] = useState(false);
  const [plantillaPorColocar, setPlantillaPorColocar] = useState<Plantilla | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [d, p] = await Promise.all([getDestinosFisica(), getPlantillas()]);
      if (!d.success) { setError(d.error); setGrupos([]); return; }
      setGrupos(d.grupos);
      setAlumnos(d.alumnos);
      if (p.success) setPlantillas(p.plantillas);
      const preferido = d.grupos.find((g) => /f[ií]sic/i.test(g.kind) || /f[ií]sic/i.test(g.name)) ?? d.grupos[0];
      if (preferido) setDestino({ tipo: 'grupo', id: preferido.id });
      else if (d.alumnos[0]) setDestino({ tipo: 'alumno', id: d.alumnos[0].id });
    })();
  }, []);

  const semanas = useMemo(
    () => (vista === 'mes' ? semanasDelMes(mes) : vista === '2semanas' ? [ancla, sumaDias(ancla, 7)] : [ancla]),
    [vista, mes, ancla],
  );
  const desde = semanas[0];
  const hasta = sumaDias(semanas[semanas.length - 1], 6);

  const cargar = useCallback(async () => {
    if (!destino) return;
    const res = await getPlanificador({ destino, desde, hasta });
    if (!res.success) { setError(res.error); return; }
    setError(null);
    setDatos(res);
  }, [destino, desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const recargarPlantillas = useCallback(async () => {
    const p = await getPlantillas();
    if (p.success) setPlantillas(p.plantillas);
  }, []);

  const tras = useCallback(() => { cargar(); recargarPlantillas(); }, [cargar, recargarPlantillas]);

  function mover(n: number) {
    if (vista === 'mes') setMes((m) => sumaMeses(m, n));
    else setAncla((a) => sumaDias(a, n * (vista === '2semanas' ? 14 : 7)));
  }
  function irAHoy() {
    const h = datos?.hoy ?? hoyLocal();
    setAncla(lunesDe(h));
    setMes(mesDe(h));
  }

  const hoy = datos?.hoy ?? hoyLocal();
  const sesionesPorDia = useMemo(() => porDia(datos?.sesiones ?? []), [datos]);
  const idsMiembros = useMemo(() => (datos?.miembros ?? []).map((m) => m.id), [datos]);
  const nombreDestino = destino?.tipo === 'grupo'
    ? grupos?.find((g) => g.id === destino.id)?.name
    : alumnos.find((a) => a.id === destino?.id)?.email;

  // ── Arrastrar (ordenador) ──
  function alSoltar(e: DragEvent, fecha: string) {
    e.preventDefault();
    setArrastrando(null);
    let carga: { tipo: string; id: string } | null = null;
    try { carga = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
    if (!carga || !destino) return;
    if (carga.tipo === 'sesion') {
      const s = datos?.sesiones.find((x) => x.id === carga!.id);
      if (!s || (s.fecha === fecha && !(e.altKey || e.ctrlKey))) return;
      moverSesion({ id: s.id, fecha, copiar: e.altKey || e.ctrlKey }).then((r) => (r.success ? cargar() : setError(r.error ?? 'No se ha podido mover.')));
    } else if (carga.tipo === 'plantilla') {
      const p = plantillas.find((x) => x.id === carga!.id);
      if (p) colocarPlantilla(p, fecha);
    }
  }

  async function colocarPlantilla(p: Plantilla, fecha: string) {
    if (!destino) return;
    const r = await saveSesion({ destino, fecha, contenido: { ...p } });
    if (!r.success) setError(r.error);
    setPlantillaPorColocar(null);
    cargar();
  }

  if (grupos === null) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;
  if (!grupos.length && !alumnos.length) {
    return <EmptyState title="Aún no hay grupos ni alumnos" hint="Crea un grupo en «Grupos» o da de alta a tus alumnos en «Alumnos», y aquí podrás planificarles la física." bordered />;
  }

  return (
    <div className="space-y-3">
      {/* ── PARA QUIÉN ── */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-2">
        <div className="w-full sm:max-w-sm">
        <SelectField
          label="Planificar para"
          value={claveDestino(destino)}
          onChange={(e) => { setDatos(null); setDestino(leeDestino(e.target.value)); }}
        >
          {grupos.length > 0 && (
            <optgroup label="Grupos (todos sus alumnos)">
              {grupos.map((g) => <option key={g.id} value={`grupo:${g.id}`}>{g.name} · {g.miembros} {g.miembros === 1 ? 'alumno' : 'alumnos'}</option>)}
            </optgroup>
          )}
          {alumnos.length > 0 && (
            <optgroup label="Un alumno (entrenamiento individual)">
              {alumnos.map((a) => <option key={a.id} value={`alumno:${a.id}`}>{a.email}</option>)}
            </optgroup>
          )}
        </SelectField>
        </div>
        <p className={cx(TEXT.muted, 'sm:pb-3')}>
          {destino?.tipo === 'alumno'
            ? 'Ves sus sesiones individuales y, con borde de puntos, las de sus grupos.'
            : 'Cada sesión la ven todos los alumnos del grupo.'}
        </p>
      </div>

      {/* ── NAVEGAR Y HERRAMIENTAS ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => mover(-1)} aria-label="Anterior" className="w-11 h-11 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronLeft size={18} /></button>
          <span className="px-2 text-sm font-black text-slate-900 dark:text-white min-w-[150px] text-center">
            {vista === 'mes' ? mayuscula(etiquetaMes(mes)) : semanas.map(etiquetaSemana).join(' · ')}
          </span>
          <button onClick={() => mover(1)} aria-label="Siguiente" className="w-11 h-11 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronRight size={18} /></button>
          <Button variant="ghost" size="sm" onClick={irAHoy}>Hoy</Button>
        </div>
        <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60">
          {([['semana', 'Semana'], ['2semanas', '2 semanas'], ['mes', 'Mes']] as const).map(([v, t]) => (
            <button key={v} onClick={() => setVista(v)} aria-pressed={vista === v}
              className={cx('min-h-[44px] px-3 rounded-lg text-xs font-black',
                vista === v ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400')}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="secondary" size="sm" onClick={() => setBiblioteca((b) => !b)} aria-pressed={biblioteca}>
            <Library size={15} /> Biblioteca{plantillas.length ? ` (${plantillas.length})` : ''}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setCopiando(true)}><Copy size={15} /> Copiar semana</Button>
          <Button size="sm" onClick={() => setEditor({ sesion: null, fecha: hoy >= desde && hoy <= hasta ? hoy : desde })}><Plus size={15} /> Sesión</Button>
        </div>
      </div>

      {biblioteca && (
        <Biblioteca
          plantillas={plantillas}
          onColocar={(p) => setPlantillaPorColocar(p)}
          onCambio={recargarPlantillas}
          onArrastrar={() => setArrastrando('plantilla')}
        />
      )}

      {error && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
      {!datos && !error && <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>}

      {datos && destino && (
        <div className="space-y-3">
          {semanas.map((lunes) => {
            const dias = diasDeSemana(lunes);
            const deLaSemana = dias.flatMap((d) => sesionesPorDia.get(d) ?? []);
            const r = resumenSemana({
              sesiones: deLaSemana, apuntes: datos.apuntes, hoy,
              alumnos: destino.tipo === 'grupo' ? idsMiembros : undefined,
            });
            const nota = datos.notas.find((n) => n.weekStart === lunes
              && (destino.tipo === 'grupo' ? n.classId === destino.id : n.classId === null));
            return (
              <div key={lunes} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <NotaSemanaBar destino={destino} lunes={lunes} nota={nota?.note ?? null} onCambio={cargar} />
                <div className="grid grid-cols-1 md:grid-cols-7 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800">
                  {dias.map((d) => {
                    const ses = sesionesPorDia.get(d) ?? [];
                    const fuera = vista === 'mes' && mesDe(d) !== mes;
                    return (
                      <div
                        key={d}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => alSoltar(e, d)}
                        className={cx(
                          'p-2 flex md:flex-col gap-2 md:min-h-[150px] min-w-0',
                          d === hoy && 'bg-indigo-50/50 dark:bg-indigo-900/10',
                          fuera && 'bg-slate-50 dark:bg-slate-950/40',
                          arrastrando && 'md:hover:bg-indigo-50 md:dark:hover:bg-indigo-900/20',
                        )}
                      >
                        <div className="w-16 md:w-auto shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-1 pt-1 md:pt-0">
                          <span className={cx('text-[11px] font-black capitalize', d === hoy ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400')}>
                            {etiquetaDia(d).replace(/ \S+$/, '')}
                          </span>
                          {/* En el móvil, un «+» de 44 px bajo la fecha si el día ya tiene algo; en el ordenador, pequeño a la derecha. */}
                          <button onClick={() => setEditor({ sesion: null, fecha: d })} aria-label={`Añadir sesión el ${etiquetaDia(d)}`}
                            className={cx('items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30',
                              'w-11 h-11 md:w-7 md:h-7 md:flex', ses.length ? 'flex' : 'hidden')}>
                            <Plus size={15} />
                          </button>
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          {ses.map((s) => (
                            <TarjetaCoach
                              key={s.id}
                              s={s}
                              destino={destino}
                              apuntes={datos.apuntes.filter((a) => a.sessionId === s.id)}
                              miembros={idsMiembros.length}
                              hoy={hoy}
                              nombreGrupo={s.classId ? datos.nombresGrupo[s.classId] ?? 'Grupo' : null}
                              onAbrir={() => setEditor({ sesion: s, fecha: s.fecha })}
                              onArrastrar={() => setArrastrando('sesion')}
                            />
                          ))}
                          {ses.length === 0 && (
                            <button onClick={() => setEditor({ sesion: null, fecha: d })}
                              className="md:hidden w-full min-h-[44px] rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
                              <Plus size={14} /> Añadir sesión
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <ResumenFila r={r} grupo={destino.tipo === 'grupo'} />
              </div>
            );
          })}
          <p className={cx(TEXT.muted, 'hidden md:block text-right')}>Arrastra una sesión a otro día para moverla; con Alt o Ctrl, para copiarla.</p>
        </div>
      )}

      {editor && destino && datos && (
        <EditorSesion
          destino={destino}
          fecha={editor.fecha}
          sesion={editor.sesion}
          plantillas={plantillas}
          apuntes={datos.apuntes}
          miembros={datos.miembros}
          hoy={hoy}
          rm={destino.tipo === 'alumno' ? datos.rm : null}
          nombreGrupo={editor.sesion?.classId ? datos.nombresGrupo[editor.sesion.classId] ?? null : destino.tipo === 'grupo' ? nombreDestino ?? null : null}
          onCerrar={() => setEditor(null)}
          onCambio={tras}
        />
      )}

      {plantillaPorColocar && (
        <Modal title={`«${plantillaPorColocar.title}»`} subtitle="¿Qué día?" onClose={() => setPlantillaPorColocar(null)} width="sm">
          <div className="grid grid-cols-2 gap-2">
            {semanas.flatMap(diasDeSemana).filter((d) => vista !== 'mes' || mesDe(d) === mes).map((d) => (
              <Button key={d} variant={d === hoy ? 'primary' : 'secondary'} size="sm" onClick={() => colocarPlantilla(plantillaPorColocar, d)}>
                <span className="capitalize">{etiquetaDia(d)}</span>
              </Button>
            ))}
          </div>
        </Modal>
      )}

      {copiando && destino && (
        <CopiarSemana destino={destino} semanas={semanas} onCerrar={() => setCopiando(false)} onHecho={() => { setCopiando(false); cargar(); }} />
      )}
    </div>
  );
}

// ── Una sesión en el calendario del preparador ──

function TarjetaCoach({ s, destino, apuntes, miembros, hoy, nombreGrupo, onAbrir, onArrastrar }: {
  s: Sesion;
  destino: Destino;
  apuntes: ApunteConCorreo[];
  miembros: number;
  hoy: string;
  nombreGrupo: string | null;
  onAbrir: () => void;
  onArrastrar: () => void;
}) {
  const E = ESTILO_TIPO[s.kind];
  const Icono = E.icono;
  const deGrupoEnAlumno = destino.tipo === 'alumno' && !!s.classId;
  const meta = [formateaMinutos(s.durationMin), formateaKm(s.distanceKm)].filter(Boolean).join(' · ');
  const hechas = apuntes.filter((a) => a.status === 'hecha').length;
  const comentarios = apuntes.filter((a) => a.comment).length;
  const estadoAlumno = destino.tipo === 'alumno' ? estadoSesion(s.fecha, apuntes[0], hoy) : null;

  return (
    <button
      draggable={!deGrupoEnAlumno}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ tipo: 'sesion', id: s.id })); onArrastrar(); }}
      onClick={onAbrir}
      className={cx(
        'w-full min-h-[44px] text-left rounded-xl overflow-hidden flex border transition-colors hover:shadow-sm',
        deGrupoEnAlumno ? 'border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900',
      )}
    >
      <span className={cx('w-1 shrink-0', E.barra)} />
      <span className="flex-1 min-w-0 px-2 py-1.5">
        <span className="flex items-center gap-1.5 min-w-0">
          <Icono size={12} className={cx('shrink-0 rounded', E.chip)} />
          <span className="text-xs font-black text-slate-900 dark:text-white leading-snug line-clamp-2">{s.title}</span>
        </span>
        {s.cargas.length > 0 && (
          <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
            {s.cargas.length} {s.cargas.length === 1 ? 'carga' : 'cargas'} en % 1RM
          </span>
        )}
        {(meta || deGrupoEnAlumno) && (
          <span className="block text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
            {meta}{meta && deGrupoEnAlumno ? ' · ' : ''}{deGrupoEnAlumno ? nombreGrupo : ''}
          </span>
        )}
        {s.fecha <= hoy && s.kind !== 'descanso' && (
          <span className="mt-1 flex items-center gap-1.5 text-[10px] font-black">
            {destino.tipo === 'grupo' ? (
              <span className={cx('px-1.5 py-0.5 rounded-md', hechas === miembros && miembros > 0
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>
                <Check size={9} strokeWidth={3} className="inline -mt-px" /> {hechas}/{miembros}
              </span>
            ) : estadoAlumno === 'hecha' ? (
              <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">Hecha{apuntes[0]?.rpe != null && ` · ${apuntes[0].rpe}/10`}</span>
            ) : estadoAlumno === 'no_hecha' ? (
              <span className="px-1.5 py-0.5 rounded-md bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"><X size={9} strokeWidth={3} className="inline -mt-px" /> No hecha</span>
            ) : (
              <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Sin apuntar</span>
            )}
            {comentarios > 0 && <span className="text-indigo-600 dark:text-indigo-300 flex items-center gap-0.5"><MessageSquare size={10} /> {comentarios}</span>}
          </span>
        )}
      </span>
    </button>
  );
}

function ResumenFila({ r, grupo }: { r: ReturnType<typeof resumenSemana>; grupo: boolean }) {
  const pct = r.posibles ? Math.round((r.hechas / r.posibles) * 100) : null;
  return (
    <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
      <span><b className="text-slate-900 dark:text-white">{r.sesiones}</b> {r.sesiones === 1 ? 'sesión' : 'sesiones'}</span>
      {formateaMinutos(r.minutos) && <span>{formateaMinutos(r.minutos)}</span>}
      {formateaKm(r.kilometros) && <span>{formateaKm(r.kilometros)}</span>}
      {pct !== null && <span>Cumplido <b className="text-slate-900 dark:text-white">{pct} %</b>{grupo && ` (${r.hechas}/${r.posibles})`}</span>}
      {r.rpeMedio !== null && <span>Esfuerzo medio <b className="text-slate-900 dark:text-white">{r.rpeMedio.toLocaleString('es-ES')}/10</b></span>}
    </div>
  );
}

function NotaSemanaBar({ destino, lunes, nota, onCambio }: { destino: Destino; lunes: string; nota: string | null; onCambio: () => void }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(nota ?? '');
  const [guardando, setGuardando] = useState(false);

  if (editando) {
    return (
      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-indigo-50/60 dark:bg-indigo-900/15 flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <TextField label={`Nota de la semana del ${etiquetaSemana(lunes)}`} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={300}
            placeholder="Semana de carga · lo importante es…" autoFocus />
        </div>
        <Button size="sm" disabled={guardando} onClick={async () => {
          setGuardando(true);
          const r = await setNotaSemana({ destino, weekStart: lunes, note: texto });
          setGuardando(false);
          if (r.success) { setEditando(false); onCambio(); }
        }}>{guardando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Guardar</Button>
        <Button size="sm" variant="ghost" onClick={() => { setEditando(false); setTexto(nota ?? ''); }}>Cancelar</Button>
      </div>
    );
  }
  return (
    <button onClick={() => { setTexto(nota ?? ''); setEditando(true); }}
      className={cx('w-full min-h-[44px] px-3 py-1.5 text-left text-xs flex items-center gap-2 border-b border-slate-100 dark:border-slate-800',
        nota ? 'bg-indigo-50/70 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-200 font-semibold' : 'text-slate-400 dark:text-slate-500 hover:text-indigo-600')}>
      <StickyNote size={13} className="shrink-0" />
      <span className="truncate">{nota ?? `Semana del ${etiquetaSemana(lunes)} · añadir una nota`}</span>
    </button>
  );
}

// ── La biblioteca de plantillas ──

function Biblioteca({ plantillas, onColocar, onCambio, onArrastrar }: {
  plantillas: Plantilla[];
  onColocar: (p: Plantilla) => void;
  onCambio: () => void;
  onArrastrar: () => void;
}) {
  if (!plantillas.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">La biblioteca está vacía</p>
        <p className={TEXT.muted}>Abre cualquier sesión y pulsa «Guardar como plantilla». Luego la podrás poner en cualquier día con un toque o arrastrándola.</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2">
      <p className={TEXT.muted}>
        <span className="hidden md:inline">Arrastra una plantilla a un día, o </span>tócala para elegir el día.
      </p>
      {TIPOS_SESION.map((t) => {
        const deTipo = plantillas.filter((p) => p.kind === t);
        if (!deTipo.length) return null;
        const E = ESTILO_TIPO[t];
        const Icono = E.icono;
        return (
          <div key={t}>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">{ETIQUETA_TIPO[t]}</p>
            <div className="flex flex-wrap gap-1.5">
              {deTipo.map((p) => (
                <span key={p.id} className={cx('inline-flex items-center rounded-xl overflow-hidden max-w-full', E.chip)}>
                  <button
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ tipo: 'plantilla', id: p.id })); onArrastrar(); }}
                    onClick={() => onColocar(p)}
                    className="min-h-[40px] pl-2.5 pr-2 inline-flex items-center gap-1.5 text-xs font-bold min-w-0"
                  >
                    <Icono size={13} className="shrink-0" /> <span className="truncate">{p.title}</span>
                  </button>
                  <button aria-label={`Borrar la plantilla ${p.title}`}
                    onClick={async () => { if (confirm(`¿Borrar la plantilla «${p.title}»? Las sesiones ya puestas no cambian.`)) { const r = await deletePlantilla({ id: p.id }); if (r.success) onCambio(); } }}
                    className="min-h-[40px] px-2 opacity-60 hover:opacity-100">
                    <Trash2 size={13} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        );
      })}
      <p className={cx(TEXT.muted, 'flex items-center gap-1')}><Pencil size={11} /> Para cambiar una plantilla, ponla en un día, edítala y vuelve a guardarla como plantilla.</p>
    </div>
  );
}

// ── Copiar una semana ──

function CopiarSemana({ destino, semanas, onCerrar, onHecho }: {
  destino: Destino;
  semanas: string[];
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const [origen, setOrigen] = useState(semanas[0]);
  const [saltos, setSaltos] = useState(1);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = sumaDias(origen, 7 * saltos);

  return (
    <Modal title="Copiar una semana" subtitle="Las mismas sesiones, el mismo día de la semana" onClose={onCerrar} width="sm"
      footer={
        <Button disabled={guardando} onClick={async () => {
          setGuardando(true);
          const r = await copiarSemanaFisica({ destino, desde: origen, a });
          setGuardando(false);
          if (!r.success) { setError(r.error); return; }
          onHecho();
        }}>
          {guardando ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />} Copiar
        </Button>
      }>
      <div className="space-y-3">
        <SelectField label="Copiar la semana del" value={origen} onChange={(e) => setOrigen(e.target.value)}>
          {semanas.map((l) => <option key={l} value={l}>{etiquetaSemana(l)}</option>)}
        </SelectField>
        <SelectField label="A la semana del" value={String(saltos)} onChange={(e) => setSaltos(Number(e.target.value))}>
          {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{etiquetaSemana(sumaDias(origen, 7 * n))}{n === 1 ? ' (la siguiente)' : ''}</option>
          ))}
        </SelectField>
        <p className={TEXT.muted}>Lo que ya haya en la semana de destino se queda; las copiadas se añaden.</p>
        {error && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Modal>
  );
}

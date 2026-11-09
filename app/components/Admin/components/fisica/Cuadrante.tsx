'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Copy, Image as ImagenIcono, MessageSquare, Plus, AlertTriangle, Users, Loader2, Trash2, Check,
  CalendarX2, Undo2, FileText, ArrowRightLeft, UserPlus,
} from 'lucide-react';
import {
  getCuadrante, saveCelda, copiarCuadrante, deleteSesion, copiarCelda, setSinClase, borrarSesionesDia,
  setMultiEnClase, moverMulti, getPlanificador, getPlantillas,
} from '@/actions';
import type { DatosCuadrante, ApuntadoMulti } from '@/app/actions/cuadrante';
import type { ApunteConCorreo } from '@/app/actions/fisica';
import { lunesDe, ETIQUETA_TIPO, type Sesion, type Plantilla } from '@/app/lib/sesiones';
import { sumaDias } from '@/app/lib/asistencia';
import {
  armaCuadrante, textoCuadrante, colorDeGrupo, nombrePila, etiquetaRango, tipoDeTitulo, leeHora, plazasSesion,
  fechasDelGrupo, tituloDia,
  type FilaCuadrante, type DiaCuadrante, type Cuadrante as CuadranteArmado, type GrupoCuadrante,
} from '@/app/lib/cuadrante';
import { entregaImagenCuadrante } from '@/app/components/fisica/cuadranteImagen';
import { Button, Card, EmptyState, Modal, SelectField, TextField, TEXT, cx } from '../../../ui';
import EditorSesion from './EditorSesion';

/**
 * EL CUADRANTE SEMANAL (reglas 96 y 97).
 *
 * La rejilla que Alphapol manda cada semana por WhatsApp, pero editable: una
 * columna por día y, dentro, un renglón por grupo con lo que toca y qué
 * profesor lo da. Solo CLASES DE GRUPO: los grupos con horario y Multi (un
 * grupo sin horario no sale). Se puede copiar de la semana anterior, bajar
 * como imagen (o compartirla desde el móvil) y copiar como texto.
 *
 * Un día (o un grupo un día) se QUITA sin tocar el horario fijo: festivo, no
 * hay profesor… Desaparece de la rejilla, de la imagen y del texto, y se
 * puede devolver desde «Sin clase esta semana». Un día suelto (solo existe por
 * una sesión de Multi) se quita borrando sus sesiones, con confirmación.
 *
 * Cada celda es una sesión del grupo (regla 86): lo que se escribe aquí se ve en
 * el calendario del alumno. El tipo (el color) sale del título.
 */

function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const clave = (classId: string, fecha: string) => `${classId}|${fecha}`;
const MOTIVOS = ['Festivo', 'Sin profesor'];
const HORAS_MULTI = ['18:30', '19:00', '10:00'];

type Edicion = { fila: FilaCuadrante; fecha: string; titulo: string };
type Detalle = { classId: string; fecha: string; sesionId: string; nombre: string };

/** Las plazas de una clase: las que da el servidor o, si nadie falta ni se ha apuntado, las del grupo. */
function plazasDe(datos: DatosCuadrante, g: GrupoCuadrante, fecha: string) {
  return datos.plazas[clave(g.id, fecha)] ?? plazasSesion(g.horario.capacity, g.inscritos, 0, 0);
}

export default function Cuadrante() {
  const [lunes, setLunes] = useState(() => lunesDe(hoyLocal()));
  const [datos, setDatos] = useState<DatosCuadrante | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [copia, setCopia] = useState<Edicion | null>(null);
  const [quitar, setQuitar] = useState<DiaCuadrante | null>(null);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async (l: string) => {
    setCargando(true);
    const res = await getCuadrante({ lunes: l });
    if (res.success) { setDatos(res.datos); setError(null); }
    else setError(res.error);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(lunes); }, [lunes, cargar]);

  const cuadrante = useMemo(
    () => (datos ? armaCuadrante({ lunes: datos.lunes, grupos: datos.grupos, sesiones: datos.sesiones, profesores: datos.profesores, sinClase: datos.sinClase }) : null),
    [datos],
  );
  const hayGrupos = !!datos?.grupos.some((g) => !g.esMulti);

  async function copiaAnterior() {
    setOcupado('copiar'); setError(null); setAviso(null);
    const res = await copiarCuadrante({ desde: sumaDias(lunes, -7), a: lunes });
    if (res.success) {
      setAviso(`Copiadas ${res.creadas} sesiones de la semana anterior${res.omitidas ? ` (${res.omitidas} ya estaban)` : ''}.`);
      await cargar(lunes);
    } else setError(res.error);
    setOcupado(null);
  }

  async function bajaImagen() {
    if (!cuadrante) return;
    setOcupado('imagen'); setError(null); setAviso(null);
    const r = await entregaImagenCuadrante(cuadrante, `cuadrante-${lunes}.png`);
    if (r === 'error') setError('No se ha podido crear la imagen.');
    else setAviso(r === 'descargada' ? 'Imagen descargada.' : 'Imagen lista para compartir.');
    setOcupado(null);
  }

  async function copiaTexto() {
    if (!cuadrante) return;
    setError(null); setAviso(null);
    try {
      await navigator.clipboard.writeText(textoCuadrante(cuadrante));
      setAviso('Texto copiado: pégalo en WhatsApp.');
    } catch {
      setError('Tu navegador no deja copiar. Prueba desde Chrome o Safari.');
    }
  }

  async function devolver(fecha: string, grupos: GrupoCuadrante[]) {
    setOcupado(`devolver-${fecha}`); setError(null); setAviso(null);
    const res = await setSinClase({ fecha, classIds: grupos.map((g) => g.id), sinClase: false });
    if (res.success) { setAviso('Día devuelto al cuadrante.'); await cargar(lunes); }
    else setError(res.error);
    setOcupado(null);
  }

  const fin = sumaDias(lunes, 6);
  const recargar = async (texto?: string) => { if (texto) setAviso(texto); await cargar(lunes); };

  return (
    <div className="space-y-4">
      <Card tone="base" pad="md" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => setLunes(sumaDias(lunes, -7))} aria-label="Semana anterior"
            className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300">
            <ChevronLeft size={20} />
          </button>
          <div className="text-center min-w-0">
            <p className={cx(TEXT.label, 'text-slate-500 dark:text-slate-400')}>Semana</p>
            <p className="font-black text-slate-900 dark:text-white text-sm sm:text-base">{mayuscula(etiquetaRango(lunes, fin))}</p>
            {lunes !== lunesDe(hoyLocal()) && (
              <button onClick={() => setLunes(lunesDe(hoyLocal()))} className="min-h-[44px] px-2 text-xs font-black text-indigo-600 dark:text-indigo-400">Ir a esta semana</button>
            )}
          </div>
          <button onClick={() => setLunes(sumaDias(lunes, 7))} aria-label="Semana siguiente"
            className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300">
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={ocupado === 'copiar' ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
            disabled={!hayGrupos || ocupado !== null} onClick={copiaAnterior}>Copiar semana anterior</Button>
          <Button size="sm" variant="secondary" icon={ocupado === 'imagen' ? <Loader2 size={14} className="animate-spin" /> : <ImagenIcono size={14} />}
            disabled={!cuadrante?.dias.length || ocupado !== null} onClick={bajaImagen}>Imagen para WhatsApp</Button>
          <Button size="sm" variant="secondary" icon={<MessageSquare size={14} />}
            disabled={!cuadrante?.dias.length} onClick={copiaTexto}>Copiar texto</Button>
        </div>
        {aviso && <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5"><Check size={14} /> {aviso}</p>}
        {error && <p className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p>}
      </Card>

      {cargando && !datos ? (
        <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
      ) : !hayGrupos ? (
        <EmptyState icon={<Users size={40} />} title="No hay grupos de física con horario"
          hint="Crea los grupos en la pestaña «Grupos» con el tipo «Físicas» y sus días de clase: aquí saldrán solos." bordered />
      ) : (
        <>
          {cuadrante && cuadrante.dias.length === 0 && (
            <p className={cx(TEXT.muted, 'text-center py-6')}>Esta semana no queda ningún día con clase.</p>
          )}
          <div className={cx('grid gap-3', cuadrante && cuadrante.dias.length > 2 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-2')}>
            {cuadrante?.dias.map((dia) => (
              <DiaCard key={dia.fecha} dia={dia} datos={datos!} hoy={datos!.hoy}
                onEdita={(fila) => setEdicion({ fila, fecha: dia.fecha, titulo: dia.titulo })}
                onQuitar={() => setQuitar(dia)} />
            ))}
          </div>

          {cuadrante && cuadrante.quitados.length > 0 && (
            <Card tone="sunken" pad="md" className="space-y-2">
              <p className={cx(TEXT.label, 'text-slate-500 dark:text-slate-400 flex items-center gap-1.5')}><CalendarX2 size={14} /> Sin clase esta semana</p>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {cuadrante.quitados.map((q) => (
                  <li key={q.fecha} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="min-w-0 text-sm text-slate-700 dark:text-slate-200">
                      <span className="font-black">{q.titulo}</span>
                      {' · '}{q.todos ? 'todo el día' : q.grupos.map((g) => g.corto).join(', ')}
                      {q.motivos.length > 0 && <span className="text-slate-500 dark:text-slate-400"> ({q.motivos.join(', ')})</span>}
                    </span>
                    <Button size="sm" variant="ghost" disabled={ocupado !== null} onClick={() => devolver(q.fecha, q.grupos)}
                      icon={ocupado === `devolver-${q.fecha}` ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}>
                      Devolver
                    </Button>
                  </li>
                ))}
              </ul>
              <p className={TEXT.muted}>No salen en la imagen ni en el texto. Los alumnos lo ven como «sin clase».</p>
            </Card>
          )}
        </>
      )}

      {edicion && datos && cuadrante && (
        <EditorCelda edicion={edicion} datos={datos} cuadrante={cuadrante} onClose={() => setEdicion(null)}
          onGuardado={async (texto) => { setEdicion(null); await recargar(texto); }}
          onCambio={() => recargar()}
          onCopiar={() => { setCopia(edicion); setEdicion(null); }}
          onDetalles={(d) => { setDetalle(d); setEdicion(null); }} />
      )}
      {copia && datos && (
        <CopiarCelda edicion={copia} datos={datos} onClose={() => setCopia(null)}
          onHecho={async (n) => { setCopia(null); await recargar(`Copiada a ${n} ${n === 1 ? 'celda' : 'celdas'}.`); }} />
      )}
      {quitar && datos && (
        <QuitarDia dia={quitar} onClose={() => setQuitar(null)}
          onHecho={async (texto) => { setQuitar(null); await recargar(texto); }} />
      )}
      {detalle && (
        <DetalleCelda detalle={detalle} onClose={() => setDetalle(null)} onCambio={() => recargar()} />
      )}
    </div>
  );
}

function DiaCard({ dia, datos, hoy, onEdita, onQuitar }: {
  dia: DiaCuadrante; datos: DatosCuadrante; hoy: string; onEdita: (f: FilaCuadrante) => void; onQuitar: () => void;
}) {
  return (
    <Card tone="base" pad="sm" className={cx('space-y-2', dia.fecha === hoy && 'ring-2 ring-oro')}>
      <div className="flex items-center justify-between gap-2 pl-1">
        <h4 className="font-black text-slate-900 dark:text-white text-sm tracking-tight">{dia.titulo}</h4>
        <button onClick={onQuitar} aria-label={`Quitar el ${dia.titulo.toLowerCase()}`}
          className="min-h-[44px] px-2 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-1">
          <CalendarX2 size={14} /> Quitar día
        </button>
      </div>
      {dia.filas.map((f) => {
        const col = colorDeGrupo(f.grupo.corto);
        const plazas = f.grupo.esMulti ? null : plazasDe(datos, f.grupo, dia.fecha);
        const multis = datos.multis[clave(f.grupo.id, dia.fecha)]?.length ?? 0;
        return (
          <div key={f.grupo.id} className="flex gap-1.5">
            <div className="w-[88px] shrink-0 rounded-xl flex items-center justify-center text-center font-black italic text-sm px-1"
              style={{ background: col.fondo, color: col.texto }}>
              {f.grupo.corto.toUpperCase()}
            </div>
            <button onClick={() => onEdita(f)}
              className={cx('flex-1 min-h-[56px] min-w-0 text-left rounded-xl border-2 px-3 py-2',
                f.sesion ? 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-700' : 'border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400',
                f.avisos.length > 0 && 'border-amber-400 dark:border-amber-500')}>
              {f.sesion ? (
                <>
                  <span className="flex items-center gap-1.5 font-black text-slate-900 dark:text-white text-sm leading-tight min-w-0">
                    <span className="truncate">{f.sesion.titulo}</span>
                    {f.horaRotulada && <span className="shrink-0 text-[10px] bg-amber-300 text-slate-900 rounded px-1.5 py-0.5">{f.horaRotulada} h</span>}
                    {f.extra && <span className="shrink-0 text-[10px] bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 rounded px-1.5 py-0.5">extra</span>}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                    {f.profesor ? nombrePila(f.profesor.nombre) : 'Sin profesor'}
                    {f.extras > 0 && ` · +${f.extras} más`}
                    {plazas && plazas.libres !== null && ` · ${plazas.libres} libres`}
                    {multis > 0 && ` · ${multis} multi`}
                  </span>
                  {f.avisos.map((a) => (
                    <span key={a} className="flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 mt-0.5">
                      <AlertTriangle size={12} className="shrink-0" /> {a}
                    </span>
                  ))}
                </>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-bold">
                  <Plus size={14} /> Añadir
                  {(plazas && plazas.libres !== null) || multis > 0 ? (
                    <span className="font-medium">· {plazas?.libres != null ? `${plazas.libres} libres` : ''}{multis > 0 ? `${plazas?.libres != null ? ' · ' : ''}${multis} multi` : ''}</span>
                  ) : null}
                </span>
              )}
            </button>
          </div>
        );
      })}
    </Card>
  );
}

// ── Una celda: qué toca, quién lo da, y quién va ──

function EditorCelda({ edicion, datos, cuadrante, onClose, onGuardado, onCambio, onCopiar, onDetalles }: {
  edicion: Edicion;
  datos: DatosCuadrante;
  cuadrante: CuadranteArmado;
  onClose: () => void;
  onGuardado: (texto?: string) => void | Promise<void>;
  onCambio: () => void | Promise<void>;
  onCopiar: () => void;
  onDetalles: (d: Detalle) => void;
}) {
  const { fila, fecha, titulo: tituloDia } = edicion;
  const s = fila.sesion;
  const esMulti = fila.grupo.esMulti;
  const [titulo, setTitulo] = useState(s?.titulo ?? '');
  const [profesorId, setProfesorId] = useState(s?.profesorId ?? '');
  const [hora, setHora] = useState(s?.horaPropia ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinClase, setSinClaseAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');

  const q = titulo.trim().toLowerCase();
  const sugeridos = useMemo(
    () => datos.titulos.filter((t) => t.toLowerCase() !== q && (!q || t.toLowerCase().includes(q))).slice(0, 8),
    [datos.titulos, q],
  );
  const horaLeida = leeHora(hora);
  const tipo = titulo.trim() ? tipoDeTitulo(titulo) : null;
  const cambiado = titulo !== (s?.titulo ?? '') || profesorId !== (s?.profesorId ?? '') || (esMulti && hora !== (s?.horaPropia ?? ''));

  async function guarda() {
    setGuardando(true); setError(null);
    const res = await saveCelda({
      classId: fila.grupo.id, fecha,
      // La hora propia solo se escribe en Multi; en el resto se deja la que hubiera.
      celda: { titulo, profesorId: profesorId || null, horaPropia: esMulti ? hora || null : s?.horaPropia ?? null },
    });
    if (res.success) await onGuardado();
    else { setError(res.error); setGuardando(false); }
  }

  async function quita() {
    if (!s || !confirm(`¿Quitar «${s.titulo}» de ${fila.grupo.corto} el ${tituloDia.toLowerCase()}? Se pierde también lo que hayan apuntado los alumnos.`)) return;
    setGuardando(true); setError(null);
    const res = await deleteSesion({ id: s.id });
    if (res.success) await onGuardado('Sesión quitada.');
    else { setError(res.error ?? 'No se ha podido quitar.'); setGuardando(false); }
  }

  async function marcaSinClase() {
    setGuardando(true); setError(null);
    const res = await setSinClase({ fecha, classIds: [fila.grupo.id], sinClase: true, motivo: motivo || null });
    if (res.success) await onGuardado(`${fila.grupo.corto} sin clase el ${tituloDia.toLowerCase()}.`);
    else { setError(res.error); setGuardando(false); }
  }

  return (
    <Modal title={`${fila.grupo.corto} · ${tituloDia}`}
      subtitle={esMulti ? 'Multi: sesión propia, con su hora' : fila.grupo.horario.startTime ? `Clase a las ${fila.grupo.horario.startTime}` : undefined}
      onClose={onClose} width="sm"
      footer={
        <div className="flex gap-2 w-full">
          {s && <Button variant="ghost" icon={<Trash2 size={14} />} disabled={guardando} onClick={quita}>Quitar</Button>}
          <div className="flex-1" />
          <Button variant="secondary" disabled={guardando} onClick={onClose}>Cancelar</Button>
          <Button disabled={guardando || !titulo.trim() || !cambiado || (esMulti && !!hora.trim() && !horaLeida)} onClick={guarda}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      }>
      <div className="space-y-4">
        <div className="space-y-2">
          <TextField label="Qué toca" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} placeholder="FLK 5.0, Boxeo, F.M + RDL…" />
          {sugeridos.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Títulos ya usados">
              {sugeridos.map((t) => (
                <button key={t} type="button" onClick={() => setTitulo(t)}
                  className="min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-indigo-400">
                  {t}
                </button>
              ))}
            </div>
          )}
          {tipo && (
            <p className={TEXT.muted}>
              {tipo === 'otro'
                ? 'En el calendario del alumno sale en gris: por el título no se sabe si es fuerza, carrera…'
                : `En el calendario del alumno sale como ${ETIQUETA_TIPO[tipo].toLowerCase()}, por el título.`}
            </p>
          )}
        </div>

        <SelectField label="Profesor" value={profesorId} onChange={(e) => setProfesorId(e.target.value)}>
          <option value="">Sin asignar</option>
          {datos.profesores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </SelectField>

        {esMulti && (
          <div className="space-y-2">
            <TextField label="Hora" inputMode="numeric" autoComplete="off" value={hora} onChange={(e) => setHora(e.target.value)}
              placeholder="18:30" hint={hora.trim() ? (horaLeida ? `Se guardará como ${horaLeida}` : 'Escríbela como 18:30') : 'Como 18:30 o 1830'} />
            <div className="flex flex-wrap gap-1.5">
              {HORAS_MULTI.map((h) => (
                <button key={h} type="button" onClick={() => setHora(h)} aria-pressed={horaLeida === h}
                  className={cx('min-h-[44px] px-3 rounded-xl border text-xs font-black tabular-nums',
                    horaLeida === h ? 'border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200')}>
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}

        {s && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<Copy size={14} />} disabled={guardando || cambiado} onClick={onCopiar}>Copiar a…</Button>
            <Button size="sm" variant="secondary" icon={<FileText size={14} />} disabled={guardando || cambiado}
              onClick={() => onDetalles({ classId: fila.grupo.id, fecha, sesionId: s.id, nombre: fila.grupo.nombre })}>
              Descripción y cargas
            </Button>
          </div>
        )}
        {s && cambiado && <p className={TEXT.muted}>Guarda antes de copiar o de abrir el detalle.</p>}

        {!esMulti && (
          <Asistentes datos={datos} cuadrante={cuadrante} grupo={fila.grupo} fecha={fecha} onCambio={onCambio} />
        )}

        <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
          {!sinClase ? (
            <Button size="sm" variant="ghost" icon={<CalendarX2 size={14} />} disabled={guardando} onClick={() => setSinClaseAbierto(true)}>
              Este día {fila.grupo.corto} no tiene clase
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">¿Por qué no hay clase?</p>
              <div className="flex flex-wrap gap-1.5">
                {MOTIVOS.map((m) => (
                  <button key={m} type="button" onClick={() => setMotivo(m)} aria-pressed={motivo === m}
                    className={cx('min-h-[44px] px-3 rounded-xl border text-xs font-bold',
                      motivo === m ? 'border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200')}>
                    {m}
                  </button>
                ))}
              </div>
              <TextField label="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={120} placeholder="Festivo, sin profesor…" />
              <p className={TEXT.muted}>Sale de la imagen y del texto, y sus alumnos lo ven como «sin clase». El horario fijo no cambia.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="danger" disabled={guardando} onClick={marcaSinClase}>Quitar la clase de este día</Button>
                <Button size="sm" variant="ghost" onClick={() => setSinClaseAbierto(false)}>No</Button>
              </div>
            </div>
          )}
        </div>
        {error && <p className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p>}
      </div>
    </Modal>
  );
}

/**
 * Quién va a una clase y cuántas plazas quedan (regla 97): los del grupo menos
 * los que avisaron de que faltan, más los de Multi. El preparador apunta,
 * cambia de clase o quita a un multi; si la clase está llena, se le pregunta.
 */
function Asistentes({ datos, cuadrante, grupo, fecha, onCambio }: {
  datos: DatosCuadrante; cuadrante: CuadranteArmado; grupo: GrupoCuadrante; fecha: string; onCambio: () => void | Promise<void>;
}) {
  const k = clave(grupo.id, fecha);
  const plazas = plazasDe(datos, grupo, fecha);
  const multis = datos.multis[k] ?? [];
  const faltan = datos.faltan[k] ?? [];
  const libresMultis = datos.alumnosMulti.filter((a) => !multis.some((m) => m.userId === a.userId));
  const [nuevo, setNuevo] = useState('');
  const [moviendo, setMoviendo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Las otras clases de la semana a las que se puede llevar a un multi.
  const destinos = useMemo(() => cuadrante.dias.flatMap((d) => d.filas
    .filter((f) => !f.grupo.esMulti && !f.extra && !(f.grupo.id === grupo.id && d.fecha === fecha))
    .map((f) => ({ valor: clave(f.grupo.id, d.fecha), etiqueta: `${d.titulo} · ${f.grupo.corto}${f.hora ? ` ${f.hora}` : ''}` }))), [cuadrante, grupo.id, fecha]);

  async function haz(que: string, fn: (forzar: boolean) => Promise<{ success: boolean; error?: string; completa?: boolean }>) {
    setOcupado(que); setError(null);
    let r = await fn(false);
    if (!r.success && r.completa && confirm('Esa clase está completa. ¿Lo apunto igualmente, por encima del aforo?')) r = await fn(true);
    if (!r.success && !(r.completa)) setError(r.error ?? 'No se ha podido.');
    setOcupado(null);
    if (r.success) { setNuevo(''); setMoviendo(null); await onCambio(); }
  }

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
      <p className={cx(TEXT.label, 'text-slate-500 dark:text-slate-400 flex items-center gap-1.5')}><Users size={14} /> Quién va</p>
      <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
        {plazas.aforo === null
          ? `Sin aforo puesto. Van ${plazas.asisten}.`
          : <>Van <b>{plazas.asisten}</b> de {plazas.aforo}: {plazas.inscritos} del grupo{plazas.faltan ? ` − ${plazas.faltan} que ${plazas.faltan === 1 ? 'falta' : 'faltan'}` : ''}{multis.length ? ` + ${multis.length} de Multi` : ''}. {plazas.libres !== null && plazas.libres >= 0 ? <b>Quedan {plazas.libres}.</b> : <b className="text-red-700 dark:text-red-300">{-(plazas.libres ?? 0)} por encima del aforo.</b>}</>}
      </p>
      {faltan.length > 0 && (
        <p className={cx(TEXT.muted, 'break-words')}>Avisaron de que faltan: {faltan.map((f) => f.email).join(', ')}</p>
      )}
      {multis.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {multis.map((m) => (
            <li key={m.userId} className="py-1.5 space-y-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex-1 min-w-0 truncate text-sm text-slate-700 dark:text-slate-200">{m.email}</span>
                <button onClick={() => setMoviendo(moviendo === m.userId ? null : m.userId)} aria-label={`Cambiar de clase a ${m.email}`}
                  className="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30">
                  <ArrowRightLeft size={15} />
                </button>
                <button disabled={ocupado !== null} aria-label={`Quitar a ${m.email} de esta clase`}
                  onClick={() => haz(`q-${m.userId}`, () => setMultiEnClase({ alumnoId: m.userId, classId: grupo.id, fecha, unir: false }))}
                  className="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-slate-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20">
                  {ocupado === `q-${m.userId}` ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                </button>
              </div>
              {moviendo === m.userId && (
                <MoverA destinos={destinos} ocupado={ocupado !== null} onMover={(destino) => {
                  const [classId, f] = destino.split('|');
                  return haz(`m-${m.userId}`, (forzar) => moverMulti({ alumnoId: m.userId, de: { classId: grupo.id, fecha }, a: { classId, fecha: f }, forzar }));
                }} />
              )}
            </li>
          ))}
        </ul>
      )}
      {libresMultis.length > 0 && (
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <SelectField label="Apuntar a alguien de Multi" value={nuevo} onChange={(e) => setNuevo(e.target.value)}>
              <option value="">— Elegir —</option>
              {libresMultis.map((a: ApuntadoMulti) => <option key={a.userId} value={a.userId}>{a.email}</option>)}
            </SelectField>
          </div>
          <Button size="sm" disabled={!nuevo || ocupado !== null} icon={ocupado === 'nuevo' ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            onClick={() => haz('nuevo', (forzar) => setMultiEnClase({ alumnoId: nuevo, classId: grupo.id, fecha, unir: true, forzar }))}>
            Apuntar
          </Button>
        </div>
      )}
      {error && <p className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p>}
    </div>
  );
}

function MoverA({ destinos, ocupado, onMover }: { destinos: { valor: string; etiqueta: string }[]; ocupado: boolean; onMover: (d: string) => void | Promise<void> }) {
  const [destino, setDestino] = useState('');
  if (!destinos.length) return <p className={TEXT.muted}>No hay otra clase esta semana a la que llevarlo.</p>;
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1 min-w-0">
        <SelectField label="Llevarlo a" value={destino} onChange={(e) => setDestino(e.target.value)}>
          <option value="">— Elegir clase —</option>
          {destinos.map((d) => <option key={d.valor} value={d.valor}>{d.etiqueta}</option>)}
        </SelectField>
      </div>
      <Button size="sm" variant="secondary" disabled={!destino || ocupado} onClick={() => onMover(destino)}>Cambiar</Button>
    </div>
  );
}

// ── Copiar una celda a otros días u otros grupos ──

function CopiarCelda({ edicion, datos, onClose, onHecho }: {
  edicion: Edicion; datos: DatosCuadrante; onClose: () => void; onHecho: (n: number) => void | Promise<void>;
}) {
  const { fila, fecha } = edicion;
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [conProfesor, setConProfesor] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quitados = useMemo(() => new Set(datos.sinClase.map((d) => clave(d.classId, d.fecha))), [datos.sinClase]);

  // Esta semana y la siguiente: cada día con los grupos que tienen clase (y Multi).
  const semanas = useMemo(() => [datos.lunes, sumaDias(datos.lunes, 7)].map((l) => {
    const fijos = datos.grupos.filter((g) => !g.esMulti);
    const multis = datos.grupos.filter((g) => g.esMulti);
    const fechas = [...new Set(fijos.flatMap((g) => fechasDelGrupo(g, l)))].sort();
    return {
      lunes: l,
      dias: fechas.map((f) => ({
        fecha: f,
        grupos: [...fijos.filter((g) => fechasDelGrupo(g, l).includes(f)), ...multis]
          .filter((g) => !(g.id === fila.grupo.id && f === fecha) && !quitados.has(clave(g.id, f))),
      })).filter((d) => d.grupos.length),
    };
  }), [datos, fila.grupo.id, fecha, quitados]);

  const alterna = (k: string) => setElegidos((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  async function copia() {
    if (!fila.sesion) return;
    setGuardando(true); setError(null);
    const destinos = [...elegidos].map((k) => { const [classId, f] = k.split('|'); return { classId, fecha: f }; });
    const res = await copiarCelda({ origenId: fila.sesion.id, destinos, conProfesor });
    if (res.success) await onHecho(res.copiadas);
    else { setError(res.error); setGuardando(false); }
  }

  return (
    <Modal title={`Copiar «${fila.sesion?.titulo ?? ''}»`} subtitle={`De ${fila.grupo.corto}, ${edicion.titulo.toLowerCase()}`} onClose={onClose} width="md"
      footer={
        <div className="flex gap-2 w-full">
          <div className="flex-1" />
          <Button variant="secondary" disabled={guardando} onClick={onClose}>Cancelar</Button>
          <Button disabled={guardando || !elegidos.size} onClick={copia}>{guardando ? 'Copiando…' : `Copiar${elegidos.size ? ` a ${elegidos.size}` : ''}`}</Button>
        </div>
      }>
      <div className="space-y-4">
        <p className={TEXT.muted}>Elige a qué celdas. Si ya tienen algo, se cambia por esto.</p>
        {semanas.map((sem, i) => (
          <div key={sem.lunes} className="space-y-2">
            <p className={cx(TEXT.label, 'text-slate-500 dark:text-slate-400')}>{i === 0 ? 'Esta semana' : 'La semana siguiente'}</p>
            {sem.dias.map((d) => (
              <div key={d.fecha}>
                <p className="text-xs font-black text-slate-800 dark:text-slate-100 mb-1">{tituloDia(d.fecha)}</p>
                <div className="flex flex-wrap gap-1.5">
                  {d.grupos.map((g) => {
                    const k = clave(g.id, d.fecha);
                    const si = elegidos.has(k);
                    return (
                      <button key={k} type="button" onClick={() => alterna(k)} aria-pressed={si}
                        className={cx('min-h-[44px] px-3 rounded-xl border-2 text-xs font-black flex items-center gap-1',
                          si ? 'border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200')}>
                        {si && <Check size={12} />}{g.corto}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
        <label className="flex items-center gap-3 min-h-[44px] text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" className="w-5 h-5" checked={conProfesor} onChange={(e) => setConProfesor(e.target.checked)} />
          Con el mismo profesor{fila.profesor ? ` (${nombrePila(fila.profesor.nombre)})` : ''}
        </label>
        {error && <p className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p>}
      </div>
    </Modal>
  );
}

// ── Quitar un día entero ──

function QuitarDia({ dia, onClose, onHecho }: { dia: DiaCuadrante; onClose: () => void; onHecho: (texto: string) => void | Promise<void> }) {
  // Los grupos que tienen clase ese día; Multi, solo si tiene sesión.
  const grupos = dia.filas.filter((f) => !f.grupo.esMulti || f.sesion).map((f) => f.grupo);
  const sueltas = dia.filas.filter((f) => f.sesion).map((f) => ({ id: f.sesion!.id, texto: `${f.grupo.corto} · ${f.sesion!.titulo}` }));
  const [elegidos, setElegidos] = useState<Set<string>>(() => new Set(grupos.map((g) => g.id)));
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function quita() {
    setGuardando(true); setError(null);
    if (dia.suelto) {
      const res = await borrarSesionesDia({ fecha: dia.fecha, ids: sueltas.map((x) => x.id) });
      if (res.success) await onHecho(`${dia.titulo}: ${res.borradas} ${res.borradas === 1 ? 'sesión borrada' : 'sesiones borradas'}.`);
      else { setError(res.error); setGuardando(false); }
      return;
    }
    const res = await setSinClase({ fecha: dia.fecha, classIds: [...elegidos], sinClase: true, motivo: motivo || null });
    if (res.success) await onHecho(`${dia.titulo}: sin clase.`);
    else { setError(res.error); setGuardando(false); }
  }

  return (
    <Modal title={`Quitar el ${dia.titulo.toLowerCase()}`} onClose={onClose} width="sm"
      subtitle={dia.suelto ? 'Es un día suelto: no es de ningún horario fijo' : 'El horario fijo de los grupos no cambia'}
      footer={
        <div className="flex gap-2 w-full">
          <div className="flex-1" />
          <Button variant="secondary" disabled={guardando} onClick={onClose}>Cancelar</Button>
          <Button variant="danger" disabled={guardando || (dia.suelto ? !sueltas.length : !elegidos.size)} onClick={quita}>
            {guardando ? 'Quitando…' : dia.suelto ? `Borrar ${sueltas.length === 1 ? 'la sesión' : `las ${sueltas.length} sesiones`}` : 'Quitar'}
          </Button>
        </div>
      }>
      {dia.suelto ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-700 dark:text-slate-200">Se borran estas sesiones, y con ellas lo que hayan apuntado los alumnos:</p>
          <ul className="text-sm font-bold text-slate-900 dark:text-white list-disc pl-5">{sueltas.map((x) => <li key={x.id}>{x.texto}</li>)}</ul>
        </div>
      ) : (
        <div className="space-y-3">
          <p className={TEXT.muted}>Lo quitado sale de la imagen y del texto, y sus alumnos lo ven como «sin clase». Lo que ya estuviera escrito no se borra: vuelve si lo devuelves.</p>
          <div className="flex flex-wrap gap-1.5">
            {grupos.map((g) => {
              const si = elegidos.has(g.id);
              return (
                <button key={g.id} type="button" aria-pressed={si}
                  onClick={() => setElegidos((prev) => { const n = new Set(prev); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })}
                  className={cx('min-h-[44px] px-3 rounded-xl border-2 text-xs font-black flex items-center gap-1',
                    si ? 'border-red-500 bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400')}>
                  {si && <Check size={12} />}{g.corto}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MOTIVOS.map((m) => (
              <button key={m} type="button" onClick={() => setMotivo(m)} aria-pressed={motivo === m}
                className={cx('min-h-[44px] px-3 rounded-xl border text-xs font-bold',
                  motivo === m ? 'border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200')}>
                {m}
              </button>
            ))}
          </div>
          <TextField label="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={120} placeholder="Festivo, sin profesor…" />
        </div>
      )}
      {error && <p className="text-xs font-medium text-red-700 dark:text-red-300 mt-2">{error}</p>}
    </Modal>
  );
}

// ── El detalle de la sesión de una celda: descripción, cargas en % y feedback ──

function DetalleCelda({ detalle, onClose, onCambio }: { detalle: Detalle; onClose: () => void; onCambio: () => void }) {
  const [datos, setDatos] = useState<{ sesion: Sesion; apuntes: ApunteConCorreo[]; miembros: { id: string; email: string }[]; hoy: string; plantillas: Plantilla[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const destino = { tipo: 'grupo' as const, id: detalle.classId };
      const [r, p] = await Promise.all([getPlanificador({ destino, desde: detalle.fecha, hasta: detalle.fecha }), getPlantillas()]);
      if (!r.success) { setError(r.error); return; }
      const sesion = r.sesiones.find((x) => x.id === detalle.sesionId);
      if (!sesion) { setError('No se ha encontrado la sesión.'); return; }
      setDatos({ sesion, apuntes: r.apuntes, miembros: r.miembros, hoy: r.hoy, plantillas: p.success ? p.plantillas : [] });
    })();
  }, [detalle]);

  if (error) {
    return <Modal title="Descripción y cargas" onClose={onClose} width="sm"><p className="text-sm text-red-700 dark:text-red-300">{error}</p></Modal>;
  }
  if (!datos) {
    return <Modal title="Descripción y cargas" onClose={onClose} width="sm"><div className="py-8 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div></Modal>;
  }
  return (
    <EditorSesion
      destino={{ tipo: 'grupo', id: detalle.classId }}
      fecha={detalle.fecha}
      sesion={datos.sesion}
      plantillas={datos.plantillas}
      apuntes={datos.apuntes}
      miembros={datos.miembros}
      hoy={datos.hoy}
      rm={null}
      nombreGrupo={detalle.nombre}
      onCerrar={onClose}
      onCambio={onCambio}
    />
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Copy, Image as ImagenIcono, MessageSquare, Plus, AlertTriangle, Users, Loader2, Trash2, Check,
} from 'lucide-react';
import { getCuadrante, saveCelda, copiarCuadrante, deleteSesion } from '@/actions';
import type { DatosCuadrante } from '@/app/actions/cuadrante';
import { lunesDe, ETIQUETA_TIPO, TIPOS_SESION } from '@/app/lib/sesiones';
import { sumaDias } from '@/app/lib/asistencia';
import {
  armaCuadrante, textoCuadrante, colorDeGrupo, nombrePila, etiquetaRango,
  type FilaCuadrante, type DiaCuadrante,
} from '@/app/lib/cuadrante';
import { entregaImagenCuadrante } from '@/app/components/fisica/cuadranteImagen';
import { Button, Card, EmptyState, Modal, SelectField, TextField, TEXT, cx } from '../../../ui';

/**
 * EL CUADRANTE SEMANAL (regla 96).
 *
 * La rejilla que Alphapol manda cada semana por WhatsApp, pero editable: una
 * columna por día y, dentro, un renglón por grupo con lo que toca y qué
 * profesor lo da. Se puede copiar de la semana anterior, bajar como imagen
 * (o compartirla desde el móvil) y copiar como texto para WhatsApp.
 *
 * Cada celda es una sesión del grupo (regla 86): lo que se escribe aquí se ve en
 * el calendario del alumno y en el planificador. Los multidisciplinares se
 * apuntan solos a las sesiones de los grupos; aquí se ve cuántos van a cada una.
 */

function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

type Edicion = { fila: FilaCuadrante; fecha: string; titulo: string };

export default function Cuadrante() {
  const [lunes, setLunes] = useState(() => lunesDe(hoyLocal()));
  const [datos, setDatos] = useState<DatosCuadrante | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
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
    () => (datos ? armaCuadrante({ lunes: datos.lunes, grupos: datos.grupos, sesiones: datos.sesiones, profesores: datos.profesores }) : null),
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

  const fin = sumaDias(lunes, 6);

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
              <button onClick={() => setLunes(lunesDe(hoyLocal()))} className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 mt-0.5">Ir a esta semana</button>
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
        <EmptyState icon={<Users size={40} />} title="No hay grupos de física"
          hint="Crea los grupos en la pestaña «Grupos» con el tipo «Físicas» y su horario: aquí saldrán solos." bordered />
      ) : (
        <div className={cx('grid gap-3', cuadrante && cuadrante.dias.length > 2 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-2')}>
          {cuadrante?.dias.map((dia) => (
            <DiaCard key={dia.fecha} dia={dia} datos={datos!} hoy={datos!.hoy}
              onEdita={(fila) => setEdicion({ fila, fecha: dia.fecha, titulo: dia.titulo })} />
          ))}
        </div>
      )}

      {edicion && datos && (
        <EditorCelda edicion={edicion} datos={datos} onClose={() => setEdicion(null)}
          onGuardado={async () => { setEdicion(null); await cargar(lunes); }} />
      )}
    </div>
  );
}

function DiaCard({ dia, datos, hoy, onEdita }: { dia: DiaCuadrante; datos: DatosCuadrante; hoy: string; onEdita: (f: FilaCuadrante) => void }) {
  return (
    <Card tone="base" pad="sm" className={cx('space-y-2', dia.fecha === hoy && 'ring-2 ring-oro')}>
      <h4 className="font-black text-slate-900 dark:text-white text-sm tracking-tight px-1">{dia.titulo}</h4>
      {dia.filas.map((f) => {
        const col = colorDeGrupo(f.grupo.corto);
        const plazas = datos.plazas[`${f.grupo.id}|${dia.fecha}`];
        const multis = datos.multis[`${f.grupo.id}|${dia.fecha}`]?.length ?? 0;
        return (
          <div key={f.grupo.id} className="flex gap-1.5">
            <div className="w-[88px] shrink-0 rounded-xl flex items-center justify-center text-center font-black italic text-sm px-1"
              style={{ background: col.fondo, color: col.texto }}>
              {f.grupo.corto.toUpperCase()}
            </div>
            <button onClick={() => onEdita(f)}
              className={cx('flex-1 min-h-[56px] min-w-0 text-left rounded-xl border-2 px-3 py-2',
                f.sesion ? 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-700' : 'border-dashed border-slate-300 dark:border-slate-700 text-slate-400',
                f.avisos.length > 0 && 'border-amber-400 dark:border-amber-500')}>
              {f.sesion ? (
                <>
                  <span className="flex items-center gap-1.5 font-black text-slate-900 dark:text-white text-sm leading-tight truncate">
                    {f.sesion.titulo}
                    {f.horaRotulada && <span className="shrink-0 text-[10px] bg-amber-300 text-slate-900 rounded px-1.5 py-0.5">{f.horaRotulada} h</span>}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                    {f.profesor ? nombrePila(f.profesor.nombre) : 'Sin profesor'}
                    {f.extras > 0 && ` · +${f.extras} más`}
                    {!f.grupo.esMulti && plazas && plazas.libres !== null && ` · ${plazas.libres} libres`}
                    {multis > 0 && ` · ${multis} multi`}
                  </span>
                  {f.avisos.map((a) => (
                    <span key={a} className="flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 mt-0.5">
                      <AlertTriangle size={12} className="shrink-0" /> {a}
                    </span>
                  ))}
                  {f.fueraDeHorario && <span className="block text-[11px] text-amber-700 dark:text-amber-400">Día sin clase en su horario</span>}
                </>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-bold"><Plus size={14} /> Añadir</span>
              )}
            </button>
          </div>
        );
      })}
    </Card>
  );
}

function EditorCelda({ edicion, datos, onClose, onGuardado }: {
  edicion: Edicion; datos: DatosCuadrante; onClose: () => void; onGuardado: () => void | Promise<void>;
}) {
  const { fila, fecha, titulo: tituloDia } = edicion;
  const s = fila.sesion;
  const [titulo, setTitulo] = useState(s?.titulo ?? '');
  const [tipo, setTipo] = useState<string>(s?.tipo ?? 'otro');
  const [profesorId, setProfesorId] = useState(s?.profesorId ?? '');
  const [horaPropia, setHoraPropia] = useState(s?.horaPropia ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const multis = datos.multis[`${fila.grupo.id}|${fecha}`] ?? [];
  const plazas = datos.plazas[`${fila.grupo.id}|${fecha}`];

  // Los títulos que ya se han usado esta semana: lo más rápido es repetir.
  const sugeridos = useMemo(() => [...new Set(datos.sesiones.map((x) => x.titulo))].sort((a, b) => a.localeCompare(b, 'es')), [datos.sesiones]);

  async function guarda() {
    setGuardando(true); setError(null);
    const res = await saveCelda({ classId: fila.grupo.id, fecha, celda: { titulo, tipo, profesorId: profesorId || null, horaPropia: horaPropia || null } });
    if (res.success) await onGuardado();
    else { setError(res.error); setGuardando(false); }
  }

  async function quita() {
    if (!s) return;
    setGuardando(true); setError(null);
    const res = await deleteSesion({ id: s.id });
    if (res.success) await onGuardado();
    else { setError(res.error ?? 'No se ha podido quitar.'); setGuardando(false); }
  }

  return (
    <Modal title={`${fila.grupo.corto} · ${tituloDia}`} subtitle={fila.grupo.horario.startTime ? `Hora del grupo: ${fila.grupo.horario.startTime}` : undefined}
      onClose={onClose} width="sm"
      footer={
        <div className="flex gap-2 w-full">
          {s && <Button variant="ghost" icon={<Trash2 size={14} />} disabled={guardando} onClick={quita}>Quitar</Button>}
          <div className="flex-1" />
          <Button variant="secondary" disabled={guardando} onClick={onClose}>Cancelar</Button>
          <Button disabled={guardando || !titulo.trim()} onClick={guarda}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
        </div>
      }>
      <div className="space-y-4">
        <TextField label="Qué toca" list="titulos-cuadrante" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} placeholder="FLK 5.0, Boxeo, F.M + RDL…" />
        <datalist id="titulos-cuadrante">{sugeridos.map((t) => <option key={t} value={t} />)}</datalist>
        <SelectField label="Profesor" value={profesorId} onChange={(e) => setProfesorId(e.target.value)}>
          <option value="">Sin asignar</option>
          {datos.profesores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </SelectField>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_SESION.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>)}
          </SelectField>
          <TextField label="Hora propia" type="time" value={horaPropia} onChange={(e) => setHoraPropia(e.target.value)} hint="Solo si no es la del grupo" />
        </div>
        {!fila.grupo.esMulti && plazas && (
          <p className={cx(TEXT.muted, 'leading-relaxed')}>
            {plazas.aforo === null ? 'Sin aforo puesto.' : `Aforo ${plazas.aforo}: van ${plazas.asisten}, quedan ${plazas.libres}.`}
          </p>
        )}
        {multis.length > 0 && (
          <div>
            <p className={cx(TEXT.label, 'text-slate-500 dark:text-slate-400 mb-1')}>Multis apuntados ({multis.length})</p>
            <ul className="text-sm text-slate-700 dark:text-slate-200 space-y-0.5">
              {multis.map((m) => <li key={m.userId} className="truncate">{m.email}</li>)}
            </ul>
          </div>
        )}
        {error && <p className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p>}
      </div>
    </Modal>
  );
}

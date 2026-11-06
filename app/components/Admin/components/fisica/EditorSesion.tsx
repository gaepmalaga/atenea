'use client';

import { useState } from 'react';
import { Loader2, Save, Trash2, Copy, BookmarkPlus, Check, X, MessageSquare, Plus, Weight } from 'lucide-react';
import { saveSesion, deleteSesion, moverSesion, savePlantilla, responderApunte } from '@/actions';
import {
  TIPOS_SESION, ETIQUETA_TIPO, estadoSesion, etiquetaDia, formateaMinutos, formateaKm,
  type Destino, type Sesion, type Plantilla, type TipoSesion,
} from '@/app/lib/sesiones';
import type { ApunteConCorreo, RMVigente } from '@/app/actions/fisica';
import { EJERCICIOS_FUERZA, claveEjercicio, kgDeCarga, formateaKg, type Carga } from '@/app/lib/rm';
import { ESTILO_TIPO } from '@/app/components/fisica/estiloTipo';
import { Modal, Button, TextField, TextAreaField, SelectField, TEXT, cx } from '../../../ui';

/**
 * CREAR O CAMBIAR UNA SESIÓN (regla 86).
 *
 * Lo mismo que pide la herramienta que usaba el preparador: tipo, título, una
 * descripción escrita a su manera —cada línea como él la escriba—, y si quiere
 * duración, distancia y un vídeo. Puede partir de una plantilla, guardar la
 * sesión como plantilla, duplicarla o borrarla. En la pestaña «Feedback» ve lo
 * que ha apuntado cada alumno y le contesta.
 */
export default function EditorSesion({
  destino, fecha: fechaInicial, sesion, plantillas, apuntes, miembros, hoy, nombreGrupo, rm, onCerrar, onCambio,
}: {
  destino: Destino;
  fecha: string;
  sesion: Sesion | null;
  plantillas: Plantilla[];
  apuntes: ApunteConCorreo[];
  miembros: { id: string; email: string }[];
  hoy: string;
  /** Si la sesión es de un grupo y se está mirando desde un alumno: solo lectura. */
  nombreGrupo: string | null;
  /** El 1RM del alumno, si se planifica para uno: para ver sus kilos (regla 87). */
  rm: RMVigente | null;
  onCerrar: () => void;
  onCambio: () => void;
}) {
  const soloLectura = !!sesion && destino.tipo === 'alumno' && !!sesion.classId;
  const [pestaña, setPestaña] = useState<'sesion' | 'feedback'>('sesion');
  const [kind, setKind] = useState<TipoSesion>(sesion?.kind ?? 'fuerza');
  const [title, setTitle] = useState(sesion?.title ?? '');
  const [description, setDescription] = useState(sesion?.description ?? '');
  const [fecha, setFecha] = useState(sesion?.fecha ?? fechaInicial);
  const [durationMin, setDurationMin] = useState(sesion?.durationMin != null ? String(sesion.durationMin) : '');
  const [distanceKm, setDistanceKm] = useState(sesion?.distanceKm != null ? String(sesion.distanceKm).replace('.', ',') : '');
  const [video, setVideo] = useState(sesion?.video ?? '');
  const [cargas, setCargas] = useState<FilaCarga[]>(() => (sesion?.cargas ?? []).map(aFila));
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const contenido = { kind, title, description, durationMin, distanceKm, video, cargas };

  function desdePlantilla(id: string) {
    const p = plantillas.find((x) => x.id === id);
    if (!p) return;
    setKind(p.kind);
    setTitle(p.title);
    setDescription(p.description ?? '');
    setDurationMin(p.durationMin != null ? String(p.durationMin) : '');
    setDistanceKm(p.distanceKm != null ? String(p.distanceKm).replace('.', ',') : '');
    setVideo(p.video ?? '');
    setCargas(p.cargas.map(aFila));
  }

  async function haz(que: string, fn: () => Promise<{ success: boolean; error?: string }>, cerrar = true) {
    setOcupado(que);
    setError(null);
    setAviso(null);
    const r = await fn();
    setOcupado(null);
    if (!r.success) { setError(r.error ?? 'No se ha podido guardar.'); return false; }
    onCambio();
    if (cerrar) onCerrar();
    return true;
  }

  const apuntesDe = new Map(apuntes.filter((a) => a.sessionId === sesion?.id).map((a) => [a.userId, a]));
  const hechas = [...apuntesDe.values()].filter((a) => a.status === 'hecha').length;

  return (
    <Modal
      title={sesion ? (soloLectura ? sesion.title : 'Sesión') : 'Nueva sesión'}
      subtitle={`${etiquetaDia(fecha)}${nombreGrupo ? ` · ${nombreGrupo}` : ''}`}
      onClose={onCerrar}
      width="md"
      footer={pestaña === 'sesion' && !soloLectura ? (
        <div className="flex flex-wrap items-center gap-2 w-full">
          <Button onClick={() => haz('guardar', () => saveSesion({ id: sesion?.id ?? null, destino, fecha, contenido }))} disabled={!!ocupado}>
            {ocupado === 'guardar' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar
          </Button>
          <Button variant="secondary" disabled={!!ocupado}
            onClick={async () => { if (await haz('plantilla', () => savePlantilla({ contenido }), false)) setAviso('Guardada en la biblioteca.'); }}>
            <BookmarkPlus size={16} /> Guardar como plantilla
          </Button>
          {sesion && (
            <>
              <Button variant="ghost" disabled={!!ocupado} onClick={() => haz('duplicar', () => moverSesion({ id: sesion.id, fecha: sesion.fecha, copiar: true }))}>
                <Copy size={16} /> Duplicar
              </Button>
              <Button variant="danger" disabled={!!ocupado} className="sm:ml-auto"
                onClick={() => { if (confirm('¿Borrar esta sesión? Se pierde también lo que hayan apuntado los alumnos.')) haz('borrar', () => deleteSesion({ id: sesion.id })); }}>
                <Trash2 size={16} /> Borrar
              </Button>
            </>
          )}
        </div>
      ) : undefined}
    >
      {sesion && (
        <div className="flex gap-1 p-1 mb-4 rounded-xl bg-slate-100 dark:bg-slate-800/60">
          {(['sesion', 'feedback'] as const).map((p) => (
            <button key={p} onClick={() => setPestaña(p)} aria-pressed={pestaña === p}
              className={cx('flex-1 min-h-[40px] rounded-lg text-sm font-black',
                pestaña === p ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400')}>
              {p === 'sesion' ? 'Sesión' : `Feedback · ${hechas}/${miembros.length}`}
            </button>
          ))}
        </div>
      )}

      {pestaña === 'sesion' && soloLectura && sesion && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-xl px-3 py-2">
            Es una sesión del grupo «{nombreGrupo}». Para cambiarla, elige el grupo arriba: aquí la cambiarías para todos.
          </p>
          <p className="text-sm whitespace-pre-wrap text-slate-800 dark:text-slate-100">{sesion.description || 'Sin descripción.'}</p>
        </div>
      )}

      {pestaña === 'sesion' && !soloLectura && (
        <div className="space-y-3">
          {!sesion && plantillas.length > 0 && (
            <SelectField label="Partir de una plantilla (opcional)" defaultValue="" onChange={(e) => desdePlantilla(e.target.value)}>
              <option value="">— Elegir de la biblioteca —</option>
              {TIPOS_SESION.map((t) => {
                const deTipo = plantillas.filter((p) => p.kind === t);
                return deTipo.length ? (
                  <optgroup key={t} label={ETIQUETA_TIPO[t]}>
                    {deTipo.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </optgroup>
                ) : null;
              })}
            </SelectField>
          )}

          <div>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">Tipo</p>
            <div className="flex flex-wrap gap-1.5">
              {TIPOS_SESION.map((t) => {
                const E = ESTILO_TIPO[t];
                const Icono = E.icono;
                return (
                  <button key={t} onClick={() => setKind(t)} aria-pressed={kind === t}
                    className={cx('min-h-[40px] px-3 rounded-xl text-xs font-black inline-flex items-center gap-1.5 border-2 transition-colors',
                      kind === t ? cx(E.chip, 'border-current') : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300')}>
                    <Icono size={14} /> {ETIQUETA_TIPO[t]}
                  </button>
                );
              })}
            </div>
          </div>

          <TextField label="Título" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Series de 400 m, Fuerza tren superior…" />
          <TextAreaField
            label="Descripción"
            hint="Escríbela como se la explicarías: calentamiento, bloques, descansos, en qué fijarse."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={8}
            maxLength={4000}
            placeholder={'Calentamiento: 10′ trote suave + movilidad\n6 × 400 m a ritmo de prueba · R: 1′30″\nVuelta a la calma: 5′'}
          />
          <div className="grid grid-cols-3 gap-2">
            <TextField label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            <TextField label="Duración (min)" inputMode="numeric" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} placeholder="45" />
            <TextField label="Distancia (km)" inputMode="decimal" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} placeholder="—" />
          </div>
          <TextField label="Vídeo (opcional)" type="url" inputMode="url" value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://youtube.com/…" />
          <EditorCargas cargas={cargas} onChange={setCargas} rm={rm} />
          {aviso && <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{aviso}</p>}
          {error && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}

      {pestaña === 'feedback' && sesion && (
        <div className="space-y-2">
          {miembros.length === 0 && <p className={TEXT.muted}>Este grupo no tiene alumnos.</p>}
          {sesion.fecha > hoy && <p className={TEXT.muted}>La sesión aún no ha llegado: los alumnos la apuntarán ese día.</p>}
          {miembros.map((m) => (
            <FilaFeedback key={m.id} sesionId={sesion.id} email={m.email} userId={m.id}
              apunte={apuntesDe.get(m.id) ?? null} estado={estadoSesion(sesion.fecha, apuntesDe.get(m.id), hoy)} onCambio={onCambio} />
          ))}
        </div>
      )}
    </Modal>
  );
}

function FilaFeedback({ sesionId, userId, email, apunte, estado, onCambio }: {
  sesionId: string;
  userId: string;
  email: string;
  apunte: ApunteConCorreo | null;
  estado: ReturnType<typeof estadoSesion>;
  onCambio: () => void;
}) {
  const [respuesta, setRespuesta] = useState(apunte?.coachReply ?? '');
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState(false);
  const real = [formateaMinutos(apunte?.durationMin), formateaKm(apunte?.distanceKm)].filter(Boolean).join(' · ');

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="flex-1 min-w-0 truncate text-sm font-bold text-slate-800 dark:text-slate-100">{email}</span>
        {estado === 'hecha' && <span className="shrink-0 text-[10px] font-black px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 flex items-center gap-1"><Check size={11} /> Hecha{apunte?.rpe != null && ` · ${apunte.rpe}/10`}</span>}
        {estado === 'no_hecha' && <span className="shrink-0 text-[10px] font-black px-2 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 flex items-center gap-1"><X size={11} /> No hecha</span>}
        {estado === 'pendiente' && <span className="shrink-0 text-[10px] font-black px-2 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Sin apuntar</span>}
        {estado === 'planificada' && <span className="shrink-0 text-[10px] font-black px-2 py-1 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Planificada</span>}
      </div>
      {real && <p className={cx(TEXT.hud, 'text-slate-500 dark:text-slate-400 mt-1')}>Real: {real}</p>}
      {apunte?.comment && <p className="text-sm text-slate-700 dark:text-slate-200 mt-1 whitespace-pre-wrap break-words">«{apunte.comment}»</p>}
      {apunte && (
        <div className="mt-2 flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <TextAreaField label="Tu respuesta" value={respuesta} onChange={(e) => { setRespuesta(e.target.value); setOk(false); }} rows={2} maxLength={500} placeholder="Bien hecho. El jueves, más suave." />
          </div>
          <Button size="sm" variant="secondary" disabled={guardando}
            onClick={async () => { setGuardando(true); const r = await responderApunte({ sessionId: sesionId, alumnoId: userId, reply: respuesta }); setGuardando(false); if (r.success) { setOk(true); onCambio(); } }}>
            {guardando ? <Loader2 size={14} className="animate-spin" /> : ok ? <Check size={14} /> : <MessageSquare size={14} />} {ok ? 'Enviada' : 'Responder'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Las cargas en % del 1RM (regla 87) ──

type FilaCarga = { ejercicio: string; porcentaje: string; series: string; reps: string };
const aFila = (c: Carga): FilaCarga => ({
  ejercicio: c.ejercicio, porcentaje: String(c.porcentaje), series: c.series ? String(c.series) : '', reps: c.reps ? String(c.reps) : '',
});

function EditorCargas({ cargas, onChange, rm }: { cargas: FilaCarga[]; onChange: (c: FilaCarga[]) => void; rm: RMVigente | null }) {
  const cambia = (i: number, patch: Partial<FilaCarga>) => onChange(cargas.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const nueva = () => onChange([...cargas, { ejercicio: '', porcentaje: '75', series: '', reps: '' }]);
  if (!cargas.length) {
    return (
      <Button variant="ghost" size="sm" onClick={nueva}>
        <Weight size={15} /> Añadir cargas en % del 1RM (opcional)
      </Button>
    );
  }
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
      <p className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"><Weight size={14} /> Cargas en % del 1RM</p>
      <p className={TEXT.muted}>{rm ? 'Al lado, los kilos de este alumno.' : 'Cada alumno verá sus kilos según su 1RM.'}</p>
      <datalist id="ejercicios-cargas">{EJERCICIOS_FUERZA.map((x) => <option key={x} value={x} />)}</datalist>
      {cargas.map((c, i) => {
        const suyo = rm?.[claveEjercicio(c.ejercicio || ' ')];
        const kg = suyo ? kgDeCarga(suyo.rm, Number(c.porcentaje)) : null;
        return (
          <div key={i} className="grid grid-cols-[1fr_auto] sm:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 items-end">
            <div className="col-span-2 sm:col-span-1">
              <TextField label="Ejercicio" list="ejercicios-cargas" value={c.ejercicio} onChange={(e) => cambia(i, { ejercicio: e.target.value })} placeholder="Sentadilla" />
            </div>
            <div className="grid grid-cols-3 gap-2 sm:contents">
              <TextField label="Series" inputMode="numeric" value={c.series} onChange={(e) => cambia(i, { series: e.target.value })} placeholder="4" />
              <TextField label="Reps" inputMode="numeric" value={c.reps} onChange={(e) => cambia(i, { reps: e.target.value })} placeholder="6" />
              <TextField label="% 1RM" inputMode="numeric" value={c.porcentaje} onChange={(e) => cambia(i, { porcentaje: e.target.value })} placeholder="75" />
            </div>
            <div className="flex items-center gap-1 pb-0.5 col-start-2 row-start-2 sm:col-start-auto sm:row-start-auto">
              {rm && <span className="text-xs font-black text-slate-700 dark:text-slate-200 tabular-nums whitespace-nowrap">{kg !== null ? formateaKg(kg) : '— kg'}</span>}
              <button aria-label="Quitar la carga" onClick={() => onChange(cargas.filter((_, j) => j !== i))}
                className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        );
      })}
      <Button variant="ghost" size="sm" onClick={nueva}><Plus size={14} /> Otra carga</Button>
    </div>
  );
}

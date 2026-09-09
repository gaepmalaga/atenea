'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Loader2, Save, Dumbbell, Plus, Trash2, Moon, Eye, Copy, CalendarClock } from 'lucide-react';
import { saveManualTrainingPlan } from '@/actions';
import { normalizePlan, buildManualPlan, type WeeklyPlan, type Exercise } from '@/app/lib/training-plan';
import {
  BIBLIOTECA_EJERCICIOS,
  camposDeKind,
  kindDeEjercicio,
  KIND_LABEL,
  resumeDia,
  type EjercicioKind,
} from '@/app/lib/exercise-library';
import CalendarioEntrenamiento from '@/app/components/student/modules/training/components/CalendarioEntrenamiento';
import { Button, TextAreaField, SelectField, TAP, cx } from '../../ui';

/**
 * EL PLAN QUE ESCRIBE UN PREPARADOR REAL — rehecho para que se edite viendo.
 *
 * Antes eran siete `<textarea>` con la sintaxis `nombre; series; reps; descanso`:
 * había que recordar el orden de los campos y un error se guardaba en silencio.
 * Ahora cada día es una lista de FILAS con campos de verdad, el nombre sale de
 * una biblioteca (`exercise-library`), los campos cambian según el tipo de
 * ejercicio (una serie de 200 m no son «series y reps»), se puede partir de la
 * semana pasada y hay una vista previa de lo que verá el alumno — la misma
 * pantalla, construida del mismo `buildManualPlan` que se guarda.
 *
 * Un día en «Descanso» (o sin ejercicios) NO ENTRA en el plan —lo filtra
 * `buildManualPlan`— así que no hay que «marcar» los días de descanso.
 */

const KEY_DATALIST = 'biblioteca-ejercicios';
const KINDS: EjercicioKind[] = ['fuerza', 'carrera', 'circuito', 'general'];

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const CHIPS_ENFOQUE = [
  'Base — fuerza general y rodaje suave',
  'Carga — subir volumen e intensidad',
  'Descarga — bajar carga, mantener técnica',
  'Semana de test — simular las pruebas',
  'Recuperación — movilidad y trote suave',
];

type Fila = {
  key: string;
  name: string;
  kind: EjercicioKind;
  c1: string;
  c2: string;
  c3: string;
  nota: string;
};

type DiaEstado = { entreno: boolean; filas: Fila[] };

type PlanActivo = { id: string; weekStart: string | null; plan: WeeklyPlan | null } | null;

type GuardarParams = {
  weekFocus: string;
  days: Array<{ day: string; type: string; title: string; exercises: Exercise[] }>;
};

let contador = 0;
const nuevaKey = () => `f${Date.now()}-${contador++}`;

function esKind(v: unknown): v is EjercicioKind {
  return typeof v === 'string' && (KINDS as string[]).includes(v);
}

function ejercicioAFila(e: Exercise): Fila {
  return {
    key: nuevaKey(),
    name: e.name,
    // `metric_type` guarda el kind desde este editor; una fila de un plan de IA
    // vieja trae 'weight'/'time'/… que no son kinds nuestros: se deduce del nombre.
    kind: esKind(e.metric_type) ? e.metric_type : kindDeEjercicio(e.name),
    c1: e.sets != null ? String(e.sets) : '',
    c2: e.reps ?? '',
    c3: e.rest ?? '',
    nota: e.target ?? '',
  };
}

function filaAEjercicio(f: Fila): Exercise | null {
  const name = f.name.trim();
  if (!name) return null;
  return {
    name,
    sets: f.c1.trim() || null,
    reps: f.c2.trim() || null,
    rest: f.c3.trim() || null,
    target: f.nota.trim() || null,
    metric_type: f.kind,
  };
}

function diasIniciales(plan: WeeklyPlan | null | undefined): Record<string, DiaEstado> {
  const out: Record<string, DiaEstado> = {};
  for (const dia of DIAS) {
    const enPlan = plan?.days.find((d) => d.day.toLowerCase().startsWith(dia.slice(0, 3).toLowerCase()));
    out[dia] = enPlan && enPlan.exercises.length > 0
      ? { entreno: true, filas: enPlan.exercises.map(ejercicioAFila) }
      : { entreno: false, filas: [] };
  }
  return out;
}

function construyeParams(weekFocus: string, dias: Record<string, DiaEstado>): GuardarParams {
  return {
    weekFocus: weekFocus.trim() || 'Semana del preparador',
    days: DIAS.map((dia) => ({
      day: dia,
      type: 'Entrenamiento',
      title: dia,
      exercises: dias[dia].entreno
        ? dias[dia].filas.map(filaAEjercicio).filter((e): e is Exercise => e !== null)
        : [],
    })),
  };
}

export default function PlanEntrenadorEditor({
  studentId,
  planActual,
  onGuardado,
  onSave,
  etiquetaGuardado = 'Guardado. Ya es el plan activo del alumno.',
  semanaAnteriorPlan = null,
  etiquetaSemanaAnterior = null,
}: {
  studentId?: string;
  /** `undefined` mientras se carga, `null` si de verdad no hay plan activo. */
  planActual: PlanActivo | undefined;
  onGuardado: () => void;
  onSave?: (params: GuardarParams) => Promise<{ success: boolean; error?: string }>;
  etiquetaGuardado?: string;
  /** El plan de la última semana con contenido, para «partir de la semana pasada». */
  semanaAnteriorPlan?: WeeklyPlan | null;
  etiquetaSemanaAnterior?: string | null;
}) {
  const [weekFocus, setWeekFocus] = useState('');
  const [dias, setDias] = useState<Record<string, DiaEstado>>(() => diasIniciales(null));
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [verPreview, setVerPreview] = useState(false);
  const [copiarDe, setCopiarDe] = useState<string>('Lunes');
  const [copiarA, setCopiarA] = useState<string>('Miércoles');

  const refsDia = useRef<Record<string, HTMLDivElement | null>>({});

  // Precarga con el plan activo cuando llega, para AJUSTAR en vez de reescribir.
  useEffect(() => {
    if (planActual === undefined) return;
    setWeekFocus(planActual?.plan?.week_focus ?? '');
    setDias(diasIniciales(planActual?.plan ?? null));
  }, [planActual]);

  const previewPlan = useMemo<WeeklyPlan | null>(
    () => normalizePlan(buildManualPlan(construyeParams(weekFocus, dias))),
    [weekFocus, dias],
  );
  const totalEjercicios = DIAS.reduce(
    (n, d) => n + (dias[d].entreno ? dias[d].filas.filter((f) => f.name.trim()).length : 0),
    0,
  );

  function editaDia(dia: string, patch: Partial<DiaEstado>) {
    setDias((prev) => ({ ...prev, [dia]: { ...prev[dia], ...patch } }));
  }
  function editaFila(dia: string, key: string, patch: Partial<Fila>) {
    setDias((prev) => ({
      ...prev,
      [dia]: {
        ...prev[dia],
        filas: prev[dia].filas.map((f) => (f.key === key ? { ...f, ...patch } : f)),
      },
    }));
  }
  function añadeFila(dia: string) {
    editaDia(dia, {
      entreno: true,
      filas: [...dias[dia].filas, { key: nuevaKey(), name: '', kind: 'fuerza', c1: '', c2: '', c3: '', nota: '' }],
    });
  }
  function quitaFila(dia: string, key: string) {
    editaDia(dia, { filas: dias[dia].filas.filter((f) => f.key !== key) });
  }
  function copiaDia() {
    if (copiarDe === copiarA) return;
    setDias((prev) => ({
      ...prev,
      [copiarA]: {
        entreno: prev[copiarDe].entreno,
        filas: prev[copiarDe].filas.map((f) => ({ ...f, key: nuevaKey() })),
      },
    }));
    refsDia.current[copiarA]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function partirDeSemanaPasada() {
    if (!semanaAnteriorPlan) return;
    setWeekFocus((prev) => prev || semanaAnteriorPlan.week_focus);
    setDias(diasIniciales(semanaAnteriorPlan));
  }

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    const params = construyeParams(weekFocus, dias);
    const res = onSave
      ? await onSave(params)
      : await saveManualTrainingPlan({ studentId: studentId ?? '', ...params });
    setGuardando(false);
    setMensaje(
      res.success
        ? { ok: true, texto: etiquetaGuardado }
        : { ok: false, texto: res.error ?? 'No se pudo guardar.' },
    );
    if (res.success) onGuardado();
  }

  if (planActual === undefined) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
        <Loader2 size={12} className="animate-spin" /> Comprobando el plan…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <datalist id={KEY_DATALIST}>
        {BIBLIOTECA_EJERCICIOS.map((e) => (
          <option key={e.nombre} value={e.nombre}>{e.grupo}</option>
        ))}
      </datalist>

      {planActual?.plan && (
        <p className={cx('text-xs px-2 py-1 rounded-md inline-block',
          planActual.plan.source === 'entrenador'
            ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400')}
        >
          Plan activo: {planActual.plan.source === 'entrenador' ? 'escrito por el preparador' : 'generado por IA'}
        </p>
      )}

      {/* PARTIR DE LA SEMANA PASADA */}
      {semanaAnteriorPlan && semanaAnteriorPlan.days.length > 0 && (
        <button
          onClick={partirDeSemanaPasada}
          className={cx(
            'w-full flex items-center gap-2.5 rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-800',
            'bg-indigo-50/50 dark:bg-indigo-950/30 px-3 text-left text-indigo-700 dark:text-indigo-300', TAP,
          )}
        >
          <CalendarClock size={16} className="shrink-0" />
          <span className="text-xs font-bold leading-tight">
            Partir de la semana del {etiquetaSemanaAnterior ?? 'anterior'}
            <span className="block font-medium opacity-80">Copia esos días aquí y ajustas lo que cambie.</span>
          </span>
        </button>
      )}

      {/* ENFOQUE DE LA SEMANA */}
      <div>
        <TextAreaField
          label="Enfoque de la semana"
          rows={2}
          value={weekFocus}
          onChange={(e) => setWeekFocus(e.target.value)}
          placeholder="Qué se busca esta semana"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {CHIPS_ENFOQUE.map((c) => (
            <button
              key={c}
              onClick={() => setWeekFocus(c)}
              className="text-[11px] font-bold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              {c.split(' — ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* TIRA-RESUMEN DE LA SEMANA */}
      <div className="grid grid-cols-7 gap-1">
        {DIAS.map((dia, i) => {
          const est = dias[dia];
          const n = est.filas.filter((f) => f.name.trim()).length;
          return (
            <button
              key={dia}
              onClick={() => refsDia.current[dia]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className={cx(
                'rounded-lg px-0.5 py-1.5 text-center border transition-colors flex flex-col items-center justify-center', TAP,
                est.entreno && n > 0
                  ? 'border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                  : 'border-slate-200 dark:border-slate-800 text-slate-400',
              )}
            >
              <span className="text-[10px] font-black uppercase">{DIAS_CORTOS[i]}</span>
              <span className="text-[10px] font-bold tabular-nums leading-none mt-0.5">
                {est.entreno ? (n || '·') : '—'}
              </span>
            </button>
          );
        })}
      </div>

      {/* COPIAR UN DÍA A OTRO */}
      <div className="flex items-end gap-2 flex-wrap rounded-xl bg-slate-50 dark:bg-slate-900 p-2.5">
        <Copy size={14} className="text-slate-400 shrink-0 mb-2.5" />
        <MiniSelect label="Copiar" value={copiarDe} onChange={setCopiarDe} opciones={DIAS as unknown as string[]} />
        <MiniSelect label="a" value={copiarA} onChange={setCopiarA} opciones={DIAS as unknown as string[]} />
        <Button size="sm" variant="secondary" onClick={copiaDia} disabled={copiarDe === copiarA}>Copiar</Button>
      </div>

      {/* LOS SIETE DÍAS */}
      <div className="space-y-2.5">
        {DIAS.map((dia) => {
          const est = dias[dia];
          return (
            <div
              key={dia}
              ref={(el) => { refsDia.current[dia] = el; }}
              className={cx(
                'rounded-2xl border scroll-mt-4',
                est.entreno
                  ? 'border-slate-200 dark:border-slate-800'
                  : 'border-slate-100 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-900/40',
              )}
            >
              <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <span className="font-black text-sm text-slate-900 dark:text-white">{dia}</span>
                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-[11px] font-black uppercase tracking-wide">
                  <button
                    onClick={() => editaDia(dia, { entreno: true })}
                    className={cx('px-2.5 py-1.5', est.entreno ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-slate-400')}
                  >
                    Entreno
                  </button>
                  <button
                    onClick={() => editaDia(dia, { entreno: false })}
                    className={cx('px-2.5 py-1.5 flex items-center gap-1', !est.entreno ? 'bg-slate-700 text-white' : 'text-slate-500 dark:text-slate-400')}
                  >
                    <Moon size={11} /> Descanso
                  </button>
                </div>
              </div>

              {est.entreno && (
                <div className="px-3 pb-3 space-y-2 border-t border-slate-100 dark:border-slate-800/70 pt-2.5">
                  {est.filas.length === 0 && (
                    <p className="text-xs text-slate-400 py-1">Aún no hay ejercicios este día.</p>
                  )}
                  {est.filas.map((f) => (
                    <FilaEjercicio
                      key={f.key}
                      fila={f}
                      onCambio={(patch) => editaFila(dia, f.key, patch)}
                      onQuitar={() => quitaFila(dia, f.key)}
                    />
                  ))}
                  <button
                    onClick={() => añadeFila(dia)}
                    className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline pt-0.5"
                  >
                    <Plus size={14} /> Añadir ejercicio
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* VISTA PREVIA */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <button
          onClick={() => setVerPreview((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300"
        >
          <Eye size={14} /> {verPreview ? 'Ocultar' : 'Ver'} cómo lo verá el alumno
        </button>
        {verPreview && (
          <div className="border-t border-slate-200 dark:border-slate-800 p-3 bg-slate-50/60 dark:bg-slate-900/40">
            {previewPlan && previewPlan.days.length > 0 ? (
              <CalendarioEntrenamiento
                semanas={[{ weekStart: planActual?.weekStart ?? '', plan: previewPlan }]}
                origen="grupo"
              />
            ) : (
              <p className="text-xs text-slate-400 text-center py-6">
                Añade al menos un ejercicio y aquí verás la semana como la ve el alumno.
              </p>
            )}
          </div>
        )}
      </div>

      <Button
        onClick={guardar}
        disabled={guardando}
        icon={guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
      >
        {guardando ? 'Guardando…' : `Guardar (${totalEjercicios} ${totalEjercicios === 1 ? 'ejercicio' : 'ejercicios'})`}
      </Button>

      {mensaje && (
        <p className={cx('text-xs font-semibold', mensaje.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>
          {mensaje.texto}
        </p>
      )}

      {!planActual?.plan && (
        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <Dumbbell size={12} /> Este grupo no tiene plan para esta semana todavía.
        </p>
      )}
    </div>
  );
}

function MiniSelect({
  label, value, onChange, opciones,
}: { label: string; value: string; onChange: (v: string) => void; opciones: string[] }) {
  return (
    <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block mt-0.5 text-base sm:text-sm font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-900 dark:text-white"
      >
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function FilaEjercicio({
  fila, onCambio, onQuitar,
}: { fila: Fila; onCambio: (patch: Partial<Fila>) => void; onQuitar: () => void }) {
  const campos = camposDeKind(fila.kind);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-2 space-y-2 bg-white dark:bg-slate-950">
      <div className="flex items-center gap-2">
        <input
          list={KEY_DATALIST}
          value={fila.name}
          onChange={(e) => {
            const name = e.target.value;
            // Al elegir de la biblioteca, el tipo se ajusta solo; con texto
            // libre se respeta lo que el preparador haya puesto a mano.
            onCambio({ name, kind: name.trim() ? kindDeEjercicio(name) : fila.kind });
          }}
          placeholder="Ejercicio"
          className="flex-1 min-w-0 text-base sm:text-sm font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 px-2.5 py-2 outline-none focus:border-indigo-500"
        />
        <button
          onClick={onQuitar}
          className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10"
          aria-label="Quitar ejercicio"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <select
          value={fila.kind}
          onChange={(e) => onCambio({ kind: e.target.value as EjercicioKind })}
          className="text-[11px] font-bold rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 px-1.5 py-1"
        >
          {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        {campos.campo1 && (
          <CampoMedida label={campos.campo1.label} ejemplo={campos.campo1.ejemplo} value={fila.c1} onChange={(v) => onCambio({ c1: v })} />
        )}
        {campos.campo2 && (
          <CampoMedida label={campos.campo2.label} ejemplo={campos.campo2.ejemplo} value={fila.c2} onChange={(v) => onCambio({ c2: v })} />
        )}
        {campos.campo3 && (
          <CampoMedida label={campos.campo3.label} ejemplo={campos.campo3.ejemplo} value={fila.c3} onChange={(v) => onCambio({ c3: v })} />
        )}
      </div>

      <input
        value={fila.nota}
        onChange={(e) => onCambio({ nota: e.target.value })}
        placeholder="Nota u objetivo (opcional) — p. ej. «marca 3:45», «técnica: rodillas altas»"
        className="w-full text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 px-2.5 py-1.5 outline-none focus:border-indigo-500"
      />
    </div>
  );
}

function CampoMedida({
  label, ejemplo, value, onChange,
}: { label: string; ejemplo: string; value: string; onChange: (v: string) => void }): ReactNode {
  return (
    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={ejemplo}
        inputMode="text"
        className="block w-20 mt-0.5 text-base sm:text-sm font-semibold normal-case tracking-normal rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 px-2 py-1.5 outline-none focus:border-indigo-500"
      />
    </label>
  );
}

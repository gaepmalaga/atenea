'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save, Dumbbell } from 'lucide-react';
import { saveManualTrainingPlan } from '@/actions';
import type { WeeklyPlan, Exercise } from '@/app/lib/training-plan';
import { Button, TextField, TextAreaField, cx } from '../../ui';

/**
 * EL PLAN QUE ESCRIBE UN ENTRENADOR REAL.
 *
 * Siete días fijos y un `<textarea>` por día: cada línea, un ejercicio, con el
 * formato «nombre; series; repeticiones; descanso» — es el mismo compromiso
 * que ya toma el alta manual de preguntas (regla 27): una tabla dinámica de
 * filas para añadir/quitar ejercicios habría costado el triple de código para
 * un formulario que un preparador rellena una vez por semana, no cien veces
 * al día.
 *
 * Un día con el textarea vacío simplemente NO ENTRA en el plan —
 * `buildManualPlan` lo filtra— así que el entrenador puede dejar descanso los
 * días que no entrena sin tener que "marcar" nada.
 */

type PlanActivo = { id: string; weekStart: string | null; plan: WeeklyPlan | null } | null;

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function lineaAEjercicio(linea: string): Exercise | null {
  const partes = linea.split(';').map((p) => p.trim());
  const [name, sets, reps, rest] = partes;
  if (!name) return null;
  return { name, sets: sets || null, reps: reps || null, rest: rest || null, target: null, metric_type: null };
}

function ejerciciosATexto(exercises: Exercise[] | undefined): string {
  return (exercises ?? [])
    .map((e) => [e.name, e.sets ?? '', e.reps ?? '', e.rest ?? ''].join('; ').replace(/;\s*$/, ''))
    .join('\n');
}

type GuardarParams = {
  weekFocus: string;
  days: Array<{ day: string; type: string; title: string; exercises: Exercise[] }>;
};

export default function PlanEntrenadorEditor({
  studentId,
  planActual,
  onGuardado,
  onSave,
  etiquetaGuardado = 'Guardado. Ya es el plan activo del alumno.',
}: {
  /** Obligatorio salvo que se pase `onSave` (plan de grupo, P7). */
  studentId?: string;
  /** `undefined` mientras se carga, `null` si de verdad no hay plan activo. */
  planActual: PlanActivo | undefined;
  onGuardado: () => void;
  /**
   * Quién guarda. Por defecto `saveManualTrainingPlan` (plan individual). El
   * plan de grupo (P7) pasa aquí `saveGroupTrainingPlan`: mismo editor, misma
   * validación, distinto destino.
   */
  onSave?: (params: GuardarParams) => Promise<{ success: boolean; error?: string }>;
  etiquetaGuardado?: string;
}) {
  const [weekFocus, setWeekFocus] = useState('');
  const [textoDias, setTextoDias] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Se precarga con el plan activo cuando llega, para poder AJUSTAR una
  // semana en vez de reescribirla entera de cero cada vez.
  useEffect(() => {
    if (!planActual?.plan) return;
    setWeekFocus(planActual.plan.week_focus);
    const porDia: Record<string, string> = {};
    for (const d of planActual.plan.days) porDia[d.day] = ejerciciosATexto(d.exercises);
    setTextoDias(porDia);
  }, [planActual]);

  async function guardar() {
    setGuardando(true);
    setMensaje(null);

    const days = DIAS.map((day) => ({
      day,
      type: 'Entrenamiento',
      title: day,
      exercises: (textoDias[day] ?? '')
        .split('\n')
        .map(lineaAEjercicio)
        .filter((e): e is Exercise => e !== null),
    }));

    const params = { weekFocus: weekFocus.trim() || 'Semana del preparador', days };
    const res = onSave
      ? await onSave(params)
      : await saveManualTrainingPlan({ studentId: studentId ?? '', ...params });

    setGuardando(false);
    setMensaje(res.success ? etiquetaGuardado : (res.error ?? 'No se pudo guardar.'));
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
      {planActual?.plan && (
        <p className={cx('text-xs px-2 py-1 rounded-md inline-block',
          planActual.plan.source === 'entrenador'
            ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400')}
        >
          Plan activo: {planActual.plan.source === 'entrenador' ? 'escrito por el entrenador' : 'generado por IA'}
        </p>
      )}

      <TextField
        label="Enfoque de la semana"
        value={weekFocus}
        onChange={(e) => setWeekFocus(e.target.value)}
        placeholder="Fuerza tren superior y resistencia aeróbica"
      />

      <div className="grid sm:grid-cols-2 gap-3">
        {DIAS.map((dia) => (
          <TextAreaField
            key={dia}
            label={dia}
            rows={3}
            value={textoDias[dia] ?? ''}
            onChange={(e) => setTextoDias((prev) => ({ ...prev, [dia]: e.target.value }))}
            placeholder={'Dominadas; 4; 8-10; 90s\nFlexiones; 3; 15; 60s'}
            hint={undefined}
          />
        ))}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
        Una línea por ejercicio: <code>nombre; series; repeticiones; descanso</code>. Un día en blanco es descanso.
      </p>

      <Button onClick={guardar} disabled={guardando} icon={guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}>
        {guardando ? 'Guardando…' : 'Guardar y activar esta semana'}
      </Button>

      {mensaje && (
        <p className={cx('text-xs font-semibold', mensaje.startsWith('Guardado') ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>
          {mensaje}
        </p>
      )}

      {!planActual?.plan && (
        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <Dumbbell size={12} /> Este alumno no tiene ningún plan activo todavía.
        </p>
      )}
    </div>
  );
}

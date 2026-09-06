'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Dumbbell, RefreshCw, ChevronDown, Trash2, Sparkles, Users2 } from 'lucide-react';
import { getGroups, getGroupTrainingPlan, saveGroupTrainingPlan, deleteGroupTrainingPlan, getTrainingSwitches, setTrainingSwitch } from '@/actions';
import type { GroupRow } from '@/app/actions/groups';
import type { WeeklyPlan } from '@/app/lib/training-plan';
import { TRAINING_SWITCH_LABEL, TRAINING_SWITCH_DESC, type TrainingSwitches } from '@/app/lib/training-switches';
import PlanEntrenadorEditor from './PlanEntrenadorEditor';
import { Card, EmptyState, Button, TEXT, cx } from '../../ui';

/**
 * «Preparación física» (P7, afinado tras P8): el entrenamiento vive aquí, por
 * GRUPO, no en la ficha de cada alumno.
 *
 * Dos interruptores, que el dueño pidió por separado del módulo entero:
 *  - IA: que el alumno se genere su propio plan (de pago).
 *  - Grupo: el plan manual por grupo, que sus miembros heredan.
 */
export default function AdminPhysical() {
  const [grupos, setGrupos] = useState<GroupRow[]>([]);
  const [switches, setSwitches] = useState<TrainingSwitches | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    const [gruposRes, switchesRes] = await Promise.all([getGroups(), getTrainingSwitches()]);
    if (gruposRes.success) setGrupos(gruposRes.groups.filter((g) => g.llevaPlan));
    else setError(gruposRes.error);
    if (switchesRes.success) setSwitches(switchesRes.switches);
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function cambiaSwitch(switchId: 'ai' | 'group', enabled: boolean) {
    setBusy(true);
    const res = await setTrainingSwitch({ switchId, enabled });
    if (!res.success) setError(res.error ?? 'No se pudo guardar.');
    await cargar();
    setBusy(false);
  }

  const grupoOn = switches?.group !== false;

  return (
    <div className="space-y-4 animate-in fade-in pb-24">
      <Card tone="sunken" pad="md" className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-slate-700/10 dark:bg-white/5 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
            <Dumbbell size={20} />
          </div>
          <div>
            <h3 className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-tight">Preparación física</h3>
            <p className={cx(TEXT.muted, 'mt-0.5')}>Un plan por grupo de físicas. Sus miembros lo heredan.</p>
          </div>
        </div>
        <button onClick={() => { setLoading(true); cargar(); }} className="w-11 h-11 shrink-0 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400" aria-label="Recargar">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </Card>

      {error && (
        <Card tone="base" pad="md" className="border-red-500/30 text-red-700 dark:text-red-300">
          <p className="text-xs font-medium">{error}</p>
        </Card>
      )}

      {/* --- LOS DOS INTERRUPTORES --- */}
      {switches && (
        <div className="grid sm:grid-cols-2 gap-2 sm:gap-3">
          <SwitchCard
            icon={<Sparkles size={16} />}
            label={TRAINING_SWITCH_LABEL.ai}
            desc={TRAINING_SWITCH_DESC.ai}
            on={switches.ai}
            busy={busy}
            onToggle={(v) => cambiaSwitch('ai', v)}
          />
          <SwitchCard
            icon={<Users2 size={16} />}
            label={TRAINING_SWITCH_LABEL.group}
            desc={TRAINING_SWITCH_DESC.group}
            on={switches.group}
            busy={busy}
            onToggle={(v) => cambiaSwitch('group', v)}
          />
        </div>
      )}

      {!grupoOn ? (
        <EmptyState
          icon={<Users2 size={40} />}
          title="El plan por grupo está apagado"
          hint="Enciéndelo arriba para escribir un plan que hereden los miembros de cada grupo de físicas."
          bordered
        />
      ) : (
        <>
          {!loading && grupos.length === 0 && (
            <EmptyState
              icon={<Dumbbell size={40} />}
              title="No hay ningún grupo de físicas"
              hint="Crea un grupo de un tipo que «lleve plan» en la pestaña Grupos y aquí podrás ponerle el entrenamiento."
              bordered
            />
          )}
          <div className="space-y-2">
            {grupos.map((g) => <GrupoFisicas key={g.id} g={g} onCambio={cargar} />)}
          </div>
        </>
      )}
    </div>
  );
}

function SwitchCard({
  icon, label, desc, on, busy, onToggle,
}: {
  icon: ReactNode;
  label: string;
  desc: string;
  on: boolean;
  busy: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <Card tone="base" pad="md" className={cx('flex flex-col gap-2', !on && 'opacity-70')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <span className="text-slate-500 dark:text-slate-400 shrink-0">{icon}</span>
          <span className="text-xs font-black leading-tight">{label}</span>
        </div>
        <Button size="sm" variant={on ? 'secondary' : 'primary'} disabled={busy} onClick={() => onToggle(!on)}>
          {on ? 'Apagar' : 'Encender'}
        </Button>
      </div>
      <p className={cx(TEXT.muted, 'leading-relaxed')}>{desc}</p>
      <span className={cx('text-[10px] font-black uppercase tracking-wider', on ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400')}>
        {on ? 'Encendido' : 'Apagado'}
      </span>
    </Card>
  );
}

function GrupoFisicas({ g, onCambio }: { g: GroupRow; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [plan, setPlan] = useState<WeeklyPlan | null | undefined>(undefined);

  const cargarPlan = useCallback(async () => {
    const res = await getGroupTrainingPlan(g.id);
    setPlan(res.success ? res.plan : null);
  }, [g.id]);

  useEffect(() => { if (abierto) cargarPlan(); }, [abierto, cargarPlan]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800">
      <button onClick={() => setAbierto((x) => !x)} className="w-full flex items-center justify-between gap-3 p-3 text-left">
        <span className="min-w-0">
          <span className="block font-bold text-slate-900 dark:text-white truncate">{g.name}</span>
          <span className={cx(TEXT.muted, 'flex items-center gap-2')}>
            {g.miembros} {g.miembros === 1 ? 'alumno' : 'alumnos'}
            {g.staffNames.length > 0 && ` · ${g.staffNames.join(", ")}`}
            {' · '}
            <span className={g.tienePlan ? 'text-emerald-700 dark:text-emerald-400 font-bold' : ''}>
              {g.tienePlan ? 'con plan' : 'sin plan'}
            </span>
          </span>
        </span>
        <ChevronDown size={16} className={cx('shrink-0 text-slate-400 transition-transform', abierto && 'rotate-180')} />
      </button>

      {abierto && (
        <div className="px-3 pb-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          <PlanEntrenadorEditor
            planActual={plan === undefined ? undefined : plan ? { id: `grupo:${g.id}`, weekStart: null, plan } : null}
            etiquetaGuardado="Guardado. Es el plan de todo el grupo."
            onSave={(params) => saveGroupTrainingPlan({ groupId: g.id, weekFocus: params.weekFocus, days: params.days })}
            onGuardado={() => { cargarPlan(); onCambio(); }}
          />

          {g.tienePlan && (
            <button
              onClick={async () => { await deleteGroupTrainingPlan(g.id); cargarPlan(); onCambio(); }}
              className="mt-3 text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5 hover:underline"
            >
              <Trash2 size={13} /> Borrar el plan del grupo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

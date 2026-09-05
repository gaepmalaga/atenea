'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dumbbell, RefreshCw, ChevronDown, Trash2, Info } from 'lucide-react';
import { getGroups, getGroupTrainingPlan, saveGroupTrainingPlan, deleteGroupTrainingPlan } from '@/actions';
import type { GroupRow } from '@/app/actions/groups';
import type { WeeklyPlan } from '@/app/lib/training-plan';
import PlanEntrenadorEditor from './PlanEntrenadorEditor';
import { Card, EmptyState, TEXT, cx } from '../../ui';

/**
 * "Preparación física" (P7): saca el entrenamiento de la ficha de cada alumno
 * a su sitio. Un plan por GRUPO de físicas — todos sus miembros lo heredan; si
 * un alumno necesita algo distinto, un plan individual (en Academia) lo
 * sobrescribe.
 */
export default function AdminPhysical() {
  const [grupos, setGrupos] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await getGroups();
    if (res.success) setGrupos(res.groups.filter((g) => g.llevaPlan));
    else setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

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

      <Card tone="base" pad="md" className="border-slate-300/40 flex items-start gap-3">
        <Info size={15} className="shrink-0 mt-0.5 text-slate-500 dark:text-slate-400" />
        <p className={cx(TEXT.muted, 'leading-relaxed')}>
          El plan individual de un alumno (que se escribe en <strong>Academia</strong>, dentro de su ficha)
          manda sobre el del grupo. Un alumno no puede marcar días sobre el plan de grupo —
          es compartido—: para eso se le pone uno individual.
        </p>
      </Card>

      {!loading && grupos.length === 0 && (
        <EmptyState
          icon={<Dumbbell size={40} />}
          title="No hay ningún grupo de físicas"
          hint="Crea un grupo de tipo «Físicas» en la pestaña Grupos y aquí podrás ponerle el plan."
          bordered
        />
      )}

      <div className="space-y-2">
        {grupos.map((g) => <GrupoFisicas key={g.id} g={g} onCambio={cargar} />)}
      </div>
    </div>
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

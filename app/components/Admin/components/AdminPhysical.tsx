'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Dumbbell, RefreshCw, ChevronDown, Trash2, Sparkles, Users2, CalendarDays } from 'lucide-react';
import { getGroups, getGroupTrainingPlan, saveGroupTrainingPlan, deleteGroupTrainingPlan, getTrainingSwitches, setTrainingSwitch } from '@/actions';
import type { GroupRow, SemanaDeGrupo } from '@/app/actions/groups';
import { lunesDeSemana, semanasEditables, etiquetaSemana, type WeeklyPlan } from '@/app/lib/training-plan';
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

function SemanaSoloLectura({ plan }: { plan: WeeklyPlan | null }) {
  if (!plan) return <p className={TEXT.muted}>Esa semana no tuvo plan.</p>;
  return (
    <div className="space-y-2">
      <p className={cx(TEXT.muted, 'italic')}>Semana pasada — solo lectura.</p>
      {plan.week_focus && <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{plan.week_focus}</p>}
      {plan.days.map((d, i) => (
        <div key={i} className="text-xs border border-slate-200 dark:border-slate-800 rounded-lg p-2">
          <p className="font-bold text-slate-700 dark:text-slate-200">{d.day}</p>
          <ul className="text-slate-500 dark:text-slate-400 mt-0.5">
            {d.exercises.map((e, j) => (
              <li key={j}>· {e.name}{e.sets ? ` — ${e.sets}×${e.reps ?? ''}` : ''}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function GrupoFisicas({ g, onCambio }: { g: GroupRow; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [semanas, setSemanas] = useState<SemanaDeGrupo[] | undefined>(undefined);
  const [semanaSel, setSemanaSel] = useState<string>(lunesDeSemana());

  const cargarPlan = useCallback(async () => {
    const res = await getGroupTrainingPlan(g.id);
    setSemanas(res.success ? res.semanas : []);
  }, [g.id]);

  useEffect(() => { if (abierto) cargarPlan(); }, [abierto, cargarPlan]);

  const opciones = semanasEditables(); // esta semana + 4 por venir
  const semanaActual = semanas?.find((s) => s.weekStart === semanaSel);
  const planSel: WeeklyPlan | null | undefined =
    semanas === undefined ? undefined : (semanaActual?.plan ?? null);
  const pasadas = (semanas ?? []).filter((s) => s.pasada);
  const lunesHoy = lunesDeSemana();

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
        <div className="px-3 pb-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">

          {/* SELECTOR DE SEMANA */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <CalendarDays size={13} className="text-slate-500 dark:text-slate-400 shrink-0" />
            {opciones.map((o) => {
              const tiene = (semanas ?? []).some((s) => s.weekStart === o.weekStart && s.plan);
              const activo = o.weekStart === semanaSel;
              return (
                <button
                  key={o.weekStart}
                  onClick={() => setSemanaSel(o.weekStart)}
                  className={cx('min-h-[32px] px-2.5 rounded-lg text-xs font-bold border',
                    activo
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300')}
                >
                  {o.offset === 0 ? 'Esta semana' : etiquetaSemana(o.weekStart)}
                  {tiene && <span className={cx('ml-1', activo ? '' : 'text-emerald-600 dark:text-emerald-400')}>●</span>}
                </button>
              );
            })}
          </div>

          {semanaSel < lunesHoy ? (
            <SemanaSoloLectura plan={semanaActual?.plan ?? null} />
          ) : (
            <>
              <PlanEntrenadorEditor
                key={semanaSel}
                planActual={planSel === undefined ? undefined : planSel ? { id: `grupo:${g.id}`, weekStart: semanaSel, plan: planSel } : null}
                etiquetaGuardado={semanaSel === lunesHoy ? 'Guardado. Es el plan de esta semana para el grupo.' : 'Guardado. Preparado para esa semana.'}
                onSave={(params) => saveGroupTrainingPlan({ groupId: g.id, weekStart: semanaSel, weekFocus: params.weekFocus, days: params.days })}
                onGuardado={() => { cargarPlan(); onCambio(); }}
              />

              {semanaActual?.plan && (
                <button
                  onClick={async () => { await deleteGroupTrainingPlan(g.id, semanaSel); cargarPlan(); onCambio(); }}
                  className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5 hover:underline"
                >
                  <Trash2 size={13} /> Borrar el plan de esta semana
                </button>
              )}
            </>
          )}

          {/* HISTÓRICO */}
          {pasadas.length > 0 && (
            <details className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <summary className={cx(TEXT.muted, 'cursor-pointer')}>Semanas anteriores ({pasadas.length})</summary>
              <div className="mt-2 space-y-1">
                {pasadas.map((s) => (
                  <div key={s.weekStart} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-600 dark:text-slate-300">
                      Semana del {etiquetaSemana(s.weekStart)} · {s.plan?.days.length ?? 0} días
                    </span>
                    <button
                      onClick={() => { setSemanaSel(s.weekStart); }}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      title="Ver (solo lectura al ser una semana pasada)"
                    >
                      ver
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

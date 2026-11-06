'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Dumbbell, RefreshCw, Users2, CalendarDays, Sparkles, Trophy } from 'lucide-react';
import { getTrainingSwitches, setTrainingSwitch } from '@/actions';
import { TRAINING_SWITCH_LABEL, TRAINING_SWITCH_DESC, type TrainingSwitches } from '@/app/lib/training-switches';
import Planificador from './fisica/Planificador';
import MarcasAcademia from './fisica/MarcasAcademia';
import { Card, EmptyState, Button, TEXT, cx } from '../../ui';

/**
 * «Preparación física» (P7, afinado tras P8): el entrenamiento vive aquí, por
 * GRUPO, no en la ficha de cada alumno — salvo en la academia «casa», que es
 * la excepción a propósito (ver más abajo).
 *
 * `ai` y `group` son EXCLUYENTES por academia (decidido el 12 sep, ver regla
 * en `lib/training-switches.ts`): la academia casa (`ACADEMIA_CASA_SLUG`) es
 * solo-IA — el alumno se genera su plan —; cualquier otra es solo-manual — un
 * preparador escribe el plan por grupo —. `esCasa` decide cuál de los dos
 * interruptores se ofrece; el otro ni aparece, no solo se apaga.
 */
export default function AdminPhysical() {
  const [switches, setSwitches] = useState<TrainingSwitches | null>(null);
  const [esCasa, setEsCasa] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [vista, setVista] = useState<'planificar' | 'marcas'>('planificar');

  const cargar = useCallback(async () => {
    const switchesRes = await getTrainingSwitches();
    if (switchesRes.success) { setSwitches(switchesRes.switches); setEsCasa(switchesRes.esCasa); }
    else setError(switchesRes.error);
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
  const iaOn = switches?.ai !== false;

  return (
    <div className="space-y-4 animate-in fade-in pb-24">
      <Card tone="sunken" pad="md" className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-slate-700/10 dark:bg-white/5 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
            <Dumbbell size={20} />
          </div>
          <div>
            <h3 className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-tight">Preparación física</h3>
            <p className={cx(TEXT.muted, 'mt-0.5')}>
              {esCasa ? 'El alumno se genera su plan con IA, semana a semana.' : 'Sesiones para un grupo o para un alumno, y las marcas de las pruebas oficiales.'}
            </p>
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

      {/* --- INTERRUPTOR, UNO SOLO: `ai` en la academia casa, `group` en
          cualquier otra (regla de la academia casa). El que no toca no se
          ofrece — no es solo que esté apagado, es que aquí no es una opción. */}
      {switches && (
        <div className="grid gap-2 sm:gap-3">
          {esCasa ? (
            <SwitchCard
              icon={<Sparkles size={16} />}
              label={TRAINING_SWITCH_LABEL.ai}
              desc={TRAINING_SWITCH_DESC.ai}
              on={switches.ai}
              busy={busy}
              onToggle={(v) => cambiaSwitch('ai', v)}
            />
          ) : (
            <SwitchCard
              icon={<Users2 size={16} />}
              label={TRAINING_SWITCH_LABEL.group}
              desc={TRAINING_SWITCH_DESC.group}
              on={switches.group}
              busy={busy}
              onToggle={(v) => cambiaSwitch('group', v)}
            />
          )}
        </div>
      )}

      {esCasa ? (
        !iaOn && (
          <EmptyState
            icon={<Sparkles size={40} />}
            title="La generación con IA está apagada"
            hint="Enciéndela arriba para que el alumno pueda pedir su plan semanal."
            bordered
          />
        )
      ) : !grupoOn ? (
        <EmptyState
          icon={<Users2 size={40} />}
          title="El plan por grupo está apagado"
          hint="Enciéndelo arriba para planificar las sesiones de tus grupos y alumnos."
          bordered
        />
      ) : (
        <>
          <div className="flex gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/60 max-w-md">
            {([['planificar', 'Planificar', CalendarDays], ['marcas', 'Marcas', Trophy]] as const).map(([id, texto, Icono]) => (
              <button key={id} onClick={() => setVista(id)} aria-pressed={vista === id}
                className={cx('flex-1 min-h-[44px] rounded-xl text-sm font-black flex items-center justify-center gap-2',
                  vista === id ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400')}>
                <Icono size={16} /> {texto}
              </button>
            ))}
          </div>
          {vista === 'planificar' ? <Planificador /> : <MarcasAcademia />}
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

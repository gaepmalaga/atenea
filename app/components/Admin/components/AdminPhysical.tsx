'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { RefreshCw, Users2, Sparkles } from 'lucide-react';
import { getTrainingSwitches, setTrainingSwitch } from '@/actions';
import { TRAINING_SWITCH_LABEL, TRAINING_SWITCH_DESC, type TrainingSwitches } from '@/app/lib/training-switches';
import Planificador from './fisica/Planificador';
import MarcasAcademia from './fisica/MarcasAcademia';
import Cuadrante from './fisica/Cuadrante';
import { PanelTitulo, Pestanas, Hoja, BloqueTitulo, Aviso, Boton, Estado, EmptyState, cx } from '../../ui';

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
  const [vista, setVista] = useState<'cuadrante' | 'planificar' | 'marcas'>('cuadrante');

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
    <div className="space-y-5 animate-in fade-in pb-24">
      <PanelTitulo
        titulo="Prep. física"
        sub={esCasa ? 'El alumno se genera su plan con IA, semana a semana.' : 'El cuadrante de cada semana, el entreno de cada alumno y las marcas de las pruebas oficiales.'}
        acciones={<Boton variant="secondary" icon={<RefreshCw size={15} className={loading ? 'animate-spin' : ''} />} onClick={() => { setLoading(true); cargar(); }}>Recargar</Boton>}
      />

      {error && <Aviso tono="malo">{error}</Aviso>}

      {/* En Alphapol (no es la academia casa) el interruptor de la física con
          preparador se quitó de la vista a petición del dueño (regla 103): está
          encendido y no se toca. Si alguna vez estuviera apagado, el aviso de
          abajo trae su botón para encenderlo. */}
      {switches && esCasa && (
        <SwitchCard
          icon={<Sparkles size={16} />}
          label={TRAINING_SWITCH_LABEL.ai}
          desc={TRAINING_SWITCH_DESC.ai}
          on={switches.ai}
          busy={busy}
          onToggle={(v) => cambiaSwitch('ai', v)}
        />
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
          title="La física con preparador está apagada"
          hint="Los alumnos no ven su calendario de física ni tú el cuadrante. Enciéndela para volver a usarla."
          action={<Boton disabled={busy} onClick={() => cambiaSwitch('group', true)}>Encender</Boton>}
          bordered
        />
      ) : (
        <>
          <Pestanas
            etiqueta="Vistas de la preparación física"
            activa={vista}
            onCambia={setVista}
            items={[
              { id: 'cuadrante', etiqueta: 'Cuadrante' },
              { id: 'planificar', etiqueta: 'Planificar' },
              { id: 'marcas', etiqueta: 'Marcas' },
            ]}
          />
          {vista === 'cuadrante' ? <Cuadrante /> : vista === 'planificar' ? <Planificador /> : <MarcasAcademia />}
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
    <Hoja pad="md" className={cx('flex flex-col gap-2', !on && 'opacity-80')}>
      <div className="flex items-start justify-between gap-3">
        <BloqueTitulo icon={icon}>{label}</BloqueTitulo>
        <Boton size="sm" variant={on ? 'secondary' : 'primary'} disabled={busy} onClick={() => onToggle(!on)}>
          {on ? 'Apagar' : 'Encender'}
        </Boton>
      </div>
      <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">{desc}</p>
      <Estado tono={on ? 'ok' : 'apagado'}>{on ? 'Encendido' : 'Apagado'}</Estado>
    </Hoja>
  );
}

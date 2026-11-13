'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ShieldOff, Sparkles } from 'lucide-react';
import { getModuleSettings, setModuleEnabled, getTrainingSwitches, setTrainingSwitch } from '@/actions';
import {
  MODULE_IDS_MVP,
  MODULE_LABEL,
  MODULE_DESCRIPCION,
  todosActivos,
  modulosActivos,
  type ModuleId,
  type ModuleSettings,
} from '@/app/lib/modules';
import { TRAINING_SWITCH_LABEL, TRAINING_SWITCH_DESC } from '@/app/lib/training-switches';
import AcademyIdentity from './AcademyIdentity';
import AdminDemo from './AdminDemo';
import { PanelTitulo, Hoja, BloqueTitulo, Aviso, Conmutador } from '../../ui';
import { confirmar } from '@/app/lib/dialogos';

/**
 * Los interruptores de los módulos del alumno (P4).
 *
 * La decisión fue que se pueda apagar **cualquiera**, así que están los ocho,
 * Centro de Mando y Estadísticas incluidos.
 *
 * Apagar uno lo apaga también en el servidor: la Server Action del módulo se
 * cierra antes de tocar a Gemini. Esconder el enlace del menú no es una medida
 * de seguridad — una Server Action es un endpoint HTTP público.
 */
export default function AdminModules() {
  const [settings, setSettings] = useState<ModuleSettings>(todosActivos);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<ModuleId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adaptativo, setAdaptativo] = useState<boolean | null>(null);
  const [guardandoAdaptativo, setGuardandoAdaptativo] = useState(false);

  useEffect(() => {
    let vivo = true;
    Promise.all([getModuleSettings(), getTrainingSwitches()]).then(([mods, sw]) => {
      if (!vivo) return;
      if (mods.success) setSettings(mods.settings);
      else setError(mods.error);
      if (sw.success) setAdaptativo(sw.switches.adaptive);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, []);

  async function alternaAdaptativo() {
    if (adaptativo === null) return;
    setGuardandoAdaptativo(true);
    setError(null);
    const res = await setTrainingSwitch({ switchId: 'adaptive', enabled: !adaptativo });
    if (res.success) setAdaptativo(!adaptativo);
    else setError(res.error ?? 'No se pudo guardar.');
    setGuardandoAdaptativo(false);
  }

  async function alterna(id: ModuleId) {
    const nuevo = !settings[id];
    setGuardando(id);
    setError(null);

    const res = await setModuleEnabled({ moduleId: id, enabled: nuevo });

    if (res.success) {
      setSettings((prev) => ({ ...prev, [id]: nuevo }));
    } else {
      // Se enseña: una escritura fallida que solo va a la consola deja al
      // administrador creyendo que apagó un módulo que sigue encendido.
      setError(res.error ?? 'No se pudo guardar.');
    }
    setGuardando(null);
  }

  const activos = modulosActivos(settings).length;

  // Apagar un módulo lo apaga para TODOS los alumnos y al instante (también en
  // el servidor), así que se pregunta. Encender no hace falta preguntarlo.
  async function pideAlternar(id: ModuleId) {
    if (settings[id] && !(await confirmar(`¿Apagar «${MODULE_LABEL[id]}»? Los alumnos dejan de verlo y de poder usarlo en este mismo momento.`))) return;
    alterna(id);
  }

  return (
    <div className="space-y-5 animate-in fade-in pb-24">
      <PanelTitulo titulo="Ajustes" sub="Lo que ve y lo que puede hacer el alumno, y los datos de la academia." />

      <AcademyIdentity />

      {error && <Aviso tono="malo"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}</Aviso>}

      {activos === 0 && !cargando && (
        <Aviso>
          <ShieldOff size={15} className="mt-0.5 shrink-0" />
          No queda ningún módulo activo: los alumnos entran a una pantalla que solo les dice que hablen con la academia.
        </Aviso>
      )}

      <Hoja className="overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-linea dark:border-noche-linea px-4 py-3.5">
          <BloqueTitulo>Módulos del alumno</BloqueTitulo>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {cargando ? 'Cargando…' : `${activos} de ${MODULE_IDS_MVP.length} activos`} · lo que se apaga aquí deja de servirse también en el servidor
          </p>
        </div>
        {/* Los que están fuera del MVP no salen: su interruptor sería una mentira,
            porque el alumno no los ve de todas formas (MODULOS_FUERA_DEL_MVP). */}
        {MODULE_IDS_MVP.map((id) => {
          const activo = settings[id];
          return (
            <div key={id} className="flex items-center justify-between gap-4 border-b border-linea dark:border-noche-linea px-4 py-2.5 last:border-b-0">
              <div className="min-w-0">
                <p className={activo ? 'font-semibold text-slate-900 dark:text-white' : 'font-semibold text-slate-600 dark:text-slate-400'}>{MODULE_LABEL[id]}</p>
                <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">{MODULE_DESCRIPCION[id]}</p>
              </div>
              <Conmutador activo={activo} etiqueta={MODULE_LABEL[id]} disabled={guardando === id || cargando} onChange={() => pideAlternar(id)} />
            </div>
          );
        })}
      </Hoja>

      {/* Ajustes de método de estudio. El entrenamiento adaptativo (P10). */}
      <Hoja className="flex items-center justify-between gap-4 px-4 py-2.5">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
            <Sparkles size={15} className="text-indigo-700 dark:text-indigo-300" /> {TRAINING_SWITCH_LABEL.adaptive}
          </p>
          <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">{TRAINING_SWITCH_DESC.adaptive}</p>
        </div>
        <Conmutador activo={adaptativo === true} etiqueta={TRAINING_SWITCH_LABEL.adaptive} disabled={guardandoAdaptativo || cargando || adaptativo === null} onChange={alternaAdaptativo} />
      </Hoja>

      {/* Datos de demostración (regla 106): lo que no se toca a diario va al final (regla 103). */}
      <AdminDemo />
    </div>
  );
}

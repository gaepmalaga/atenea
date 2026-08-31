'use client';

import { useEffect, useState } from 'react';
import { Loader2, Power, AlertTriangle, ShieldOff } from 'lucide-react';
import { getModuleSettings, setModuleEnabled } from '@/actions';
import {
  MODULE_IDS,
  MODULE_LABEL,
  MODULE_DESCRIPCION,
  todosActivos,
  modulosActivos,
  type ModuleId,
  type ModuleSettings,
} from '@/app/lib/modules';

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

  useEffect(() => {
    let vivo = true;
    getModuleSettings().then((res) => {
      if (!vivo) return;
      if (res.success) setSettings(res.settings);
      else setError(res.error);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, []);

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

  return (
    <div className="space-y-6 animate-in fade-in pb-24">
      <div className="bg-slate-900/80 border border-white/10 p-6 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-cyan-600 to-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
            <Power size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="font-black text-white text-base tracking-tight uppercase">Módulos del alumno</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {cargando ? 'Cargando…' : `${activos} de ${MODULE_IDS.length} activos`}
              {' · '}lo que se apaga aquí deja de servirse también en el servidor
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/5 border border-red-500/20 text-red-300 rounded-2xl px-4 py-3 text-xs font-medium flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {activos === 0 && !cargando && (
        <div className="bg-amber-500/5 border border-amber-500/20 text-amber-200/90 rounded-2xl px-4 py-3 text-xs font-medium flex items-center gap-2">
          <ShieldOff size={14} />
          No queda ningún módulo activo: los alumnos entran a una pantalla que solo les dice
          que hablen con la academia.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {MODULE_IDS.map((id) => {
          const activo = settings[id];
          return (
            <div
              key={id}
              className={`border rounded-3xl p-5 transition-all ${
                activo ? 'bg-slate-900 border-slate-800' : 'bg-slate-950 border-slate-800/60'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className={`font-black text-sm ${activo ? 'text-white' : 'text-slate-500'}`}>
                    {MODULE_LABEL[id]}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{MODULE_DESCRIPCION[id]}</p>
                </div>

                <button
                  onClick={() => alterna(id)}
                  disabled={guardando === id || cargando}
                  aria-pressed={activo}
                  title={activo ? 'Desactivar' : 'Activar'}
                  className={`shrink-0 w-14 h-8 rounded-full flex items-center px-1 transition-all disabled:opacity-40 ${
                    activo ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                  }`}
                >
                  <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-slate-900">
                    {guardando === id && <Loader2 size={12} className="animate-spin" />}
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import {
  Shield, LogOut, RefreshCw, Users, Book,
  Activity, AlertTriangle, Database, Power, Coins, KeyRound, Users2, Dumbbell,
  ArrowLeftRight, ChevronLeft, ChevronRight, Check
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import AdminStudents from './components/AdminStudents';
import AdminPayments from './components/AdminPayments';
import AdminContent from './components/AdminContent';
import AdminActivity from './components/AdminActivity';
import AdminModeration from './components/AdminModeration';
import AdminBank from './components/AdminBank';
import AdminModules from './components/AdminModules';
import AdminCost from './components/AdminCost';
import AdminGroups from './components/AdminGroups';
import AdminPhysical from './components/AdminPhysical';
import ModuleErrorBoundary from '../shared/ModuleErrorBoundary';
import type { AuthUser } from '@/app/lib/auth';

/** Las pestañas del panel. El `id` de `tabs` tiene que ser uno de estos. */
type AdminTab = 'students' | 'groups' | 'physical' | 'payments' | 'moderation' | 'content' | 'activity' | 'bank' | 'modules' | 'cost';

/**
 * El orden de las pestañas lo puede cambiar cada admin y se recuerda en SU
 * navegador (`localStorage`) — es una comodidad por dispositivo, no un ajuste de
 * academia (regla 36 sobre `localStorage`: se envuelve en try/catch y se pinta
 * bien sin valor guardado).
 */
const ORDEN_KEY = 'atenea-admin-orden-pestanas';

function leeOrdenGuardado(): string[] {
  try {
    const raw = localStorage.getItem(ORDEN_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function guardaOrden(ids: string[]): void {
  try {
    localStorage.setItem(ORDEN_KEY, JSON.stringify(ids));
  } catch {
    /* modo privado, o almacenamiento bloqueado: el orden vuelve al de por defecto */
  }
}

/**
 * Reordena `tabs` según los ids guardados: primero los conocidos en el orden
 * guardado, después los que sean nuevos (una pestaña añadida al código aparece
 * al final en vez de desaparecer).
 */
function aplicaOrden<T extends { id: string }>(tabs: T[], orden: string[]): T[] {
  if (orden.length === 0) return tabs;
  const porId = new Map(tabs.map((t) => [t.id, t]));
  const vistos = new Set<string>();
  const salida: T[] = [];
  for (const id of orden) {
    const t = porId.get(id);
    if (t && !vistos.has(id)) { salida.push(t); vistos.add(id); }
  }
  for (const t of tabs) if (!vistos.has(t.id)) salida.push(t);
  return salida;
}

export default function AdminView({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  // Estado para la navegación
  // Añadimos 'bank' a los tipos permitidos
  const [activeTab, setActiveTab] = useState<AdminTab>('students');
  
  // Truco para forzar recarga de componentes hijos sin recargar la página entera
  const [refreshKey, setRefreshKey] = useState(0); 

  // Al cambiar de seccion, arriba del todo. Mismo motivo que en el alumno: el
  // panel es UNA sola ruta con pestañas, asi que sin esto entras en la seccion
  // nueva por donde te quedaste en la anterior.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [activeTab]);

  const forceRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  // Orden de las pestañas, editable y recordado en este navegador.
  const [orden, setOrden] = useState<string[]>([]);
  const [reordenando, setReordenando] = useState(false);
  useEffect(() => { setOrden(leeOrdenGuardado()); }, []);

  // Configuración del Menú
  // `satisfies` y no `as`: obliga a que cada `id` sea un AdminTab de verdad,
  // sin borrar el tipo literal de cada uno. Antes se colaba con `as any` en el
  // onClick, asi que una pestaña mal escrita compilaba y no hacia nada.
  const tabs = [
    { id: 'students', label: 'Alumnos', icon: Users, color: 'text-blue-700 dark:text-blue-400' },
    { id: 'groups', label: 'Grupos', icon: Users2, color: 'text-teal-700 dark:text-teal-400' },
    { id: 'physical', label: 'Prep. física', icon: Dumbbell, color: 'text-orange-700 dark:text-orange-400' },
    { id: 'payments', label: 'Pagos', icon: KeyRound, color: 'text-rose-700 dark:text-rose-400' },
    { id: 'content', label: 'Temario & IA', icon: Book, color: 'text-purple-700 dark:text-purple-400' },
    { id: 'bank', label: 'Banco Oficial', icon: Database, color: 'text-emerald-700 dark:text-emerald-400' }, // <--- NUEVA PESTAÑA
    { id: 'moderation', label: 'Moderación', icon: AlertTriangle, color: 'text-amber-700 dark:text-amber-400' },
    { id: 'modules', label: 'Ajustes', icon: Power, color: 'text-cyan-700 dark:text-cyan-400' },
    { id: 'cost', label: 'Consumo IA', icon: Coins, color: 'text-lime-700 dark:text-lime-400' },
    { id: 'activity', label: 'Logs & Auditoría', icon: Activity, color: 'text-slate-500 dark:text-slate-400' },
  ] satisfies { id: AdminTab; label: string; icon: LucideIcon; color: string }[];

  const tabsOrdenadas = aplicaOrden(tabs, orden);

  const mueve = (id: AdminTab, dir: -1 | 1) => {
    const ids = tabsOrdenadas.map((t) => t.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrden(ids);
    guardaOrden(ids);
  };

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 pb-[max(2rem,env(safe-area-inset-bottom))] font-sans">

      {/* LA BARRA SE QUEDA OSCURA SIEMPRE, Y ES LA ÚNICA COSA QUE NO SIGUE EL
          TEMA. No es un resto del panel de antes: es la señal de contexto.
          Este es el sitio donde se borra temario y se publican preguntas para
          todos los alumnos, y conviene saber de un vistazo que ya no estás en
          el de estudiar. El contenido sí sigue el tema, porque esto se usa de
          día y a plena luz, y ahí el oscuro se lee peor.

          El filete de la bandera viene del login, en proporciones reales
          (1:2:1). */}
      <div className="bg-slate-950 text-slate-200 px-4 md:px-8 pt-4">

      {/* --- HEADER SUPERIOR --- */}
      {/* Era `flex-col md:flex-row` con `items-center`: en movil eso centraba
          la identidad y dejaba los dos botones en una fila aparte, ocupando
          dos alturas completas antes de las pestañas. Ahora es una sola fila
          desde el principio, con los controles a la derecha. */}
      <header className="flex items-center justify-between gap-3 pb-4 md:pb-6">

        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-indigo-600/20 p-2.5 md:p-3 rounded-2xl border border-indigo-500/30 shrink-0">
            <Shield className="text-indigo-400 w-5 h-5 md:w-7 md:h-7" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-black text-white tracking-tight leading-none truncate">
              Centro de Mando
            </h1>
            <div className="flex items-center gap-2 mt-1 min-w-0">
              <span className="text-[9px] font-black bg-indigo-500 text-white px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
                Admin
              </span>
              <p className="text-[11px] font-mono text-slate-400 truncate">{user.email}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setReordenando((x) => !x)}
            className={`flex items-center justify-center w-11 h-11 border rounded-xl transition-all ${
              reordenando
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 text-slate-500 dark:text-slate-400'
            }`}
            title={reordenando ? 'Listo' : 'Reordenar pestañas'}
            aria-label={reordenando ? 'Terminar de reordenar' : 'Reordenar pestañas'}
          >
            {reordenando ? <Check size={18} /> : <ArrowLeftRight size={18} />}
          </button>
          <button
            onClick={forceRefresh}
            className="flex items-center justify-center w-11 h-11 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all group"
            title="Recargar datos"
            aria-label="Recargar datos"
          >
            <RefreshCw size={18} className="group-hover:rotate-180 transition-transform duration-500" />
          </button>

          {/* En movil solo el icono: "Salir" escrito al lado empujaba el
              correo del admin hasta dejarlo en tres letras. */}
          <button
            onClick={onLogout}
            className="flex items-center justify-center gap-2 min-h-[44px] w-11 md:w-auto md:px-5 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40 text-red-700 dark:text-red-400 rounded-xl transition-all font-bold text-xs uppercase tracking-wide"
            aria-label="Cerrar sesión"
          >
            <LogOut size={16} />
            <span className="hidden md:inline">Salir</span>
          </button>
        </div>
      </header>

      {/* --- NAVEGACIÓN PRINCIPAL (PESTAÑAS) --- */}
      {/* Siete pestañas no caben en un telefono, asi que la fila se desplaza en
          horizontal. El degradado del borde derecho es la parte que faltaba:
          sin el, no habia NADA que indicara que hay mas pestañas fuera de
          pantalla, y las tres ultimas (incluida Modulos) eran invisibles para
          quien no arrastrara por probar. */}
      <div className="relative">
        {reordenando && (
          <p className="text-[11px] text-slate-400 pb-2">
            Usa las flechas para mover cada pestaña. Se guarda solo en este navegador.
          </p>
        )}
        <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex gap-2 min-w-max pb-1">
            {tabsOrdenadas.map((tab, i) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;

              if (reordenando) {
                return (
                  <div key={tab.id} className="min-h-[44px] px-2 rounded-xl font-bold text-sm flex items-center gap-1.5 bg-slate-800 text-slate-200 ring-1 ring-slate-700">
                    <button
                      onClick={() => mueve(tab.id, -1)}
                      disabled={i === 0}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-700 disabled:opacity-30"
                      aria-label={`Mover ${tab.label} a la izquierda`}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <Icon size={16} className={tab.color} />
                    <span className="px-1">{tab.label}</span>
                    <button
                      onClick={() => mueve(tab.id, 1)}
                      disabled={i === tabsOrdenadas.length - 1}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-700 disabled:opacity-30"
                      aria-label={`Mover ${tab.label} a la derecha`}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                );
              }

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative min-h-[44px] px-4 md:px-5 rounded-xl font-bold text-sm flex items-center gap-2.5 transition-all duration-300 ${
                    isActive
                      ? 'bg-slate-800 text-white ring-1 ring-slate-700'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  {isActive && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-[3px] bg-indigo-500 rounded-t-full" />
                  )}
                  <Icon size={18} className={isActive ? tab.color : 'opacity-70'} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="md:hidden pointer-events-none absolute right-0 top-0 bottom-1 w-10 bg-gradient-to-l from-slate-950 to-transparent" />
      </div>

      {/* El filete cierra la banda y la separa del contenido. En proporciones
          reales (1:2:1): en tres franjas iguales la bandera canta. */}
      <div
        className="h-1 -mx-4 md:-mx-8 mt-3"
        style={{ background: 'linear-gradient(to right,#c60b1e 0 22%,#ffc400 22% 78%,#c60b1e 78% 100%)' }}
        aria-hidden
      />
      </div>

      {/* --- ÁREA DE CONTENIDO (RENDERIZADO DINÁMICO) --- */}
      {/* `min-h-[600px]` fijo dejaba medio movil en negro en las secciones
          cortas (Modulos son ocho interruptores). */}
      <main className="animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-[40dvh] px-4 md:px-8 pt-5 md:pt-8">
        {/* Usamos la 'key' para forzar remontaje si pulsamos Refrescar */}
        <div key={refreshKey}>
            <ModuleErrorBoundary moduleName={tabs.find(t => t.id === activeTab)?.label ?? 'La seccion'}>
                {activeTab === 'students' && <AdminStudents />}
                {activeTab === 'groups' && <AdminGroups />}
                {activeTab === 'physical' && <AdminPhysical />}
                {activeTab === 'payments' && <AdminPayments />}
                {activeTab === 'content' && <AdminContent />}
                {activeTab === 'bank' && <AdminBank />}
                {activeTab === 'moderation' && <AdminModeration />}
                {activeTab === 'modules' && <AdminModules />}
                {activeTab === 'cost' && <AdminCost />}
                {activeTab === 'activity' && <AdminActivity />}
            </ModuleErrorBoundary>
        </div>
      </main>
      
    </div>
  );
}
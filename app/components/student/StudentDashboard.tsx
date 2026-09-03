'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  LayoutGrid, MessageSquareText, Crosshair, Zap, 
  Fingerprint, BarChart2, Dumbbell, Target 
} from 'lucide-react';

// --- LAYOUT COMPONENTS ---
import Sidebar from './layout/Sidebar';
import MobileNav from './layout/MobileNav';
import Header from './layout/Header';

// --- MODULES ---
import DashboardHome from './modules/home/DashboardHome';
import IntelChat from './modules/chat/IntelChat';
import ExamManager from './modules/exams/ExamManager';
import FlashcardDeck from './modules/flashcards/FlashcardDeck';
import PhysicalTrainer from './modules/training/PhysicalTrainer'; // NUEVO MÓDULO
import BiodataManager from './modules/profile/BiodataManager';
import InterviewRoom from './modules/interview/InterviewRoom';
import StatsPanel from './modules/stats/StatsPanel';
import FailedQuestions from './modules/review/FailedQuestions';
import ModuleErrorBoundary from '../shared/ModuleErrorBoundary';
import type { AuthUser } from '@/app/lib/auth';
import { getModuleSettings } from '@/actions';
import { todosActivos, moduloDeEntrada, type ModuleSettings } from '@/app/lib/modules';

// --- TIPOS ---
export type TabId = 'home' | 'chat' | 'test' | 'review' | 'cards' | 'training' | 'interview' | 'stats';

interface StudentDashboardProps {
  user: AuthUser;
  onLogout: () => void;
}

export default function StudentDashboard({ user, onLogout }: StudentDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  /**
   * Que modulos ha dejado encendidos la academia (P4).
   *
   * Se parte de TODOS ACTIVOS y no de una pantalla vacia: mientras la consulta
   * viaja, y tambien si falla, el alumno ve su plataforma entera. Un fallo de
   * lectura no puede parecerse a un apagado deliberado.
   */
  const [modules, setModules] = useState<ModuleSettings>(todosActivos);
  const [zenMode, setZenMode] = useState(false); // Oculta UI durante simulacros
  const [interviewMode, setInterviewMode] = useState(false); // Activa Overlay de Sala de Voz

  // CONFIGURACIÓN DEL MENÚ DE NAVEGACIÓN
  const todosLosItems = [
    { id: 'home', label: 'Centro de Mando', icon: LayoutGrid },
    { id: 'chat', label: 'Inteligencia (RAG)', icon: MessageSquareText },
    { id: 'test', label: 'Operaciones (Test)', icon: Crosshair },
    // Justo despues del test, no al final: el repaso del fallo es el paso
    // siguiente de hacer el test, no un apartado de consulta.
    { id: 'review', label: 'Repasar fallos', icon: Target },
    { id: 'cards', label: 'Drills (Memoria)', icon: Zap },
    { id: 'training', label: 'Prep. Física', icon: Dumbbell }, // NUEVO
    { id: 'interview', label: 'Perfilado & Voz', icon: Fingerprint },
    { id: 'stats', label: 'Rango & Estadísticas', icon: BarChart2 }
  ];

  // El menu se deriva del estado, no se guarda: es la regla 14 aplicada a otra
  // cosa. Y se filtra ADEMAS de cerrar la accion en el servidor — esconder el
  // enlace no es una medida de seguridad, es de cortesia.
  const navItems = todosLosItems.filter((i) => modules[i.id as TabId]);
  const sinModulos = navItems.length === 0;

  // Los interruptores de los modulos. Si el que estaba abierto se ha apagado
  // —o si `home` lo esta al entrar—, se salta al primero que quede encendido.
  useEffect(() => {
    let vivo = true;
    getModuleSettings().then((res) => {
      if (!vivo || !res.success) return;
      setModules(res.settings);
      setActiveTab((actual) => (res.settings[actual] ? actual : moduloDeEntrada(res.settings) ?? actual));
    });
    return () => { vivo = false; };
  }, []);

  // Detectar preferencia de tema oscuro del sistema al inicio
  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  /**
   * Al cambiar de pantalla, arriba del todo.
   *
   * ESTE ERA EL "SIEMPRE ME LLEVA AL FINAL DE LA PAGINA".
   * La aplicacion es UNA sola ruta con pestañas: al cambiar de pestaña no hay
   * navegacion del navegador, asi que la posicion del scroll se queda donde
   * estaba. Y como la barra de pestañas vive ABAJO, cuando pulsas una llevas
   * por definicion la pagina bajada: entrabas en la pantalla nueva por el
   * final. Si ademas era mas corta que la anterior, el navegador te dejaba
   * pegado a su ultimo pixel.
   *
   * Sin `behavior: 'smooth'` a proposito: cambiar de seccion tiene que ser
   * instantaneo, y una animacion de scroll aqui se siente como un tiron.
   */
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [activeTab]);

  /**
   * El boton ATRAS del movil.
   *
   * Siendo una sola ruta, Atras SALIA DE LA APLICACION. En Android es el gesto
   * que mas se usa: el alumno lo pulsaba esperando volver del test al menu y
   * se encontraba fuera, con el examen perdido. Ahora cada pestaña deja su
   * entrada en el historial y Atras vuelve a la anterior.
   *
   * `zenModeRef` y no `zenMode`: el manejador se registra una vez, y leer el
   * estado desde el cierre daria siempre el valor del primer render (regla 13).
   */
  const zenModeRef = useRef(zenMode);
  const activeTabRef = useRef<TabId>(activeTab);
  // Se sincronizan en un efecto, no durante el render: escribir en un ref
  // mientras se renderiza es un efecto colateral encubierto.
  useEffect(() => {
    zenModeRef.current = zenMode;
    activeTabRef.current = activeTab;
  });

  useEffect(() => {
    // La pestaña de entrada no añade entrada nueva: si lo hiciera, harian falta
    // dos Atras para salir de la aplicacion desde el inicio.
    window.history.replaceState({ atenea: 'home' }, '');

    const alVolver = (e: PopStateEvent) => {
      const destino = (e.state as { atenea?: string } | null)?.atenea;

      // Con un examen abierto, Atras no se lo lleva por delante sin preguntar.
      // El examen queda guardado y es reanudable, pero perder el sitio de golpe
      // en mitad de un simulacro cronometrado es lo bastante caro como para
      // confirmarlo.
      if (zenModeRef.current) {
        window.history.pushState({ atenea: 'test' }, '');
        const salir = window.confirm(
          'Tienes un examen en curso.\n\n¿Salir? Se guarda y podrás reanudarlo desde donde lo dejaste.',
        );
        if (salir) {
          setZenMode(false);
          setActiveTab('test');
        }
        return;
      }

      if (destino) setActiveTab(destino as TabId);
    };

    window.addEventListener('popstate', alVolver);
    return () => window.removeEventListener('popstate', alVolver);
  }, []);

  /**
   * Cambiar de pestaña, dejando huella en el historial.
   *
   * Todo lo que navega pasa por aqui: la barra lateral, la barra de abajo y los
   * accesos del centro de mando. Si alguno llamara a `setActiveTab` a secas, esa
   * pestaña no existiria para el boton Atras.
   */
  const irAPestana = useCallback((id: TabId) => {
    // El `pushState` va FUERA del actualizador de `setActiveTab`: el
    // actualizador tiene que ser puro, y en StrictMode se ejecuta dos veces
    // (regla 14). Metido dentro, cada cambio de pestaña dejaba DOS entradas en
    // el historial y hacían falta dos Atrás para volver una.
    if (activeTabRef.current === id) return;
    window.history.pushState({ atenea: id }, '');
    setActiveTab(id);
  }, []);

  /**
   * Cerrar la pestaña del navegador con un examen abierto.
   *
   * El examen ya se guarda solo, pero el aviso del navegador es la unica forma
   * de que el alumno sepa que se esta yendo de uno: sin el, cerrar sin querer
   * parece que no ha pasado nada hasta que vuelve y no encuentra el test.
   */
  useEffect(() => {
    if (!zenMode) return;
    const alCerrar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Los navegadores modernos ignoran el texto y enseñan el suyo, pero
      // `returnValue` sigue siendo lo que dispara el aviso.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', alCerrar);
    return () => window.removeEventListener('beforeunload', alCerrar);
  }, [zenMode]);

  return (
    <div className={`relative min-h-screen flex bg-slate-50 dark:bg-slate-950 transition-colors duration-500 font-sans text-slate-900 dark:text-slate-100 ${zenMode ? 'zen-active' : ''}`}>
      
      {/* 1. OVERLAY DE SALA DE VOZ (PRIORIDAD MÁXIMA) */}
      {/* Se monta sobre toda la interfaz cuando se activa el modo entrevista */}
      {interviewMode && (
         <div className="fixed inset-0 z-[200] bg-black animate-in fade-in duration-300">
             <InterviewRoom onExit={() => setInterviewMode(false)} />
         </div>
      )}

      {/* 2. BARRA LATERAL (SIDEBAR) */}
      <Sidebar 
        activeTab={activeTab} 
        onTabChange={(id) => irAPestana(id as TabId)} 
        onLogout={onLogout}
        items={navItems}
        hidden={zenMode}
      />

      {/* 3. ÁREA PRINCIPAL */}
      {/*
        `MobileNav` es `fixed bottom-0`: no empuja el contenido, se pinta
        ENCIMA. Sin hueco reservado abajo, el ultimo elemento de cualquier
        modulo (un boton "Iniciar", una tarjeta) queda fisicamente debajo de
        la barra en vez de terminar visible antes de ella. Cada modulo habia
        ido añadiendo su propio `pb-20` a ciegas para compensar —una sola vez
        en unos, ninguna en otros (`ExamConfig` no tenia ninguno)— asi que el
        hueco real dependia de que cada componente se acordara. Se reserva
        UNA vez aqui, en el contenedor que ya sabe cuando existe la barra
        (`!zenMode`, que es tambien cuando `MobileNav` se monta). `pb-24`
        (96px) cubre la barra (~60-80px con el area segura) con margen.
      */}
      <main className={`flex-1 w-full min-h-screen transition-all duration-300 ${zenMode ? 'p-0' : 'px-4 pt-8 pb-24 md:pl-28 md:pr-10 md:pt-10 md:pb-10'}`}>
        
        {/* CABECERA (Header) */}
        {!zenMode && (
            <Header 
                title={navItems.find(i => i.id === activeTab)?.label || 'Sistema'} 
                activeTab={activeTab}
            />
        )}

        {/* CONTENEDOR DE MÓDULOS */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-[80dvh] relative">

            {/* Se pueden apagar los ocho, así que este estado existe de verdad
                y hay que decirlo en vez de dejar la pantalla en blanco. */}
            {sinModulos && (
                <div className="py-32 text-center">
                    <p className="font-black text-slate-400 uppercase tracking-widest text-sm">Sin módulos activos</p>
                    <p className="text-sm text-slate-500 mt-2">
                        Tu academia ha desactivado todos los módulos. Ponte en contacto con ella.
                    </p>
                </div>
            )}
            
            {/* Cada modulo va aislado: un fallo de render en uno no debe dejar
                el dashboard entero en blanco (pasaba con 'home' y 'stats'). */}
            {activeTab === 'home' && (
                <ModuleErrorBoundary moduleName="El centro de mando">
                    <DashboardHome user={user} onNavigate={irAPestana} />
                </ModuleErrorBoundary>
            )}

            {activeTab === 'chat' && (
                <ModuleErrorBoundary moduleName="Inteligencia">
                    <IntelChat user={user} />
                </ModuleErrorBoundary>
            )}

            {activeTab === 'test' && (
                <ModuleErrorBoundary moduleName="Operaciones">
                    <ExamManager
                        onZenToggle={setZenMode}
                        onRepasarFallos={modules.review ? () => irAPestana('review') : undefined}
                    />
                </ModuleErrorBoundary>
            )}

            {activeTab === 'review' && (
                <ModuleErrorBoundary moduleName="Repaso de fallos">
                    <FailedQuestions />
                </ModuleErrorBoundary>
            )}

            {activeTab === 'cards' && (
                <ModuleErrorBoundary moduleName="Drills">
                    <FlashcardDeck />
                </ModuleErrorBoundary>
            )}

            {activeTab === 'training' && (
                <ModuleErrorBoundary moduleName="Preparacion fisica">
                    <PhysicalTrainer user={user} />
                </ModuleErrorBoundary>
            )}

            {activeTab === 'stats' && (
                <ModuleErrorBoundary moduleName="Rango y estadisticas">
                    <StatsPanel user={user} />
                </ModuleErrorBoundary>
            )}

            {/* MÓDULO DE PERFILADO (Con botón flotante para la voz) */}
            {activeTab === 'interview' && (
                <>
                    {/* `pb-28`: el boton rojo flotante ocupa una franja fija de
                        ~150px sobre la barra de pestañas, y sin este hueco se
                        pintaba ENCIMA del boton de guardar del formulario. El
                        hueco de la barra se reserva una vez en `<main>`, pero
                        este boton solo existe en esta pestaña, asi que su hueco
                        es cosa de esta pestaña. */}
                    <ModuleErrorBoundary moduleName="Perfilado">
                        <div className="pb-28 sm:pb-0">
                            <BiodataManager user={user} />
                        </div>
                    </ModuleErrorBoundary>
                    
                    {/* Botón Flotante de Acción Táctica (Solo en esta pestaña).

                        En movil `MobileNav` es una barra fija de pie de pantalla con
                        su propio `z-50`; este boton estaba en `bottom-8` (32px), justo
                        DENTRO de esa franja, y al pintarse MobileNav despues en el DOM
                        quedaba encima tapandolo. Se sube por encima de la barra solo
                        en movil (`md:` recupera la posicion de escritorio, donde no
                        hay barra inferior). */}
                    <div className="fixed bottom-24 right-4 md:bottom-8 md:right-8 z-50 animate-in zoom-in duration-300">
                        {/* EN MOVIL, SOLO EL ICONO.
                            Con el texto, este boton mide 300px de ancho y flota
                            SOBRE el formulario: tapaba el titulo de la seccion y
                            parte de los campos de una pantalla que existe para
                            escribir en ella. Un boton fijo que oculta contenido
                            no es un acceso rapido, es un estorbo. Desde `sm`,
                            donde sobra sitio, vuelve el texto. */}
                        <button
                            onClick={() => setInterviewMode(true)}
                            aria-label="Iniciar simulación de entrevista"
                            className="flex items-center justify-center gap-3 bg-red-600 hover:bg-red-500 text-white w-14 h-14 sm:w-auto sm:h-auto sm:px-6 sm:py-4 rounded-full font-bold shadow-2xl hover:scale-105 transition-all ring-4 ring-red-600/20 shadow-red-600/40"
                        >
                            <Fingerprint size={24}/>
                            <span className="hidden sm:inline">INICIAR SIMULACIÓN</span>
                        </button>
                    </div>
                </>
            )}

        </div>
      </main>

      {/* 4. NAVEGACIÓN MÓVIL (Bottom Bar) */}
      {!zenMode && (
        <MobileNav 
            activeTab={activeTab} 
            onTabChange={(id) => irAPestana(id as TabId)} 
            onLogout={onLogout}
            items={navItems}
        />
      )}
    </div>
  );
}
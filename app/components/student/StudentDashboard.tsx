'use client';

import { useState, useEffect } from 'react';
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
        onTabChange={(id) => setActiveTab(id as TabId)} 
        onLogout={onLogout}
        items={navItems}
        hidden={zenMode}
      />

      {/* 3. ÁREA PRINCIPAL */}
      <main className={`flex-1 w-full min-h-screen transition-all duration-300 ${zenMode ? 'p-0' : 'p-4 md:pl-28 md:pr-10 py-8 md:py-10'}`}>
        
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
                    <DashboardHome user={user} onNavigate={setActiveTab} />
                </ModuleErrorBoundary>
            )}

            {activeTab === 'chat' && (
                <ModuleErrorBoundary moduleName="Inteligencia">
                    <IntelChat user={user} />
                </ModuleErrorBoundary>
            )}

            {activeTab === 'test' && (
                <ModuleErrorBoundary moduleName="Operaciones">
                    <ExamManager onZenToggle={setZenMode} />
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
                    <ModuleErrorBoundary moduleName="Perfilado">
                        <BiodataManager user={user} />
                    </ModuleErrorBoundary>
                    
                    {/* Botón Flotante de Acción Táctica (Solo en esta pestaña).

                        En movil `MobileNav` es una barra fija de pie de pantalla con
                        su propio `z-50`; este boton estaba en `bottom-8` (32px), justo
                        DENTRO de esa franja, y al pintarse MobileNav despues en el DOM
                        quedaba encima tapandolo. Se sube por encima de la barra solo
                        en movil (`md:` recupera la posicion de escritorio, donde no
                        hay barra inferior). */}
                    <div className="fixed bottom-24 right-4 md:bottom-8 md:right-8 z-50 animate-in zoom-in duration-300">
                        <button
                            onClick={() => setInterviewMode(true)}
                            className="flex items-center gap-3 bg-red-600 hover:bg-red-500 text-white px-6 py-4 rounded-full font-bold shadow-2xl hover:scale-105 transition-all animate-pulse ring-4 ring-red-600/20 shadow-red-600/40"
                        >
                            <Fingerprint size={24}/>
                            INICIAR SIMULACIÓN
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
            onTabChange={(id) => setActiveTab(id as TabId)} 
            onLogout={onLogout}
            items={navItems}
        />
      )}
    </div>
  );
}
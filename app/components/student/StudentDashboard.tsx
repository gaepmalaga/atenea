'use client';

import { useState, useEffect } from 'react';
import { 
  LayoutGrid, MessageSquareText, Crosshair, Zap, 
  Fingerprint, BarChart2, Dumbbell 
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
import ModuleErrorBoundary from '../shared/ModuleErrorBoundary';
import type { AuthUser } from '@/app/lib/auth';

// --- TIPOS ---
export type TabId = 'home' | 'chat' | 'test' | 'cards' | 'training' | 'interview' | 'stats';

interface StudentDashboardProps {
  user: AuthUser;
  onLogout: () => void;
}

export default function StudentDashboard({ user, onLogout }: StudentDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [zenMode, setZenMode] = useState(false); // Oculta UI durante simulacros
  const [interviewMode, setInterviewMode] = useState(false); // Activa Overlay de Sala de Voz

  // CONFIGURACIÓN DEL MENÚ DE NAVEGACIÓN
  const navItems = [
    { id: 'home', label: 'Centro de Mando', icon: LayoutGrid },
    { id: 'chat', label: 'Inteligencia (RAG)', icon: MessageSquareText },
    { id: 'test', label: 'Operaciones (Test)', icon: Crosshair },
    { id: 'cards', label: 'Drills (Memoria)', icon: Zap },
    { id: 'training', label: 'Prep. Física', icon: Dumbbell }, // NUEVO
    { id: 'interview', label: 'Perfilado & Voz', icon: Fingerprint },
    { id: 'stats', label: 'Rango & Estadísticas', icon: BarChart2 }
  ];

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
             <InterviewRoom 
                 user={user} 
                 onExit={() => setInterviewMode(false)} 
             />
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
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-[80vh] relative">
            
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

            {activeTab === 'cards' && (
                <ModuleErrorBoundary moduleName="Drills">
                    <FlashcardDeck user={user} />
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
                    
                    {/* Botón Flotante de Acción Táctica (Solo en esta pestaña) */}
                    <div className="fixed bottom-8 right-8 z-50 animate-in zoom-in duration-300">
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
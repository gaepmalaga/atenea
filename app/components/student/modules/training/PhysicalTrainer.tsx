'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { 
    getPhysicalProfile, 
    savePhysicalProfile, 
    generateWeeklyPlan, 
    getActiveTrainingPlan,
    completeTrainingDay // <--- ASEGÚRATE DE TENER ESTO EN ACTIONS.TS
} from '@/actions';

// IMPORTACIÓN DE COMPONENTES
import SetupWizard from './components/SetupWizard';
import AssessmentHub from './components/AssessmentHub';
import TestRunner from './components/TestRunner';
import TrainingDashboard from './components/TrainingDashboard';
import ActiveSession from './components/ActiveSession';

interface PhysicalTrainerProps { user: any; }

export default function PhysicalTrainer({ user }: PhysicalTrainerProps) {
  // ESTADOS PRINCIPALES
  const [view, setView] = useState('loading'); // 'loading' | 'setup' | 'hub' | 'runner' | 'dashboard' | 'session'
  const [profile, setProfile] = useState<any>(null);
  const [activeTestId, setActiveTestId] = useState<any>(null);
  
  // ESTADOS DEL PLAN
  const [weeklyPlan, setWeeklyPlan] = useState<any>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(null); // ID real de la base de datos para guardar progresos

  // ESTADOS DE SESIÓN ACTIVA
  const [activeDay, setActiveDay] = useState<any>(null);
  const [isReporting, setIsReporting] = useState(false); // Controla si abrimos directo en modo reporte

  // --- 1. CARGA INICIAL DE DATOS ---
  useEffect(() => {
    async function init() {
        try {
            const [profileRes, planRes] = await Promise.all([
                 getPhysicalProfile(user.id),
                 getActiveTrainingPlan(user.id)
            ]);
            
            const profileData = profileRes.data;
            const activePlanRow = planRes.plan; // El objeto completo de la BD (con id, plan_data, etc.)

            setProfile(profileData || {});

            // Lógica de Redirección Inteligente
            if (!profileData?.height) {
                // Si no hay datos biométricos, vamos al Setup
                setView('setup');
            } else if (activePlanRow) {
                // Si ya tiene un plan activo, vamos al Dashboard
                setWeeklyPlan(activePlanRow.plan_data);
                setActivePlanId(activePlanRow.id); // ¡CRÍTICO! Guardamos el ID para poder actualizarlo luego
                setView('dashboard');
            } else {
                // Si tiene perfil pero no plan, vamos al Hub de Tests
                setView('hub');
            }
        } catch (error) {
            console.error("Error cargando entrenador:", error);
            setView('setup'); 
        }
    }
    init();
  }, [user.id]);

  // --- 2. GESTORES DE PERFIL Y TESTS ---
  const handleSaveBio = async (data: any) => {
      await savePhysicalProfile(user.id, data);
      setProfile({ ...profile, ...data });
      setView('hub');
  };

  const handleSaveTest = async (testData: any) => {
      const newMetrics = { ...profile.baseline_metrics, ...testData };
      const payload = { baseline_metrics: newMetrics };
      await savePhysicalProfile(user.id, payload);
      setProfile({ ...profile, ...payload });
      setView('hub');
  };

  // --- 3. GENERADOR DE PLANES ---
  const handleGenerate = async () => {
      const res = await generateWeeklyPlan(user.id, profile);
      if (res.success) {
          setWeeklyPlan(res.plan.plan_data);
          setActivePlanId(res.plan.id); // Guardamos el nuevo ID generado
          setView('dashboard');
      }
  };

  const handleGenerateNextWeek = async () => {
      // AQUÍ IRÍA LA LÓGICA DE PROGRESIÓN (Semana 2)
      // Por ahora, un placeholder funcional
      alert("¡Felicidades! Procesando tus métricas para generar la Fase 2...");
      // const res = await generateNextWeek(user.id, activePlanId); ...
  };
  
  // --- 4. GESTIÓN DE SESIÓN (START / REPORT) ---
  
  const handleStartSession = (day: any) => {
      setActiveDay(day);
      setIsReporting(false); // Modo normal (ver ejercicios)
      setView('session');
  };

  const handleReportIssue = (day: any) => {
      setActiveDay(day);
      setIsReporting(true); // Modo reporte directo (pantalla roja)
      setView('session');
  };

  // --- 5. COMPLETAR SESIÓN (PERSISTENCIA Y UI) ---
  const handleCompleteSession = async (logData: any) => {
      if (!weeklyPlan || !activeDay) return;

      // A) ACTUALIZACIÓN OPTIMISTA (UI)
      // Buscamos el índice del día en el array para marcarlo como completado localmente
      const dayIndex = weeklyPlan.days.findIndex((d: any) => d.day === activeDay.day);
      
      if (dayIndex !== -1) {
          // Creamos una copia profunda del plan para no mutar estado directamente
          const updatedDays = [...weeklyPlan.days];
          updatedDays[dayIndex] = { 
              ...updatedDays[dayIndex], 
              isCompleted: true, // Marca visual para el Dashboard
              log: logData       // Guardamos el log localmente también
          };
          
          // Actualizamos el estado visual inmediatamente (la barra de progreso se moverá)
          setWeeklyPlan({ ...weeklyPlan, days: updatedDays });

          // B) PERSISTENCIA EN BASE DE DATOS (Server Action)
          if (activePlanId) {
              // Llamada asíncrona al backend (no bloquea la UI)
              completeTrainingDay(user.id, activePlanId, dayIndex, logData)
                  .then(res => {
                      if (!res.success) console.error("Error guardando progreso en BD:", res.error);
                  });
          }
      }
      
      // C) RETORNO AL DASHBOARD
      setView('dashboard');
      setActiveDay(null);
  };

  // --- 6. ROUTER DE VISTAS ---
  
  if (view === 'loading') {
      return (
          <div className="h-96 w-full flex flex-col items-center justify-center gap-4 animate-pulse">
              <Loader2 className="animate-spin text-emerald-500 w-12 h-12"/>
              <p className="text-slate-400 text-sm font-mono uppercase tracking-widest">Cargando Sistema Táctico...</p>
          </div>
      );
  }

  if (view === 'setup') {
      return <SetupWizard initialData={profile} onSave={handleSaveBio} />;
  }

  if (view === 'hub') {
      return (
          <AssessmentHub 
            profile={profile} 
            onSelectTest={(id) => { setActiveTestId(id); setView('runner'); }} 
            onGenerate={handleGenerate} 
            onEditBio={() => setView('setup')} 
          />
      );
  }

  if (view === 'runner') {
      return (
          <TestRunner 
            testId={activeTestId} 
            initialData={profile?.baseline_metrics} 
            onSave={handleSaveTest} 
            onExit={() => setView('hub')} 
          />
      );
  }
  
  if (view === 'dashboard') {
      return (
          <TrainingDashboard 
            plan={weeklyPlan} 
            onStartSession={handleStartSession} 
            onReportIssue={handleReportIssue} 
            onReconfigure={() => setView('hub')} 
            onGenerateNextWeek={handleGenerateNextWeek}
          />
      );
  }

  if (view === 'session') {
      return (
          <ActiveSession 
            day={activeDay} 
            onExit={() => setView('dashboard')} 
            onComplete={handleCompleteSession}
            startInReportMode={isReporting} 
          />
      );
  }

  return null;
}
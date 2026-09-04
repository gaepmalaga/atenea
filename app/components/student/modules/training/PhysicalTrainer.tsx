'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { 
    getPhysicalProfile, 
    savePhysicalProfile, 
    generateWeeklyPlan, 
    getActiveTrainingPlan,
    generateNextWeek,
    completeTrainingDay
} from '@/actions';

// IMPORTACIÓN DE COMPONENTES
import SetupWizard from './components/SetupWizard';
import AssessmentHub from './components/AssessmentHub';
import TestRunner from './components/TestRunner';
import TrainingDashboard from './components/TrainingDashboard';
import ActiveSession from './components/ActiveSession';
import { hasBiometrics, type BaselineMetrics, type PhysicalProfile, type TestId } from '@/app/lib/physical';
import type { TrainingDay, WeeklyPlan } from '@/app/lib/training-plan';
import type { TrainingDayLog } from '@/app/lib/training-plan';

interface PhysicalTrainerProps { user: { id: string } }

export default function PhysicalTrainer({ user }: PhysicalTrainerProps) {
  // ESTADOS PRINCIPALES
  const [view, setView] = useState('loading'); // 'loading' | 'setup' | 'hub' | 'runner' | 'dashboard' | 'session'
  const [profile, setProfile] = useState<PhysicalProfile | null>(null);
  const [activeTestId, setActiveTestId] = useState<TestId>('force');

  // Guardado: sin esto la pantalla avanzaba pasara lo que pasara, y el alumno
  // se quedaba convencido de que sus datos estaban en el servidor.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  
  // ESTADOS DEL PLAN
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan | null>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(null); // ID real de la base de datos para guardar progresos

  // ESTADOS DE SESIÓN ACTIVA
  const [activeDay, setActiveDay] = useState<TrainingDay | null>(null);
  const [isReporting, setIsReporting] = useState(false); // Controla si abrimos directo en modo reporte

  // --- 1. CARGA INICIAL DE DATOS ---
  useEffect(() => {
    async function init() {
        try {
            const [profileRes, planRes] = await Promise.all([
                 getPhysicalProfile(),
                 getActiveTrainingPlan()
            ]);
            
            const profileData = profileRes.data;
            const activePlanRow = planRes.plan; // El objeto completo de la BD (con id, plan_data, etc.)

            setProfile(profileData || {});

            // Lógica de Redirección Inteligente
            if (!hasBiometrics(profileData)) {
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
  /**
   * Guarda y solo entonces avanza. Devuelve si fue bien, por si quien llama
   * necesita saberlo.
   */
  const persist = async (payload: PhysicalProfile): Promise<boolean> => {
      setSaving(true);
      setSaveError(null);
      const res = await savePhysicalProfile(payload);
      setSaving(false);

      if (!res.success) {
          setSaveError(res.error || 'Error desconocido al guardar.');
          return false;
      }
      setProfile(prev => ({ ...prev, ...payload }));
      setView('hub');
      return true;
  };

  const handleSaveBio = (data: PhysicalProfile) => persist(data);

  const handleSaveTest = (testData: BaselineMetrics) =>
      persist({ baseline_metrics: { ...profile?.baseline_metrics, ...testData } });

  // --- 3. GENERADOR DE PLANES ---
  const handleGenerate = async () => {
      if (!profile) return;
      setGenerating(true);
      setSaveError(null);
      const res = await generateWeeklyPlan(profile);
      setGenerating(false);

      // El fallo de la IA se pinta: antes se descartaba en silencio y el boton
      // simplemente no hacia nada.
      if (!res.success || !res.plan) {
          setSaveError(res.error || 'No se pudo generar el plan.');
          return;
      }
      setWeeklyPlan(res.plan.plan_data);
      setActivePlanId(res.plan.id); // Guardamos el nuevo ID generado
      setView('dashboard');
  };

  const handleGenerateNextWeek = async () => {
      setGenerating(true);
      setSaveError(null);
      const res = await generateNextWeek();
      setGenerating(false);

      if (!res.success || !res.plan) {
          setSaveError(res.error || 'No se pudo generar la semana siguiente.');
          return;
      }
      setWeeklyPlan(res.plan.plan_data);
      setActivePlanId(res.plan.id);
  };
  
  // --- 4. GESTIÓN DE SESIÓN (START / REPORT) ---
  
  const handleStartSession = (day: TrainingDay) => {
      setActiveDay(day);
      setIsReporting(false); // Modo normal (ver ejercicios)
      setView('session');
  };

  const handleReportIssue = (day: TrainingDay) => {
      setActiveDay(day);
      setIsReporting(true); // Modo reporte directo (pantalla roja)
      setView('session');
  };

  // --- 5. COMPLETAR SESIÓN (PERSISTENCIA Y UI) ---
  const handleCompleteSession = async (logData: TrainingDayLog) => {
      if (!weeklyPlan || !activeDay) return;

      // A) ACTUALIZACIÓN OPTIMISTA (UI)
      // Buscamos el índice del día en el array para marcarlo como completado localmente
      const dayIndex = weeklyPlan.days.findIndex((d) => d.day === activeDay.day);
      
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
              completeTrainingDay(activePlanId, dayIndex, logData)
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

  // El tipo saca a la luz un camino real: sin dia activo, `ActiveSession` leia
  // `day.title` y `day.exercises.map` sobre null y dejaba la pantalla en blanco.
  // Se DERIVA la vista en vez de corregirla con un setState (regla 14).
  const currentView = view === 'session' && !activeDay ? 'dashboard' : view;

  
  if (currentView === 'loading') {
      return (
          <div className="h-96 w-full flex flex-col items-center justify-center gap-4 animate-pulse">
              <Loader2 className="animate-spin text-emerald-500 w-12 h-12"/>
              <p className="text-slate-500 dark:text-slate-400 text-sm font-mono uppercase tracking-widest">Cargando Sistema Táctico...</p>
          </div>
      );
  }

  if (currentView === 'setup') {
      return <SetupWizard initialData={profile} onSave={handleSaveBio} saving={saving} error={saveError} />;
  }

  if (currentView === 'hub') {
      return (
          <AssessmentHub 
            profile={profile} 
            onSelectTest={(id) => { setSaveError(null); setActiveTestId(id); setView('runner'); }} 
            onGenerate={handleGenerate} 
            generating={generating}
            error={saveError}
            onEditBio={() => { setSaveError(null); setView('setup'); }} 
          />
      );
  }

  if (currentView === 'runner') {
      return (
          <TestRunner 
            testId={activeTestId} 
            initialData={profile?.baseline_metrics} 
            onSave={handleSaveTest} 
            onExit={() => { setSaveError(null); setView('hub'); }} 
            saving={saving}
            error={saveError}
          />
      );
  }
  
  if (currentView === 'dashboard') {
      return (
          <TrainingDashboard 
            plan={weeklyPlan} 
            onStartSession={handleStartSession} 
            onReportIssue={handleReportIssue} 
            onReconfigure={() => { setSaveError(null); setView('hub'); }} 
            onGenerateNextWeek={handleGenerateNextWeek}
            generating={generating}
            error={saveError}
          />
      );
  }

  if (currentView === 'session' && activeDay) {
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
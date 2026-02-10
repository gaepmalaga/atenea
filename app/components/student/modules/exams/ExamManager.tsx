'use client';

import { useState } from 'react';
import { generateTestQuestion, saveExamResults } from '../../../../actions';
import { Loader2 } from 'lucide-react';

// SUB-COMPONENTES
import ExamConfig from './ExamConfig';
import ActiveTest from './ActiveTest';
import ExamResults from './ExamResults';

// TIPOS
export type Question = {
  id?: string;
  question: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
  userAnswer?: string | null;
  errorType?: string | null; // Para la taxonomía del error
};

export type ExamSettings = {
  mode: 'practice' | 'exam';
  questionCount: number;
  difficulty: 'easy' | 'medium' | 'hard';
  selectedTopics: string[];
};

interface ExamManagerProps {
  user: any;
  onZenToggle: (active: boolean) => void;
}

export default function ExamManager({ user, onZenToggle }: ExamManagerProps) {
  const [step, setStep] = useState<'config' | 'active' | 'results'>('config');
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [settings, setSettings] = useState<ExamSettings>({
    mode: 'practice',
    questionCount: 5,
    difficulty: 'medium',
    selectedTopics: []
  });

  // 1. INICIAR OPERACIÓN
  const handleStart = async (newSettings: ExamSettings) => {
    setSettings(newSettings);
    setLoading(true);
    
    try {
      // Generación en paralelo de preguntas (Promesa.all para velocidad)
      const promises = Array.from({ length: newSettings.questionCount }).map(() => {
        // Elegir tema aleatorio de los seleccionados
        const randomTopic = newSettings.selectedTopics[Math.floor(Math.random() * newSettings.selectedTopics.length)];
        return generateTestQuestion(randomTopic);
      });

      const results = await Promise.all(promises);
      
      // Filtrar errores y formatear
      const validQuestions: Question[] = results
        .filter(r => r.success && r.data)
        .map(r => ({ ...r.data, userAnswer: null }));

      if (validQuestions.length === 0) {
        throw new Error("No se pudo generar inteligencia sobre los temas seleccionados.");
      }

      setQuestions(validQuestions);
      setStep('active');
      onZenToggle(true); // Activar Modo Zen (Ocultar Sidebar)

    } catch (error: any) {
      alert(`Error crítico: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 2. FINALIZAR OPERACIÓN
  const handleFinish = async (finalQuestions: Question[]) => {
    setQuestions(finalQuestions);
    setStep('results');
    onZenToggle(false); // Desactivar Modo Zen

    // Guardado asíncrono de resultados (Fire & Forget)
    if (settings.mode === 'exam') {
       const resultsPayload = finalQuestions.map(q => ({
          topic: settings.selectedTopics.join(', '), // Simplificación
          question_text: q.question,
          is_correct: q.userAnswer === q.correctOptionId,
          error_type: q.errorType
       }));
       await saveExamResults(user.id, resultsPayload);
    }
  };

  // 3. REINICIAR
  const handleExit = () => {
    setStep('config');
    setQuestions([]);
    onZenToggle(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 animate-in fade-in">
        <Loader2 className="animate-spin text-indigo-600 mb-4" size={48} />
        <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-widest">
            Generando Escenario Táctico...
        </h3>
        <p className="text-slate-400 mt-2">Consultando Jurisprudencia y Leyes.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {step === 'config' && (
        <ExamConfig 
            initialSettings={settings} 
            onStart={handleStart} 
        />
      )}

      {step === 'active' && (
        <ActiveTest 
            questions={questions} 
            mode={settings.mode}
            userId={user.id}
            topicName={settings.selectedTopics[0]} // Para el guardado individual en práctica
            onFinish={handleFinish}
            onExit={handleExit}
        />
      )}

      {step === 'results' && (
        <ExamResults 
            questions={questions} 
            onRetry={() => setStep('config')} 
        />
      )}
    </div>
  );
}
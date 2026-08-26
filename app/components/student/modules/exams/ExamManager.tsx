'use client';

import { useState } from 'react';
import { generateAndSaveCandidate, saveExamResults, getQuestionsFromBank } from '@/actions';
import {
  type Question as ExamQuestion,
  difficultyToNumber,
  mapBankRowToQuestion,
  mapCandidateToQuestion,
} from '@/app/lib/questions';
import { Loader2 } from 'lucide-react';

import ExamConfig from './ExamConfig';
import ActiveTest from './ActiveTest';
import ExamResults from './ExamResults';

// Los tipos y el mapeo DB/IA -> UI viven en app/lib/questions.ts (modulo puro
// y cubierto por tests). Se reexporta Question porque otros modulos lo importan
// desde aqui.
export type { Question } from '@/app/lib/questions';

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
  const [loadingMsg, setLoadingMsg] = useState("Iniciando..."); 
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [settings, setSettings] = useState<ExamSettings>({
    mode: 'practice',
    questionCount: 5,
    difficulty: 'medium',
    selectedTopics: []
  });

  const handleStart = async (newSettings: ExamSettings) => {
    setSettings(newSettings);
    setLoading(true);
    setLoadingMsg("Consultando Banco de Preguntas...");

    try {
      if (!newSettings.selectedTopics || newSettings.selectedTopics.length === 0) {
        throw new Error("Selecciona al menos un tema.");
      }

      const targetCount = newSettings.questionCount;
      const difficultyNum = difficultyToNumber(newSettings.difficulty);

      // 1. FASE BANCO
      const perTopic = Math.max(1, Math.ceil(targetCount / newSettings.selectedTopics.length));
      const bankFetches = await Promise.all(
        newSettings.selectedTopics.map((topic) =>
          getQuestionsFromBank({ topic, difficulty: difficultyNum, limit: perTopic })
        )
      );

      let loadedQuestions: ExamQuestion[] = bankFetches
        .flatMap((r) => (r.success ? r.data : []))
        .map(mapBankRowToQuestion);

      const seenIds = new Set();
      loadedQuestions = loadedQuestions.filter(q => {
        if (seenIds.has(q.id)) return false;
        seenIds.add(q.id);
        return true;
      });

      loadedQuestions = loadedQuestions.sort(() => Math.random() - 0.5).slice(0, targetCount);

      // 2. FASE IA (Relleno)
      const missing = targetCount - loadedQuestions.length;
      if (missing > 0) {
        setLoadingMsg(`Generando ${missing} nuevas preguntas...`);
        const aiPromises = Array.from({ length: missing }).map(() => {
          const randomTopic = newSettings.selectedTopics[Math.floor(Math.random() * newSettings.selectedTopics.length)];
          return generateAndSaveCandidate(randomTopic);
        });
        const aiResults = await Promise.all(aiPromises);
        const newCandidates = aiResults
          .filter(r => r.success && r.data)
          .map(r => mapCandidateToQuestion(r.data));
        loadedQuestions = [...loadedQuestions, ...newCandidates];
      }

      if (loadedQuestions.length === 0) throw new Error("No se pudieron obtener preguntas.");

      setQuestions(loadedQuestions);
      setStep('active');
      onZenToggle(true);

    } catch (error: any) {
      alert(`Error iniciando el test: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

const handleFinish = async (finalQuestions: ExamQuestion[]) => {
    setQuestions(finalQuestions);
    setStep('results');
    onZenToggle(false);

    // GUARDADO GLOBAL REFORZADO (Incluye Dimensión de Comportamiento)
    if (settings.mode === 'exam') {
      const resultsPayload = finalQuestions.map(q => ({
        question_id: q.id,
        is_correct: q.userAnswer === q.correctOptionId,
        // Capturamos el tiempo y los cambios que vienen del estado de la pregunta
        // Asegúrate de que tu tipo Question incluya estos campos opcionales
        response_time_ms: (q as any).timeMs || 0, 
        option_changes: (q as any).changes || 0,
        error_type: q.errorType,
        subject_id: q.subject_id
      }));
      
      // Enviamos el payload enriquecido al servidor
      await saveExamResults(user.id, resultsPayload);
    }
  };

  const handleExit = () => {
    setStep('config');
    setQuestions([]);
    onZenToggle(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 animate-in fade-in">
        <Loader2 className="animate-spin text-indigo-600 mb-4" size={48} />
        <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-widest">PREPARANDO SIMULACRO</h3>
        <p className="text-slate-400 mt-2 font-mono text-sm">{loadingMsg}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {step === 'config' && <ExamConfig initialSettings={settings} onStart={handleStart} />}
      
      {step === 'active' && (
        <ActiveTest
          questions={questions}
          mode={settings.mode}
          userId={user.id}
          topicName={settings.selectedTopics[0]} 
          onFinish={handleFinish}
          onExit={handleExit}
        />
      )}

      {step === 'results' && <ExamResults questions={questions} onRetry={() => setStep('config')} />}
    </div>
  );
}
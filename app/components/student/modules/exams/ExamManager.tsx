'use client';

import { useState } from 'react';
import { generateAndSaveCandidate, saveExamResults, getQuestionsFromBank } from '@/actions';
import { Loader2 } from 'lucide-react';

import ExamConfig from './ExamConfig';
import ActiveTest from './ActiveTest';
import ExamResults from './ExamResults';

export type Question = {
  id: string; // ID Obligatorio
  question: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
  userAnswer?: string | null;
  errorType?: string | null;
  subject_id?: number | null;
  origin?: 'bank' | 'live_ai' | 'candidate';
timeMs?: number; // Para el algoritmo Atenea
  changes?: number; // Para el algoritmo Atenea
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

function difficultyToNumber(d: 'easy' | 'medium' | 'hard') {
  if (d === 'easy') return 1;
  if (d === 'hard') return 3;
  return 2;
}

// Helper: Mapeo DB -> Frontend
function mapBankRowToQuestion(row: any): Question {
  const opts = Array.isArray(row.options) 
    ? row.options.map((text: string, idx: number) => ({
        id: idx === 0 ? 'a' : idx === 1 ? 'b' : 'c',
        text: typeof text === 'string' ? text : JSON.stringify(text)
      }))
    : [];

  const correctOptionId = row.correct_index === 0 ? 'a' : row.correct_index === 1 ? 'b' : 'c';

  return {
    id: row.id,
    subject_id: row.subject_id ?? null,
    question: row.question_text,
    options: opts,
    correctOptionId,
    explanation: row.explanation,
    userAnswer: null,
    errorType: null,
    origin: row.origin || 'bank'
  };
}

// Helper: Mapeo IA Live -> Frontend
function mapCandidateToQuestion(data: any): Question {
  let formattedOptions;
  if (data.options && data.options[0] && typeof data.options[0] === 'object') {
    formattedOptions = data.options;
  } else if (Array.isArray(data.options)) {
     formattedOptions = data.options.map((text: string, idx: number) => ({
        id: idx === 0 ? 'a' : idx === 1 ? 'b' : 'c',
        text
      }));
  } else {
    formattedOptions = [];
  }

  return {
    id: data.id,
    subject_id: data.subject_id ?? null,
    question: data.question || data.question_text,
    options: formattedOptions,
    correctOptionId: data.correctOptionId || (data.correct_index === 0 ? 'a' : data.correct_index === 1 ? 'b' : 'c'),
    explanation: data.explanation,
    userAnswer: null,
    errorType: null,
    origin: 'candidate'
  };
}

export default function ExamManager({ user, onZenToggle }: ExamManagerProps) {
  const [step, setStep] = useState<'config' | 'active' | 'results'>('config');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Iniciando..."); 
  const [questions, setQuestions] = useState<Question[]>([]);
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

      let loadedQuestions: Question[] = bankFetches
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

const handleFinish = async (finalQuestions: Question[]) => {
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
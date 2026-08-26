'use client';

import { useState } from 'react';
import { generateAndSaveCandidate, saveExamResults, getQuestionsFromBank } from '@/actions';
import { buildExamResults } from '@/app/lib/exam-results';
import {
  type Question as ExamQuestion,
  difficultyToNumber,
  shuffle,
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
  onZenToggle: (active: boolean) => void;
}

export default function ExamManager({ onZenToggle }: ExamManagerProps) {
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
      // Se conserva de que tema salio cada pregunta. `question_bank` guarda
      // `subject_id` y `question_attempts` guarda `topic`: si no se arrastra
      // aqui, al terminar el examen ya no hay forma de saberlo.
      const bankFetches = await Promise.all(
        newSettings.selectedTopics.map(async (topic) => ({
          topic,
          resultado: await getQuestionsFromBank({ topic, difficulty: difficultyNum, limit: perTopic }),
        }))
      );

      let loadedQuestions: ExamQuestion[] = bankFetches.flatMap(({ topic, resultado }) =>
        resultado.success ? resultado.data.map((fila) => ({ ...mapBankRowToQuestion(fila), topic })) : []
      );

      const seenIds = new Set();
      loadedQuestions = loadedQuestions.filter(q => {
        if (seenIds.has(q.id)) return false;
        seenIds.add(q.id);
        return true;
      });

      loadedQuestions = shuffle(loadedQuestions).slice(0, targetCount);

      // 2. FASE IA (Relleno)
      const missing = targetCount - loadedQuestions.length;
      if (missing > 0) {
        setLoadingMsg(`Generando ${missing} nuevas preguntas...`);
        const aiPromises = Array.from({ length: missing }).map(async () => {
          const randomTopic = newSettings.selectedTopics[Math.floor(Math.random() * newSettings.selectedTopics.length)];
          // El tema viaja con la respuesta: hace falta para etiquetar la fila.
          // La dificultad tambien va al relleno por IA: si no, un examen
          // "dificil" mezclaria preguntas del nivel pedido con otras medias.
          return { topic: randomTopic, resultado: await generateAndSaveCandidate(randomTopic, difficultyNum) };
        });
        const aiResults = await Promise.all(aiPromises);
        // flatMap en vez de filter+map: `filter` no estrecha el tipo, así que
        // una respuesta sin `data` llegaba al mapeo como undefined.
        const newCandidates = aiResults.flatMap(({ topic, resultado }) =>
          resultado.success && resultado.data
            ? [{ ...mapCandidateToQuestion(resultado.data), topic }]
            : []
        );
        loadedQuestions = [...loadedQuestions, ...newCandidates];
      }

      if (loadedQuestions.length === 0) throw new Error("No se pudieron obtener preguntas.");

      setQuestions(loadedQuestions);
      setStep('active');
      onZenToggle(true);

    } catch (error) {
      alert(`Error iniciando el test: ${error instanceof Error ? error.message : 'desconocido'}`);
    } finally {
      setLoading(false);
    }
  };

const handleFinish = async (finalQuestions: ExamQuestion[]) => {
    setQuestions(finalQuestions);
    setStep('results');
    onZenToggle(false);

    // En modo entrenamiento cada respuesta ya se guardo al contestarla.
    if (settings.mode === 'exam') {
      // El payload lo construye un helper tipado: antes se armaba aqui a mano
      // con dos `as any` que tapaban el desajuste de nombres con el servidor.
      const res = await saveExamResults(buildExamResults(finalQuestions, settings.selectedTopics[0] ?? ''));
      if (!res.success) {
        console.error('No se pudieron guardar los resultados del examen.');
      }
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
          topicName={settings.selectedTopics[0]} 
          onFinish={handleFinish}
          onExit={handleExit}
        />
      )}

      {step === 'results' && <ExamResults questions={questions} onRetry={() => setStep('config')} />}
    </div>
  );
}
'use client';

import { useState, useEffect, useCallback } from 'react';
import { generateAndSaveCandidate, saveExamResults, getQuestionsFromBank } from '@/actions';
import { buildExamResults } from '@/app/lib/exam-results';
import {
  type Question as ExamQuestion,
  difficultyToNumber,
  shuffle,
  mapBankRowToQuestion,
  mapCandidateToQuestion,
} from '@/app/lib/questions';
import {
  leerExamenGuardado,
  serializarExamen,
  contestadasDe,
  EXAM_STORAGE_KEY,
  type ExamSnapshot,
} from '@/app/lib/exam-session';
import { Loader2, RotateCcw, Trash2, Clock } from 'lucide-react';

import ExamConfig from './ExamConfig';
import ActiveTest from './ActiveTest';
import { examDurationSeconds } from '@/app/lib/scoring';
import ExamResults from './ExamResults';
import { Card, Button, cx, TEXT } from '../../../ui';

// Los tipos y el mapeo DB/IA -> UI viven en app/lib/questions.ts (modulo puro
// y cubierto por tests). Se reexporta Question porque otros modulos lo importan
// desde aqui.
export type { Question } from '@/app/lib/questions';
// `ExamSettings` vive ahora en `lib/exam-session.ts`, junto a lo que lo
// persiste: un modulo de `lib/` no puede importar tipos de un componente.
export type { ExamSettings } from '@/app/lib/exam-session';

import type { ExamSettings } from '@/app/lib/exam-session';

interface ExamManagerProps {
  onZenToggle: (active: boolean) => void;
  /** Llevar al modulo de repaso al terminar. Ver `ExamResults`. */
  onRepasarFallos?: () => void;
}

export default function ExamManager({ onZenToggle, onRepasarFallos }: ExamManagerProps) {
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
  /**
   * Cuando empezo el examen que se esta haciendo.
   *
   * Es lo que hace honesto el reloj al reanudar: si `ActiveTest` volviera a
   * `Date.now()` al montarse, volver a un simulacro daria los 50 minutos otra
   * vez.
   */
  const [startedAt, setStartedAt] = useState<number>(0);

  /** Un examen a medias encontrado al abrir la pantalla. */
  const [recuperable, setRecuperable] = useState<ExamSnapshot | null>(null);

  // --- EL SEGURO ---
  // Busca un examen a medias al entrar. Va en un efecto porque `localStorage`
  // no existe en el servidor.
  useEffect(() => {
    try {
      const snap = leerExamenGuardado(window.localStorage.getItem(EXAM_STORAGE_KEY), Date.now());
      if (snap) setRecuperable(snap);
    } catch {
      // Modo incognito, almacenamiento lleno o bloqueado por el navegador. No
      // poder recuperar no puede impedir empezar un examen nuevo.
    }
  }, []);

  const olvidarGuardado = useCallback(() => {
    try {
      window.localStorage.removeItem(EXAM_STORAGE_KEY);
    } catch { /* ver arriba */ }
  }, []);

  // Se guarda en CADA cambio de las preguntas, que es donde viven las
  // respuestas. Antes, en simulacro, no se escribia nada hasta entregar: una
  // recarga o que el movil descartara la pestaña se llevaba el examen entero.
  useEffect(() => {
    if (step !== 'active' || questions.length === 0) return;
    try {
      window.localStorage.setItem(
        EXAM_STORAGE_KEY,
        serializarExamen(questions, settings, startedAt, Date.now()),
      );
    } catch { /* ver arriba */ }
  }, [step, questions, settings, startedAt]);

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

      setRecuperable(null);
      setQuestions(loadedQuestions);
      setStartedAt(Date.now());
      setStep('active');
      onZenToggle(true);

    } catch (error) {
      alert(`Error iniciando el test: ${error instanceof Error ? error.message : 'desconocido'}`);
    } finally {
      setLoading(false);
    }
  };

  /** Vuelve al examen que se quedó a medias. */
  const reanudar = () => {
    if (!recuperable) return;
    setQuestions(recuperable.questions);
    setSettings(recuperable.settings);
    setStartedAt(recuperable.startedAt);
    setRecuperable(null);
    setStep('active');
    onZenToggle(true);
  };

  const descartarGuardado = () => {
    olvidarGuardado();
    setRecuperable(null);
  };

const handleFinish = async (finalQuestions: ExamQuestion[]) => {
    setQuestions(finalQuestions);
    setStep('results');
    onZenToggle(false);
    // Entregado: ya no hay nada que reanudar. Dejarlo puesto haría que la
    // próxima vez le ofreciera volver a un examen terminado.
    olvidarGuardado();

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
    olvidarGuardado();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 animate-in fade-in">
        <Loader2 className="animate-spin text-indigo-600 mb-4" size={48} />
        <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-widest">PREPARANDO SIMULACRO</h3>
        <p className="text-slate-500 dark:text-slate-400 mt-2 font-mono text-sm">{loadingMsg}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {step === 'config' && (
        <>
          {/* EL EXAMEN QUE SE QUEDÓ A MEDIAS.
              No se reanuda solo: en un simulacro el reloj ha seguido corriendo
              mientras no estabas, así que meterte de vuelta sin avisar podría
              dejarte dentro de un examen ya vencido. Se dice lo que hay y se
              elige. */}
          {recuperable && (
            <Card tone="sunken" className="mb-4 sm:mb-6 border-amber-300 dark:border-amber-500/30">
              <p className={cx(TEXT.label, 'text-amber-600 dark:text-amber-400 flex items-center gap-2 mb-2')}>
                <Clock size={14} /> Tienes un examen a medias
              </p>
              <p className={cx(TEXT.muted, 'mb-4')}>
                {recuperable.settings.mode === 'exam' ? 'Simulacro' : 'Entrenamiento'} de{' '}
                {recuperable.questions.length} preguntas, con {contestadasDe(recuperable)} contestadas.
                {recuperable.settings.mode === 'exam' && ' El reloj ha seguido corriendo.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={reanudar} icon={<RotateCcw size={16} />}>Reanudarlo</Button>
                <Button variant="ghost" onClick={descartarGuardado} icon={<Trash2 size={16} />}>
                  Descartarlo y empezar de cero
                </Button>
              </div>
            </Card>
          )}

          <ExamConfig initialSettings={settings} onStart={handleStart} />
        </>
      )}

      {step === 'active' && (
        <ActiveTest
          questions={questions}
          mode={settings.mode}
          topicName={settings.selectedTopics[0]}
          onFinish={handleFinish}
          onExit={handleExit}
          // Cada respuesta sube al padre para que el seguro la escriba: sin
          // esto, `ActiveTest` se guardaba las respuestas para sí y lo
          // persistido era el examen en blanco.
          onProgress={setQuestions}
          startedAt={startedAt}
          // El reloj corre SOLO en el simulacro, y la duración es la de la
          // convocatoria escalada a las preguntas de este test: 30 s cada una,
          // que salen de las 100 preguntas en 50 minutos del BOE. En
          // entrenamiento no hay límite — la pregunta se corrige al momento y
          // hay que diagnosticar el fallo, así que correr no aporta nada.
          //
          // Se cuenta sobre las preguntas REALMENTE cargadas, no sobre las
          // pedidas: si el banco solo devolvió 12 de las 20, dar 10 minutos
          // sería regalar tiempo.
          durationSeconds={settings.mode === 'exam' ? examDurationSeconds(questions.length) : 0}
        />
      )}

      {step === 'results' && <ExamResults questions={questions} onRetry={() => setStep('config')} onRepasarFallos={onRepasarFallos} />}
    </div>
  );
}

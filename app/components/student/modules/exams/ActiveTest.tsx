'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ChevronRight, CheckCircle2, XCircle, Brain,
  BookX, AlertTriangle, Eye, ArrowLeft, Clock, Layers,
  ThumbsUp, ThumbsDown, Flag, Send, Bookmark, Eraser,
  Scale
} from 'lucide-react';
import { Modal, Button, TextAreaField } from '../../../ui';
import { formatTime } from '@/app/lib/timer';
import { examClock } from '@/app/lib/scoring';
import { Question } from './ExamManager';
import { saveTestResult, setResultErrorType, voteQuestion, reportQuestion } from '@/actions';
import { countChange } from '@/app/lib/exam-results';
import QuestionNote from '../../QuestionNote';

interface ActiveTestProps {
  questions: Question[];
  mode: 'practice' | 'exam';
  topicName: string;
  onFinish: (qs: Question[]) => void;
  onExit: () => void;
  /**
   * Sube cada cambio de las respuestas al padre, que es quien lo persiste.
   *
   * Sin esto, `ActiveTest` se guardaba las respuestas para si y lo que el
   * seguro escribia en disco era el examen EN BLANCO: al reanudar aparecian
   * todas las preguntas sin contestar.
   */
  onProgress?: (qs: Question[]) => void;
  /**
   * Cuando empezo el examen. Al reanudar uno a medias llega el original, no
   * el momento de volver: si no, el cronometro del simulacro arrancaria de
   * cero y regalaria el tiempo ya consumido.
   */
  startedAt?: number;
  /**
   * Duracion del simulacro. 0 o ausente = sin limite.
   *
   * En entrenamiento nunca hay reloj: correr no aporta nada cuando la pregunta
   * se corrige al momento y hay que diagnosticar el fallo.
   */
  durationSeconds?: number;
}

// Tipos de Reporte disponibles
const REPORT_TYPES = [
  { id: 'wrong_correct_answer', label: 'Respuesta Correcta Errónea' },
  { id: 'ambiguous_question', label: 'Pregunta Ambigua / Confusa' },
  { id: 'bad_explanation', label: 'Explicación Mala o Incompleta' },
  { id: 'out_of_syllabus', label: 'Fuera de Temario / Derogada' },
  { id: 'typo_or_format', label: 'Error Ortográfico / Formato' },
  { id: 'other', label: 'Otro' }
];

export default function ActiveTest({
  questions, mode, topicName, onFinish, onExit, onProgress, startedAt, durationSeconds = 0,
}: ActiveTestProps) {
  const [localQuestions, setLocalQuestions] = useState<Question[]>(questions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [errorTagged, setErrorTagged] = useState(false); 

  // Métricas VIP (Tiempos y Dudas)
  //
  // ACUMULADAS POR PREGUNTA, NO POR VISITA. Desde que se puede volver atrás,
  // una pregunta se visita varias veces: si el tiempo se midiera desde la
  // última entrada, revisar una respuesta al final borraría los tres minutos
  // que costó la primera vez. Lo que interesa saber es cuánto ha costado la
  // pregunta EN TOTAL.
  //
  // Un ref y no estado: se escribe y se lee dentro del mismo manejador, y con
  // `useState` el cierre devolvería el valor anterior (regla 13). Ese fallo ya
  // pasó aquí: en entrenamiento se guardaban siempre 0 cambios.
  const metricasRef = useRef<Map<number, { tiempo: number; cambios: number }>>(new Map());
  /** Momento en que se entró en la pregunta que se está viendo. */
  const entradaRef = useRef<number>(Date.now());

  const metricasDe = useCallback(
    (indice: number) => metricasRef.current.get(indice) ?? { tiempo: 0, cambios: 0 },
    []
  );

  /** Lo que lleva acumulado la pregunta actual, contando la visita en curso. */
  const tiempoActual = useCallback(
    () => metricasDe(currentIndex).tiempo + (Date.now() - entradaRef.current),
    [currentIndex, metricasDe]
  );

  /** Cierra la cuenta de la pregunta que se deja y arranca la de la siguiente. */
  const cerrarVisita = useCallback((indice: number) => {
    const m = metricasDe(indice);
    metricasRef.current.set(indice, { ...m, tiempo: m.tiempo + (Date.now() - entradaRef.current) });
    entradaRef.current = Date.now();
  }, [metricasDe]);

  // Id de la fila de `question_attempts` que guardo la respuesta actual.
  // Etiquetar el fallo actualiza ESA fila; antes se insertaba una segunda y
  // cada error etiquetado contaba doble en el porcentaje de acierto.
  const resultIdRef = useRef<string | null>(null);
  // El guardado en vuelo. Los botones de diagnóstico aparecen en cuanto se
  // marca la respuesta, mientras el insert sigue viajando: sin esperarlo, un
  // clic rápido leería `resultIdRef` a null y volvería a insertar.
  const savePromiseRef = useRef<Promise<{ success: boolean; id: string | null }> | null>(null);

  /**
   * Preguntas marcadas para revisar antes de entregar.
   *
   * Es el estándar del sector y de Moodle, y sin ello dudar te obliga a decidir
   * en el momento. Solo tiene sentido con navegación libre, así que vive junto
   * a ella: en el simulacro.
   */
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());

  // --- CRONOMETRO DEL TEST ---
  // El tiempo se deriva de marcas de reloj; el intervalo solo decide cada
  // cuanto se repinta. Contar +1 por tick se desfasa con la pestania en
  // segundo plano y con el ahorro de bateria (regla 14).
  // `useRef` con valor inicial se evalua UNA vez: al reanudar toma el arranque
  // original y el tiempo consumido sigue contando.
  const testStartRef = useRef<number>(startedAt && startedAt > 0 ? startedAt : Date.now());
  const [ahora, setAhora] = useState<number>(Date.now());

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const segundosTest = Math.floor((ahora - testStartRef.current) / 1000);

  /**
   * El reloj del simulacro, DERIVADO del transcurrido.
   *
   * No es estado: guardarlo obligaria a mantenerlo sincronizado con `ahora` en
   * un efecto, que es de donde salio la mitad de los fallos de esta pantalla
   * (regla 14). Si se puede derivar, se deriva.
   */
  const reloj = examClock(durationSeconds, segundosTest);
  const conLimite = durationSeconds > 0;

  // Estados para Votos y Reportes
  const [votes, setVotes] = useState<Record<string, 'up' | 'down' | null>>({});
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportData, setReportData] = useState({ type: '', message: '' });
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  /**
   * Volver atrás, marcar y revisar antes de entregar solo existen en el
   * simulacro.
   *
   * En entrenamiento cada pregunta se corrige al momento: volver a una ya
   * corregida no es repasar, es mirar la respuesta. Y marcar para revisar no
   * lleva a ninguna parte si no se puede volver.
   */
  const navegacionLibre = mode === 'exam';

  /**
   * El unico camino por el que cambian las respuestas.
   *
   * Ademas de actualizar el estado, avisa al padre para que lo escriba en el
   * seguro. Centralizarlo evita que un cuarto sitio que cambie respuestas se
   * olvide de persistirlas.
   */
  const aplicarRespuestas = useCallback((siguiente: Question[]) => {
    setLocalQuestions(siguiente);
    onProgress?.(siguiente);
  }, [onProgress]);

  const currentQ = localQuestions[currentIndex];
  const isAnswered = !!currentQ.userAnswer;
  const isCorrect = currentQ.userAnswer === currentQ.correctOptionId;

  // El cronómetro ya no se reinicia en un efecto: lo lleva `irA`, que es quien
  // sabe qué pregunta se deja y cuál se abre. Un efecto no puede hacerlo porque
  // cuando se ejecuta el índice YA ha cambiado y la cuenta anterior se pierde.

  // --- MANEJO DE RESPUESTA ---
  const handleAnswer = useCallback(async (optionId: string) => {
    if (mode === 'practice' && isAnswered) return;

    // Solo cuenta como duda pasar a una opción DISTINTA habiendo marcado ya
    // una. Antes se sumaba en cada pulsación, así que se contaban respuestas,
    // no cambios, y la primera respuesta ya valía 1.
    if (countChange(currentQ.userAnswer, optionId)) {
        const m = metricasDe(currentIndex);
        metricasRef.current.set(currentIndex, { ...m, cambios: m.cambios + 1 });
    }

    // Copia del objeto, no solo del array: la copia superficial mutaba la misma
    // pregunta que tiene el componente padre en su estado.
    const updated = localQuestions.map((q, i) =>
        i === currentIndex ? { ...q, userAnswer: optionId } : q
    );
    aplicarRespuestas(updated);

    if (mode === 'practice') {
        const correct = optionId === currentQ.correctOptionId;
        setErrorTagged(correct);

        savePromiseRef.current = saveTestResult(
            topicName,
            currentQ.id,
            correct,
            {
                responseTimeMs: tiempoActual(),
                optionChanges: metricasDe(currentIndex).cambios,
                selectedIndex: currentQ.options.findIndex((o) => o.id === optionId),
            }
        );
        const saved = await savePromiseRef.current;
        resultIdRef.current = saved.id;
    }
  }, [aplicarRespuestas, currentIndex, currentQ, isAnswered, localQuestions, metricasDe, mode, tiempoActual, topicName]);

  // --- MANEJO DE TAXONOMÍA DE ERROR ---
  const handleErrorTag = async (type: string) => {
      if (errorTagged) return;
      aplicarRespuestas(localQuestions.map((q, i) =>
          i === currentIndex ? { ...q, errorType: type } : q
      ));
      setErrorTagged(true);
      
      // UNA fila por respuesta: se actualiza la que creó handleAnswer, no se
      // inserta otra. Solo se toca `error_type`; el tiempo y los cambios son
      // los de la respuesta, no los de esta pantalla de diagnóstico.
      // Esperamos al guardado de la respuesta antes de decidir si actualizar
      // o insertar. Sin esto, un clic rápido crearía la segunda fila.
      if (savePromiseRef.current) await savePromiseRef.current;
      const resultId = resultIdRef.current;

      if (resultId) {
          const res = await setResultErrorType(resultId, type);
          if (!res.success) console.error('No se pudo etiquetar el fallo:', res.error);
      } else {
          // El guardado de la respuesta falló, así que aquí no hay nada que
          // duplicar: se inserta la fila completa con la etiqueta incluida.
          const saved = await saveTestResult(topicName, currentQ.id, false, {
              errorType: type,
              responseTimeMs: tiempoActual(),
              optionChanges: metricasDe(currentIndex).cambios,
          });
          resultIdRef.current = saved.id;
      }
  };

  // --- MANEJO DE VOTOS ---
  const handleVote = async (vote: 'up' | 'down') => {
    // Sin id no hay fila que votar: es una pregunta generada en vivo que no
    // llegó a guardarse. La variable local además deja claro al compilador que
    // ya está comprobado.
    const questionId = currentQ.id;
    if (!questionId) return;

    const currentVote = votes[questionId];
    const newVote = currentVote === vote ? null : vote;
    setVotes(prev => ({ ...prev, [questionId]: newVote }));

    await voteQuestion({
      questionId,
      vote: vote === 'up' ? 1 : -1
    });
  };

  // --- MANEJO DE REPORTES ---
  const submitReport = async () => {
    if (!reportData.type || !currentQ.id) return;
    setIsSubmittingReport(true);
    
    try {
      await reportQuestion({
        questionId: currentQ.id,
        reportType: reportData.type,
        message: reportData.message
      });
      setIsReportModalOpen(false);
      setReportData({ type: '', message: '' });
      alert("Reporte enviado. Gracias por ayudar a mejorar Atenea.");
    } catch {
      alert("Error enviando reporte.");
    } finally {
      setIsSubmittingReport(false);
    }
  };

/**
   * Ir a una pregunta cualquiera.
   *
   * EN EL EXAMEN REAL SE PUEDE VOLVER SOBRE LOS PASOS, y es lo que hace todo el
   * mundo. Aquí el test era una vía de sentido único. Solo se habilita en el
   * simulacro: en entrenamiento cada pregunta se corrige al momento, así que
   * volver a una ya corregida no es repasar, es mirar la respuesta.
   */
  const irA = useCallback((destino: number) => {
    if (destino < 0 || destino >= localQuestions.length || destino === currentIndex) return;

    cerrarVisita(currentIndex);
    setCurrentIndex(destino);

    // El estado de diagnóstico es de la pregunta, no de la pantalla: al llegar
    // a una ya respondida y etiquetada no hay que volver a etiquetarla.
    const q = localQuestions[destino];
    setErrorTagged(
      !q.userAnswer ? false : q.userAnswer === q.correctOptionId || Boolean(q.errorType)
    );

    // El guardado en vuelo era de la pregunta que se deja.
    resultIdRef.current = null;
    savePromiseRef.current = null;
  }, [cerrarVisita, currentIndex, localQuestions]);

  /**
   * Dejar la pregunta en blanco, a proposito.
   *
   * CON PENALIZACION EL BLANCO ES UNA DECISION, NO UN DESCUIDO. Cada dos fallos
   * se pierde un acierto, asi que hay un punto en el que arriesgar sale peor
   * que no contestar. Sin este boton el alumno podia saltarse una pregunta,
   * pero no RETIRAR una respuesta ya marcada: una vez pulsada la A, la unica
   * salida era dejar la A. Ahora puede volver al blanco.
   *
   * Solo en el simulacro: en entrenamiento la pregunta se corrige al momento y
   * dejarla en blanco no significa nada.
   */
  const dejarEnBlanco = useCallback(() => {
    if (mode !== 'exam') return;
    aplicarRespuestas(
      localQuestions.map((q, i) => (i === currentIndex ? { ...q, userAnswer: null } : q))
    );
  }, [aplicarRespuestas, currentIndex, localQuestions, mode]);

  /** Marca o desmarca la pregunta actual para revisarla luego. */
  const alternarMarca = useCallback(() => {
    setMarcadas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(currentIndex)) siguiente.delete(currentIndex);
      else siguiente.add(currentIndex);
      return siguiente;
    });
  }, [currentIndex]);

  const handleFinish = useCallback(() => {
    cerrarVisita(currentIndex);

    // Las métricas se vuelcan AQUÍ, para todas las preguntas y desde el mapa
    // acumulado. Antes se escribían al pasar de pregunta: volver sobre una la
    // habría dejado con el tiempo de la última visita en vez del total, y las
    // dudas de la primera se habrían perdido.
    const finales = localQuestions.map((q, i) => {
      const m = metricasDe(i);
      return { ...q, timeMs: m.tiempo, changes: m.cambios };
    });

    setLocalQuestions(finales);
    onFinish(finales);
  }, [cerrarVisita, currentIndex, localQuestions, metricasDe, onFinish]);

  /**
   * PANTALLA DE REVISION ANTES DE ENTREGAR (lo que Moodle llama «Terminar
   * intento»).
   *
   * Entregar era irreversible y estaba a un clic del boton de avanzar, en el
   * mismo sitio y con el mismo aspecto: pulsar «SIGUIENTE» de mas en la ultima
   * pregunta entregaba el examen. Con 13 preguntas en blanco sin saberlo.
   *
   * Solo en el simulacro. En entrenamiento cada pregunta se corrige al momento,
   * asi que no hay nada que revisar al final.
   */
  const [revisando, setRevisando] = useState(false);

  const handleNext = useCallback(() => {
    if (currentIndex < localQuestions.length - 1) { irA(currentIndex + 1); return; }
    // Al final del simulacro se pasa por la revision; en entrenamiento se
    // entrega directamente.
    if (navegacionLibre) { cerrarVisita(currentIndex); setRevisando(true); return; }
    handleFinish();
  }, [cerrarVisita, currentIndex, handleFinish, irA, localQuestions.length, navegacionLibre]);

  /** Vuelve del resumen a una pregunta concreta. */
  const volverAlExamen = useCallback((destino: number) => {
    setRevisando(false);
    // El cronometro de la pregunta arranca AHORA: el tiempo mirando el resumen
    // no es tiempo de ninguna pregunta.
    entradaRef.current = Date.now();
    if (destino !== currentIndex) irA(destino);
  }, [currentIndex, irA]);

  /**
   * ENTREGA AUTOMATICA AL AGOTARSE EL TIEMPO.
   *
   * Es lo que convierte el cronometro en un limite de verdad. Sin esto el
   * reloj llegaba a cero y no pasaba nada, que es justo lo que no hace un
   * tribunal.
   *
   * El `ref` no es defensivo de mas: en StrictMode los efectos corren dos
   * veces, y el intervalo sigue repintando despues de expirar. Sin el, el
   * examen se entregaria varias veces y `saveExamResults` insertaria las filas
   * repetidas — el mismo fallo de la doble insercion de la fase 2.4, por otra
   * puerta.
   */
  const entregadoRef = useRef(false);

  useEffect(() => {
    if (!conLimite || !reloj.expired || entregadoRef.current) return;
    entregadoRef.current = true;
    handleFinish();
  }, [conLimite, reloj.expired, handleFinish]);

  // --- ATAJOS DE TECLADO ---
  // En un test de 100 preguntas ir a raton cansa. A/B/C o 1/2/3 responden,
  // Enter avanza.
  //
  // No dispara con el modal de reporte abierto ni escribiendo en un campo: si
  // no, teclear "la b esta mal" en el reporte marcaria la opcion B.
  const puedeAvanzar = mode === 'exam' || (isAnswered && (isCorrect || errorTagged));

  const estaMarcada = marcadas.has(currentIndex);

  useEffect(() => {
    function alPulsar(e: KeyboardEvent) {
      if (isReportModalOpen) return;
      const dentroDeUnCampo = (e.target as HTMLElement)?.closest('input, textarea, [contenteditable]');
      if (dentroDeUnCampo) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'Enter') {
        if (puedeAvanzar) { e.preventDefault(); handleNext(); }
        return;
      }

      if (navegacionLibre) {
        // Las flechas mueven por el examen como en cualquier formulario largo.
        if (e.key === 'ArrowLeft') { e.preventDefault(); irA(currentIndex - 1); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); irA(currentIndex + 1); return; }
        // `M` no colisiona con las opciones, que son A, B y C.
        if (e.key.toLowerCase() === 'm') { e.preventDefault(); alternarMarca(); return; }
        // `0` tampoco: las opciones se numeran desde el 1.
        if (e.key === '0') { e.preventDefault(); dejarEnBlanco(); return; }
      }

      const tecla = e.key.toLowerCase();
      const porLetra = currentQ.options.findIndex((o) => o.id === tecla);
      const porNumero = /^[1-9]$/.test(tecla) ? Number(tecla) - 1 : -1;
      const indice = porLetra >= 0 ? porLetra : porNumero;

      const opcion = currentQ.options[indice];
      if (opcion) { e.preventDefault(); handleAnswer(opcion.id); }
    }

    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [alternarMarca, currentIndex, currentQ, dejarEnBlanco, handleAnswer, handleNext, irA, isReportModalOpen, navegacionLibre, puedeAvanzar]);

  /**
   * PANTALLA DE REVISION — «Terminar intento».
   *
   * Un resumen antes de entregar: cuantas contestadas, cuantas en blanco,
   * cuantas marcadas, y desde ahi volver a cualquiera. Entregar es
   * irreversible y estaba a un clic del boton de avanzar; ahora hay una
   * parada explicita en medio.
   *
   * El boton de entregar NO se pinta como el de avanzar, a proposito: el color
   * y la posicion son parte de la guarda contra el clic de mas.
   */
  if (revisando) {
    const enBlanco = localQuestions.reduce<number[]>((acc, q, i) => (q.userAnswer ? acc : [...acc, i]), []);
    const contestadas = localQuestions.length - enBlanco.length;
    const pendientes = enBlanco.length + marcadas.size;

    return (
      <div className="max-w-3xl mx-auto animate-in fade-in duration-300 pb-24">
        <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-5 sm:p-8 md:p-12 shadow-2xl border border-slate-100 dark:border-slate-800">

          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{topicName}</p>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-6 sm:mb-8">
            Antes de entregar
          </h2>

          <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6 sm:mb-10">
            <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-3 sm:p-5 border border-slate-100 dark:border-slate-800">
              <p className="text-2xl sm:text-3xl font-black text-indigo-600">{contestadas}</p>
              <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider mt-1">Contestadas</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-3 sm:p-5 border border-slate-100 dark:border-slate-800">
              <p className={`text-2xl sm:text-3xl font-black ${enBlanco.length > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-300'}`}>
                {enBlanco.length}
              </p>
              <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider mt-1">En blanco</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-3 sm:p-5 border border-slate-100 dark:border-slate-800">
              <p className={`text-2xl sm:text-3xl font-black ${marcadas.size > 0 ? 'text-amber-500' : 'text-slate-300'}`}>
                {marcadas.size}
              </p>
              <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider mt-1">Marcadas</p>
            </div>
          </div>

          {/* Que un blanco no reste es cierto, pero tampoco suma. Decirlo aqui
              evita que el alumno lo lea como "da igual dejarlas". */}
          {enBlanco.length > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 sm:mb-8 leading-relaxed">
              Las respuestas en blanco <strong className="text-slate-700 dark:text-slate-200">no restan</strong>,
              pero tampoco suman. Si puedes descartar una opción, arriesgar sale a cuenta.
            </p>
          )}

          {/* LA CUADRICULA. Aqui si cabe el numero de cada pregunta, que en la
              barra de la cabecera no cabia. */}
          <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5 sm:gap-2 mb-6 sm:mb-10">
            {localQuestions.map((q, i) => {
              const respondida = !!q.userAnswer;
              const marcada = marcadas.has(i);
              return (
                <button
                  key={i}
                  onClick={() => volverAlExamen(i)}
                  title={`Pregunta ${i + 1}${marcada ? ' · marcada' : ''}${respondida ? '' : ' · en blanco'}`}
                  className={`relative aspect-square rounded-xl text-xs font-black flex items-center justify-center border-2 transition-all hover:scale-105 ${
                    respondida
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-slate-950 text-slate-400 border-dashed border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {i + 1}
                  {marcada && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-white dark:border-slate-900" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => volverAlExamen(enBlanco[0] ?? [...marcadas][0] ?? currentIndex)}
              className="flex-1 px-6 py-4 rounded-xl font-black text-sm border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400 transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft size={16} />
              {pendientes > 0 ? 'Volver a las pendientes' : 'Volver al examen'}
            </button>
            <button
              onClick={handleFinish}
              className="flex-1 px-6 py-4 rounded-xl font-black text-sm bg-slate-900 dark:bg-white text-white dark:text-black shadow-xl hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
            >
              Entregar y corregir
              <CheckCircle2 size={16} />
            </button>
          </div>

          {conLimite && (
            <p className={`text-center text-[11px] font-black uppercase tracking-wider mt-6 font-mono ${
              reloj.urgency === 'critical' ? 'text-red-500' : 'text-slate-400'
            }`}>
              El reloj sigue corriendo · {formatTime(reloj.remaining)}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    // `justify-center` sobre `min-h-[80vh]` dejaba la tarjeta flotando en
    // medio de la pantalla con medio viewport vacio debajo. Ahora el contenido
    // se apoya arriba y la cabecera acompania al scroll.
    <div className="max-w-3xl mx-auto animate-in fade-in duration-300 relative pb-32">

      {/* ================= CABECERA ================= */}
      <div className="sticky top-0 z-30 -mx-4 px-4 pt-4 pb-4 mb-6 sm:mb-8 bg-slate-50/85 dark:bg-slate-950/85 backdrop-blur-xl border-b border-slate-200/70 dark:border-slate-800/70">

          {/* Antes era una sola fila con tres grupos (Abortar / tema+modo /
              reloj+contador) peleando por sitio: en un movil de 360px no
              cabian sin apretarse. Con `flex-wrap` el tema+modo baja a su
              propia fila SOLO en movil (`w-full` fuerza el salto); en sm+
              vuelve a la fila unica de siempre. */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3 sm:gap-4 sm:mb-4">
              <button onClick={onExit} className="text-[11px] font-black text-slate-400 hover:text-red-500 uppercase tracking-wider flex items-center gap-1.5 transition-colors order-1">
                  <ArrowLeft size={14}/> Abortar
              </button>

              <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0 order-2">
                  {/* Marcar para revisar. Dudar deja de obligar a decidir en el
                      momento: la marcas, sigues, y vuelves al final. */}
                  {navegacionLibre && (
                      <button
                        onClick={alternarMarca}
                        title={estaMarcada ? 'Quitar la marca (M)' : 'Marcar para revisarla luego (M)'}
                        className={`p-1.5 rounded-lg transition-colors ${
                          estaMarcada
                            ? 'text-amber-500 bg-amber-500/10'
                            : 'text-slate-400 hover:text-amber-500 hover:bg-amber-500/10'
                        }`}
                      >
                          <Bookmark size={15} fill={estaMarcada ? 'currentColor' : 'none'}/>
                      </button>
                  )}

                  {/* CUENTA ATRAS, no cuenta adelante.
                      El simulacro decia tener cronómetro pero contaba hacia
                      arriba y no terminaba nunca. La mitad de la dificultad
                      del examen real es que el tiempo se acaba: quien solo ha
                      practicado sin límite no sabe a qué ritmo va.
                      El color es el aviso — no hay pitidos, porque un examen
                      se hace en silencio. */}
                  <span
                    title={conLimite
                      ? `Quedan ${formatTime(reloj.remaining)} de ${formatTime(durationSeconds)}`
                      : 'Sin límite de tiempo'}
                    className={`text-[11px] font-black font-mono flex items-center gap-1.5 tabular-nums transition-colors ${
                      !conLimite ? 'text-slate-500 dark:text-slate-400'
                        : reloj.urgency === 'critical' ? 'text-red-500 animate-pulse'
                        : reloj.urgency === 'warning' ? 'text-amber-500'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                      <Clock size={13} className={conLimite && reloj.urgency !== 'calm' ? '' : 'text-slate-400'}/>
                      {conLimite ? formatTime(reloj.remaining) : formatTime(segundosTest)}
                  </span>
                  <span className="text-[11px] font-black text-slate-900 dark:text-white font-mono tabular-nums">
                      {currentIndex + 1}<span className="text-slate-400">/{localQuestions.length}</span>
                  </span>
              </div>

              {/* El tema y el modo: antes no habia forma de saber que estabas
                  haciendo ni de que iba. `w-full` en movil lo manda a su
                  propia fila (order-3); en sm+ vuelve al centro de la fila
                  unica, como antes. */}
              <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto sm:flex-1 justify-center order-3 sm:order-none">
                  <Layers size={13} className="text-slate-400 flex-shrink-0"/>
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                      {topicName}
                  </span>
                  <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0 ${
                      mode === 'exam'
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300'
                  }`}>
                      {mode === 'exam' ? 'Examen' : 'Entreno'}
                  </span>
              </div>
          </div>

          {/* Un segmento por pregunta en vez de una barra lisa: de un vistazo
              se ve cuantas van y como. En examen NO se colorea el acierto —
              el alumno no debe saber si va bien hasta el final. */}
          {/* Un segmento por pregunta, y en el simulacro se puede pulsar: es el
              mapa de preguntas que distingue una pantalla de examen seria de un
              formulario. Amarillo = marcada para revisar. */}
          {/* La marca ya NO sustituye al color: son dos cosas distintas y
              taparse una a otra perdia informacion. Una pregunta marcada y
              contestada se veia igual que una marcada y en blanco, que es
              justo lo que hay que poder distinguir al final del examen.
              El color dice si esta contestada; la marca, una muesca encima. */}
          <div className="flex gap-1 items-end">
              {localQuestions.map((q, i) => {
                  const respondida = !!q.userAnswer;
                  const esActual = i === currentIndex;
                  const marcada = marcadas.has(i);

                  let color = 'bg-slate-200 dark:bg-slate-800';
                  if (mode === 'practice' && respondida) {
                      color = q.userAnswer === q.correctOptionId ? 'bg-emerald-500' : 'bg-red-500';
                  } else if (respondida) {
                      color = 'bg-indigo-500';
                  }

                  const barra = `h-1.5 w-full rounded-full transition-all duration-300 ${color} ${
                    esActual ? 'ring-2 ring-offset-2 ring-indigo-500 dark:ring-offset-slate-950' : ''
                  }`;

                  const contenido = (
                      <>
                          {/* La muesca de "marcada", encima y sin robarle sitio
                              al color de estado. */}
                          <span
                            className={`block h-1 w-1 rounded-full mx-auto mb-0.5 ${
                              marcada ? 'bg-amber-400' : 'bg-transparent'
                            }`}
                          />
                          <span className={barra} />
                      </>
                  );

                  const titulo = `Pregunta ${i + 1}${marcada ? ' · marcada' : ''}${
                    respondida ? '' : ' · en blanco'
                  }`;

                  if (!navegacionLibre) {
                      return <div key={i} className="flex-1" title={titulo}>{contenido}</div>;
                  }

                  return (
                      <button
                        key={i}
                        onClick={() => irA(i)}
                        title={titulo}
                        className="flex-1 cursor-pointer group/seg"
                      >
                          {contenido}
                      </button>
                  );
              })}
          </div>

          {/* El recuento, en palabras. Con penalizacion el alumno necesita
              saber cuantas lleva en blanco ANTES de entregar: son las que no
              restan, y decidir sobre ellas es media estrategia del examen. */}
          {navegacionLibre && (
              <p className="mt-2 flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <span className="text-indigo-500">
                      {localQuestions.filter((q) => q.userAnswer).length} contestadas
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span>{localQuestions.filter((q) => !q.userAnswer).length} en blanco</span>
                  {marcadas.size > 0 && (
                      <>
                          <span className="text-slate-300 dark:text-slate-700">·</span>
                          <span className="text-amber-500">{marcadas.size} marcadas</span>
                      </>
                  )}
              </p>
          )}
      </div>

      {/* El cuerpo se centra en el hueco que dejan cabecera y pie.

          Sin esto, una pregunta corta sin feedback dejaba medio viewport
          vacio debajo. Es `min-h` y no `h`, asi que cuando el feedback del
          modo entrenamiento es largo el bloque crece hacia abajo en vez de
          recortarse. */}
      {/*
        El `calc(100vh-15rem)` asume la altura de cabecera y pie de un
        escritorio. En movil la cabecera ahora puede ocupar dos filas (arriba)
        y el 100vh de un navegador movil se mueve con la barra de
        direcciones: ese calculo fijo dejaba huecos en blanco distintos segun
        el telefono. Por debajo de `sm` se usa un minimo relativo al viewport
        en vez de restar un offset de escritorio.
      */}
      <div className="min-h-[45dvh] sm:min-h-[calc(100dvh-15rem)] flex flex-col justify-center">

      {/* TARJETA DE PREGUNTA */}
      <div className="bg-white dark:bg-slate-900 p-5 sm:p-8 md:p-12 rounded-2xl sm:rounded-3xl shadow-2xl shadow-indigo-500/10 border border-slate-100 dark:border-slate-800 relative overflow-hidden group/card">
          
          {/* Marca de agua decorativa */}
          <div className="absolute top-0 right-0 p-32 bg-indigo-500/5 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>

          {/* TOOLBAR DE CALIDAD */}
          {/* Solo si la pregunta tiene fila en la base de datos: sin id, votar o
              reportar no puede llegar a ninguna parte, y unos botones que no
              hacen nada son peores que no tenerlos. */}
          {currentQ.id && (
            <div className="absolute top-6 right-6 flex items-center gap-2 opacity-100 md:opacity-0 group-hover/card:opacity-100 transition-opacity duration-300">
              <button onClick={() => handleVote('up')} className={`p-2 rounded-full transition-colors ${votes[currentQ.id] === 'up' ? 'bg-emerald-100 text-emerald-600' : 'hover:bg-slate-100 text-slate-300 hover:text-emerald-500'}`}><ThumbsUp size={18} /></button>
              <button onClick={() => handleVote('down')} className={`p-2 rounded-full transition-colors ${votes[currentQ.id] === 'down' ? 'bg-red-100 text-red-600' : 'hover:bg-slate-100 text-slate-300 hover:text-red-500'}`}><ThumbsDown size={18} /></button>
              <div className="w-px h-4 bg-slate-200 mx-1"></div>
              <button onClick={() => setIsReportModalOpen(true)} className="p-2 rounded-full hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"><Flag size={18} /></button>
            </div>
          )}

          {/* Etiqueta de Origen

              Hay TRES origenes y aqui solo se distinguian dos: `origin === 'live_ai'`
              o "todo lo demas". Como las recien generadas llegan con
              `origin: 'candidate'`, caian en el `else` y se le presentaban al
              alumno como "BANCO OFICIAL" — una pregunta que la IA acababa de
              inventar y que nadie habia revisado. En una oposicion eso no es un
              detalle: le estas diciendo que esta validada. */}
          <div className="mb-5">
             {currentQ.origin === 'bank' ? (
               <span className="text-[10px] font-mono uppercase px-2.5 py-1 rounded-md border bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
                 📚 Banco oficial
               </span>
             ) : (
               <span
                 className="text-[10px] font-mono uppercase px-2.5 py-1 rounded-md border bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
                 title="Generada por IA a partir del temario. Aún no la ha revisado un administrador."
               >
                 ⚠ Generada por IA · sin revisar
               </span>
             )}
          </div>

          <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white mb-6 sm:mb-10 leading-snug relative z-10">
              {currentQ.question}
          </h3>

          <div className="space-y-3 sm:space-y-4 relative z-10">
              {currentQ.options.map((opt) => {
                  const isSelected = currentQ.userAnswer === opt.id;
                  const isCorrectOpt = opt.id === currentQ.correctOptionId;
                  
                  let style = "border-slate-200 dark:border-slate-800 hover:border-indigo-400 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300";
                  
                  if (mode === 'practice' && isAnswered) {
                      if (isCorrectOpt) style = "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500";
                      else if (isSelected) style = "border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 opacity-60";
                      else style = "border-slate-100 dark:border-slate-800 opacity-40";
                  } else if (isSelected) {
                      style = "border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-[1.02]";
                  }

                  return (
                      <button 
                          key={opt.id} 
                          onClick={() => handleAnswer(opt.id)}
                          disabled={mode === 'practice' && isAnswered}
                          className={`w-full text-left p-4 sm:p-5 rounded-2xl border-2 font-bold transition-all duration-200 flex items-start gap-3 sm:gap-4 group ${style}`}
                      >
                          {/* La letra hace de tecla: es el atajo, no un adorno.
                              Con borde de teclado para que se lea como tal. */}
                          <kbd className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black uppercase border-b-2 flex-shrink-0 mt-0.5 transition-colors ${
                            isSelected || (mode === 'practice' && isCorrectOpt && isAnswered)
                              ? 'border-transparent bg-white/25 text-current'
                              : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-500 group-hover:border-indigo-400 group-hover:text-indigo-500'
                          }`}>
                              {opt.id}
                          </kbd>
                          <span className="text-sm md:text-base leading-relaxed">{opt.text}</span>
                      </button>
                  );
              })}
          </div>

          {/* DEJAR EN BLANCO

              Con la penalizacion de la convocatoria, el blanco es una DECISION
              estrategica: cada dos fallos se pierde un acierto, asi que hay un
              punto en el que arriesgar sale peor que callarse. Sin este boton
              se podia saltar una pregunta, pero no RETIRAR una respuesta ya
              marcada — una vez pulsada la A, la unica salida era dejar la A.

              Solo se ofrece cuando hay algo que retirar: un boton que no hace
              nada es peor que no tenerlo. */}
          {navegacionLibre && isAnswered && (
              <div className="mt-6 flex justify-center relative z-10">
                  <button
                    onClick={dejarEnBlanco}
                    title="Retirar la respuesta y dejarla en blanco (0)"
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                      <Eraser size={14} />
                      Dejar en blanco
                      <kbd className="px-1.5 py-0.5 rounded border border-b-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono">
                          0
                      </kbd>
                  </button>
              </div>
          )}
      </div>

      {/* FEEDBACK (SOLO MODO PRÁCTICA) */}
      {mode === 'practice' && isAnswered && (
          <div className="mt-6 animate-in slide-in-from-bottom-4 fade-in duration-500">
              {isCorrect ? (
                  <div className="bg-emerald-500 text-white p-6 rounded-3xl shadow-lg flex items-start gap-4 relative overflow-hidden">
                      <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm"><CheckCircle2 size={28} /></div>
                      <div className="relative z-10">
                          <p className="font-black text-lg uppercase tracking-wide">¡Correcto!</p>
                          <p className="text-emerald-50 font-medium mt-1 leading-relaxed text-sm opacity-90">{currentQ.explanation}</p>
                          {/* De donde sale la pregunta (P3.7). Para un opositor
                              esto vale casi tanto como la explicacion: le dice
                              QUE RELEER. Solo aparece si se sabe: nulo es
                              "no consta", y no hay nada que ensenar. */}
                          {currentQ.legalReference && (
                              <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest bg-white/20 px-3 py-1.5 rounded-full">
                                  <Scale size={12}/> {currentQ.legalReference}
                              </p>
                          )}
                      </div>
                  </div>
              ) : (
                  <div className="bg-white dark:bg-slate-900 border-2 border-red-100 dark:border-red-900/30 p-6 rounded-3xl shadow-xl">
                      <div className="flex items-start gap-4 mb-6">
                          <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-2xl"><XCircle size={28} /></div>
                          <div>
                              <p className="font-black text-red-500 uppercase tracking-wide text-sm">Respuesta Incorrecta</p>
                              <p className="text-slate-600 dark:text-slate-300 text-sm mt-2 font-medium leading-relaxed">{currentQ.explanation}</p>
                              {currentQ.legalReference && (
                                  <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1.5 rounded-full">
                                      <Scale size={12}/> {currentQ.legalReference}
                                  </p>
                              )}
                          </div>
                      </div>

                      {!errorTagged ? (
                        <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                            <p className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Diagnóstico del Error (Obligatorio)</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                    {id:'olvido',label:'OLVIDO',icon:Brain},
                                    {id:'desconocimiento',label:'LAGUNA',icon:BookX},
                                    {id:'trampa',label:'TRAMPA',icon:AlertTriangle},
                                    {id:'fallo_procesamiento',label:'LECTURA',icon:Eye}
                                ].map((e)=>(
                                    <button key={e.id} onClick={()=>handleErrorTag(e.id)} className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl flex flex-col items-center gap-2 transition-all group">
                                        <e.icon size={20} className="text-slate-400 group-hover:text-indigo-500 transition-colors"/>
                                        <span className="text-[10px] font-bold text-slate-500 group-hover:text-indigo-600 transition-colors">{e.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                      ) : (
                        <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl text-center border border-dashed border-slate-300 dark:border-slate-700">
                            <p className="text-xs font-bold text-slate-500 flex items-center justify-center gap-2"><CheckCircle2 size={14} className="text-indigo-500"/> Error archivado.</p>
                        </div>
                      )}
                  </div>
              )}

              {/* La nota del alumno sobre ESTA pregunta (P3.8). Aqui y no en
                  una pantalla aparte: una nota que hay que ir a buscar a otro
                  sitio no se escribe. Volvera a salir la proxima vez que le
                  toque la pregunta. */}
              <QuestionNote questionId={currentQ.id ?? null} />
          </div>
      )}

      </div>

      {/* ================= PIE ================= */}
      {/* Fijo abajo: el boton de avanzar no deberia obligar a buscar con el
          raton ni a hacer scroll cuando el enunciado es largo. */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-slate-50/85 dark:bg-slate-950/85 backdrop-blur-xl border-t border-slate-200/70 dark:border-slate-800/70">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-4">

              {/* La pista de atajos, visible pero discreta. Un atajo que nadie
                  descubre es un atajo que no existe. */}
              <p className="hidden sm:flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <span className="flex items-center gap-1">
                      {currentQ.options.map((o) => (
                          <kbd key={o.id} className="px-1.5 py-0.5 rounded border border-b-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono uppercase">
                              {o.id}
                          </kbd>
                      ))}
                      responder
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded border border-b-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono">
                          Enter
                      </kbd>
                      avanzar
                  </span>
                  {navegacionLibre && (
                      <>
                          <span className="text-slate-300 dark:text-slate-700">·</span>
                          <span className="flex items-center gap-1">
                              <kbd className="px-1.5 py-0.5 rounded border border-b-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono">
                                  ←→
                              </kbd>
                              moverse
                          </span>
                          <span className="text-slate-300 dark:text-slate-700">·</span>
                          <span className="flex items-center gap-1">
                              <kbd className="px-1.5 py-0.5 rounded border border-b-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono">
                                  M
                              </kbd>
                              marcar
                          </span>
                      </>
                  )}
              </p>

              {/* Volver atrás: en el examen real se puede, y es lo que hace todo
                  el mundo. Antes esto era una vía de sentido único. */}
              {navegacionLibre && currentIndex > 0 && (
                  <button
                    onClick={() => irA(currentIndex - 1)}
                    className="ml-auto text-slate-500 hover:text-slate-900 dark:hover:text-white px-4 py-3.5 rounded-xl font-black text-sm flex items-center gap-2 transition-colors"
                  >
                      <ArrowLeft size={16}/> ANTERIOR
                  </button>
              )}

              {/* En entrenamiento el boton solo aparece con la respuesta dada;
                  si es un fallo, hay que etiquetarlo antes (es obligatorio). */}
              {(mode === 'exam' || isAnswered) ? (
                  <button
                    onClick={handleNext}
                    disabled={!puedeAvanzar}
                    className="ml-auto bg-slate-900 dark:bg-white text-white dark:text-black px-8 py-3.5 rounded-xl font-black text-sm shadow-xl hover:scale-105 transition-transform disabled:opacity-40 disabled:scale-100 disabled:cursor-not-allowed flex items-center gap-3"
                  >
                      {/* En el simulacro la última NO entrega: lleva al
                          resumen. Decir "FINALIZAR" donde se abre una revisión
                          es mentir sobre lo que hace el botón, y donde de
                          verdad entregaba era peor: irreversible, en el mismo
                          sitio y con el mismo aspecto que "SIGUIENTE". */}
                      {currentIndex < localQuestions.length - 1
                        ? 'SIGUIENTE'
                        : navegacionLibre ? 'REVISAR' : 'FINALIZAR'}
                      <ChevronRight size={16}/>
                  </button>
              ) : (
                  <span className="ml-auto text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Elige una respuesta
                  </span>
              )}
          </div>
      </div>

      {/* REPORTAR UNA PREGUNTA */}
      {/* Era el quinto modal escrito a mano. Además del `vh`, tenía un detalle
          propio: la lista de motivos iba en un `max-h-48` con scroll DENTRO de
          un modal que ya hacía scroll — dos barras anidadas en una pantalla de
          móvil, donde el dedo nunca sabe cuál va a mover. El primitivo hace
          scroll una sola vez, en el cuerpo. */}
      {isReportModalOpen && (
        <Modal
          title="Reportar la pregunta"
          subtitle="Lo revisa un administrador"
          width="sm"
          onClose={() => setIsReportModalOpen(false)}
          footer={
            <Button
              block
              onClick={submitReport}
              disabled={!reportData.type || isSubmittingReport}
              iconRight={!isSubmittingReport ? <Send size={14} /> : undefined}
            >
              {isSubmittingReport ? 'Enviando…' : 'Enviar reporte'}
            </Button>
          }
        >
          <div className="space-y-4">
            <div className="space-y-2">
              {REPORT_TYPES.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setReportData({ ...reportData, type: type.id })}
                  className={`w-full text-left text-sm px-4 py-3 min-h-[44px] rounded-xl border transition-all ${
                    reportData.type === type.id
                      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-500 text-amber-700 dark:text-amber-400 font-bold'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>

            <TextAreaField
              label="Detalles (opcional)"
              rows={3}
              placeholder="Qué has visto…"
              value={reportData.message}
              onChange={(e) => setReportData({ ...reportData, message: e.target.value })}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
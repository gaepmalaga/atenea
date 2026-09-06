'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw, Target, Brain, BookX, AlertTriangle, Eye,
  CheckCircle2, ChevronDown, Layers, Repeat, Scale, Crosshair,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getFailedQuestions } from '@/actions';
import { indexToOptionId } from '@/app/lib/questions';
import { esAtascada, type FailedQuestion } from '@/app/lib/review';
import { ERROR_LABELS } from '@/app/lib/stats';
import QuestionNote from '../../QuestionNote';
import { Button } from '../../../ui';

/**
 * REPASO DE LO FALLADO.
 *
 * La plataforma sabía exactamente qué había fallado cada alumno —y por qué,
 * porque el diagnóstico del error es obligatorio— y no había ni una pantalla
 * para volver a ello. El dato se recogía y se moría en la tabla.
 *
 * Lo que se muestra sigue la misma regla que la pantalla del test: todo tiene
 * que ayudar a entender el fallo. Nada de rachas ni medallas.
 */

const ERROR_META: Record<string, { label: string; icon: LucideIcon; hint: string }> = {
  olvido: {
    label: ERROR_LABELS.olvido,
    icon: Brain,
    hint: 'Lo sabías y no te salió. Es el que mejor responde a repetir.',
  },
  desconocimiento: {
    label: ERROR_LABELS.desconocimiento,
    icon: BookX,
    hint: 'No lo habías estudiado. Toca volver al temario, no al test.',
  },
  trampa: {
    label: ERROR_LABELS.trampa,
    icon: AlertTriangle,
    hint: 'La pregunta te llevó donde quería. Fíjate en cómo está redactada.',
  },
  fallo_procesamiento: {
    label: 'Lectura',
    icon: Eye,
    hint: 'Leíste mal el enunciado. Suele ser prisa: en el examen, léelo dos veces.',
  },
};

interface FailedQuestionsProps {
  /**
   * Ir a hacer un test. Opcional: la academia puede tener el modulo de test
   * apagado (P4), y entonces no se ofrece un camino que no existe.
   */
  onHacerTest?: () => void;
}

export default function FailedQuestions({ onHacerTest }: FailedQuestionsProps) {
  const [items, setItems] = useState<FailedQuestion[] | null>(null);
  const [byTopic, setByTopic] = useState<{ topic: string; count: number }[]>([]);
  const [temaFiltrado, setTemaFiltrado] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  // El error se guarda y se PINTA. Un fallo de lectura que solo va a consola
  // deja la pantalla diciendo «no has fallado nada», que es la mentira más
  // tranquilizadora posible.
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const res = await getFailedQuestions();
    if (res.success) {
      setItems(res.items);
      setByTopic(res.byTopic);
    } else {
      setError(res.error);
      setItems([]);
    }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) {
    return <div className="p-20 text-center animate-pulse text-slate-500">Recuperando fallos...</div>;
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <AlertTriangle className="mx-auto text-amber-500 mb-4" size={40} />
        <p className="font-black text-slate-900 dark:text-white mb-2">No se pudo cargar el repaso</p>
        <p className="text-sm text-slate-500 mb-6">{error}</p>
        <button
          onClick={cargar}
          className="px-6 py-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black font-black text-sm"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const lista = items ?? [];
  const visibles = temaFiltrado ? lista.filter((i) => (i.topic || 'Sin tema') === temaFiltrado) : lista;

  // «Sin datos» y «cero» no son lo mismo (regla 8), y aquí además significan
  // cosas opuestas: no haber fallado nunca no es igual que no haber hecho
  // ningún test.
  if (lista.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16 sm:py-24 animate-in fade-in duration-500">
        <CheckCircle2 className="mx-auto text-emerald-500 mb-6" size={56} />
        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-3">
          No hay nada que repasar
        </h2>
        <p className="text-slate-500 leading-relaxed">
          Aquí aparecerán las preguntas que falles, agrupadas y con el diagnóstico
          que les pusiste. Las que dejes en blanco no cuentan: no son fallos.
        </p>
        {/* Una pantalla vacia que no dice como dejar de estarlo es un callejon
            sin salida. El unico modo de que aqui aparezca algo es hacer un test,
            y estaba a dos toques de distancia sin que nada lo dijera. */}
        {onHacerTest && (
          <div className="mt-7 flex justify-center">
            <Button onClick={onHacerTest} icon={<Crosshair size={18} />}>
              Hacer un test
            </Button>
          </div>
        )}
      </div>
    );
  }

  const reincidentes = lista.filter((i) => i.times > 1).length;

  // El hueco para MobileNav ya lo reserva `<main>` en StudentDashboard.
  return (
    <div className="max-w-4xl mx-auto pb-4 animate-in fade-in duration-500">

      {/* Sin titulo propio: `Header` ya pone "REPASAR FALLOS · ANÁLISIS DE
          FALLOS" justo encima, y debajo iba "Tus fallos" en `text-3xl`. Lo que
          si hace falta es el recuento, que es informacion. */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">
            {lista.length} pregunta{lista.length !== 1 ? 's' : ''} fallada{lista.length !== 1 ? 's' : ''}
            {reincidentes > 0 && (
              <>
                {' · '}
                <span className="text-red-500 font-bold">
                  {reincidentes} más de una vez
                </span>
              </>
            )}
          </p>
        </div>
        <button
          onClick={cargar}
          title="Volver a cargar"
          aria-label="Volver a cargar los fallos"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* FILTRO POR TEMA. Ordenado por número de fallos: el tema que más duele
          va primero, que es la información y no solo un filtro. */}
      {/* UNA FILA QUE SE ARRASTRA, no `flex-wrap`.

          Los temas del CNP son frases enteras ("La Unión Europea:
          Instituciones y Derecho derivado"), asi que cada pastilla ocupaba el
          ancho completo: con cuatro temas eran 280px de filtro antes del primer
          fallo, y el temario tiene 45. Ahora cada una es de una linea, se
          recorta si hace falta y la fila se desplaza de lado. */}
      {byTopic.length > 1 && (
        <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
          <button
            onClick={() => setTemaFiltrado(null)}
            className={`min-h-[44px] px-3 rounded-lg text-[11px] font-black uppercase tracking-wider transition-colors shrink-0 ${
              temaFiltrado === null
                ? 'bg-slate-900 dark:bg-white text-white dark:text-black'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Todos ({lista.length})
          </button>
          {byTopic.map(({ topic, count }) => (
            <button
              key={topic}
              onClick={() => setTemaFiltrado(topic === temaFiltrado ? null : topic)}
              className={`min-h-[44px] px-3 rounded-lg text-[11px] font-black uppercase tracking-wider transition-colors ${
                temaFiltrado === topic
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-black'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {topic} ({count})
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {visibles.map((q) => {
          const meta = q.lastErrorType ? ERROR_META[q.lastErrorType] : null;
          const estaAbierta = abierta === q.questionId;
          // Un distractor repetido dice más que el número de fallos: si cayó
          // dos veces en la MISMA opción, no es que no se lo sepa, es que esa
          // opción le convence.
          // Regla 5: nada se lee sin comprobar que esta. Estos datos llegan
          // de una Server Action, o sea de la red: un `chosenIndexes` ausente
          // tumbaba la pantalla ENTERA de repaso —no la tarjeta, la pantalla—
          // y lo unico que quedaba era el aviso del ModuleErrorBoundary.
          const marcadas = q.chosenIndexes ?? [];
          const opciones = q.options ?? [];
          const insiste = q.times > 1 && marcadas.length === 1;

          return (
            <div
              key={q.questionId}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-shadow hover:shadow-lg"
            >
              <button
                onClick={() => setAbierta(estaAbierta ? null : q.questionId)}
                className="w-full text-left p-6 flex items-start gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {q.topic && (
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Layers size={11} /> {q.topic}
                      </span>
                    )}
                    {q.times > 1 && (
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 flex items-center gap-1">
                        <Repeat size={10} /> {q.times} veces
                      </span>
                    )}
                    {meta && (
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                        <meta.icon size={10} /> {meta.label}
                      </span>
                    )}
                  </div>
                  <p className="font-bold text-slate-900 dark:text-white leading-snug">
                    {/* Regla 5: el enunciado viene por join y puede faltar si la
                        pregunta se borró del banco. Se dice, no se revienta. */}
                    {q.questionText || <span className="text-slate-500 dark:text-slate-400 italic">Pregunta ya no disponible en el banco</span>}
                  </p>
                </div>
                <ChevronDown
                  size={18}
                  className={`text-slate-500 dark:text-slate-400 flex-shrink-0 mt-1 transition-transform ${estaAbierta ? 'rotate-180' : ''}`}
                />
              </button>

              {estaAbierta && (
                <div className="px-6 pb-6 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="space-y-2 mb-5">
                    {opciones.map((texto, i) => {
                      const esCorrecta = i === q.correctIndex;
                      const laMarco = marcadas.includes(i);
                      return (
                        <div
                          key={i}
                          className={`p-3.5 rounded-xl border-2 text-sm flex items-start gap-3 ${
                            esCorrecta
                              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300'
                              : laMarco
                              ? 'border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400'
                              : 'border-slate-100 dark:border-slate-800 text-slate-500'
                          }`}
                        >
                          <span className="font-black uppercase text-xs mt-0.5">{indexToOptionId(i)}</span>
                          <span className="flex-1">{texto}</span>
                          {esCorrecta && <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />}
                          {!esCorrecta && laMarco && (
                            <span className="text-[9px] font-black uppercase tracking-wider flex-shrink-0 mt-1">
                              la marcaste
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {opciones.length === 0 && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                        Las opciones ya no están disponibles.
                      </p>
                    )}
                  </div>

                  {q.explanation && (
                    <div className="bg-slate-50 dark:bg-slate-950 rounded-xl p-4 border border-slate-100 dark:border-slate-800 mb-4">
                      <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                        Por qué
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        {q.explanation}
                      </p>
                      {/* De qué artículo sale (P3.7). En una pantalla de repaso
                          es la mitad del valor: dice qué releer. Solo aparece
                          si consta. */}
                      {q.legalReference && (
                        <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                          <Scale size={12} /> {q.legalReference}
                        </p>
                      )}
                    </div>
                  )}

                  {/* El diagnóstico que puso el alumno, devuelto como consejo.
                      Clasificar el error solo sirve si luego se le dice qué
                      hacer con esa clasificación. */}
                  {meta && (
                    <p className="text-xs text-slate-500 dark:text-slate-500 dark:text-slate-400 flex items-start gap-2 leading-relaxed">
                      <Target size={13} className="text-indigo-500 flex-shrink-0 mt-0.5" />
                      {meta.hint}
                    </p>
                  )}

                  {insiste && (
                    <p className="text-xs text-red-600 dark:text-red-400 flex items-start gap-2 leading-relaxed mt-3">
                      <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                      Has caído {q.times} veces en la misma opción. No es que no te la
                      sepas: es que esa respuesta te convence.
                    </p>
                  )}

                  {/* Atascada (técnica 10): fallada 4+ veces. Más tests no la
                      arreglan — hay que ir a la fuente. */}
                  {esAtascada(q) && (
                    <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                      <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed flex items-start gap-2">
                        <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                        <span>
                          Llevas <strong>{q.times}</strong> fallos en esta. Repetirla en los tests no
                          está funcionando: {q.legalReference
                            ? <>vuelve al <strong>{q.legalReference}</strong> y léelo despacio</>
                            : <>relee esa parte del temario con calma</>}, y si quieres hazte una ficha del dato exacto.
                        </span>
                      </p>
                    </div>
                  )}

                  {/* La nota se carga al DESPLEGAR la tarjeta, no al pintar la
                      lista: son tantas consultas como preguntas abiertas, no
                      como preguntas falladas. */}
                  <QuestionNote questionId={q.questionId} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

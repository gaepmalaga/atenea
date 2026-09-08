'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Brain, CheckCircle2,
  HelpCircle, AlertTriangle, MousePointerClick, Loader2,
} from 'lucide-react';
import { generateFlashcard, saveFlashcardProgress, getStudentTopics } from '@/actions';
import SelectorTema from '../../SelectorTema';

type CardData = {
  db_id?: string | null;
  /**
   * La ficha del BANCO COMPARTIDO de la que sale este repaso.
   *
   * Sin arrastrarlo hasta el guardado no hay forma de saber qué fichas ha
   * visto ya el alumno, y la siguiente que se le sirviera podría ser la misma.
   */
  card_id?: string | null;
  front: string;
  back: string;
  topic: string;
  /** Id del tema, ya normalizado por el servidor. */
  subjectId?: number | null;
  box?: number | null;
  isReview?: boolean;
};

type Resultado =
  | { ok: true; card: CardData }
  | { ok: false; aviso: string | null };

export default function FlashcardDeck() {
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [currentCard, setCurrentCard] = useState<CardData | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [loadingTopics, setLoadingTopics] = useState(true);
  // Solo para la PRIMERA ficha del tema: a partir de ahí la siguiente ya está
  // precargada y el cambio es instantáneo.
  const [cargandoPrimera, setCargandoPrimera] = useState(false);
  // Un guardado que falló. No revierte la ficha (ya no está en pantalla), solo
  // avisa: el alumno merece saber que ese repaso no se apuntó.
  const [guardadoFallido, setGuardadoFallido] = useState(false);

  // La SIGUIENTE ficha, traída mientras el alumno lee la actual. En un ref y no
  // en estado: se escribe desde una precarga en segundo plano y leerlo desde un
  // cierre daría el valor de antes (regla 13).
  const nextRef = useRef<CardData | null>(null);
  // Marca de la petición en curso: si el alumno cambia de tema a mitad de una
  // precarga, la respuesta que llega tarde no debe pisar la nueva.
  const peticionRef = useRef(0);

  const pedirFicha = useCallback(
    async (topic: string, excluir?: CardData | null): Promise<Resultado> => {
      try {
        const res = await generateFlashcard(topic, {
          dbId: excluir?.db_id ?? null,
          cardId: excluir?.card_id ?? null,
        });
        if (res.success && res.data) return { ok: true, card: res.data };
        return { ok: false, aviso: ('error' in res && res.error) || 'No se ha podido cargar la ficha.' };
      } catch {
        return { ok: false, aviso: 'No se ha podido cargar la ficha. Comprueba tu conexión.' };
      }
    },
    [],
  );

  /** Deja lista en `nextRef` la ficha que vendrá después de `actual`. */
  const precargarSiguiente = useCallback(
    async (topic: string, actual: CardData, marca: number) => {
      const r = await pedirFicha(topic, actual);
      if (marca !== peticionRef.current) return; // el alumno cambió de tema
      nextRef.current = r.ok ? r.card : null;
    },
    [pedirFicha],
  );

  // 1. CARGA INICIAL — la lista de temas.
  useEffect(() => {
    getStudentTopics().then((res) => {
      if (res.success && res.topics) {
        setTopics(res.topics);
        if (res.topics.length > 0) setSelectedTopic((t) => t || res.topics[0]);
      }
      setLoadingTopics(false);
    });
  }, []);

  /** Empieza (o reempieza) el repaso del tema elegido. */
  const empezar = useCallback(async () => {
    if (!selectedTopic) return;
    const marca = ++peticionRef.current;
    nextRef.current = null;
    setIsFlipped(false);
    setCurrentCard(null);
    setAviso(null);
    setGuardadoFallido(false);
    setCargandoPrimera(true);

    const r = await pedirFicha(selectedTopic);
    if (marca !== peticionRef.current) return;
    setCargandoPrimera(false);
    if (r.ok) {
      setCurrentCard(r.card);
      void precargarSiguiente(selectedTopic, r.card, marca);
    } else {
      setAviso(r.aviso);
    }
  }, [selectedTopic, pedirFicha, precargarSiguiente]);

  // 2. PUNTUAR Y PASAR A LA SIGUIENTE.
  //
  // El guardado NO bloquea: se dispara y el alumno ve ya la siguiente ficha
  // (que estaba precargada). Antes eran DOS viajes al servidor EN FILA —guardar,
  // luego pedir— con un spinner a pantalla completa entre cada tarjeta.
  const puntuar = useCallback(
    async (rating: 'fail' | 'hard' | 'easy') => {
      const saved = currentCard;
      if (!saved) return;
      const marca = peticionRef.current;
      const topic = selectedTopic;

      setIsFlipped(false);

      const siguiente = nextRef.current;
      if (siguiente) {
        // Instantáneo: la teníamos precargada.
        nextRef.current = null;
        setCurrentCard(siguiente);
        setAviso(null);
      } else {
        // No había precarga (primera ficha, o red lenta). Se pide ahora, sin
        // tapar la pantalla con el spinner grande.
        setCurrentCard(null);
        setCargandoPrimera(true);
      }

      // Traer contenido va PRIMERO, guardar DESPUÉS: Next serializa las Server
      // Actions, así que si el guardado va delante la siguiente ficha espera a
      // que termine. La ficha en pantalla no puede esperar; el guardado sí.
      // (En cadena, no a la vez: lanzarlas juntas hacía que una abortara a la
      // otra.)
      (async () => {
        if (siguiente) {
          // Ya está en pantalla la siguiente: dejar lista la de después.
          await precargarSiguiente(topic, siguiente, marca);
        } else {
          // No había precarga: traer la actual ahora y dejar lista la siguiente.
          const r = await pedirFicha(topic, saved);
          if (marca !== peticionRef.current) return;
          setCargandoPrimera(false);
          if (r.ok) {
            setCurrentCard(r.card);
            void precargarSiguiente(topic, r.card, marca);
          } else {
            setAviso(r.aviso);
          }
        }

        const res = await saveFlashcardProgress(saved, rating).catch(() => ({ success: false as const }));
        if (marca === peticionRef.current && !res.success) setGuardadoFallido(true);
      })();
    },
    [currentCard, selectedTopic, pedirFicha, precargarSiguiente],
  );

  const enJuego = currentCard || cargandoPrimera;

  return (
    <div className="flex flex-col w-full max-w-2xl mx-auto">

      {/* SOLO EL SELECTOR DE TEMA. Es lo único que decide algo aquí. */}
      <div className="w-full mb-5">
        <SelectorTema
          label="Tema"
          value={selectedTopic}
          placeholder={loadingTopics ? 'Cargando…' : 'Elige un tema'}
          onChange={(t) => { setSelectedTopic(t); setCurrentCard(null); setAviso(null); nextRef.current = null; }}
          temas={topics.map((t) => ({ valor: t, etiqueta: t }))}
        />
      </div>

      {guardadoFallido && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          Un repaso no se pudo guardar. Sigue estudiando; si se repite, avisa a tu academia.
        </div>
      )}

      <div className="relative w-full min-h-[20rem] sm:min-h-[22rem]" style={{ perspective: '1000px' }}>

        {!enJuego ? (
          <div className="w-full h-full bg-slate-100 dark:bg-slate-900/50 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl flex flex-col items-center justify-center text-center p-8">
            <Brain size={48} className="text-slate-300 mb-4" />
            <h3 className="text-lg font-bold text-slate-500 mb-2">
              {aviso ? 'Nada que repasar ahora' : 'Listo para entrenar'}
            </h3>
            {aviso && (
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-4 max-w-xs">
                {aviso}
              </p>
            )}
            <button onClick={empezar} disabled={!selectedTopic} className="min-h-[44px] bg-purple-600 hover:bg-purple-500 text-white px-8 py-3 rounded-xl font-bold uppercase tracking-wider shadow-lg transition-all hover:scale-105 disabled:opacity-50">
              Empezar a repasar
            </button>
          </div>
        ) : !currentCard ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800">
            <Loader2 size={32} className="text-purple-600 animate-spin mb-3" />
            <p className="text-[11px] font-bold text-purple-600 uppercase tracking-widest">Cargando…</p>
          </div>
        ) : (
          <div
            className="grid w-full h-full transition-transform duration-300 cursor-pointer group"
            style={{
              transformStyle: 'preserve-3d',
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            }}
            onClick={() => setIsFlipped(!isFlipped)}
          >
            {/* CARA FRONTAL (PREGUNTA) */}
            <div
              className="w-full bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-3xl p-5 pt-14 sm:p-8 sm:pt-16 flex flex-col items-center justify-center text-center shadow-xl"
              style={{
                gridArea: '1 / 1',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
              }}
            >
              <div className="absolute top-6 left-6 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
                <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest">
                  {currentCard.isReview ? 'REPASO' : 'NUEVO'}
                </span>
              </div>

              <div className="flex-1 w-full flex items-center justify-center overflow-y-auto max-h-[50dvh] py-2">
                <h3 className="text-lg sm:text-xl md:text-3xl font-black text-slate-900 dark:text-white leading-tight [overflow-wrap:anywhere]">
                  {currentCard.front}
                </h3>
              </div>

              <div className="mt-auto flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider opacity-60">
                <MousePointerClick size={14} />
                <span>Tocar para ver respuesta</span>
              </div>
            </div>

            {/* CARA TRASERA (RESPUESTA) */}
            <div
              className="w-full bg-slate-900 text-white rounded-3xl p-5 sm:p-8 flex flex-col items-center justify-center text-center shadow-2xl"
              style={{
                gridArea: '1 / 1',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
                background: 'linear-gradient(145deg, #1e293b, #0f172a)',
              }}
            >
              <div className="flex-1 w-full flex items-center justify-center overflow-y-auto max-h-[50dvh] py-2">
                <p className="text-base sm:text-lg md:text-2xl font-medium leading-relaxed text-white [overflow-wrap:anywhere]">
                  {currentCard.back}
                </p>
              </div>

              <div className="w-full grid grid-cols-3 gap-3 mt-6 pt-6 border-t border-white/10" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => puntuar('fail')} className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-red-500/10 hover:bg-red-600 border border-red-500/30 hover:border-red-500 transition-all group/btn">
                  <AlertTriangle size={20} className="text-red-500 group-hover/btn:text-white mb-1" />
                  <span className="text-[10px] font-black text-red-400 group-hover/btn:text-white uppercase">Fallo</span>
                </button>
                <button onClick={() => puntuar('hard')} className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-orange-500/10 hover:bg-orange-600 border border-orange-500/30 hover:border-orange-500 transition-all group/btn">
                  <HelpCircle size={20} className="text-orange-500 group-hover/btn:text-white mb-1" />
                  <span className="text-[10px] font-black text-orange-400 group-hover/btn:text-white uppercase">Duda</span>
                </button>
                <button onClick={() => puntuar('easy')} className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-600 border border-emerald-500/30 hover:border-emerald-500 transition-all group/btn">
                  <CheckCircle2 size={20} className="text-emerald-500 group-hover/btn:text-white mb-1" />
                  <span className="text-[10px] font-black text-emerald-400 group-hover/btn:text-white uppercase">Bien</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

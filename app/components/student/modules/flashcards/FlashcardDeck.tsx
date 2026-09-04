'use client';

import { useState, useEffect } from 'react';
import { 
  Brain, CheckCircle2, 
  HelpCircle, AlertTriangle, MousePointerClick, Loader2 
} from 'lucide-react';
import { generateFlashcard, saveFlashcardProgress, getStudentTopics } from '@/actions';

type CardData = {
  db_id?: string | null;
  front: string;
  back: string;
  topic: string;
  /** Id del tema, ya normalizado por el servidor. */
  subjectId?: number | null;
  box?: number | null;
  isReview?: boolean;
};

export default function FlashcardDeck() {
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [currentCard, setCurrentCard] = useState<CardData | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(true);

  // 1. CARGA INICIAL
  useEffect(() => {
    getStudentTopics().then(res => {
      if (res.success && res.topics) {
        setTopics(res.topics);
        if (res.topics.length > 0) setSelectedTopic(res.topics[0]);
      }
      setLoadingTopics(false);
    });
  }, []);

  // 2. GENERAR TARJETA
  const loadNextCard = async () => {
    if (!selectedTopic) return;
    setLoading(true);
    setIsFlipped(false);
    setCurrentCard(null);

    try {
      const res = await generateFlashcard(selectedTopic);
      if (res.success && res.data) {
        setCurrentCard(res.data);
      } else {
        alert("Error: " + (('error' in res && res.error) || "Inténtalo de nuevo."));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // 3. SRS LOGIC
  const handleRating = async (rating: 'fail' | 'hard' | 'easy') => {
    if (!currentCard) return;
    const cardToSave = { ...currentCard };
    
    // Animación de salida rápida
    setIsFlipped(false);
    setLoading(true);

    try {
      // El guardado ya no se da por bueno a ciegas: si falla, el alumno pierde
      // el repaso y merece enterarse antes de seguir.
      const saved = await saveFlashcardProgress(cardToSave, rating);
      if (!saved.success) {
        alert('No se pudo guardar el repaso: ' + (saved.error ?? 'error desconocido'));
        setCurrentCard(cardToSave);
        return;
      }

      const res = await generateFlashcard(selectedTopic);
      if (res.success && res.data) setCurrentCard(res.data);
      else setCurrentCard(null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // SIN CABECERA PROPIA.
  //
  // La pantalla ya tiene una: "DRILLS (MEMORIA) · MEMORIZACIÓN ACTIVA", que
  // pinta `Header`. Este modulo repetia justo debajo "DRILLS · MEMORIZACIÓN
  // ACTIVA" con su icono, asi que en un movil las dos cabeceras se comian 300px
  // de los 844 que hay antes de llegar a nada que se pueda usar. Ademas el
  // texto y el desplegable se tocaban.
  //
  // Y `justify-center` sobre `min-h-[70dvh]` centraba el bloque dejando 200px
  // en blanco arriba y 250 abajo: el boton principal quedaba flotando en mitad
  // de una pantalla vacia. Se apoya arriba, como el resto de la aplicacion.
  return (
    <div className="flex flex-col w-full max-w-2xl mx-auto">
      
      {/* SOLO EL SELECTOR DE TEMA. Es lo unico que decide algo aqui. */}
      <div className="w-full flex items-center gap-3 mb-5">
          <label htmlFor="tema-drills" className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest shrink-0">
              Tema
          </label>
          <select 
            id="tema-drills" 
            value={selectedTopic} 
            onChange={(e) => setSelectedTopic(e.target.value)}
            disabled={loading}
            /* `min-w-0 max-w-full` + `truncate`: un <select> nativo crece
               hasta el ancho de su opcion mas larga, y los temas son frases
               enteras. Medido en el banco de pruebas: llegaba a 731px en una
               pantalla de 390 y arrastraba la pagina de lado. */
            className="flex-1 min-w-0 max-w-full truncate min-h-[44px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold uppercase rounded-lg px-4 outline-none focus:border-purple-500 cursor-pointer"
          >
              {loadingTopics ? <option>Cargando...</option> : topics.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
      </div>

      {/* ÁREA DE JUEGO

          NO LLEVA PROPORCION FIJA, Y ESA ERA LA AVERIA. Con `aspect-[4/3]` la
          tarjeta medía ~290px de alto en un móvil de 390px, dijera lo que
          dijera la ficha. Una respuesta larga —y las del temario lo son: "la
          unidad investigadora de Policía Judicial; la duración; la forma y
          periodicidad de la información…"— se salía por arriba Y por abajo, y
          como el contenido iba con `scrollbar-hide` NO HABIA NI BARRA que
          avisara de que aquello seguía. El alumno leía media frase y no tenía
          forma de saberlo.

          Ahora las dos caras se apilan con `grid` en la MISMA celda (1/1) en
          vez de con `absolute inset-0`. La diferencia es que una celda de
          grid SÍ mide lo que mide su contenido: la tarjeta crece con el texto
          y el giro sigue funcionando igual. `min-h` es solo el suelo, para
          que una ficha corta no salga raquítica. */}
      <div className="relative w-full min-h-[20rem] sm:min-h-[22rem]" style={{ perspective: '1000px' }}>
        
        {!currentCard && !loading ? (
            <div className="w-full h-full bg-slate-100 dark:bg-slate-900/50 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl flex flex-col items-center justify-center text-center p-8">
                <Brain size={48} className="text-slate-300 mb-4"/>
                <h3 className="text-lg font-bold text-slate-500 mb-2">Listo para entrenar</h3>
                {/* "Iniciar sesión" NO. En una aplicacion en la que se entra
                    con correo y contraseña, ese texto significa otra cosa: el
                    boton que empieza un repaso de tarjetas decia literalmente
                    lo mismo que el de la pantalla de acceso. */}
                <button onClick={loadNextCard} disabled={!selectedTopic} className="min-h-[44px] bg-purple-600 hover:bg-purple-500 text-white px-8 py-3 rounded-xl font-bold uppercase tracking-wider shadow-lg transition-all hover:scale-105 disabled:opacity-50">
                    Empezar a repasar
                </button>
            </div>
        ) : loading ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800">
                <Loader2 size={40} className="text-purple-600 animate-spin mb-4"/>
                <p className="text-xs font-bold text-purple-600 uppercase tracking-widest animate-pulse">Cargando...</p>
            </div>
        ) : (
            // --- CARTA 3D INTERACTIVA ---
            <div 
                className="grid w-full h-full transition-transform duration-500 cursor-pointer group"
                style={{ 
                    transformStyle: 'preserve-3d', 
                    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' 
                }}
                // FIX 1: Permitir voltear Y des-voltear (!isFlipped era el error)
                onClick={() => setIsFlipped(!isFlipped)}
            >
                {/* CARA FRONTAL (PREGUNTA) */}
                <div 
                    className="w-full bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-3xl p-5 pt-14 sm:p-8 sm:pt-16 flex flex-col items-center justify-center text-center shadow-xl"
                    style={{ 
                        gridArea: '1 / 1',
                        backfaceVisibility: 'hidden', 
                        WebkitBackfaceVisibility: 'hidden' // Safari/Webkit: sin esto se ve el efecto espejo
                    }} 
                >
                    <div className="absolute top-6 left-6 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
                        <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest">
                            {currentCard?.isReview ? 'REPASO' : 'NUEVO'}
                        </span>
                    </div>

                    <div className="flex-1 w-full flex items-center justify-center overflow-y-auto max-h-[50dvh] py-2">
                        <h3 className="text-lg sm:text-xl md:text-3xl font-black text-slate-900 dark:text-white leading-tight [overflow-wrap:anywhere]">
                            {currentCard?.front}
                        </h3>
                    </div>

                    <div className="mt-auto flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider opacity-60">
                        <MousePointerClick size={14}/> 
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
                        background: 'linear-gradient(145deg, #1e293b, #0f172a)'
                    }}
                >
                    {/* SIN `scrollbar-hide`. Esconder la barra en una caja que
                        SÍ se desborda es esconder la única señal de que hay
                        más texto: el alumno leía media respuesta convencido de
                        que era entera. Si algún día una ficha se pasa de
                        `max-h`, ahora se ve que se puede arrastrar. */}
                    <div className="flex-1 w-full flex items-center justify-center overflow-y-auto max-h-[50dvh] py-2">
                        <p className="text-base sm:text-lg md:text-2xl font-medium leading-relaxed text-white [overflow-wrap:anywhere]">
                            {currentCard?.back}
                        </p>
                    </div>

                    <div className="w-full grid grid-cols-3 gap-3 mt-6 pt-6 border-t border-white/10" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => handleRating('fail')} className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-red-500/10 hover:bg-red-600 border border-red-500/30 hover:border-red-500 transition-all group/btn">
                            <AlertTriangle size={20} className="text-red-500 group-hover/btn:text-white mb-1"/>
                            <span className="text-[10px] font-black text-red-400 group-hover/btn:text-white uppercase">Fallo</span>
                        </button>
                        <button onClick={() => handleRating('hard')} className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-orange-500/10 hover:bg-orange-600 border border-orange-500/30 hover:border-orange-500 transition-all group/btn">
                            <HelpCircle size={20} className="text-orange-500 group-hover/btn:text-white mb-1"/>
                            <span className="text-[10px] font-black text-orange-400 group-hover/btn:text-white uppercase">Duda</span>
                        </button>
                        <button onClick={() => handleRating('easy')} className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-600 border border-emerald-500/30 hover:border-emerald-500 transition-all group/btn">
                            <CheckCircle2 size={20} className="text-emerald-500 group-hover/btn:text-white mb-1"/>
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
'use client';

import { useState, useEffect } from 'react';
import { getStudentTopics } from '@/actions';
import { ExamSettings } from './ExamManager';
import { Crosshair, BookOpen, Clock, AlertTriangle, CheckCircle2, Layers } from 'lucide-react';
import { Card, Button, SectionLabel, OptionCard, OptionGroup, EmptyState, cx, TEXT, TAP } from '../../../ui';

interface ExamConfigProps {
  initialSettings: ExamSettings;
  onStart: (s: ExamSettings) => void;
}

const DIFICULTADES = [
  { id: 'easy', label: 'Básica' },
  { id: 'medium', label: 'Estándar' },
  { id: 'hard', label: 'Extrema' },
] as const;

export default function ExamConfig({ initialSettings, onStart }: ExamConfigProps) {
  const [topics, setTopics] = useState<string[]>([]);
  const [settings, setSettings] = useState<ExamSettings>(initialSettings);
  const [loadingTopics, setLoadingTopics] = useState(true);

  useEffect(() => {
    getStudentTopics().then(res => {
      if (res.success && res.topics) {
        setTopics(res.topics);
        // Si no había temas seleccionados, seleccionar el primero por defecto.
        //
        // La comprobación va DENTRO del actualizador, no fuera: el efecto corre
        // una sola vez y `settings` es el del cierre, no el de ahora. Si el
        // alumno elige un tema mientras la petición viaja, leerlo fuera vería
        // la lista vacía y le pisaría la elección (regla 13).
        if (res.topics.length > 0) {
            setSettings(prev =>
                prev.selectedTopics.length === 0
                    ? { ...prev, selectedTopics: [res.topics[0]] }
                    : prev
            );
        }
      }
      setLoadingTopics(false);
    });
  }, []);

  const toggleTopic = (t: string) => {
    setSettings(prev => ({
        ...prev,
        selectedTopics: prev.selectedTopics.includes(t)
            ? prev.selectedTopics.filter(x => x !== t)
            : [...prev.selectedTopics, t]
    }));
  };

  const handleSelectAll = () => {
    if (settings.selectedTopics.length === topics.length) {
        setSettings(prev => ({ ...prev, selectedTopics: [] }));
    } else {
        setSettings(prev => ({ ...prev, selectedTopics: [...topics] }));
    }
  };

  const sinTema = settings.selectedTopics.length === 0;

  return (
    /*
      Esta pantalla NO lleva cabecera propia.
      Antes abría con un icono de 64px, "CONFIGURACIÓN DE MISIÓN" a 30px y un
      subtítulo, justo debajo del "OPERACIONES (TEST)" que ya pinta la cabecera
      de la aplicación: dos títulos seguidos que se comían el primer tercio de
      la pantalla del móvil antes del primer control. El título lo pone el
      armazón; aquí se va directo a lo que hay que decidir.
    */
    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6 animate-in fade-in duration-500">

      <div className="grid md:grid-cols-12 gap-4 sm:gap-6">

        {/* TEMARIO */}
        <Card pad="none" className="md:col-span-5 flex flex-col max-h-[45dvh] md:max-h-[520px] overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 shrink-0">
            <SectionLabel
              icon={<BookOpen size={14} />}
              className="mb-0"
              aside={
                <button
                  onClick={handleSelectAll}
                  className={cx(
                    'text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider',
                    'bg-indigo-50 dark:bg-indigo-900/20 px-3 py-2 rounded-lg',
                    TAP,
                  )}
                >
                  {settings.selectedTopics.length === topics.length ? 'Desmarcar' : 'Todos'}
                </button>
              }
            >
              Temario ({settings.selectedTopics.length})
            </SectionLabel>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-hide">
            {loadingTopics ? (
              <p className={cx(TEXT.muted, 'p-4 text-center')}>Cargando temario…</p>
            ) : topics.length === 0 ? (
              <EmptyState
                title="Sin temas disponibles"
                hint="Todavía no hay preguntas en el banco. Habla con tu academia."
              />
            ) : (
              topics.map(topic => {
                const isSelected = settings.selectedTopics.includes(topic);
                return (
                  <button
                    key={topic}
                    onClick={() => toggleTopic(topic)}
                    className={cx(
                      'w-full text-left p-3 rounded-xl text-xs font-bold transition-all border flex items-center gap-3',
                      TAP,
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                        : 'bg-transparent text-slate-500 dark:text-slate-400 border-transparent hover:bg-slate-50 dark:hover:bg-slate-800',
                    )}
                  >
                    <span
                      className={cx(
                        'w-4 h-4 shrink-0 rounded border flex items-center justify-center',
                        isSelected ? 'border-white bg-white/20' : 'border-slate-300 dark:border-slate-600',
                      )}
                    >
                      {isSelected && <CheckCircle2 size={10} className="text-white" />}
                    </span>
                    {/* Dos líneas y sin truncar: el enunciado del tema es lo
                        único que le dice al alumno qué está eligiendo. */}
                    <span className="line-clamp-2 leading-snug">{topic}</span>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {/* PARÁMETROS */}
        <div className="md:col-span-7 space-y-4 sm:space-y-6">

          <Card>
            <SectionLabel icon={<Layers size={14} />}>Modo de operación</SectionLabel>
            {/* `OptionGroup` apila en móvil por definición. Es donde estaba el
                fallo: con dos columnas fijas, "ENTRENAMIENTO" en mayúsculas y
                negrita se quedaba con ~110px y tocaba el borde de su caja. */}
            <OptionGroup cols={2}>
              <OptionCard
                title="Entrenamiento"
                description="Corrección inmediata y análisis de error. Sin límite de tiempo."
                selected={settings.mode === 'practice'}
                onClick={() => setSettings({ ...settings, mode: 'practice' })}
              />
              <OptionCard
                title="Simulacro real"
                description="Sin feedback. Cronómetro activo. Registro oficial en estadísticas."
                selected={settings.mode === 'exam'}
                onClick={() => setSettings({ ...settings, mode: 'exam' })}
              />
            </OptionGroup>
          </Card>

          <Card>
            <SectionLabel icon={<AlertTriangle size={14} />}>Dificultad</SectionLabel>
            {/* Antes eran tres botones apilados dentro de media tarjeta: 150px
                de alto para elegir entre tres palabras. En fila ocupan 44. */}
            <div className="grid grid-cols-3 gap-2">
              {DIFICULTADES.map(d => {
                const activa = settings.difficulty === d.id;
                const color =
                  d.id === 'hard'
                    ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                    : d.id === 'medium'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
                return (
                  <button
                    key={d.id}
                    onClick={() => setSettings({ ...settings, difficulty: d.id })}
                    aria-pressed={activa}
                    className={cx(
                      'rounded-xl text-[11px] font-black uppercase tracking-wider transition-colors',
                      TAP,
                      activa ? color : 'bg-slate-50 dark:bg-slate-800 text-slate-400',
                    )}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <SectionLabel
              icon={<Clock size={14} />}
              aside={
                <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums leading-none">
                  {settings.questionCount}
                </span>
              }
            >
              Preguntas
            </SectionLabel>
            <input
              type="range"
              min="1"
              max="50"
              value={settings.questionCount}
              onChange={(e) => setSettings({ ...settings, questionCount: parseInt(e.target.value) })}
              aria-label="Número de preguntas"
              className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            {settings.mode === 'exam' && (
              <p className={cx(TEXT.muted, 'mt-3')}>
                Son {Math.round((settings.questionCount * 30) / 60)} min de reloj: 30 segundos por
                pregunta, el ritmo de la convocatoria.
              </p>
            )}
          </Card>

          <Button
            block
            size="lg"
            disabled={sinTema}
            onClick={() => onStart(settings)}
            iconRight={<Crosshair size={20} />}
          >
            {sinTema ? 'Selecciona un tema' : 'Iniciar operación'}
          </Button>
        </div>
      </div>
    </div>
  );
}

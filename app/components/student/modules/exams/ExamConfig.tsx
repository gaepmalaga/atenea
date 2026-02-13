'use client';

import { useState, useEffect } from 'react';
import { getStudentTopics } from '@/actions';
import { ExamSettings } from './ExamManager';
import { 
  Crosshair, BookOpen, Clock, AlertTriangle, 
  CheckCircle2, Layers 
} from 'lucide-react';

interface ExamConfigProps {
  initialSettings: ExamSettings;
  onStart: (s: ExamSettings) => void;
}

export default function ExamConfig({ initialSettings, onStart }: ExamConfigProps) {
  const [topics, setTopics] = useState<string[]>([]);
  const [settings, setSettings] = useState<ExamSettings>(initialSettings);
  const [loadingTopics, setLoadingTopics] = useState(true);

  useEffect(() => {
    getStudentTopics().then(res => {
      if (res.success && res.topics) {
        setTopics(res.topics);
        // Si no había temas seleccionados, seleccionar el primero por defecto
        if (settings.selectedTopics.length === 0 && res.topics.length > 0) {
            setSettings(prev => ({ ...prev, selectedTopics: [res.topics[0]] }));
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

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* HEADER */}
      <div className="text-center mb-10">
        <div className="w-16 h-16 bg-indigo-600/10 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-600/20">
            <Crosshair size={32} />
        </div>
        <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
            Configuración de Misión
        </h2>
        <p className="text-slate-500 mt-2">Personaliza los parámetros del simulacro.</p>
      </div>

      <div className="grid md:grid-cols-12 gap-8">
        
        {/* COLUMNA IZQUIERDA: TEMARIO */}
        <div className="md:col-span-5 flex flex-col h-[500px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <BookOpen size={16} className="text-slate-400"/>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        Temario ({settings.selectedTopics.length})
                    </span>
                </div>
                <button 
                    onClick={handleSelectAll}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-500 uppercase tracking-wider bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded"
                >
                    {settings.selectedTopics.length === topics.length ? 'Desmarcar' : 'Todos'}
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-hide">
                {loadingTopics ? (
                    <div className="p-4 text-center text-slate-400 text-xs">Cargando base de datos...</div>
                ) : (
                    topics.map(topic => {
                        const isSelected = settings.selectedTopics.includes(topic);
                        return (
                            <button 
                                key={topic} 
                                onClick={() => toggleTopic(topic)}
                                className={`w-full text-left p-3 rounded-xl text-xs font-bold transition-all border ${
                                    isSelected 
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                                    : 'bg-white dark:bg-slate-900 text-slate-500 border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'border-white bg-white/20' : 'border-slate-300'}`}>
                                        {isSelected && <CheckCircle2 size={10} className="text-white"/>}
                                    </div>
                                    <span className="truncate">{topic}</span>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </div>

        {/* COLUMNA DERECHA: PARÁMETROS */}
        <div className="md:col-span-7 space-y-6">
            
            {/* 1. MODO */}
            <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
                <label className="text-xs font-bold text-slate-400 uppercase mb-4 block flex items-center gap-2">
                    <Layers size={14}/> Modo de Operación
                </label>
                <div className="grid grid-cols-2 gap-4">
                    <button 
                        onClick={() => setSettings({...settings, mode: 'practice'})}
                        className={`p-4 rounded-2xl border-2 text-left transition-all ${
                            settings.mode === 'practice' 
                            ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-600' 
                            : 'border-slate-100 dark:border-slate-800 hover:border-indigo-300'
                        }`}
                    >
                        <span className={`text-sm font-black uppercase block mb-1 ${settings.mode === 'practice' ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-500'}`}>Entrenamiento</span>
                        <span className="text-[10px] text-slate-400 font-medium leading-tight block">Corrección inmediata y análisis de error. Sin límite de tiempo.</span>
                    </button>
                    
                    <button 
                        onClick={() => setSettings({...settings, mode: 'exam'})}
                        className={`p-4 rounded-2xl border-2 text-left transition-all ${
                            settings.mode === 'exam' 
                            ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-600' 
                            : 'border-slate-100 dark:border-slate-800 hover:border-indigo-300'
                        }`}
                    >
                        <span className={`text-sm font-black uppercase block mb-1 ${settings.mode === 'exam' ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-500'}`}>Simulacro Real</span>
                        <span className="text-[10px] text-slate-400 font-medium leading-tight block">Sin feedback. Cronómetro activo. Registro oficial en estadísticas.</span>
                    </button>
                </div>
            </div>

            {/* 2. DIFICULTAD Y CANTIDAD */}
            <div className="grid grid-cols-2 gap-4">
                <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
                    <label className="text-xs font-bold text-slate-400 uppercase mb-4 block flex items-center gap-2">
                        <AlertTriangle size={14}/> Dificultad
                    </label>
                    <div className="flex flex-col gap-2">
                        {['easy', 'medium', 'hard'].map(d => (
                            <button 
                                key={d}
                                onClick={() => setSettings({...settings, difficulty: d as any})}
                                className={`w-full py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors ${
                                    settings.difficulty === d 
                                    ? d === 'hard' ? 'bg-red-100 text-red-600' : d === 'medium' ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600'
                                    : 'bg-slate-50 dark:bg-slate-800 text-slate-400'
                                }`}
                            >
                                {d === 'easy' ? 'Básica' : d === 'medium' ? 'Estándar' : 'Extrema'}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
                    <label className="text-xs font-bold text-slate-400 uppercase mb-4 block flex items-center gap-2">
                        <Clock size={14}/> Preguntas
                    </label>
                    <div className="flex items-center justify-center h-full pb-4">
                        <div className="text-center w-full">
                            <span className="text-4xl font-black text-slate-900 dark:text-white">
                                {settings.questionCount}
                            </span>
                            <input 
                                type="range" 
                                min="1" max="50" 
                                value={settings.questionCount} 
                                onChange={(e) => setSettings({...settings, questionCount: parseInt(e.target.value)})}
                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 mt-4"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* BOTÓN INICIO */}
            <button 
                onClick={() => onStart(settings)}
                disabled={settings.selectedTopics.length === 0}
                className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-2xl font-bold text-lg shadow-xl shadow-indigo-600/20 transition-all flex items-center justify-center gap-3 uppercase tracking-wide group"
            >
                {settings.selectedTopics.length === 0 ? 'Selecciona un tema' : 'Iniciar Operación'}
                <Crosshair size={20} className="group-hover:rotate-45 transition-transform"/>
            </button>

        </div>
      </div>
    </div>
  );
}
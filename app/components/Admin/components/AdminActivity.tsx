'use client';

import { useState, useEffect } from 'react';
import { Activity, Layers, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { getGlobalActivity } from '@/actions';

export default function AdminActivity() {
  const [activityLog, setActivityLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    setLoading(true);
    const res = await getGlobalActivity();
    if (res.success) {
      setActivityLog(res.activity || []);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4 animate-in fade-in">
      {/* Cabecera y Leyenda */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-800 p-4 rounded-xl border border-slate-700">
        <h3 className="font-bold text-white flex items-center gap-2">
            <Activity className="text-indigo-400" /> Registro de Actividad
        </h3>
        
        <div className="flex items-center gap-4">
            <div className="flex gap-3 text-[10px] uppercase font-bold text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Acierto</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Fallo</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500"></span> Flashcard</span>
            </div>
            <button onClick={loadData} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
        </div>
      </div>

      {/* Lista de Logs */}
      <div className="space-y-2">
        {activityLog.map((log: any) => {
            const isFlashcard = log.error_type === 'flashcard'; 
            const isCorrect = log.is_correct;
            const typeLabel = isFlashcard ? 'MEMORIA' : 'TEST';
            
            return (
              <div key={log.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex items-center justify-between group hover:border-slate-600 transition-all">
                <div className="flex items-center gap-4">
                  <div className={`p-2.5 rounded-xl border flex-shrink-0 ${
                    isFlashcard
                      ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                      : (isCorrect ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20')
                    }`}>
                    {isFlashcard ? <Layers size={18} /> : (isCorrect ? <CheckCircle2 size={18} /> : <XCircle size={18} />)}
                  </div>

                  <div className="min-w-0">
                    <p className="text-white font-medium text-sm truncate pr-4">
                      {log.question_text?.replace('[FLASHCARD] ', '') || "Pregunta sin texto"}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded border ${
                          isFlashcard ? 'bg-purple-900/30 text-purple-300 border-purple-500/30' : 'bg-blue-900/30 text-blue-300 border-blue-500/30'
                      }`}>
                        {typeLabel}
                      </span>
                      <span className="text-slate-500 text-xs font-bold uppercase truncate max-w-[150px]">{log.topic}</span>
                    </div>
                  </div>
                </div>
                <span className="text-slate-600 text-xs font-mono whitespace-nowrap bg-slate-900 px-2 py-1 rounded border border-white/5 ml-2">
                  {log.created_at ? new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                </span>
              </div>
            );
        })}

        {!loading && activityLog.length === 0 && (
            <div className="text-center py-12 text-slate-500 border-2 border-dashed border-slate-800 rounded-2xl">
              <Activity size={40} className="mx-auto mb-3 opacity-20" />
              <p>No hay actividad registrada aún.</p>
            </div>
        )}
      </div>
    </div>
  );
}
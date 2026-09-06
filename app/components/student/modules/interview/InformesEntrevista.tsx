'use client';

import { useEffect, useState } from 'react';
import {
  FileText, ChevronDown, CheckCircle2, AlertTriangle, Target, History,
} from 'lucide-react';
import { getInterviewReports } from '@/actions';
import type { InformeGuardado } from '@/app/actions/interview';

/**
 * Los informes de entrevista anteriores.
 *
 * Antes el informe se veía una vez al terminar la sala y se perdía al cerrar:
 * un aspirante que hace tres simulacros en un mes no podía comparar si iba
 * mejorando. Ahora `evaluateInterview` los guarda (`interview_reports`) y esto
 * los lista. Si la tabla todavía no existe —guion sin ejecutar— la acción
 * devuelve lista vacía y esto no se pinta.
 */
export default function InformesEntrevista() {
  const [informes, setInformes] = useState<InformeGuardado[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    getInterviewReports().then((res) => {
      if (res.success) setInformes(res.informes);
      setCargando(false);
    });
  }, []);

  if (cargando || informes.length === 0) return null;

  const fecha = (iso: string) =>
    new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="mb-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl overflow-hidden">
      <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
        <History size={15} className="text-slate-500 dark:text-slate-400 shrink-0" />
        <h4 className="text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-widest">
          Tus simulacros de entrevista ({informes.length})
        </h4>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[28rem] overflow-y-auto">
        {informes.map((inf) => {
          const open = abierto === inf.id;
          return (
            <div key={inf.id}>
              <button
                onClick={() => setAbierto(open ? null : inf.id)}
                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <span
                  className={`text-lg font-black tabular-nums shrink-0 w-12 text-center ${
                    inf.score >= 70 ? 'text-emerald-500' : inf.score >= 50 ? 'text-amber-500' : 'text-red-500'
                  }`}
                >
                  {inf.score}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{fecha(inf.createdAt)}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {inf.report.veredicto || `${inf.turns ?? '—'} respuestas`}
                  </p>
                </div>
                <ChevronDown
                  size={16}
                  className={`text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                />
              </button>

              {open && (
                <div className="px-4 pb-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  {inf.report.fortalezas.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1.5 flex items-center gap-1.5">
                        <CheckCircle2 size={12} /> Fortalezas
                      </p>
                      <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                        {inf.report.fortalezas.map((f, i) => <li key={i}>· {f}</li>)}
                      </ul>
                    </div>
                  )}
                  {inf.report.contradicciones.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-red-600 dark:text-red-400 mb-1.5 flex items-center gap-1.5">
                        <AlertTriangle size={12} /> Contradicciones
                      </p>
                      <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                        {inf.report.contradicciones.map((c, i) => <li key={i}>· {c}</li>)}
                      </ul>
                    </div>
                  )}
                  {inf.report.recomendaciones.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-1.5 flex items-center gap-1.5">
                        <Target size={12} /> Qué preparar
                      </p>
                      <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                        {inf.report.recomendaciones.map((r, i) => <li key={i}>· {r}</li>)}
                      </ul>
                    </div>
                  )}
                  {inf.transcript && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <FileText size={12} /> Transcripción
                      </summary>
                      <pre className="mt-2 whitespace-pre-wrap font-sans text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl p-3 leading-relaxed max-h-64 overflow-y-auto">
                        {inf.transcript}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

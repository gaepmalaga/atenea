'use client';
import { useState, useEffect } from 'react';
import { 
  CheckCircle2, XCircle, Pencil, Save, X, 
  AlertTriangle, MessageSquareWarning, ArrowRight, 
  Loader2, Eye, ShieldAlert
} from 'lucide-react';

import { 
  getModerationQueue, 
  approveQuestion, 
  disableQuestion, 
  resolveReport,
  updateQuestion 
} from '@/actions';

// Mapeo de colores y textos para los tipos de reporte
const REPORT_BADGES: Record<string, { label: string, color: string, bg: string }> = {
  wrong_correct_answer: { label: 'Respuesta Errónea', color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20' },
  ambiguous_question: { label: 'Ambigua', color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/20' },
  bad_explanation: { label: 'Mala Explicación', color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/20' },
  out_of_syllabus: { label: 'Fuera de Temario', color: 'text-purple-400', bg: 'bg-purple-400/10 border-purple-400/20' },
  typo_or_format: { label: 'Errata / Formato', color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20' },
  source_mismatch: { label: 'Fuente Incorrecta', color: 'text-pink-400', bg: 'bg-pink-400/10 border-pink-400/20' },
  other: { label: 'Otro', color: 'text-slate-400', bg: 'bg-slate-400/10 border-slate-400/20' },
};

export default function AdminModeration() {
  const [queue, setQueue] = useState<any>({ candidates: [], reports: [] });
  const [loading, setLoading] = useState(true);

  // --- ESTADOS PARA EL MODAL DE EDICIÓN ---
  const [editingQ, setEditingQ] = useState<any | null>(null);
  // Guardamos el contexto del reporte si venimos de uno (para mostrar la queja en el editor)
  const [reportContext, setReportContext] = useState<any | null>(null);
  
  const [editForm, setEditForm] = useState({
    question_text: '',
    options: ['', '', ''],
    correct_index: 0,
    explanation: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const res = await getModerationQueue();
    if (res.success) setQueue(res.data);
    setLoading(false);
  }

  // --- ACCIONES RÁPIDAS ---
  async function handleApprove(id: string) {
      // Optimistic UI update
      setQueue((prev:any) => ({...prev, candidates: prev.candidates.filter((q:any)=>q.id!==id)}));
      await approveQuestion(id);
  }

  async function handleDisable(id: string, isReport = false) {
      if(!confirm("¿Confirmas que esta pregunta no tiene salvación y debe ser DESACTIVADA?")) return;
      
      // Optimistic remove
      if (isReport) {
         setQueue((prev:any) => ({...prev, reports: prev.reports.filter((r:any)=>r.question_id!==id)})); 
      } else {
         setQueue((prev:any) => ({...prev, candidates: prev.candidates.filter((q:any)=>q.id!==id)}));
      }

      await disableQuestion(id);
      if (isReport) load(); // Recargar para limpiar cascada si es necesario
  }
  
  async function handleResolveReport(reportId: string) {
      setQueue((prev:any) => ({...prev, reports: prev.reports.filter((r:any)=>r.id!==reportId)}));
      await resolveReport(reportId);
  }

  // --- LÓGICA DE EDICIÓN ---
  function openEditor(q: any, reportData: any = null) {
    if (!q) return alert("Error: No se han cargado los datos de la pregunta. Revisa actions.ts");
    
    setEditingQ(q);
    setReportContext(reportData); // Si existe, mostramos la "misión" en el editor
    
    setEditForm({
      question_text: q.question_text || '',
      options: Array.isArray(q.options) ? [...q.options] : ['', '', ''],
      correct_index: q.correct_index ?? 0,
      explanation: q.explanation || ''
    });
  }

  async function saveChanges() {
    if (!editingQ) return;
    setSaving(true);
    
    const res = await updateQuestion(editingQ.id, editForm);
    
    if (res.success) {
        // Actualizamos la UI localmente (tanto en candidatos como en preguntas reportadas)
        setQueue((prev: any) => ({
            candidates: prev.candidates.map((q: any) => 
                q.id === editingQ.id ? { ...q, ...editForm } : q
            ),
            reports: prev.reports.map((r: any) => 
                r.question_id === editingQ.id ? { ...r, question: { ...r.question, ...editForm } } : r
            )
        }));
        
        setEditingQ(null);
        setReportContext(null);
    } else {
        alert("Error al guardar: " + res.error);
    }
    setSaving(false);
  }

  if (loading) return <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-indigo-500 mb-4"/> <p className="text-slate-500 text-sm font-mono">Cargando cola de moderación...</p></div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-20">
        
        {/* === COLUMNA 1: CANDIDATOS (Nuevos Ingresos) === */}
        <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-white uppercase tracking-widest text-xs flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_#3b82f6]"></span>
                    Candidatos ({queue.candidates.length})
                </h3>
                {queue.candidates.length > 0 && <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-1 rounded border border-blue-500/20">Pendientes de aprobación</span>}
            </div>
            
            {queue.candidates.length === 0 && (
                <div className="border-2 border-dashed border-slate-800 rounded-2xl p-8 text-center">
                    <CheckCircle2 className="mx-auto text-slate-700 mb-2" size={32}/>
                    <p className="text-slate-500 text-sm">Bandeja de entrada limpia.</p>
                </div>
            )}

            {queue.candidates.map((q: any) => (
                <div key={q.id} className="bg-slate-800/50 backdrop-blur-sm p-5 rounded-2xl border border-slate-700 group hover:border-blue-500/30 transition-all shadow-lg hover:shadow-blue-900/10">
                    <div className="flex justify-between items-start mb-3">
                        <span className="text-[10px] font-black tracking-wider text-blue-300 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">{q.topic}</span>
                        <span className="text-[10px] font-mono text-slate-500">{q.created_at ? new Date(q.created_at).toLocaleDateString() : '—'}</span>
                    </div>
                    
                    <p className="font-bold text-slate-200 text-sm mb-4 leading-relaxed">{q.question_text}</p>
                    
                    <div className="space-y-1.5 mb-5">
                        {q.options.map((opt:string, i:number) => (
                            <div key={i} className={`text-xs px-3 py-2 rounded-lg border flex items-center gap-2 ${
                                i === q.correct_index 
                                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' 
                                : 'bg-slate-900/30 text-slate-400 border-transparent'
                            }`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${i === q.correct_index ? 'bg-emerald-400' : 'bg-slate-600'}`}></div>
                                {opt}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-4">
                        <button onClick={()=>openEditor(q)} className="bg-slate-700 hover:bg-indigo-600 text-slate-300 hover:text-white py-2 rounded-lg text-xs font-bold flex justify-center items-center gap-2 transition-all">
                            <Pencil size={14}/> Editar
                        </button>
                        <button onClick={()=>handleApprove(q.id)} className="bg-emerald-600/20 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/20 py-2 rounded-lg text-xs font-bold flex justify-center items-center gap-2 transition-all">
                            <CheckCircle2 size={14}/> Aprobar
                        </button>
                        <button onClick={()=>handleDisable(q.id)} className="bg-slate-800 hover:bg-red-500/20 text-slate-500 hover:text-red-400 py-2 rounded-lg text-xs font-bold flex justify-center items-center transition-all">
                            <XCircle size={14}/>
                        </button>
                    </div>
                </div>
            ))}
        </div>

        {/* === COLUMNA 2: REPORTES (Quejas de usuarios) === */}
        <div className="space-y-4">
             <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-white uppercase tracking-widest text-xs flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_10px_#f59e0b]"></span>
                    Reportes ({queue.reports.length})
                </h3>
                {queue.reports.length > 0 && <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-1 rounded border border-amber-500/20 animate-pulse">Requieren atención</span>}
            </div>

            {queue.reports.length === 0 && (
                 <div className="border-2 border-dashed border-slate-800 rounded-2xl p-8 text-center">
                    <ShieldAlert className="mx-auto text-slate-700 mb-2" size={32}/>
                    <p className="text-slate-500 text-sm">Todo tranquilo. Sin quejas.</p>
                </div>
            )}

            {queue.reports.map((r: any) => {
                const badge = REPORT_BADGES[r.report_type] || REPORT_BADGES['other'];
                return (
                    <div key={r.id} className="bg-slate-800/50 backdrop-blur-sm p-5 rounded-2xl border border-amber-500/20 relative group hover:border-amber-500/40 transition-all shadow-lg hover:shadow-amber-900/10">
                        
                        {/* Header Reporte */}
                        <div className="flex justify-between items-start mb-3">
                             <div className={`text-[10px] font-bold px-2 py-1 rounded border flex items-center gap-1.5 ${badge.bg} ${badge.color}`}>
                                <AlertTriangle size={10} /> {badge.label}
                             </div>
                             <span className="text-[10px] text-slate-600 font-mono">ID: {r.id.split('-')[0]}</span>
                        </div>
                        
                        {/* Pregunta Contexto */}
                        <div className="mb-4 pl-3 border-l-2 border-slate-700">
                             <p className="font-bold text-slate-300 text-sm line-clamp-2 italic">"{r.question?.question_text || 'Pregunta no encontrada'}"</p>
                        </div>
                        
                        {/* Mensaje Usuario */}
                        <div className="bg-amber-500/5 p-3 rounded-xl border border-amber-500/10 mb-4">
                            <p className="text-[10px] text-amber-500 uppercase font-black mb-1">Comentario del alumno:</p>
                            <p className="text-amber-100 text-xs italic">"{r.message}"</p>
                        </div>

                        {/* Actions */}
                        <div className="grid grid-cols-3 gap-2">
                             <button 
                                onClick={() => openEditor(r.question, r)} // Pasamos 'r' como contexto
                                className="bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-xs font-bold flex justify-center items-center gap-1.5 shadow-lg shadow-indigo-500/20 transition-all"
                                title="Editar y corregir"
                            >
                                <Pencil size={14}/> CORREGIR
                            </button>

                             <button 
                                onClick={()=>handleDisable(r.question_id, true)} 
                                className="bg-slate-800 hover:bg-red-900/30 text-red-400 hover:text-red-300 border border-transparent hover:border-red-500/30 py-2 rounded-lg text-xs font-bold flex justify-center items-center gap-1.5 transition-all"
                                title="Desactivar Pregunta"
                            >
                                <XCircle size={14}/> MATAR
                            </button>
                            
                            <button 
                                onClick={()=>handleResolveReport(r.id)} 
                                className="bg-slate-700 hover:bg-emerald-600 text-slate-300 hover:text-white py-2 rounded-lg text-xs font-bold flex justify-center items-center gap-1.5 transition-all"
                                title="Marcar como Resuelto (Sin cambios)"
                            >
                                <CheckCircle2 size={14}/> OK
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>

        {/* === MODAL DE EDICIÓN === */}
        {editingQ && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
                <div className="bg-slate-900 w-full max-w-2xl rounded-2xl border border-slate-700 shadow-2xl flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-200">
                    
                    {/* Header Modal */}
                    <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                        <h3 className="font-black text-white text-lg flex items-center gap-2">
                            <Pencil className="text-indigo-400" size={20}/>
                            <span className="tracking-tight">Editor Quirúrgico</span>
                        </h3>
                        <button onClick={() => setEditingQ(null)} className="text-slate-400 hover:text-white p-2 hover:bg-slate-800 rounded-full transition-colors">
                            <X size={20}/>
                        </button>
                    </div>

                    {/* CONTEXTO INTELIGENTE (Si venimos de un reporte) */}
                    {reportContext && (
                        <div className="bg-amber-500/10 border-b border-amber-500/10 p-4 flex gap-3 items-start">
                             <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={18} />
                             <div>
                                <p className="text-amber-500 text-xs font-black uppercase mb-0.5">ESTÁS EDITANDO UNA QUEJA</p>
                                <p className="text-amber-200 text-sm">"{reportContext.message}"</p>
                             </div>
                        </div>
                    )}

                    {/* Scrollable Body */}
                    <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
                        
                        {/* Enunciado */}
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Enunciado de la Pregunta</label>
                            <textarea 
                                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl p-4 text-white text-sm focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all resize-none shadow-inner"
                                rows={3}
                                value={editForm.question_text}
                                onChange={(e) => setEditForm({...editForm, question_text: e.target.value})}
                            />
                        </div>

                        {/* Opciones */}
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Opciones <span className="text-slate-600 lowercase font-normal">(Selecciona la correcta)</span></label>
                            {editForm.options.map((opt, idx) => (
                                <div key={idx} className={`flex gap-3 items-center p-2 rounded-xl border transition-all ${
                                     editForm.correct_index === idx ? 'bg-emerald-500/5 border-emerald-500/30' : 'border-transparent hover:bg-slate-800'
                                }`}>
                                    <button 
                                        onClick={() => setEditForm({...editForm, correct_index: idx})}
                                        className={`w-10 h-10 rounded-xl flex items-center justify-center border font-bold text-sm transition-all shadow-sm ${
                                            editForm.correct_index === idx 
                                            ? 'bg-emerald-500 border-emerald-500 text-white scale-110' 
                                            : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-500'
                                        }`}
                                    >
                                        {idx === 0 ? 'A' : idx === 1 ? 'B' : 'C'}
                                    </button>
                                    <div className="flex-1 relative">
                                        <input 
                                            type="text"
                                            className={`w-full bg-slate-950 border rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none transition-all ${
                                                editForm.correct_index === idx 
                                                ? 'border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.1)]' 
                                                : 'border-slate-800 focus:border-indigo-500'
                                            }`}
                                            value={opt}
                                            onChange={(e) => {
                                                const newOpts = [...editForm.options];
                                                newOpts[idx] = e.target.value;
                                                setEditForm({...editForm, options: newOpts});
                                            }}
                                        />
                                        {editForm.correct_index === idx && (
                                            <span className="absolute right-3 top-3 text-[10px] font-black text-emerald-500 uppercase tracking-wide pointer-events-none">Correcta</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Explicación */}
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Explicación / Retroalimentación</label>
                            <textarea 
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-300 text-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all shadow-inner"
                                rows={4}
                                value={editForm.explanation}
                                onChange={(e) => setEditForm({...editForm, explanation: e.target.value})}
                            />
                        </div>

                    </div>

                    {/* Footer Actions */}
                    <div className="p-5 border-t border-slate-800 flex justify-end gap-3 bg-slate-900/50 rounded-b-2xl">
                        <button 
                            onClick={() => setEditingQ(null)} 
                            className="px-5 py-2.5 text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={saveChanges}
                            disabled={saving}
                            className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/20 flex items-center gap-2 disabled:opacity-50 hover:scale-105 transition-all"
                        >
                            {saving ? <Loader2 className="animate-spin" size={16}/> : <><Save size={18}/> Guardar Cambios</>}
                        </button>
                    </div>

                </div>
            </div>
        )}

    </div>
  );
}
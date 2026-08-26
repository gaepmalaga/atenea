'use client';

import { useState, useEffect } from 'react';
import { 
  Search, Filter, Edit, Trash2, ChevronLeft, ChevronRight, 
  Database, Loader2, BookOpen, Save, X, CheckCircle2, 
  MoreHorizontal, AlertTriangle, Copy
} from 'lucide-react';
import {
  getAdminQuestionBank,
  getOfficialSyllabus,
  disableQuestion,
  approveQuestions,
  updateQuestion
} from '@/actions';
import {
  QUESTION_STATUS,
  QUESTION_STATUS_LABEL,
  QUESTION_STATUSES,
  type QuestionStatus,
} from '@/app/lib/questions';

// --- UTILIDAD VISUAL: ESTADO DE LA PREGUNTA ---
const STATUS_STYLE: Record<QuestionStatus, string> = {
  [QUESTION_STATUS.ACTIVE]: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  [QUESTION_STATUS.CANDIDATE]: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  [QUESTION_STATUS.DISABLED]: 'bg-slate-700/40 text-slate-500 border-slate-600/30',
};

// --- UTILIDAD VISUAL: COLORES POR BLOQUE ---
const getTopicStyle = (num: number) => {
    if (num <= 26) return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', label: 'JURÍDICAS' };
    if (num <= 37) return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', label: 'SOCIALES' };
    return { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', label: 'TÉCNICAS' };
};

export default function AdminBank() {
  // --- ESTADOS ---
  const [questions, setQuestions] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, page: 1, totalPages: 1 });
  
  // Filtros
  const [selectedSubject, setSelectedSubject] = useState<number | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  // 'all' por defecto: filtrar 'active' en duro era lo que hacia que un admin
  // sembrara cientos de preguntas y viera la lista vacia.
  const [statusFilter, setStatusFilter] = useState<QuestionStatus | 'all'>('all');
  const [bulkRunning, setBulkRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Editor
  const [editingQ, setEditingQ] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    question_text: '',
    options: ['', '', ''],
    correct_index: 0,
    explanation: ''
  });
  const [saving, setSaving] = useState(false);

  // Init
  useEffect(() => {
    loadSyllabus();
    loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live Filter
  useEffect(() => {
    const timer = setTimeout(() => { loadQuestions(1); }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubject, searchTerm, statusFilter]);

  // --- CARGA DE DATOS ---
  async function loadSyllabus() {
    const res = await getOfficialSyllabus();
    if (res.success && res.syllabus) {
        const flatSubjects = res.syllabus.flatMap((b:any) => b.subjects);
        setSubjects(flatSubjects);
    }
  }

  async function loadQuestions(page = 1) {
    setLoading(true);
    const res = await getAdminQuestionBank({
        subjectId: selectedSubject,
        search: searchTerm,
        status: statusFilter,
        page,
        limit: 15 // Menos preguntas por página para diseño más aireado
    });
    
    if (res.success) {
        setQuestions(res.data);
        setStats({ total: res.total, page: res.page, totalPages: res.totalPages });
    }
    setLoading(false);
  }

  // --- ACCIONES ---
  async function handleDisable(id: string) {
      if(!confirm("¿Descartar esta pregunta?\nDejará de aparecer en los exámenes de los alumnos. No se borra: queda marcada como descartada y no vuelve al banco aunque se resiembre el tema.")) return;
      setIsDeleting(id);
      const res = await disableQuestion(id);
      if (res.success) {
          // Si estamos viendo todos los estados, la pregunta sigue ahi pero
          // descartada; si hay filtro, ya no pertenece a esta vista.
          if (statusFilter === 'all') {
              setQuestions(prev => prev.map(q => q.id === id ? { ...q, status: QUESTION_STATUS.DISABLED } : q));
          } else {
              await loadQuestions(stats.page);
          }
      } else {
          alert('No se pudo descartar: ' + res.error);
      }
      setIsDeleting(null);
  }

  const visibleCandidates = questions.filter(q => q.status === QUESTION_STATUS.CANDIDATE);

  async function handleApproveVisible() {
      const ids = visibleCandidates.map(q => q.id);
      if (!ids.length) return;
      if (!confirm(`Se publicaran ${ids.length} preguntas en el banco de los alumnos. ¿Continuar?`)) return;

      setBulkRunning(true);
      const res = await approveQuestions(ids);
      if (res.success) {
          setQuestions(prev => prev.map(q =>
              ids.includes(q.id) ? { ...q, status: QUESTION_STATUS.ACTIVE } : q
          ));
      } else {
          alert('No se pudieron aprobar: ' + res.error);
      }
      setBulkRunning(false);
  }

  function openEditor(q: any) {
      setEditingQ(q);
      setEditForm({
          question_text: q.question_text,
          options: [...q.options],
          correct_index: q.correct_index,
          explanation: q.explanation || ''
      });
  }

  async function handleSaveEdit() {
      if(!editingQ) return;
      setSaving(true);
      const res = await updateQuestion(editingQ.id, editForm);
      if(res.success) {
          setQuestions(prev => prev.map(q => q.id === editingQ.id ? { ...q, ...editForm } : q));
          setEditingQ(null);
      }
      setSaving(false);
  }

  return (
    <div className="space-y-8 animate-in fade-in pb-24">
        
        {/* --- HEADER CONTROL PANEL --- */}
        <div className="sticky top-4 z-30 bg-slate-900/80 backdrop-blur-xl border border-white/10 p-4 rounded-3xl shadow-2xl flex flex-col lg:flex-row gap-4 justify-between items-center transition-all">
            
            {/* Título & Stats */}
            <div className="flex items-center gap-4 w-full lg:w-auto">
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                    <Database size={24} strokeWidth={2.5}/>
                </div>
                <div>
                    <h3 className="font-black text-white text-base tracking-tight uppercase">Banco Maestro</h3>
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <p className="text-xs font-mono text-slate-400">
                            {stats.total} {statusFilter === 'all' ? 'preguntas' : QUESTION_STATUS_LABEL[statusFilter].toLowerCase()}
                        </p>
                    </div>
                </div>
            </div>

            {/* Filtros Avanzados */}
            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                <div className="relative group w-full sm:w-64">
                    <Search className="absolute left-4 top-3 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={18}/>
                    <input 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por contenido..." 
                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-12 pr-4 py-3 text-sm text-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all placeholder:text-slate-600"
                    />
                </div>

                <div className="relative group w-full sm:w-48">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as QuestionStatus | 'all')}
                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 pr-10 py-3 text-sm text-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none appearance-none cursor-pointer"
                    >
                        <option value="all">Todos los estados</option>
                        {QUESTION_STATUSES.map(st => (
                            <option key={st} value={st}>{QUESTION_STATUS_LABEL[st]}</option>
                        ))}
                    </select>
                    <div className="absolute right-4 top-3.5 pointer-events-none text-slate-600">
                        <MoreHorizontal size={14}/>
                    </div>
                </div>

                <div className="relative group w-full sm:w-64">
                    <Filter className="absolute left-4 top-3 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={18}/>
                    <select 
                        value={selectedSubject || ''}
                        onChange={(e) => setSelectedSubject(e.target.value ? Number(e.target.value) : undefined)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-12 pr-10 py-3 text-sm text-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none appearance-none cursor-pointer truncate"
                    >
                        <option value="">Todos los Temas</option>
                        {subjects.map(s => (
                            <option key={s.id} value={s.id}>Tema {s.number}: {s.title.substring(0,25)}...</option>
                        ))}
                    </select>
                    <div className="absolute right-4 top-3.5 pointer-events-none text-slate-600">
                        <MoreHorizontal size={14}/>
                    </div>
                </div>
            </div>
        </div>

        {/* --- APROBACIÓN EN LOTE --- */}
        {!loading && visibleCandidates.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-amber-500/5 border border-amber-500/20 rounded-2xl px-6 py-4 animate-in fade-in">
                <p className="text-sm text-amber-200/80">
                    <span className="font-black text-amber-400">{visibleCandidates.length}</span> preguntas pendientes en esta página.
                    Los alumnos no las reciben hasta que se publiquen.
                </p>
                <button
                    onClick={handleApproveVisible}
                    disabled={bulkRunning}
                    className="shrink-0 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl font-black uppercase text-[11px] tracking-widest transition-all flex items-center gap-2 active:scale-95"
                >
                    {bulkRunning ? <Loader2 className="animate-spin" size={14}/> : <CheckCircle2 size={14}/>}
                    Publicar las {visibleCandidates.length}
                </button>
            </div>
        )}

        {/* --- GRID DE PREGUNTAS (Estilo Tarjetas Pro) --- */}
        {loading ? (
            <div className="py-32 flex flex-col items-center justify-center gap-4 opacity-50">
                <div className="relative">
                    <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 size={24} className="text-indigo-500 animate-pulse"/>
                    </div>
                </div>
                <p className="text-sm font-mono text-indigo-400 uppercase tracking-widest">Accediendo a la BBDD...</p>
            </div>
        ) : (
            <div className="grid grid-cols-1 gap-6">
                {questions.map((q) => {
                    const topicNum = q.subjects?.topic_number || 99;
                    const style = getTopicStyle(topicNum);
                    
                    return (
                        <div key={q.id} className="group relative bg-slate-900 border border-slate-800 rounded-3xl p-6 hover:border-indigo-500/30 hover:shadow-2xl hover:shadow-indigo-500/5 transition-all duration-300">
                            
                            {/* Header de la Tarjeta */}
                            <div className="flex justify-between items-start mb-5">
                                <div className="flex gap-2 items-center">
                                    <span className={`text-[10px] font-black px-3 py-1 rounded-full border uppercase tracking-wider flex items-center gap-2 ${style.bg} ${style.text} ${style.border}`}>
                                        <BookOpen size={10}/>
                                        TEMA {topicNum}
                                    </span>
                                    <span className={`text-[10px] font-black px-3 py-1 rounded-full border uppercase tracking-wider ${STATUS_STYLE[q.status as QuestionStatus] ?? STATUS_STYLE[QUESTION_STATUS.DISABLED]}`}>
                                        {QUESTION_STATUS_LABEL[q.status as QuestionStatus] ?? q.status}
                                    </span>
                                    {q.difficulty === 3 && (
                                        <span className="text-[10px] font-bold bg-red-500/10 text-red-400 px-2 py-1 rounded-full border border-red-500/20 flex items-center gap-1">
                                            <AlertTriangle size={10}/> DIFÍCIL
                                        </span>
                                    )}
                                </div>

                                {/* Menú de Acciones (Hover) */}
                                <div className="flex gap-2 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-all transform lg:translate-x-4 group-hover:translate-x-0">
                                    <button 
                                        onClick={() => navigator.clipboard.writeText(q.id)}
                                        className="p-2 bg-slate-800 text-slate-500 hover:text-white rounded-xl hover:bg-slate-700 transition-colors"
                                        title="Copiar ID"
                                    >
                                        <Copy size={16}/>
                                    </button>
                                    <button 
                                        onClick={() => openEditor(q)}
                                        className="p-2 bg-indigo-600 text-white rounded-xl shadow-lg hover:bg-indigo-500 hover:scale-105 transition-all"
                                        title="Editar"
                                    >
                                        <Edit size={16}/>
                                    </button>
                                    <button 
                                        onClick={() => handleDisable(q.id)}
                                        disabled={q.status === QUESTION_STATUS.DISABLED}
                                        className="p-2 bg-slate-800 text-slate-400 border border-slate-700 hover:border-red-500 hover:text-red-500 disabled:opacity-30 disabled:hover:border-slate-700 disabled:hover:text-slate-400 rounded-xl transition-colors"
                                        title="Descartar del banco"
                                    >
                                        {isDeleting === q.id ? <Loader2 className="animate-spin" size={16}/> : <Trash2 size={16}/>}
                                    </button>
                                </div>
                            </div>

                            {/* Contenido */}
                            <div className="mb-6">
                                <p className="text-slate-200 font-bold text-base md:text-lg leading-relaxed selection:bg-indigo-500/30">
                                    {q.question_text}
                                </p>
                            </div>

                            {/* Opciones Grid */}
                            <div className="grid md:grid-cols-3 gap-3">
                                {q.options.map((opt: string, i: number) => {
                                    const isCorrect = i === q.correct_index;
                                    return (
                                        <div key={i} className={`relative p-4 rounded-2xl border transition-all ${
                                            isCorrect 
                                            ? 'bg-emerald-500/5 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.05)]' 
                                            : 'bg-slate-950 border-slate-800 text-slate-500'
                                        }`}>
                                            <div className="flex gap-3 items-start">
                                                <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold border ${
                                                    isCorrect ? 'bg-emerald-500 text-slate-900 border-emerald-500' : 'border-slate-700 text-slate-600'
                                                }`}>
                                                    {['A','B','C'][i]}
                                                </span>
                                                <p className={`text-xs leading-snug ${isCorrect ? 'text-emerald-200 font-medium' : ''}`}>
                                                    {opt}
                                                </p>
                                            </div>
                                            {isCorrect && (
                                                <div className="absolute top-2 right-2 text-emerald-500">
                                                    <CheckCircle2 size={14}/>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Explicación (Acordeón sutil) */}
                            {q.explanation && (
                                <div className="mt-4 pt-4 border-t border-slate-800/50">
                                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">
                                        Retroalimentación Oficial
                                    </p>
                                    <p className="text-xs text-slate-400 leading-relaxed max-w-4xl">
                                        {q.explanation}
                                    </p>
                                </div>
                            )}
                        </div>
                    );
                })}

                {questions.length === 0 && (
                    <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/30">
                        <Database size={48} className="mx-auto mb-4 text-slate-700"/>
                        <p className="text-slate-500 font-bold">No hay preguntas que coincidan.</p>
                        <p className="text-xs text-slate-600">Prueba a generar más en la pestaña "Temario".</p>
                    </div>
                )}
            </div>
        )}

        {/* --- PAGINACIÓN MODERNA --- */}
        {stats.totalPages > 1 && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-xl border border-slate-700 p-2 rounded-2xl shadow-2xl flex items-center gap-2 z-40">
                <button 
                    disabled={stats.page === 1}
                    onClick={() => { loadQuestions(stats.page - 1); window.scrollTo({top:0, behavior:'smooth'}); }}
                    className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl disabled:opacity-30 transition-colors text-white"
                >
                    <ChevronLeft size={18}/>
                </button>
                
                <span className="px-4 font-mono text-sm text-indigo-400 font-bold">
                    {stats.page} <span className="text-slate-600">/</span> {stats.totalPages}
                </span>
                
                <button 
                    disabled={stats.page === stats.totalPages}
                    onClick={() => { loadQuestions(stats.page + 1); window.scrollTo({top:0, behavior:'smooth'}); }}
                    className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl disabled:opacity-30 transition-colors text-white"
                >
                    <ChevronRight size={18}/>
                </button>
            </div>
        )}

        {/* --- MODAL EDITOR QUIRÚRGICO (DISEÑO PRO) --- */}
        {editingQ && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                <div className="bg-slate-950 w-full max-w-2xl rounded-3xl border border-slate-800 shadow-[0_0_50px_rgba(79,70,229,0.1)] flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-300">
                    
                    {/* Modal Header */}
                    <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 rounded-t-3xl">
                        <div>
                            <h3 className="font-black text-white text-xl">Edición Táctica</h3>
                            <p className="text-xs text-slate-500 font-mono mt-1">ID: {editingQ.id.substring(0,8)}...</p>
                        </div>
                        <button onClick={() => setEditingQ(null)} className="p-2 bg-slate-900 border border-slate-800 rounded-full hover:bg-white hover:text-black transition-all">
                            <X size={20}/>
                        </button>
                    </div>

                    {/* Modal Body */}
                    <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Enunciado</label>
                            <textarea 
                                className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl p-4 text-white text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all resize-none min-h-[100px]"
                                value={editForm.question_text}
                                onChange={e => setEditForm({...editForm, question_text: e.target.value})}
                            />
                        </div>

                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Opciones (Marca la válida)</label>
                            {editForm.options.map((opt, i) => (
                                <div key={i} className={`flex items-center gap-3 p-2 rounded-2xl border transition-all ${
                                    i === editForm.correct_index ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-slate-900/30 border-slate-800'
                                }`}>
                                    <button 
                                        onClick={() => setEditForm({...editForm, correct_index: i})}
                                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm transition-all ${
                                            i === editForm.correct_index 
                                            ? 'bg-emerald-500 text-slate-900 shadow-lg shadow-emerald-500/20 scale-105' 
                                            : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                                        }`}
                                    >
                                        {['A','B','C'][i]}
                                    </button>
                                    <input 
                                        className="flex-1 bg-transparent border-b border-transparent focus:border-indigo-500/50 px-2 py-2 text-sm text-white outline-none transition-colors"
                                        value={opt}
                                        onChange={(e) => {
                                            const newOpts = [...editForm.options];
                                            newOpts[i] = e.target.value;
                                            setEditForm({...editForm, options: newOpts});
                                        }}
                                    />
                                    {i === editForm.correct_index && <CheckCircle2 size={16} className="text-emerald-500 mr-2"/>}
                                </div>
                            ))}
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Justificación</label>
                            <textarea 
                                className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl p-4 text-slate-300 text-xs focus:border-indigo-500 outline-none transition-all resize-none min-h-[80px]"
                                value={editForm.explanation}
                                onChange={e => setEditForm({...editForm, explanation: e.target.value})}
                            />
                        </div>
                    </div>

                    {/* Modal Footer */}
                    <div className="p-6 border-t border-slate-800 flex justify-end gap-3 bg-slate-900/30 rounded-b-3xl">
                        <button onClick={() => setEditingQ(null)} className="px-6 py-3 text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-wider">
                            Descartar
                        </button>
                        <button 
                            onClick={handleSaveEdit}
                            disabled={saving}
                            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-600/20 flex items-center gap-2 disabled:opacity-50 hover:translate-y-[-2px] transition-all"
                        >
                            {saving ? <Loader2 className="animate-spin" size={16}/> : <><Save size={16}/> Guardar Cambios</>}
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}
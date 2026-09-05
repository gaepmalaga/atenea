'use client';

import { useState, useEffect } from 'react';
import { 
  Search, Filter, Edit, Trash2, ChevronLeft, ChevronRight, 
  Database, Loader2, BookOpen, Save, CheckCircle2,
  MoreHorizontal, AlertTriangle, Copy, Plus
} from 'lucide-react';
import {
  getAdminQuestionBank,
  getOfficialSyllabus,
  disableQuestion,
  discardAllQuestions,
  approveQuestions,
  updateQuestion
} from '@/actions';
import {
  QUESTION_STATUS,
  QUESTION_STATUS_LABEL,
  QUESTION_STATUSES,
  DIFFICULTY,
  type QuestionStatus,
  type AdminBankRow,
} from '@/app/lib/questions';
import type { SyllabusSubject } from '@/app/actions/admin';
import QuestionComposer from './QuestionComposer';
import { Modal, Button, TextAreaField } from '../../ui';

// --- UTILIDAD VISUAL: ESTADO DE LA PREGUNTA ---
const STATUS_STYLE: Record<QuestionStatus, string> = {
  [QUESTION_STATUS.ACTIVE]: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  [QUESTION_STATUS.CANDIDATE]: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  [QUESTION_STATUS.DISABLED]: 'bg-slate-300/40 dark:bg-slate-700/40 text-slate-500 dark:text-slate-400 border-slate-600/30',
};

// --- UTILIDAD VISUAL: COLORES POR BLOQUE ---
const getTopicStyle = (num: number) => {
    if (num <= 26) return { bg: 'bg-blue-500/10', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-500/20', label: 'JURÍDICAS' };
    if (num <= 37) return { bg: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-500/20', label: 'SOCIALES' };
    return { bg: 'bg-purple-500/10', text: 'text-purple-700 dark:text-purple-400', border: 'border-purple-500/20', label: 'TÉCNICAS' };
};

export default function AdminBank() {
  // --- ESTADOS ---
  const [questions, setQuestions] = useState<AdminBankRow[]>([]);
  const [subjects, setSubjects] = useState<SyllabusSubject[]>([]);
  const [stats, setStats] = useState({ total: 0, page: 1, totalPages: 1 });
  
  // Filtros
  const [selectedSubject, setSelectedSubject] = useState<number | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  // 'all' por defecto: filtrar 'active' en duro era lo que hacia que un admin
  // sembrara cientos de preguntas y viera la lista vacia.
  const [statusFilter, setStatusFilter] = useState<QuestionStatus | 'all'>('all');
  const [bulkRunning, setBulkRunning] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  // Alta manual (P2): hasta ahora solo se podian EDITAR las que ya existian.
  const [componiendo, setComponiendo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Editor
  const [editingQ, setEditingQ] = useState<AdminBankRow | null>(null);
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
        const flatSubjects = res.syllabus.flatMap((b) => b.subjects);
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

  /**
   * Vacía el banco entero de un golpe: pasa a `disabled` todas las preguntas
   * activas o candidatas que haya, sin importar el filtro que se esté viendo.
   * No borra filas (regla 3): `question_attempts` y compañía las referencian.
   */
  async function handleDiscardAll() {
      const escrito = window.prompt(
          `Vas a descartar TODAS las preguntas del banco (activas y candidatas), no solo las de este filtro.\n` +
          `Dejan de servirse a los alumnos y no se borran: es reversible desde la base de datos, pero no desde este panel.\n\n` +
          `Escribe BORRAR para confirmar:`
      );
      if (escrito !== 'BORRAR') return;

      setClearingAll(true);
      const res = await discardAllQuestions();
      setClearingAll(false);

      if (res.success) {
          alert(`Banco vaciado: ${res.discarded} preguntas descartadas.`);
          setStatusFilter('all');
          setSelectedSubject(undefined);
          setSearchTerm('');
          await loadQuestions(1);
      } else {
          alert('No se pudo vaciar el banco: ' + res.error);
      }
  }

  function openEditor(q: AdminBankRow) {
      setEditingQ(q);
      setEditForm({
          // `options` es jsonb y el enunciado puede llegar nulo: el formulario
          // espera cadenas y un array de tres, siempre.
          question_text: q.question_text ?? '',
          options: Array.isArray(q.options) ? [...q.options] : ['', '', ''],
          correct_index: q.correct_index ?? 0,
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
        <div className="sticky top-4 z-30 bg-slate-100/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white/10 p-4 rounded-3xl shadow-2xl flex flex-col lg:flex-row gap-4 justify-between items-center transition-all">
            
            {/* Título & Stats */}
            <div className="flex items-center gap-4 w-full lg:w-auto">
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                    <Database size={24} strokeWidth={2.5}/>
                </div>
                <div>
                    <h3 className="font-black text-slate-900 dark:text-white text-base tracking-tight uppercase">Banco Maestro</h3>
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            {stats.total} {statusFilter === 'all' ? 'preguntas' : QUESTION_STATUS_LABEL[statusFilter].toLowerCase()}
                        </p>
                    </div>
                </div>
            </div>

            {/* Nueva pregunta a mano (P2) */}
            <button
                onClick={() => setComponiendo(true)}
                className="shrink-0 px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black uppercase text-[11px] tracking-widest transition-all flex items-center gap-2 active:scale-95 shadow-lg shadow-emerald-600/20"
            >
                <Plus size={16} strokeWidth={3}/> Nueva
            </button>

            {/* Filtros Avanzados */}
            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                <div className="relative group w-full sm:w-64">
                    <Search className="absolute left-4 top-3 text-slate-500 dark:text-slate-400 group-focus-within:text-indigo-700 dark:group-focus-within:text-indigo-400 transition-colors" size={18}/>
                    <input 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por contenido..." 
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl pl-12 pr-4 py-3 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all placeholder:text-slate-500 dark:placeholder:text-slate-400"
                    />
                </div>

                <div className="relative group w-full sm:w-48">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as QuestionStatus | 'all')}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 pr-10 py-3 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none appearance-none cursor-pointer"
                    >
                        <option value="all">Todos los estados</option>
                        {QUESTION_STATUSES.map(st => (
                            <option key={st} value={st}>{QUESTION_STATUS_LABEL[st]}</option>
                        ))}
                    </select>
                    <div className="absolute right-4 top-3.5 pointer-events-none text-slate-500 dark:text-slate-400">
                        <MoreHorizontal size={14}/>
                    </div>
                </div>

                <div className="relative group w-full sm:w-64">
                    <Filter className="absolute left-4 top-3 text-slate-500 dark:text-slate-400 group-focus-within:text-indigo-700 dark:group-focus-within:text-indigo-400 transition-colors" size={18}/>
                    <select 
                        value={selectedSubject || ''}
                        onChange={(e) => setSelectedSubject(e.target.value ? Number(e.target.value) : undefined)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl pl-12 pr-10 py-3 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none appearance-none cursor-pointer truncate"
                    >
                        <option value="">Todos los Temas</option>
                        {subjects.map(s => (
                            <option key={s.id} value={s.id}>Tema {s.number}: {s.title.substring(0,25)}...</option>
                        ))}
                    </select>
                    <div className="absolute right-4 top-3.5 pointer-events-none text-slate-500 dark:text-slate-400">
                        <MoreHorizontal size={14}/>
                    </div>
                </div>
            </div>
        </div>

        {/* --- APROBACIÓN EN LOTE --- */}
        {!loading && visibleCandidates.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-amber-500/5 border border-amber-500/20 rounded-2xl px-6 py-4 animate-in fade-in">
                <p className="text-sm text-amber-800 dark:text-amber-200/80">
                    <span className="font-black text-amber-700 dark:text-amber-400">{visibleCandidates.length}</span> preguntas pendientes en esta página.
                    Los alumnos no las reciben hasta que se publiquen.
                </p>
                <button
                    onClick={handleApproveVisible}
                    disabled={bulkRunning}
                    className="shrink-0 min-h-[44px] px-5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl font-black uppercase text-[11px] tracking-widest transition-all flex items-center gap-2 active:scale-95"
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
                <p className="text-sm font-mono text-indigo-700 dark:text-indigo-400 uppercase tracking-widest">Accediendo a la BBDD...</p>
            </div>
        ) : (
            <div className="grid grid-cols-1 gap-6">
                {questions.map((q) => {
                    const topicNum = q.subjects?.topic_number || 99;
                    const style = getTopicStyle(topicNum);
                    
                    return (
                        <div key={q.id} className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 hover:border-indigo-500/30 hover:shadow-2xl hover:shadow-indigo-500/5 transition-all duration-300">
                            
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
                                    {/* La columna se llama `difficulty_level`, no
                                        `difficulty`. Con el estado en `any` esto era
                                        siempre undefined y el distintivo no salio nunca. */}
                                    {q.difficulty_level === DIFFICULTY.hard && (
                                        <span className="text-[10px] font-bold bg-red-500/10 text-red-700 dark:text-red-400 px-2 py-1 rounded-full border border-red-500/20 flex items-center gap-1">
                                            <AlertTriangle size={10}/> DIFÍCIL
                                        </span>
                                    )}
                                </div>

                                {/* Menú de Acciones (Hover) */}
                                <div className="flex gap-2 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-all transform lg:translate-x-4 group-hover:translate-x-0">
                                    <button 
                                        onClick={() => navigator.clipboard.writeText(q.id)}
                                        className="w-11 h-11 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                                        title="Copiar ID"
                                    >
                                        <Copy size={16}/>
                                    </button>
                                    <button 
                                        onClick={() => openEditor(q)}
                                        className="w-11 h-11 flex items-center justify-center bg-indigo-600 text-white rounded-xl shadow-lg hover:bg-indigo-500 transition-all"
                                        title="Editar"
                                    >
                                        <Edit size={16}/>
                                    </button>
                                    <button 
                                        onClick={() => handleDisable(q.id)}
                                        disabled={q.status === QUESTION_STATUS.DISABLED}
                                        className="w-11 h-11 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:border-red-500 hover:text-red-500 disabled:opacity-30 disabled:hover:border-slate-300 dark:disabled:hover:border-slate-700 disabled:hover:text-slate-500 dark:disabled:hover:text-slate-400 rounded-xl transition-colors"
                                        title="Descartar del banco"
                                    >
                                        {isDeleting === q.id ? <Loader2 className="animate-spin" size={16}/> : <Trash2 size={16}/>}
                                    </button>
                                </div>
                            </div>

                            {/* Contenido */}
                            <div className="mb-6">
                                <p className="text-slate-800 dark:text-slate-200 font-bold text-base md:text-lg leading-relaxed selection:bg-indigo-500/30">
                                    {q.question_text}
                                </p>
                            </div>

                            {/* Opciones Grid */}
                            <div className="grid md:grid-cols-3 gap-3">
                                {(Array.isArray(q.options) ? q.options : []).map((opt: string, i: number) => {
                                    const isCorrect = i === q.correct_index;
                                    return (
                                        <div key={i} className={`relative p-4 rounded-2xl border transition-all ${
                                            isCorrect 
                                            ? 'bg-emerald-500/5 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.05)]' 
                                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                                        }`}>
                                            <div className="flex gap-3 items-start">
                                                <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold border ${
                                                    isCorrect ? 'bg-emerald-500 text-slate-900 border-emerald-500' : 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                                                }`}>
                                                    {['A','B','C'][i]}
                                                </span>
                                                <p className={`text-xs leading-snug ${isCorrect ? 'text-emerald-800 dark:text-emerald-200 font-medium' : ''}`}>
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
                                    <p className="text-[10px] font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-widest mb-1">
                                        Retroalimentación Oficial
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-4xl">
                                        {q.explanation}
                                    </p>
                                </div>
                            )}
                        </div>
                    );
                })}

                {questions.length === 0 && (
                    <div className="py-20 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-100/30 dark:bg-slate-900/30">
                        <Database size={48} className="mx-auto mb-4 text-slate-700"/>
                        <p className="text-slate-500 dark:text-slate-400 font-bold">No hay preguntas que coincidan.</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Prueba a generar más en la pestaña “Temario”.</p>
                    </div>
                )}
            </div>
        )}

        {/* --- PAGINACIÓN MODERNA --- */}
        {stats.totalPages > 1 && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-100/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-300 dark:border-slate-700 p-2 rounded-2xl shadow-2xl flex items-center gap-2 z-40">
                <button 
                    disabled={stats.page === 1}
                    onClick={() => { loadQuestions(stats.page - 1); window.scrollTo({top:0, behavior:'smooth'}); }}
                    className="p-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-xl disabled:opacity-30 transition-colors text-slate-900 dark:text-white"
                >
                    <ChevronLeft size={18}/>
                </button>
                
                <span className="px-4 font-mono text-sm text-indigo-700 dark:text-indigo-400 font-bold">
                    {stats.page} <span className="text-slate-500 dark:text-slate-400">/</span> {stats.totalPages}
                </span>
                
                <button 
                    disabled={stats.page === stats.totalPages}
                    onClick={() => { loadQuestions(stats.page + 1); window.scrollTo({top:0, behavior:'smooth'}); }}
                    className="p-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-xl disabled:opacity-30 transition-colors text-slate-900 dark:text-white"
                >
                    <ChevronRight size={18}/>
                </button>
            </div>
        )}

        {/* --- VACIAR EL BANCO ---

            AL FINAL, Y APARTE. Estaba pegado a "Nueva", del mismo tamaño y con
            la misma forma: en un movil, doce pixeles separaban el boton de
            CREAR una pregunta del que DESCARTA TODAS. Es la regla 26 del
            proyecto —una accion irreversible no comparte sitio, color ni
            tamaño con la que se repite— y es la accion mas destructiva de la
            plataforma.

            Sigue estando a un toque de distancia, con su confirmacion escrita
            ("BORRAR"), pero al final de la pantalla y en la zona de peligro:
            donde no se llega sin querer. */}
        <div className="mt-10 pt-6 border-t border-dashed border-red-500/20">
            <p className="text-[10px] font-black uppercase tracking-widest text-red-700 dark:text-red-400 mb-2">Zona de peligro</p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 flex-1 leading-snug">
                    Descarta <strong className="text-slate-500 dark:text-slate-400">todas</strong> las preguntas del banco, sin
                    importar el filtro. Dejan de servirse a los alumnos; no se borran de la base de datos.
                </p>
                <button
                    onClick={handleDiscardAll}
                    disabled={clearingAll}
                    title="Descarta TODAS las preguntas del banco, sin importar el filtro"
                    className="shrink-0 min-h-[44px] px-5 bg-transparent hover:bg-red-600 border border-red-500/30 hover:border-red-500 disabled:opacity-40 text-red-700 dark:text-red-400 hover:text-white rounded-xl font-black uppercase text-[11px] tracking-widest transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                    {clearingAll ? <Loader2 className="animate-spin" size={16}/> : <Trash2 size={16} strokeWidth={3}/>}
                    Vaciar banco
                </button>
            </div>
        </div>

        {/* --- ALTA MANUAL / IMPORTACIÓN (P2) --- */}
        {componiendo && (
            <QuestionComposer
                subjects={subjects}
                onClose={() => setComponiendo(false)}
                // Se recarga la pagina actual para que lo recien publicado
                // aparezca en la lista sin cerrar el panel.
                onCreated={() => loadQuestions(stats.page)}
            />
        )}

        {/* --- EDITOR DE UNA PREGUNTA --- */}
        {/* Estaba escrito a mano, con `max-h-[95vh]`: en un móvil el pie —donde
            está "Guardar cambios"— se salía de la pantalla nada más abrirlo,
            porque `vh` no descuenta la barra de direcciones. El primitivo usa
            `dvh`, deja fijos cabecera y pie, y en móvil se apoya abajo. */}
        {editingQ && (
            <Modal
                title="Editar pregunta"
                subtitle={`ID ${editingQ.id.substring(0, 8)}`}
                onClose={() => setEditingQ(null)}
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setEditingQ(null)}>Descartar</Button>
                        <Button
                            onClick={handleSaveEdit}
                            disabled={saving}
                            icon={saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                        >
                            {saving ? 'Guardando…' : 'Guardar cambios'}
                        </Button>
                    </>
                }
            >
                <div className="space-y-5">
                    <TextAreaField
                        label="Enunciado"
                        rows={4}
                        value={editForm.question_text}
                        onChange={e => setEditForm({ ...editForm, question_text: e.target.value })}
                    />

                    <div>
                        <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                            Opciones · marca la válida
                        </p>
                        <div className="space-y-2">
                            {editForm.options.map((opt, i) => (
                                <div
                                    key={i}
                                    className={`flex items-center gap-2 p-2 rounded-2xl border transition-all ${
                                        i === editForm.correct_index
                                            ? 'bg-emerald-500/5 border-emerald-500/40'
                                            : 'bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800'
                                    }`}
                                >
                                    <button
                                        onClick={() => setEditForm({ ...editForm, correct_index: i })}
                                        aria-label={`Marcar la opción ${['A', 'B', 'C'][i]} como correcta`}
                                        className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center font-black text-sm transition-all ${
                                            i === editForm.correct_index
                                                ? 'bg-emerald-500 text-slate-900'
                                                : 'bg-slate-200 dark:bg-slate-800 text-slate-500 hover:bg-slate-300 dark:hover:bg-slate-700'
                                        }`}
                                    >
                                        {['A', 'B', 'C'][i]}
                                    </button>
                                    <input
                                        className="flex-1 min-w-0 bg-transparent border-b border-transparent focus:border-indigo-500/50 px-2 py-3 text-base sm:text-sm text-slate-900 dark:text-white outline-none transition-colors"
                                        value={opt}
                                        onChange={(e) => {
                                            const newOpts = [...editForm.options];
                                            newOpts[i] = e.target.value;
                                            setEditForm({ ...editForm, options: newOpts });
                                        }}
                                    />
                                    {i === editForm.correct_index && (
                                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mr-1" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <TextAreaField
                        label="Justificación"
                        rows={3}
                        value={editForm.explanation}
                        onChange={e => setEditForm({ ...editForm, explanation: e.target.value })}
                    />
                </div>
            </Modal>
        )}
    </div>
  );
}
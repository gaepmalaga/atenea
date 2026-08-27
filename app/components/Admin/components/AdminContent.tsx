'use client';

import { useState, useEffect } from 'react';
import type { QuestionStatus } from '@/app/lib/questions';
import { 
  Upload, FileText, Trash2, Loader2, RefreshCw, 
  Book, Sparkles, ChevronDown, ChevronRight, FolderOpen, 
  File, Calendar, CheckCircle2, AlertCircle, XCircle 
} from 'lucide-react';

// Importamos las Server Actions
import { 
  getOfficialSyllabus, 
  uploadTopicPDF, 
  deleteDocument, 
  seedQuestionBank 
} from '@/actions'; 

// --- TIPOS DE DATOS (CORREGIDOS Y COMPLETOS) ---
type DocFile = {
    id: string;
    filename: string;
    // IMPORTANTE: Usamos uploaded_at porque es como se llama en tu BD
    uploaded_at: string; 
};

type Subject = {
  id: number;
  number: number;
  title: string;
  docCount: number;
  documents: DocFile[]; // Array de archivos individuales
};

type Block = {
  id: number;
  name: string;
  subjects: Subject[];
};

export default function AdminContent() {
  const [syllabus, setSyllabus] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estado para subida de archivos
  const [uploading, setUploading] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);

  // Estado del Generador (IA)
  const [genSubject, setGenSubject] = useState<Subject | null>(null);
  const [genCount, setGenCount] = useState(20);
  // Publicar directo en el banco o mandar a moderacion. Antes era una constante
  // oculta en el servidor, y estaba puesta al reves de lo que decia su comentario.
  const [genAutoApprove, setGenAutoApprove] = useState(true);

  // Control de acordeón (Bloques abiertos)
  const [openBlocks, setOpenBlocks] = useState<Record<number, boolean>>({ 1: true });

  async function load() {
    setLoading(true);
    const res = await getOfficialSyllabus();
    if (res.success && res.syllabus) {
      setSyllabus(res.syllabus);
    } else {
      console.error("Error cargando temario:", res.error);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const toggleBlock = (blockId: number) => {
    setOpenBlocks(prev => ({ ...prev, [blockId]: !prev[blockId] }));
  };

  // --- SUBIDA DE ARCHIVOS ---
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return;
    if (!selectedSubject) { alert("Primero selecciona un TEMA de la lista."); return; }

    const file = e.target.files[0];
    if (file.type !== 'application/pdf') { alert("Solo se admiten archivos PDF."); return; }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('subjectId', selectedSubject.id.toString());
    
    const res = await uploadTopicPDF(formData);
    setUploading(false);

    if (!res.success) {
        alert("❌ Error: " + res.error);
        return;
    }

    await load(); // Recarga visual

    // Un indexado parcial no es un éxito: significa que parte del temario no
    // está en el buscador y el chat no lo encontrará. Antes se pintaba el
    // mismo "✅" en ambos casos.
    if (res.complete) {
        alert("✅ " + res.message);
    } else {
        alert(
            "⚠️ " + res.message +
            "\n\nEse contenido NO aparecerá en las búsquedas del chat." +
            (res.failures?.length ? "\n\nPrimeros errores:\n" + res.failures.join("\n") : "") +
            "\n\nPuedes borrar el documento y volver a subirlo."
        );
    }
  }

  // --- BORRADO DE DOCUMENTO INDIVIDUAL ---
  async function handleDeleteDoc(docId: string, docName: string) {
    if (!confirm(`¿Estás seguro de que quieres eliminar el archivo "${docName}"?\nSe borrarán también los vectores de búsqueda asociados.`)) return;
    
    const res = await deleteDocument(docId);
    if (res.success) {
        await load();
    } else {
        alert("Error al borrar: " + res.error);
    }
  }

  // Calcular total de documentos en el sistema
  const totalDocs = syllabus.reduce((acc, block) => 
    acc + block.subjects.reduce((sAcc, sub) => sAcc + sub.docCount, 0), 0
  );

  return (
    <div className="space-y-8 animate-in fade-in pb-20 font-sans">
        
        {/* --- HEADER KPI & UPLOAD ZONE (DISEÑO VIP) --- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* 1. TARJETA KPI CON EFECTO CRISTAL */}
            <div className="bg-slate-800/40 backdrop-blur-md p-8 rounded-[2rem] border border-white/5 shadow-2xl relative overflow-hidden group">
                {/* Glow Effect de fondo */}
                <div className="absolute top-0 right-0 p-32 bg-indigo-600/20 rounded-full blur-[80px] -mr-16 -mt-16 pointer-events-none group-hover:bg-indigo-500/30 transition-all duration-1000"></div>
                
                <div className="flex justify-between items-start mb-8 relative z-10">
                    <div className="p-3.5 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl shadow-lg shadow-indigo-500/20 text-white transform group-hover:scale-110 transition-transform duration-300">
                        <Book size={28} strokeWidth={2.5} />
                    </div>
                    <span className="text-[10px] font-black bg-slate-900/60 text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-full uppercase tracking-widest backdrop-blur-md">
                        Biblioteca Oficial
                    </span>
                </div>
                
                <div className="relative z-10">
                    <p className="text-7xl font-black text-white tracking-tighter mb-2 drop-shadow-lg">{totalDocs}</p>
                    <p className="text-sm text-slate-400 font-bold uppercase tracking-wide flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-500"/> Documentos Indexados
                    </p>
                </div>
            </div>

            {/* 2. ZONA DE SUBIDA (Upload Zone) */}
            <div className={`relative p-[2px] rounded-[2rem] transition-all duration-500 ${selectedSubject ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-2xl shadow-indigo-500/20' : 'bg-slate-800 border border-slate-700'}`}>
                <div className="bg-slate-900 h-full w-full rounded-[30px] overflow-hidden relative">
                    {uploading ? (
                        <div className="flex flex-col items-center justify-center h-full gap-4 animate-in fade-in bg-slate-900/90 backdrop-blur-sm">
                            <div className="relative">
                                <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 animate-pulse"></div>
                                <Loader2 className="animate-spin text-indigo-400 relative z-10" size={48} />
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-bold text-white mb-1">Indexando Documento...</p>
                                <p className="text-xs font-mono text-indigo-300 animate-pulse">Generando vectores semánticos</p>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 relative group">
                            {selectedSubject ? (
                                <>
                                    <input 
                                        type="file" 
                                        accept="application/pdf" 
                                        onChange={handleFileUpload} 
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-50" 
                                    />
                                    <div className="w-20 h-20 bg-indigo-500/10 rounded-3xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 border border-indigo-500/20 shadow-inner">
                                        <Upload className="text-indigo-400" size={36} />
                                    </div>
                                    <h3 className="text-xl font-black text-white mb-1">Subir PDF al Tema {selectedSubject.number}</h3>
                                    <p className="text-xs text-slate-400 max-w-xs mx-auto line-clamp-1 font-medium">{selectedSubject.title}</p>
                                    <div className="mt-5 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-indigo-500/20 transition-all">
                                        Seleccionar Archivo
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-4 border border-slate-700 grayscale opacity-50">
                                        <FolderOpen className="text-slate-400" size={32} />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-500 mb-1">Selecciona un Tema</h3>
                                    <p className="text-xs text-slate-600 font-medium">Elige un tema de la lista inferior para activar la subida</p>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* --- 3. GENERADOR IA (PANEL INTERACTIVO) --- */}
        <SeedBankPanel
            subject={genSubject}
            count={genCount}
            setCount={setGenCount}
            autoApprove={genAutoApprove}
            setAutoApprove={setGenAutoApprove}
        />

        {/* --- 4. VISOR DE TEMARIO (ACORDEÓN PREMIUM) --- */}
        <div className="bg-slate-900 rounded-[2rem] border border-slate-800 overflow-hidden shadow-2xl">
            {/* Header del Visor */}
            <div className="px-8 py-6 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 flex justify-between items-center sticky top-0 z-20">
                <h3 className="font-black text-slate-200 text-sm uppercase tracking-widest flex items-center gap-3">
                    <Book size={18} className="text-indigo-500"/> Estructura Oficial
                </h3>
                <button 
                    onClick={load} 
                    className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-xl transition-all active:scale-95" 
                    title="Recargar datos"
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''}/>
                </button>
            </div>
            
            {/* Loading State */}
            {loading && (
                <div className="p-24 flex flex-col items-center justify-center text-slate-500 bg-slate-900/50">
                    <Loader2 className="animate-spin mb-4 text-indigo-500" size={32}/>
                    <p className="text-[10px] font-black tracking-[0.2em] uppercase opacity-70">Sincronizando Temario...</p>
                </div>
            )}
            
            {/* Lista de Bloques */}
            <div className="divide-y divide-slate-800/50">
                {syllabus.map((block) => (
                    <div key={block.id} className="bg-slate-900 group/block">
                        {/* Botón del Bloque */}
                        <button 
                            onClick={() => toggleBlock(block.id)}
                            className="w-full flex items-center justify-between p-6 hover:bg-slate-800/30 transition-all cursor-pointer"
                        >
                            <span className="font-bold text-sm text-slate-300 uppercase flex items-center gap-4 group-hover/block:text-white transition-colors">
                                <div className={`p-1 rounded-lg transition-colors ${openBlocks[block.id] ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800 text-slate-600'}`}>
                                    {openBlocks[block.id] 
                                        ? <ChevronDown size={18} strokeWidth={3}/> 
                                        : <ChevronRight size={18} strokeWidth={3}/>
                                    }
                                </div>
                                {block.name}
                            </span>
                            <span className="text-[10px] font-black tracking-wider bg-slate-950 text-slate-500 px-3 py-1.5 rounded-lg border border-slate-800">
                                {block.subjects.length} TEMAS
                            </span>
                        </button>

                        {/* Lista de Temas (Desplegable) */}
                        {openBlocks[block.id] && (
                            <div className="bg-black/20 border-t border-slate-800/50 animate-in slide-in-from-top-2 duration-300 shadow-inner">
                                {block.subjects.map(subject => {
                                    const isSelected = selectedSubject?.id === subject.id;
                                    const hasDocs = subject.docCount > 0;

                                    return (
                                        <div key={subject.id} className={`group/subject relative transition-all duration-300 ${isSelected ? 'bg-indigo-900/10' : 'hover:bg-white/5'}`}>
                                            
                                            {/* Indicador lateral de selección */}
                                            {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 shadow-[0_0_10px_#6366f1]"></div>}

                                            {/* Fila del Tema */}
                                            <div className="p-4 pl-8 flex items-center justify-between">
                                                <div className="flex items-center gap-5 flex-1 min-w-0">
                                                    {/* Número del Tema */}
                                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-black shadow-sm flex-shrink-0 transition-all ${
                                                        hasDocs 
                                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                                        : 'bg-slate-800 text-slate-500 border border-slate-700'
                                                    }`}>
                                                        {subject.number}
                                                    </div>
                                                    
                                                    {/* Título y Estado */}
                                                    <div className="min-w-0">
                                                        <p className={`text-sm font-bold truncate pr-4 transition-colors ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                                                            {subject.title}
                                                        </p>
                                                        <div className="flex items-center gap-3 mt-1.5">
                                                            {hasDocs ? (
                                                                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1.5">
                                                                    <FileText size={10} strokeWidth={3}/> {subject.docCount} archivo{subject.docCount !== 1 ? 's' : ''}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[10px] font-bold text-slate-600 bg-slate-800 px-2 py-0.5 rounded flex items-center gap-1.5">
                                                                    <AlertCircle size={10}/> Vacío
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Botones de Acción */}
                                                <div className="flex items-center gap-3 opacity-100 lg:opacity-40 lg:group-hover/subject:opacity-100 transition-all mr-4">
                                                    <button 
                                                        onClick={() => setSelectedSubject(subject)}
                                                        className={`p-2.5 rounded-xl transition-all flex items-center gap-2 text-xs font-bold border ${
                                                            isSelected 
                                                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/30' 
                                                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'
                                                        }`}
                                                        title="Seleccionar para subir"
                                                    >
                                                        <Upload size={16}/> <span className="hidden md:inline">SUBIR</span>
                                                    </button>
                                                    
                                                    {hasDocs && (
                                                        <button 
                                                            onClick={() => { setGenSubject(subject); window.scrollTo({top:0, behavior:'smooth'}); }}
                                                            className={`p-2.5 rounded-xl transition-all border ${
                                                                genSubject?.id === subject.id 
                                                                ? 'bg-purple-600 border-purple-500 text-white shadow-lg' 
                                                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-purple-400 hover:bg-slate-700'
                                                            }`}
                                                            title="Generar Test IA"
                                                        >
                                                            <Sparkles size={16}/>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* LISTA DE ARCHIVOS (SUB-NIVEL) */}
                                            {hasDocs && subject.documents && subject.documents.length > 0 && (
                                                <div className="ml-[5rem] mr-6 mb-4 space-y-2 border-l-2 border-slate-800 pl-6 animate-in slide-in-from-left-2 duration-300 py-2">
                                                    {subject.documents.map(doc => (
                                                        <div key={doc.id} className="flex items-center justify-between bg-slate-900 border border-slate-800 p-3 rounded-xl text-xs group/doc hover:bg-slate-800 hover:border-slate-600 transition-all shadow-sm">
                                                            <div className="flex items-center gap-4 overflow-hidden">
                                                                <div className="p-2 bg-slate-800 rounded-lg text-slate-500 group-hover/doc:text-indigo-400 group-hover/doc:bg-indigo-500/10 transition-colors">
                                                                    <File size={14}/>
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-slate-300 truncate font-medium group-hover/doc:text-white transition-colors">{doc.filename}</p>
                                                                    {/* AQUÍ ESTÁ LA FECHA CORREGIDA */}
                                                                    <p className="text-[10px] text-slate-600 flex items-center gap-1.5 mt-0.5">
                                                                        <Calendar size={10}/> 
                                                                        {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : 'Fecha desconocida'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            
                                                            <button 
                                                                onClick={() => handleDeleteDoc(doc.id, doc.filename)}
                                                                className="flex items-center gap-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-all opacity-0 group-hover/doc:opacity-100"
                                                                title="Eliminar archivo permanentemente"
                                                            >
                                                                <span className="font-bold text-[10px] uppercase hidden sm:inline">Eliminar</span>
                                                                <Trash2 size={14}/>
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    </div>
  );
}

// --- SUBCOMPONENTE: PANEL GENERADOR ---
function SeedBankPanel({ subject, count, setCount, autoApprove, setAutoApprove }: {
  subject: Subject | null,
  count: number,
  setCount: (n: number) => void,
  autoApprove: boolean,
  setAutoApprove: (v: boolean) => void
}) {
  const [running, setRunning] = useState(false);
  // Lo que devuelve `seedQuestionBank`: el desglose completo, no solo cuantas
  // se insertaron. Antes era `any` y la pantalla podia leer campos que no
  // vienen sin que nada avisara.
  type ResultadoSiembra =
    | {
        success: true;
        inserted: number;
        duplicated: number;
        failed: number;
        requested: number;
        /** Donde han ido a parar: al banco ('active') o a moderación. */
        status: QuestionStatus;
      }
    | { success: false; error?: string };

  const [result, setResult] = useState<ResultadoSiembra | null>(null);

  async function run() {
    if (!subject) return;
    setRunning(true);
    setResult(null);
    
    // Llamada a la Action
    const res = await seedQuestionBank({
        subjectId: subject.id,
        topic: subject.title,
        count,
        autoApprove
    });
    
    setResult(res);
    setRunning(false);
  }

  return (
    <div className={`p-[3px] rounded-[2rem] transition-all duration-700 ${subject ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-2xl shadow-purple-500/20' : 'bg-slate-800'}`}>
        <div className="bg-slate-900 p-8 rounded-[30px] h-full relative overflow-hidden">
            {/* Decoración de fondo */}
            {subject && <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 blur-[60px] rounded-full pointer-events-none"></div>}

            <div className="flex flex-col md:flex-row gap-8 items-center justify-between relative z-10">
                
                <div className="flex items-center gap-6 w-full md:w-auto">
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner transition-all duration-500 ${subject ? 'bg-indigo-600 text-white shadow-indigo-500/30 scale-105' : 'bg-slate-800 text-slate-600'}`}>
                        <Sparkles size={32} className={running ? 'animate-spin-slow' : ''} />
                    </div>
                    <div>
                        <h4 className="font-black text-white uppercase tracking-widest text-sm mb-1.5">Motor de Generación IA</h4>
                        <p className="text-xs text-slate-400">
                            {subject 
                                ? <span className="flex items-center gap-2">Objetivo: <span className="text-indigo-300 font-bold bg-indigo-500/20 px-2 py-0.5 rounded border border-indigo-500/30">Tema {subject.number}</span></span> 
                                : <span className="italic opacity-50 flex items-center gap-2"><AlertCircle size={12}/> Selecciona un tema arriba para empezar</span>}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto bg-slate-950/80 p-3 rounded-2xl border border-slate-800 shadow-lg">
                    <div className="flex flex-col px-3 border-r border-slate-800">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 text-center">Preguntas</label>
                        <input 
                            type="number" 
                            min="1" max="50"
                            value={count} 
                            onChange={(e) => setCount(Number(e.target.value))} 
                            className="bg-transparent text-white w-16 text-center font-black text-xl outline-none focus:text-indigo-400 transition-colors"
                        />
                    </div>
                    
                    <button
                        type="button"
                        onClick={() => setAutoApprove(!autoApprove)}
                        className="flex flex-col px-3 border-r border-slate-800 text-left group/toggle"
                        title="Decide si las preguntas entran directas al banco o pasan por moderación"
                    >
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Destino</span>
                        <span className={`text-[11px] font-black uppercase tracking-wide transition-colors ${autoApprove ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {autoApprove ? 'Banco' : 'Moderación'}
                        </span>
                    </button>

                    <button
                        onClick={run}
                        disabled={running || !subject}
                        className="h-14 px-8 bg-white hover:bg-indigo-50 text-slate-900 rounded-xl font-black uppercase text-xs tracking-widest transition-all disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center gap-3 hover:scale-105 active:scale-95 shadow-xl hover:shadow-indigo-500/20"
                    >
                        {running ? <Loader2 className="animate-spin" size={20}/> : <>EJECUTAR <Sparkles size={16} className="text-purple-600 fill-purple-600"/></>}
                    </button>
                </div>
            </div>

            {/* Consola de Resultados con animación */}
            {result && (
                <div className={`mt-8 p-5 rounded-2xl text-xs font-mono border flex justify-between items-center animate-in slide-in-from-top-4 duration-500 ${result.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                    <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${result.success ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                            {result.success ? <CheckCircle2 size={18}/> : <XCircle size={18}/>}
                        </div>
                        <div>
                            <p className="font-bold text-sm mb-0.5">{result.success ? 'GENERACIÓN COMPLETADA' : 'ERROR EN PROCESO'}</p>
                            <p className="opacity-80">
                                {result.success
                                  ? [
                                      `${result.inserted} nuevas en ${result.status === 'active' ? 'el banco' : 'moderación'}`,
                                      result.duplicated ? `${result.duplicated} ya existían` : null,
                                      result.failed ? `${result.failed} fallaron` : null,
                                    ].filter(Boolean).join(' · ')
                                  : result.error}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
}
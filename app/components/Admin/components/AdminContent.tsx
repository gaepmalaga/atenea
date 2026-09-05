'use client';

import { useState, useEffect, useCallback } from 'react';
import type { QuestionStatus } from '@/app/lib/questions';
import {
  Upload, FileText, Trash2, Loader2, RefreshCw,
  Book, Sparkles, ChevronDown, ChevronRight, FolderOpen,
  File, Calendar, CheckCircle2, AlertCircle, XCircle, AlertTriangle, Eye, Layers
} from 'lucide-react';

import DocumentChunksViewer from './DocumentChunksViewer';
import type { DocumentChunkRow } from '@/app/lib/documents';
import { enteroEnRango } from '@/app/lib/input-number';

// Importamos las Server Actions
import {
  getOfficialSyllabus,
  uploadTopicPDF,
  deleteDocument,
  reindexDocument,
  getDocumentChunks,
  seedQuestionBank,
  seedFlashcardBank,
  getFlashcardBankCounts
} from '@/actions'; 

// --- TIPOS DE DATOS (CORREGIDOS Y COMPLETOS) ---
type DocFile = {
    id: string;
    filename: string;
    // IMPORTANTE: Usamos uploaded_at porque es como se llama en tu BD
    uploaded_at: string;
    /** indexado | parcial | fallido | pendiente */
    index_status: string;
    chunk_count: number;
};

/**
 * Como se pinta cada estado de indexado.
 *
 * Un documento "fallido" es un tema MUDO: su texto esta guardado pero el chat
 * no encuentra nada de el. Hasta ahora era indistinguible de uno sano en esta
 * misma lista, y asi estuvo meses el TEMA 9.
 */
const ESTADO_INDEXADO: Record<string, { texto: string; clase: string; aviso?: string }> = {
    indexado: {
        texto: 'Indexado',
        clase: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
    },
    parcial: {
        texto: 'Parcial',
        clase: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
        aviso: 'Faltan fragmentos: parte de este tema no la encuentra el chat.',
    },
    fallido: {
        texto: 'Sin indexar',
        clase: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
        aviso: 'El chat NO encuentra nada de este documento. Pulsa Reindexar.',
    },
    pendiente: {
        texto: 'Pendiente',
        clase: 'bg-slate-300/50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600',
        aviso: 'Todavia no se ha indexado.',
    },
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
  /** Id del documento que se esta reindexando, o null. */
  const [reindexando, setReindexando] = useState<string | null>(null);

  /**
   * El documento cuyo contenido se esta enseñando, con sus fragmentos ya
   * cargados. Los trae ESTE componente y no el visor: asi el visor no necesita
   * ningun efecto, se monta con lo que tiene que pintar.
   */
  const [visor, setVisor] = useState<{ filename: string; chunks: DocumentChunkRow[] } | null>(null);
  /** Id del documento cuyos fragmentos se estan leyendo, o null. */
  const [cargandoVisor, setCargandoVisor] = useState<string | null>(null);
  
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
  /**
   * Vuelve a trocear e indexar un documento.
   *
   * Hace falta para dos casos: uno que fallo y quedo mudo, y uno subido antes
   * del troceado por estructura, que gana la referencia legal al reindexarse.
   */
  async function handleReindex(docId: string, docName: string) {
    setReindexando(docId);
    try {
      const res = await reindexDocument(docId);

      if (!res.success) {
        alert(`No se pudo reindexar "${docName}":\n${res.error}`);
        return;
      }

      const conRef = res.withReference
        ? `\n${res.withReference} de ellos con su referencia legal.`
        : '';

      alert(
        res.status === 'indexado'
          ? `"${docName}" reindexado: ${res.indexed} fragmentos.${conRef}`
          : `"${docName}" quedo en ${res.status}: ${res.indexed} de ${res.total} fragmentos.${conRef}`
      );

      await load();
    } finally {
      // En el `finally`: si la accion falla, el boton tiene que volver a
      // quedar disponible igualmente.
      setReindexando(null);
    }
  }

  /**
   * Abre el visor con lo que la plataforma ha entendido del documento.
   *
   * Los fragmentos se piden AQUI y se le pasan hechos al visor. Es lo que
   * permite que el visor no tenga ningun efecto.
   */
  async function handleVerFragmentos(docId: string, docName: string) {
    setCargandoVisor(docId);
    try {
      const res = await getDocumentChunks(docId);

      if (!res.success) {
        alert(`No se han podido leer los fragmentos de "${docName}":\n${res.error}`);
        return;
      }

      setVisor({ filename: docName, chunks: res.chunks });
    } finally {
      // En el `finally`: si la accion falla, el boton tiene que volver a
      // quedar disponible igualmente.
      setCargandoVisor(null);
    }
  }

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
  // `?? 0`: sumar un campo sin comprobarlo convierte TODO el total en NaN en
  // cuanto uno llega sin el, y lo que ve el administrador es "NaN documentos
  // indexados" — un panel que se contradice a si mismo. Es la regla 5 aplicada
  // a la aritmetica: no se lee un campo dando por hecho que viene.
  const totalDocs = syllabus.reduce((acc, block) =>
    acc + block.subjects.reduce((sAcc, sub) => sAcc + (sub.docCount ?? 0), 0), 0
  );

  return (
    <div className="space-y-8 animate-in fade-in pb-20 font-sans">
        
        {/* --- HEADER KPI & UPLOAD ZONE (DISEÑO VIP) --- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* 1. TARJETA KPI CON EFECTO CRISTAL */}
            <div className="bg-slate-200/40 dark:bg-slate-800/40 backdrop-blur-md p-8 rounded-2xl sm:rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden group">
                {/* Glow Effect de fondo */}
                <div className="absolute top-0 right-0 p-32 bg-indigo-600/20 rounded-full blur-[80px] -mr-16 -mt-16 pointer-events-none group-hover:bg-indigo-500/30 transition-all duration-1000"></div>
                
                <div className="flex justify-between items-start mb-8 relative z-10">
                    <div className="p-3.5 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl shadow-lg shadow-indigo-500/20 text-white transform group-hover:scale-110 transition-transform duration-300">
                        <Book size={28} strokeWidth={2.5} />
                    </div>
                    <span className="text-[10px] font-black bg-slate-100/60 dark:bg-slate-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-full uppercase tracking-widest backdrop-blur-md">
                        Biblioteca Oficial
                    </span>
                </div>
                
                <div className="relative z-10">
                    <p className="text-4xl sm:text-6xl md:text-7xl font-black text-slate-900 dark:text-white tracking-tighter mb-2 drop-shadow-lg">{totalDocs}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wide flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-500"/> {totalDocs === 1 ? 'Documento indexado' : 'Documentos indexados'}
                    </p>
                </div>
            </div>

            {/* 2. ZONA DE SUBIDA (Upload Zone) */}
            <div className={`relative p-[2px] rounded-2xl sm:rounded-3xl transition-all duration-500 ${selectedSubject ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-2xl shadow-indigo-500/20' : 'bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700'}`}>
                <div className="bg-white dark:bg-slate-900 h-full w-full rounded-3xl overflow-hidden relative">
                    {uploading ? (
                        <div className="flex flex-col items-center justify-center h-full gap-4 animate-in fade-in bg-slate-100/90 dark:bg-slate-900/90 backdrop-blur-sm">
                            <div className="relative">
                                <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 animate-pulse"></div>
                                <Loader2 className="animate-spin text-indigo-700 dark:text-indigo-400 relative z-10" size={48} />
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-bold text-slate-900 dark:text-white mb-1">Indexando Documento...</p>
                                <p className="text-xs font-mono text-indigo-700 dark:text-indigo-300 animate-pulse">Generando vectores semánticos</p>
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
                                        <Upload className="text-indigo-700 dark:text-indigo-400" size={36} />
                                    </div>
                                    <h3 className="text-xl font-black text-slate-900 dark:text-white mb-1">Subir PDF al Tema {selectedSubject.number}</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto line-clamp-1 font-medium">{selectedSubject.title}</p>
                                    <div className="mt-5 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-indigo-500/20 transition-all">
                                        Seleccionar Archivo
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-4 border border-slate-300 dark:border-slate-700 grayscale opacity-50">
                                        <FolderOpen className="text-slate-500 dark:text-slate-400" size={32} />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-500 dark:text-slate-400 mb-1">Selecciona un Tema</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Elige un tema de la lista inferior para activar la subida</p>
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

        {/* --- 3b. GENERADOR DE FICHAS --- */}
        <SeedCardsPanel subject={genSubject} />

        {/* --- 4. VISOR DE TEMARIO (ACORDEÓN PREMIUM) --- */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl">
            {/* Header del Visor */}
            <div className="px-8 py-6 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex justify-between items-center sticky top-0 z-20">
                <h3 className="font-black text-slate-800 dark:text-slate-200 text-sm uppercase tracking-widest flex items-center gap-3">
                    <Book size={18} className="text-indigo-500"/> Estructura Oficial
                </h3>
                <button 
                    onClick={load} 
                    className="w-11 h-11 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all active:scale-95" 
                    title="Recargar datos"
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''}/>
                </button>
            </div>
            
            {/* Loading State */}
            {loading && (
                <div className="p-24 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 bg-slate-100/50 dark:bg-slate-900/50">
                    <Loader2 className="animate-spin mb-4 text-indigo-500" size={32}/>
                    <p className="text-[10px] font-black tracking-[0.2em] uppercase opacity-70">Sincronizando Temario...</p>
                </div>
            )}
            
            {/* Lista de Bloques */}
            <div className="divide-y divide-slate-200 dark:divide-slate-800/50">
                {syllabus.map((block) => (
                    <div key={block.id} className="bg-white dark:bg-slate-900 group/block">
                        {/* Botón del Bloque */}
                        <button 
                            onClick={() => toggleBlock(block.id)}
                            className="w-full flex items-center justify-between p-6 hover:bg-slate-200/30 dark:hover:bg-slate-800/30 transition-all cursor-pointer"
                        >
                            <span className="font-bold text-sm text-slate-700 dark:text-slate-300 uppercase flex items-center gap-4 group-hover/block:text-slate-900 dark:group-hover/block:text-white transition-colors">
                                <div className={`p-1 rounded-lg transition-colors ${openBlocks[block.id] ? 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                                    {openBlocks[block.id] 
                                        ? <ChevronDown size={18} strokeWidth={3}/> 
                                        : <ChevronRight size={18} strokeWidth={3}/>
                                    }
                                </div>
                                {block.name}
                            </span>
                            <span className="text-[10px] font-black tracking-wider bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                                {block.subjects.length} {block.subjects.length === 1 ? 'TEMA' : 'TEMAS'}
                            </span>
                        </button>

                        {/* Lista de Temas (Desplegable) */}
                        {openBlocks[block.id] && (
                            <div className="bg-slate-50 dark:bg-black/20 border-t border-slate-200 dark:border-slate-800/50 animate-in slide-in-from-top-2 duration-300">
                                {block.subjects.map(subject => {
                                    const isSelected = selectedSubject?.id === subject.id;
                                    const hasDocs = subject.docCount > 0;

                                    return (
                                        <div key={subject.id} className={`group/subject relative transition-all duration-300 ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/10' : 'hover:bg-slate-100 dark:hover:bg-white/5'}`}>
                                            
                                            {/* Indicador lateral de selección */}
                                            {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 shadow-[0_0_10px_#6366f1]"></div>}

                                            {/* Fila del Tema */}
                                            {/* En movil, los dos botones bajan a su
                                                propia fila. Ocupaban ~110px de los
                                                390, y esta lista va sangrada por la
                                                izquierda: al titulo del tema le
                                                quedaban ~130px, o sea "El Derecho:
                                                concepto y…". Con 45 temas que
                                                empiezan igual, eso no identifica la
                                                fila. */}
                                            <div className="p-4 pl-5 sm:pl-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                                <div className="flex items-center gap-4 sm:gap-5 flex-1 min-w-0">
                                                    {/* Número del Tema */}
                                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-black shadow-sm flex-shrink-0 transition-all ${
                                                        hasDocs 
                                                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20' 
                                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700'
                                                    }`}>
                                                        {subject.number}
                                                    </div>
                                                    
                                                    {/* Título y Estado */}
                                                    <div className="min-w-0">
                                                        {/* `line-clamp-2` y no `truncate`: medido en el
                                                            banco, a "El Derecho: concepto y acepciones.
                                                            Norma juridica…" le faltaban 388px, o sea que
                                                            se leia menos de la mitad. Con 45 temas que
                                                            empiezan casi igual —"La Constitucion Espanola
                                                            (I)", "(II)"…— un titulo a medias no identifica
                                                            la fila, que es lo unico que tiene que hacer. */}
                                                        <p className={`text-sm font-bold line-clamp-2 leading-snug transition-colors ${isSelected ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                                                            {subject.title}
                                                        </p>
                                                        <div className="flex items-center gap-3 mt-1.5">
                                                            {hasDocs ? (
                                                                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1.5">
                                                                    <FileText size={10} strokeWidth={3}/> {subject.docCount} archivo{subject.docCount !== 1 ? 's' : ''}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded flex items-center gap-1.5">
                                                                    <AlertCircle size={10}/> Vacío
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Botones de Acción */}
                                                <div className="flex items-center justify-end gap-3 shrink-0 opacity-100 lg:opacity-40 lg:group-hover/subject:opacity-100 transition-all sm:mr-4">
                                                    <button 
                                                        onClick={() => setSelectedSubject(subject)}
                                                        className={`min-h-[44px] px-3 rounded-xl transition-all flex items-center justify-center gap-2 text-xs font-bold border ${
                                                            isSelected 
                                                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/30' 
                                                            : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-300 dark:hover:bg-slate-700'
                                                        }`}
                                                        title="Seleccionar para subir"
                                                    >
                                                        <Upload size={16}/> <span className="hidden md:inline">SUBIR</span>
                                                    </button>
                                                    
                                                    {hasDocs && (
                                                        <button 
                                                            onClick={() => { setGenSubject(subject); window.scrollTo({top:0, behavior:'smooth'}); }}
                                                            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-all border ${
                                                                genSubject?.id === subject.id 
                                                                ? 'bg-purple-600 border-purple-500 text-white shadow-lg' 
                                                                : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-purple-700 dark:hover:text-purple-400 hover:bg-slate-300 dark:hover:bg-slate-700'
                                                            }`}
                                                            title="Generar Test IA"
                                                            aria-label="Generar preguntas con IA para este tema"
                                                        >
                                                            <Sparkles size={16}/>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* LISTA DE ARCHIVOS (SUB-NIVEL) */}
                                            {hasDocs && subject.documents && subject.documents.length > 0 && (
                                                <div className="ml-[5rem] mr-6 mb-4 space-y-2 border-l-2 border-slate-200 dark:border-slate-800 pl-6 animate-in slide-in-from-left-2 duration-300 py-2">
                                                    {subject.documents.map(doc => (
                                                        /* En movil se APILA: el nombre arriba, los tres
                                                           botones debajo. Con los botones a 44px en una
                                                           sola fila al nombre le quedaban ~58px de ancho
                                                           util —"tema-01.pdf" salia como "te…"— porque
                                                           esta lista va sangrada 80px por la izquierda.
                                                           Los controles no pueden dejar sin sitio a lo que
                                                           identifica la fila. */
                                                        <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-xl text-xs group/doc hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all shadow-sm">
                                                            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                                                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 group-hover/doc:text-indigo-700 dark:group-hover/doc:text-indigo-400 group-hover/doc:bg-indigo-500/10 transition-colors">
                                                                    <File size={14}/>
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-slate-700 dark:text-slate-300 truncate font-medium group-hover/doc:text-slate-900 dark:group-hover/doc:text-white transition-colors">{doc.filename}</p>
                                                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-1 flex-wrap">
                                                                        <span className="flex items-center gap-1.5">
                                                                            <Calendar size={10}/>
                                                                            {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : 'Fecha desconocida'}
                                                                        </span>

                                                                        {/* El estado de indexado, SIEMPRE visible. Antes solo se veia
                                                                            en el momento de subir: al cerrar la pestania no quedaba
                                                                            rastro de un indexado a medias. */}
                                                                        {(() => {
                                                                            const e = ESTADO_INDEXADO[doc.index_status] ?? ESTADO_INDEXADO.pendiente;
                                                                            return (
                                                                                <span
                                                                                    className={`px-1.5 py-0.5 rounded border font-bold uppercase tracking-wider ${e.clase}`}
                                                                                    title={e.aviso}
                                                                                >
                                                                                    {e.texto}
                                                                                </span>
                                                                            );
                                                                        })()}

                                                                        <span className="font-mono text-slate-500 dark:text-slate-400">
                                                                            {doc.chunk_count} fragmento{doc.chunk_count !== 1 ? 's' : ''}
                                                                        </span>
                                                                    </p>

                                                                    {/* Un tema mudo merece decirlo con palabras, no solo con un color. */}
                                                                    {doc.index_status !== 'indexado' && ESTADO_INDEXADO[doc.index_status]?.aviso && (
                                                                        <p className="text-[10px] text-amber-500/80 mt-1 flex items-center gap-1.5">
                                                                            <AlertTriangle size={10}/> {ESTADO_INDEXADO[doc.index_status].aviso}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Los tres botones de un documento.

                                                                Medidos en el banco de pruebas: 26px de alto,
                                                                y en movil SIN etiqueta (`hidden sm:inline`),
                                                                asi que eran tres iconos de 14px pegados en
                                                                una franja de 26. El mimimo tactil son 44.

                                                                Y el tercero BORRA EL DOCUMENTO. Compartia
                                                                tamaño, color y sitio con "Reindexar", que es
                                                                el que se pulsa a diario (regla 26). Ahora va
                                                                separado, en rojo desde el reposo, y con su
                                                                nombre en `aria-label`: sin etiqueta visible,
                                                                era un boton anonimo que destruye archivos. */}
                                                            <div className="flex items-center justify-end gap-1 flex-shrink-0">
                                                                {/* Ver lo que ha entrado va DELANTE de reindexar: primero se
                                                                    mira que ha entendido la plataforma, y solo entonces se
                                                                    decide si hay que volver a intentarlo. */}
                                                                <button
                                                                    onClick={() => handleVerFragmentos(doc.id, doc.filename)}
                                                                    disabled={cargandoVisor === doc.id}
                                                                    aria-label="Ver los fragmentos indexados"
                                                                    className="flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-500/10 px-2 sm:px-3 rounded-lg transition-all disabled:opacity-60"
                                                                    title="Ver los fragmentos que se han indexado de este documento"
                                                                >
                                                                    <span className="font-bold text-[10px] uppercase hidden sm:inline">
                                                                        {cargandoVisor === doc.id ? 'Leyendo…' : 'Ver'}
                                                                    </span>
                                                                    {cargandoVisor === doc.id
                                                                        ? <Loader2 size={16} className="animate-spin"/>
                                                                        : <Eye size={16}/>}
                                                                </button>

                                                                <button
                                                                    onClick={() => handleReindex(doc.id, doc.filename)}
                                                                    disabled={reindexando === doc.id}
                                                                    aria-label="Reindexar el documento"
                                                                    className="flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] text-slate-500 dark:text-slate-400 hover:text-indigo-700 dark:hover:text-indigo-400 hover:bg-indigo-500/10 px-2 sm:px-3 rounded-lg transition-all disabled:opacity-60"
                                                                    title="Volver a trocear e indexar este documento"
                                                                >
                                                                    <span className="font-bold text-[10px] uppercase hidden sm:inline">
                                                                        {reindexando === doc.id ? 'Indexando…' : 'Reindexar'}
                                                                    </span>
                                                                    <RefreshCw size={16} className={reindexando === doc.id ? 'animate-spin' : ''}/>
                                                                </button>

                                                                <span className="w-px h-6 bg-slate-100 dark:bg-slate-800 mx-1" aria-hidden />

                                                                <button
                                                                    onClick={() => handleDeleteDoc(doc.id, doc.filename)}
                                                                    aria-label="Eliminar el documento permanentemente"
                                                                    className="flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] text-red-500/70 hover:text-white hover:bg-red-600 px-2 sm:px-3 rounded-lg transition-all"
                                                                    title="Eliminar archivo permanentemente"
                                                                >
                                                                    <span className="font-bold text-[10px] uppercase hidden sm:inline">Eliminar</span>
                                                                    <Trash2 size={16}/>
                                                                </button>
                                                            </div>
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

        {/* VISOR: que ha entendido la plataforma de este documento */}
        {visor && (
            <DocumentChunksViewer
                filename={visor.filename}
                chunks={visor.chunks}
                onClose={() => setVisor(null)}
            />
        )}
    </div>
  );
}

/**
 * EL GENERADOR DE FICHAS.
 *
 * Existe desde que las fichas salen de un banco compartido en vez de generarse
 * una por alumno y por tarjeta. Alguien tiene que llenar ese banco, y hasta
 * ahora lo unico que lo hacia era `npm run sembrar -- --solo-fichas`: pedirle
 * una consola a quien lleva la academia es pedirle que no lo use.
 *
 * Ensena CUANTAS FICHAS HAY YA del tema antes de sembrar. Sin ese numero se
 * siembra a ciegas: el guion se salta los temas que ya llegan al objetivo,
 * pero desde el panel no habia forma de saber si un tema estaba a cero o a
 * quince, y cada intento a ciegas son llamadas de pago.
 */
function SeedCardsPanel({ subject }: { subject: Subject | null }) {
  const [count, setCount] = useState(15);
  const [running, setRunning] = useState(false);
  const [yaHay, setYaHay] = useState<Record<string, number> | null>(null);
  type Resultado =
    | { success: true; inserted: number; duplicated: number; failed: number; requested: number }
    | { success: false; error?: string };
  const [result, setResult] = useState<Resultado | null>(null);

  const recargarRecuento = useCallback(async () => {
    const res = await getFlashcardBankCounts();
    if (res.success) setYaHay(res.porTema);
  }, []);

  useEffect(() => { recargarRecuento(); }, [recargarRecuento]);

  // `null` mientras no se ha leido el recuento: NO es lo mismo que cero, y en
  // esta tarjeta menos que en ningun sitio (regla 8). Cero significa "hay que
  // sembrar este tema"; sin dato significa "todavia no lo se".
  const tiene = subject && yaHay ? (yaHay[subject.title] ?? 0) : null;

  async function run() {
    if (!subject) return;
    setRunning(true);
    setResult(null);
    const res = await seedFlashcardBank({ subjectId: subject.id, topic: subject.title, count });
    setResult(res);
    setRunning(false);
    await recargarRecuento();
  }

  return (
    <div className="bg-white dark:bg-slate-900 border-[3px] border-slate-300 dark:border-slate-700 p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <div className={`w-12 h-12 flex items-center justify-center shrink-0 ${subject ? 'bg-purple-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
            <Layers className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h4 className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-sm mb-1.5">
              Fichas de repaso
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {subject ? (
                <>
                  Tema {subject.number} ·{' '}
                  {tiene === null
                    ? <span className="opacity-60">contando…</span>
                    : <span className={tiene === 0 ? 'text-amber-700 dark:text-amber-400 font-bold' : 'text-emerald-700 dark:text-emerald-400 font-bold'}>
                        {tiene} en el banco
                      </span>}
                </>
              ) : (
                <span className="italic opacity-50">Selecciona un tema arriba</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <label className="sr-only" htmlFor="cuantas-fichas">Cuántas fichas</label>
          <input
            id="cuantas-fichas"
            type="number"
            min={1}
            max={100}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
            disabled={!subject || running}
            className="w-20 min-h-[44px] bg-slate-50 dark:bg-slate-950 border-2 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-base sm:text-sm text-center font-bold outline-none focus:border-purple-500 disabled:opacity-40"
          />
          <button
            onClick={run}
            disabled={!subject || running}
            className="min-h-[44px] px-5 bg-purple-600 hover:bg-purple-500 text-white font-black uppercase tracking-wider text-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {running ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {running ? 'Escribiendo…' : 'Escribir fichas'}
          </button>
        </div>
      </div>

      {result && (
        <div className={`mt-4 p-3 border-2 text-xs font-bold ${result.success ? 'border-emerald-700 bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'border-red-800 bg-red-900/20 text-red-700 dark:text-red-300'}`}>
          {result.success
            ? `${result.inserted} nuevas · ${result.duplicated} repetidas · ${result.failed} fallidas (de ${result.requested} pedidas)`
            : `No se pudo: ${result.error ?? 'error desconocido'}`}
        </div>
      )}
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
    <div className={`p-[3px] rounded-2xl sm:rounded-3xl transition-all duration-700 ${subject ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-2xl shadow-purple-500/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
        <div className="bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-2xl sm:rounded-3xl h-full relative overflow-hidden">
            {/* Decoración de fondo */}
            {subject && <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 blur-[60px] rounded-full pointer-events-none"></div>}

            <div className="flex flex-col md:flex-row gap-5 md:gap-8 items-stretch md:items-center justify-between relative z-10">
                
                <div className="flex items-center gap-4 sm:gap-6 w-full md:w-auto min-w-0">
                    <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-inner transition-all duration-500 ${subject ? 'bg-indigo-600 text-white shadow-indigo-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                        <Sparkles className={`w-6 h-6 sm:w-8 sm:h-8 ${running ? 'animate-spin-slow' : ''}`} />
                    </div>
                    <div className="min-w-0">
                        <h4 className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-sm mb-1.5">Motor de Generación IA</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            {subject 
                                ? <span className="flex items-center gap-2">Objetivo: <span className="text-indigo-700 dark:text-indigo-300 font-bold bg-indigo-500/20 px-2 py-0.5 rounded border border-indigo-500/30">Tema {subject.number}</span></span> 
                                : <span className="italic opacity-50 flex items-center gap-2"><AlertCircle size={12}/> Selecciona un tema arriba para empezar</span>}
                        </p>
                    </div>
                </div>

                {/* EN MÓVIL SE APILA.

                    Los tres controles en una fila suman mas de 390px con el
                    relleno de la tarjeta, y la tarjeta es `overflow-hidden`: el
                    boton "EJECUTAR" quedaba CORTADO por su propio borde, 62px
                    fuera, sin forma de alcanzarlo. Y no lo veia ningun
                    detector, porque la pagina no crece: `hidden` recorta y ya.
                    Ahora los dos ajustes van en una fila y "Ejecutar" a lo
                    ancho debajo, que ademas es lo que se pulsa. */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 w-full md:w-auto bg-slate-50/80 dark:bg-slate-950/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="flex flex-col px-2 sm:px-3 border-r border-slate-200 dark:border-slate-800">
                        <label className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1 text-center">Preguntas</label>
                        <input 
                            type="number" 
                            min="1" max="50"
                            value={count} 
                            onChange={(e) => {
                                // `Number('')` es 0 y `Number('-')` es NaN. Ese NaN
                                // llegaba al servidor y el tope lo convertia en 1:
                                // pedias veinte preguntas y salia una (regla 16).
                                const n = enteroEnRango(e.target.value, { min: 1, max: 50 });
                                if (n !== null) setCount(n);
                            }} 
                            aria-label="Cuántas preguntas generar"
                            /* 28px de alto y sin nombre accesible: el control que
                               decide cuantas llamadas de pago se hacen a Gemini
                               era el mas pequeño de la pantalla. 44px, como todo
                               lo que se toca. */
                            className="bg-transparent text-slate-900 dark:text-white w-16 min-h-[44px] text-center font-black text-xl outline-none focus:text-indigo-700 dark:focus:text-indigo-400 transition-colors"
                        />
                    </div>
                    
                    <button
                        type="button"
                        onClick={() => setAutoApprove(!autoApprove)}
                        className="min-h-[44px] justify-center flex flex-col px-2 sm:px-3 sm:border-r border-slate-200 dark:border-slate-800 text-left group/toggle"
                        title="Decide si las preguntas entran directas al banco o pasan por moderación"
                    >
                        <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Destino</span>
                        <span className={`text-[11px] font-black uppercase tracking-wide transition-colors ${autoApprove ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                            {autoApprove ? 'Banco' : 'Moderación'}
                        </span>
                    </button>
                  </div>

                    <button
                        onClick={run}
                        disabled={running || !subject}
                        className="min-h-[44px] h-12 sm:h-14 w-full sm:w-auto px-6 sm:px-8 bg-white hover:bg-indigo-50 text-slate-900 rounded-xl font-black uppercase text-xs tracking-widest transition-all disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center gap-3 active:scale-95 shadow-xl hover:shadow-indigo-500/20"
                    >
                        {running ? <Loader2 className="animate-spin" size={20}/> : <>Ejecutar <Sparkles size={16} className="text-purple-600 fill-purple-600"/></>}
                    </button>
                </div>
            </div>

            {/* Consola de Resultados con animación */}
            {result && (
                <div className={`mt-8 p-5 rounded-2xl text-xs font-mono border flex justify-between items-center animate-in slide-in-from-top-4 duration-500 ${result.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400'}`}>
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
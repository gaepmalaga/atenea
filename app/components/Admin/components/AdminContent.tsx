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
import { cx } from '../../ui';

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

        {/* --- 3. GENERAR --- */}
        <GeneradorPanel
            syllabus={syllabus}
            subject={genSubject}
            setSubject={setGenSubject}
            autoApprove={genAutoApprove}
            setAutoApprove={setGenAutoApprove}
        />

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
 * GENERAR: QUÉ, DE QUÉ TEMA Y CUÁNTAS. En una sola caja.
 *
 * POR QUÉ SE REHIZO
 * Para generar diez preguntas del tema 7 había que: bajar al árbol del
 * temario, desplegar el bloque, encontrar el tema, pulsar un icono de estrella
 * —que además te devolvía arriba de un salto—, y sólo entonces elegir cuántas
 * y darle. Cinco pasos y dos saltos de scroll para una tarea que se hace
 * cuarenta y cinco veces seguidas al montar un temario.
 *
 * Y el orden estaba del revés: obligaba a elegir el TEMA antes de saber qué
 * ibas a generar, cuando lo primero que uno decide es «quiero preguntas» o
 * «quiero fichas».
 *
 * Ahora es una caja con las tres respuestas seguidas: qué, de qué tema,
 * cuántas. El desplegable trae los temas con lo que ya tiene cada uno, así que
 * no hay que ir a mirarlo a otra parte — sembrar a ciegas son llamadas de pago
 * tiradas.
 *
 * La estrella del árbol SE QUEDA como atajo: si estás mirando un tema y
 * quieres generar de ése, lo preselecciona. Lo que ya no es, es la única
 * puerta.
 */
function GeneradorPanel({ syllabus, subject, setSubject, autoApprove, setAutoApprove }: {
  syllabus: Block[];
  subject: Subject | null;
  setSubject: (s: Subject | null) => void;
  autoApprove: boolean;
  setAutoApprove: (v: boolean) => void;
}) {
  const [que, setQue] = useState<'preguntas' | 'fichas'>('preguntas');
  const [cuantas, setCuantas] = useState(20);
  const [corriendo, setCorriendo] = useState(false);
  const [fichasPorTema, setFichasPorTema] = useState<Record<string, number> | null>(null);

  type Resultado =
    | { success: true; inserted: number; duplicated: number; failed: number; requested: number }
    | { success: false; error?: string };
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const temas = syllabus.flatMap((b) => b.subjects);

  const recargarFichas = useCallback(async () => {
    const res = await getFlashcardBankCounts();
    if (res.success) setFichasPorTema(res.porTema);
  }, []);
  useEffect(() => { recargarFichas(); }, [recargarFichas]);

  // `null` mientras no se sabe: NO es lo mismo que cero (regla 8). Cero
  // significa «hay que sembrar este tema»; sin dato, «todavía no lo sé».
  const yaTiene = subject && fichasPorTema ? (fichasPorTema[subject.title] ?? 0) : null;
  const sinDocumentos = subject !== null && subject.docCount === 0;

  async function generar() {
    if (!subject) return;
    setCorriendo(true);
    setResultado(null);
    const res = que === 'fichas'
      ? await seedFlashcardBank({ subjectId: subject.id, topic: subject.title, count: cuantas })
      : await seedQuestionBank({ subjectId: subject.id, topic: subject.title, count: cuantas, autoApprove });
    setResultado(res);
    setCorriendo(false);
    if (que === 'fichas') recargarFichas();
  }

  return (
    <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
      <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-sm flex items-center gap-2">
        <Sparkles size={16} className="text-indigo-500" /> Generar
      </h3>

      {/* 1 · QUÉ. Lo primero que se decide, y antes era lo último. */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
        {(['preguntas', 'fichas'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => { setQue(k); setCuantas(k === 'fichas' ? 15 : 20); setResultado(null); }}
            aria-pressed={que === k}
            className={cx(
              'min-h-[44px] rounded-lg font-black uppercase tracking-wider text-xs transition-colors',
              que === k ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-slate-400',
            )}
          >
            {k === 'preguntas' ? 'Preguntas' : 'Fichas'}
          </button>
        ))}
      </div>

      {/* 2 · DE QUÉ TEMA. */}
      <div>
        <label htmlFor="gen-tema" className="block text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
          De qué tema
        </label>
        <select
          id="gen-tema"
          value={subject?.id ?? ''}
          onChange={(e) => setSubject(temas.find((t) => t.id === Number(e.target.value)) ?? null)}
          disabled={corriendo}
          className="w-full min-h-[44px] px-3 bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 rounded-xl text-base sm:text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-500"
        >
          <option value="">Elige un tema…</option>
          {temas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.number}. {t.title.slice(0, 44)}{t.docCount === 0 ? ' — sin PDF' : ''}
            </option>
          ))}
        </select>
        {que === 'fichas' && subject && (
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {yaTiene === null ? 'contando…' : `Ya tiene ${yaTiene} ficha${yaTiene === 1 ? '' : 's'} en el banco.`}
          </p>
        )}
        {sinDocumentos && (
          /* Sin PDF indexado no se puede generar nada, y decirlo AQUÍ evita una
             llamada de pago que iba a fallar. */
          <p className="mt-1.5 text-xs font-bold text-amber-700 dark:text-amber-400">
            Ese tema no tiene ningún PDF indexado: sube uno antes.
          </p>
        )}
      </div>

      {/* 3 · CUÁNTAS. */}
      <div className="flex items-end gap-3">
        <div className="shrink-0">
          <label htmlFor="gen-cuantas" className="block text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
            Cuántas
          </label>
          <input
            id="gen-cuantas"
            type="number"
            min={1}
            max={que === 'fichas' ? 100 : 200}
            value={cuantas}
            /* `enteroEnRango` devuelve `null` con el campo vacío, y ahí se
               conserva lo que había: `Number('')` sería 0, y «generar 0» no
               significa nada (regla 16). */
            onChange={(e) => setCuantas(
              enteroEnRango(e.target.value, { min: 1, max: que === 'fichas' ? 100 : 200 }) ?? cuantas,
            )}
            disabled={corriendo}
            className="w-24 min-h-[44px] px-3 bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 rounded-xl text-base sm:text-sm text-center font-black text-slate-900 dark:text-white outline-none focus:border-indigo-500"
          />
        </div>

        <button
          type="button"
          onClick={generar}
          disabled={!subject || corriendo || sinDocumentos}
          className="flex-1 min-h-[52px] bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-wider text-sm rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {corriendo ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
          {corriendo ? 'Generando…' : `Generar ${cuantas}`}
        </button>
      </div>

      {/* Sólo para preguntas: al banco o a revisar. Las fichas no pasan por
          moderación, así que enseñar aquí el interruptor sería mentir. */}
      {que === 'preguntas' && (
        <button
          type="button"
          onClick={() => setAutoApprove(!autoApprove)}
          className="flex items-center gap-2 min-h-[44px] text-xs font-bold"
        >
          <span className={cx('w-10 h-6 rounded-full transition-colors relative shrink-0', autoApprove ? 'bg-emerald-600' : 'bg-amber-600')}>
            <span className={cx('absolute top-1 w-4 h-4 bg-white rounded-full transition-all', autoApprove ? 'left-5' : 'left-1')} />
          </span>
          <span className={autoApprove ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}>
            {autoApprove ? 'Directas al banco' : 'A moderación primero'}
          </span>
        </button>
      )}

      {resultado && (
        <div className={cx(
          'p-3 border-2 text-xs font-bold rounded-xl',
          resultado.success
            ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300'
            : 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300',
        )}>
          {resultado.success
            ? `${resultado.inserted} nuevas · ${resultado.duplicated} repetidas · ${resultado.failed} fallidas (de ${resultado.requested} pedidas)`
            : `No se pudo: ${resultado.error ?? 'error desconocido'}`}
        </div>
      )}
    </div>
  );
}

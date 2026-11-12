'use client';

import { useState, useEffect } from 'react';
import { Loader2, Save, Plus, Copy, Trash2, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
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
  DIFFICULTY_LABEL,
  origenDeDificultad,
  type DifficultyLevel,
  type QuestionStatus,
  type AdminBankRow,
} from '@/app/lib/questions';
import type { SyllabusSubject } from '@/app/actions/admin';
import QuestionComposer from './QuestionComposer';
import { PanelTitulo, Aviso, Boton, Campo, CampoSelect, Etiqueta, Dato, TablaDual, PanelLateral, EmptyState, TEXT, type Tono } from '../../ui';
import EditorPregunta from './EditorPregunta';
import FamiliasRepetidas from './FamiliasRepetidas';

// El estado de una pregunta, con el color de su significado: activa verde,
// candidata ámbar (los alumnos aún no la reciben), descartada gris.
const STATUS_TONO: Record<QuestionStatus, Tono> = {
  [QUESTION_STATUS.ACTIVE]: 'ok',
  [QUESTION_STATUS.CANDIDATE]: 'aviso',
  [QUESTION_STATUS.DISABLED]: 'apagado',
};

export default function AdminBank({ esSuperadmin }: { esSuperadmin: boolean }) {
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
  // Regla 78: antes el banco global y el privado de la academia se veían
  // mezclados sin forma de auditar aparte lo que la propia academia ha subido.
  const [origenFilter, setOrigenFilter] = useState<'all' | 'global' | 'propia'>('all');
  // Para revisar por niveles: sobre todo las «difíciles», que son las que más
  // se discuten y las que más pesan al filtrar un examen.
  const [dificultadFilter, setDificultadFilter] = useState<DifficultyLevel | 'all'>('all');
  const [bulkRunning, setBulkRunning] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  // Alta manual (P2): hasta ahora solo se podian EDITAR las que ya existian.
  const [componiendo, setComponiendo] = useState(false);
  // Preguntas repetidas (regla 119): solo el superadmin, que es quien puede descartar del banco global.
  const [verRepetidas, setVerRepetidas] = useState(false);
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
  // La dificultad se edita aparte del formulario de la pregunta: es de otra
  // naturaleza (no es contenido) y solo se manda si el preparador la cambia.
  const [editNivel, setEditNivel] = useState<DifficultyLevel>(DIFFICULTY.medium);
  const [saving, setSaving] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);

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
  }, [selectedSubject, searchTerm, statusFilter, origenFilter, dificultadFilter]);

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
        origen: origenFilter,
        dificultad: dificultadFilter,
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
          setEditingQ(null);
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
   * Vacía el banco de un golpe: pasa a `disabled` todas las preguntas activas
   * o candidatas que haya, sin importar el filtro que se esté viendo. No
   * borra filas (regla 3): `question_attempts` y compañía las referencian.
   *
   * Nunca "todo, de todas las academias" (regla 75): un admin normal solo
   * vacía SU banco privado — el global, que también ve aquí, no se toca —;
   * el superadmin, el GLOBAL. `discardAllQuestions` ya lo acota en el
   * servidor; el texto de confirmación tiene que decir lo que de verdad va
   * a pasar, no una versión que asuste más de la cuenta.
   */
  async function handleDiscardAll() {
      const alcance = esSuperadmin
        ? 'TODAS las preguntas del banco GLOBAL (activas y candidatas)'
        : 'TODAS las preguntas de TU banco privado (activas y candidatas) — el banco global, que también ves aquí, no se toca';
      const escrito = window.prompt(
          `Vas a descartar ${alcance}, no solo las de este filtro.\n` +
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
      setErrorGuardar(null);
      setEditNivel(([1, 2, 3] as number[]).includes(q.difficulty_level ?? 0) ? (q.difficulty_level as DifficultyLevel) : DIFFICULTY.medium);
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
      setErrorGuardar(null);
      // El nivel solo viaja si lo ha cambiado: guardar el texto de una pregunta
      // no puede convertir en «puesta por un preparador» una dificultad que
      // en realidad era la estimada.
      const nivelCambiado = editNivel !== editingQ.difficulty_level;
      const res = await updateQuestion(editingQ.id, nivelCambiado ? { ...editForm, difficulty_level: editNivel } : editForm);
      if(res.success) {
          setQuestions(prev => prev.map(q => q.id === editingQ.id
              ? { ...q, ...editForm, ...(nivelCambiado ? { difficulty_level: editNivel, difficulty_source: 'preparador' } : {}) }
              : q));
          setEditingQ(null);
      } else {
          // Antes un fallo al guardar no decía nada y el panel se quedaba como si hubiera ido bien.
          setErrorGuardar(res.error ?? 'No se pudo guardar.');
      }
      setSaving(false);
  }

  if (verRepetidas && esSuperadmin) {
    return <FamiliasRepetidas onVolver={() => { setVerRepetidas(false); loadQuestions(stats.page); }} />;
  }

  return (
    <div className="space-y-5 animate-in fade-in pb-24">
      <PanelTitulo
        titulo="Banco oficial"
        sub={`${stats.total} ${statusFilter === 'all' ? 'preguntas' : QUESTION_STATUS_LABEL[statusFilter].toLowerCase()} · las que se sirven a los alumnos`}
        acciones={
          /* Nueva pregunta a mano (P2) */
          <div className="flex flex-wrap gap-2">
            {esSuperadmin && <Boton variant="secondary" onClick={() => setVerRepetidas(true)}>Preguntas repetidas</Boton>}
            <Boton icon={<Plus size={15} />} onClick={() => setComponiendo(true)}>Nueva pregunta</Boton>
          </div>
        }
      />

      {/* --- FILTROS --- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Campo
          type="search"
          aria-label="Buscar por contenido"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por contenido"
        />
        <CampoSelect aria-label="Estado" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as QuestionStatus | 'all')}>
          <option value="all">Todos los estados</option>
          {QUESTION_STATUSES.map((st) => (
            <option key={st} value={st}>{QUESTION_STATUS_LABEL[st]}</option>
          ))}
        </CampoSelect>
        {/* Regla 78: sin esto, una pregunta subida por la propia academia se
            perdía mezclada con las 1.795+ del banco global, sin forma de
            aislarla para auditarla. */}
        <CampoSelect aria-label="Origen" value={origenFilter} onChange={(e) => setOrigenFilter(e.target.value as 'all' | 'global' | 'propia')}>
          <option value="all">Global + propias</option>
          <option value="global">Solo banco global</option>
          <option value="propia">{esSuperadmin ? 'Solo privadas (cualquier academia)' : 'Solo las de tu academia'}</option>
        </CampoSelect>
        <CampoSelect aria-label="Dificultad" value={dificultadFilter} onChange={(e) => setDificultadFilter(e.target.value === 'all' ? 'all' : (Number(e.target.value) as DifficultyLevel))}>
          <option value="all">Toda dificultad</option>
          {([1, 2, 3] as const).map((n) => <option key={n} value={n}>{DIFFICULTY_LABEL[n]}</option>)}
        </CampoSelect>
        <CampoSelect aria-label="Tema" value={selectedSubject || ''} onChange={(e) => setSelectedSubject(e.target.value ? Number(e.target.value) : undefined)}>
          <option value="">Todos los temas</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>Tema {s.number}: {s.title.substring(0, 25)}...</option>
          ))}
        </CampoSelect>
      </div>

      {/* --- APROBACIÓN EN LOTE --- */}
      {!loading && visibleCandidates.length > 0 && (
        <Aviso>
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <p><b>{visibleCandidates.length}</b> preguntas pendientes en esta página. Los alumnos no las reciben hasta que se publiquen.</p>
            <Boton size="sm" disabled={bulkRunning} onClick={handleApproveVisible} icon={bulkRunning ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}>
              Publicar las {visibleCandidates.length}
            </Boton>
          </div>
        </Aviso>
      )}

      {/* --- LAS PREGUNTAS --- */}
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-600 dark:text-slate-400">
          <Loader2 size={26} className="animate-spin" />
          <p className="font-mono text-xs uppercase tracking-widest">Cargando el banco…</p>
        </div>
      ) : questions.length === 0 ? (
        <EmptyState icon={<CheckCircle2 size={36} />} title="No hay preguntas que coincidan." hint="Prueba a generar más en «Temario & IA»." bordered />
      ) : (
        <TablaDual
          clave={(q) => q.id}
          filas={questions}
          onFila={openEditor}
          columnas={[
            { id: 'pregunta', titulo: 'Pregunta', celda: (q) => (
              <p className="line-clamp-2 max-w-[34rem] font-medium leading-snug text-slate-900 dark:text-slate-100">
                {q.question_text}
                {/* La columna se llama `difficulty_level`, no `difficulty`. Con el estado en `any` esto era siempre undefined y el distintivo no salió nunca. */}
              </p>
            ) },
            { id: 'dificultad', titulo: 'Dificultad', celda: (q) => {
              const n = q.difficulty_level;
              if (n !== 1 && n !== 2 && n !== 3) return <Dato>—</Dato>;
              // Sin origen es el 2 que se sembró por defecto: no es «Media», es «sin clasificar».
              if (!q.difficulty_source) return <Dato>Sin clasificar</Dato>;
              return <Etiqueta tono={n === 1 ? 'ok' : n === 3 ? 'malo' : 'aviso'}>{DIFFICULTY_LABEL[n]}</Etiqueta>;
            } },
            { id: 'tema', titulo: 'Tema', celda: (q) => <Dato>Tema {q.subjects?.topic_number ?? '—'}</Dato> },
            { id: 'estado', titulo: 'Estado', celda: (q) => <Etiqueta tono={STATUS_TONO[q.status as QuestionStatus] ?? 'apagado'}>{QUESTION_STATUS_LABEL[q.status as QuestionStatus] ?? q.status}</Etiqueta> },
            // Regla 78: de dónde viene la pregunta — antes no se veía, mezclada con el resto de la lista.
            { id: 'origen', titulo: 'Origen', soloAncho: true, celda: (q) => <span className="text-[13px]">{q.academyName ?? 'Banco global'}</span> },
            { id: 'acciones', titulo: '', acciones: true, derecha: true, celda: (q) => (
              <span className="inline-flex gap-2" onClick={(e) => e.stopPropagation()}>
                <Boton size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(q.id)} title="Copiar ID" aria-label="Copiar ID" icon={<Copy size={14} />} />
                <Boton size="sm" variant="secondary" onClick={() => openEditor(q)}>Editar</Boton>
              </span>
            ) },
          ]}
        />
      )}

      {/* --- PAGINACIÓN --- */}
      {stats.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Boton variant="secondary" size="sm" icon={<ChevronLeft size={16} />} disabled={stats.page === 1}
            onClick={() => { loadQuestions(stats.page - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Anterior</Boton>
          <span className="font-mono text-sm tabular-nums text-slate-700 dark:text-slate-300">{stats.page} / {stats.totalPages}</span>
          <Boton variant="secondary" size="sm" iconRight={<ChevronRight size={16} />} disabled={stats.page === stats.totalPages}
            onClick={() => { loadQuestions(stats.page + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Siguiente</Boton>
        </div>
      )}

      {/* --- VACIAR EL BANCO ---

          AL FINAL, Y APARTE, Y PLEGADO. Estaba pegado a "Nueva", del mismo
          tamaño y con la misma forma: en un móvil, doce píxeles separaban el
          botón de CREAR una pregunta del que DESCARTA TODAS. Es la regla 26 del
          proyecto —una acción irreversible no comparte sitio, color ni tamaño
          con la que se repite— y es la acción más destructiva de la plataforma.

          Sigue estando a un toque de distancia, con su confirmación escrita
          («BORRAR»), pero al final de la pantalla y en la zona de peligro:
          donde no se llega sin querer. */}
      <details className="rounded-lg border border-red-300 bg-red-50/60 p-4 dark:border-red-500/40 dark:bg-red-500/5">
        <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-semibold text-red-700 dark:text-red-300">Zona de peligro</summary>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
          <p className="flex-1 text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
            Descarta <strong>todas</strong> las preguntas del banco, sin importar el filtro. Dejan de servirse a los alumnos; no se borran de la base de datos.
            No se puede deshacer desde este panel.
          </p>
          <Boton
            variant="danger"
            onClick={handleDiscardAll}
            disabled={clearingAll}
            title={esSuperadmin
              ? 'Descarta TODAS las preguntas del banco global, sin importar el filtro'
              : 'Descarta TODAS las preguntas de tu banco privado, sin importar el filtro (el banco global no se toca)'}
            icon={clearingAll ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
          >
            Vaciar banco
          </Boton>
        </div>
      </details>

      {/* --- ALTA MANUAL / IMPORTACIÓN (P2) --- */}
      {componiendo && (
        <QuestionComposer
          subjects={subjects}
          onClose={() => setComponiendo(false)}
          // Se recarga la página actual para que lo recién publicado aparezca
          // en la lista sin cerrar el panel.
          onCreated={() => loadQuestions(stats.page)}
        />
      )}

      {/* --- EDITOR DE UNA PREGUNTA: un panel lateral, no un diálogo ---
          «Descartar del banco» vive aquí y no en cada fila: estaba a un toque
          de «Editar», y descartar es lo único que no se deshace desde el panel. */}
      {editingQ && (
        <PanelLateral titulo="Editar pregunta" sub={`ID ${editingQ.id.substring(0, 8)}`} onCerrar={() => setEditingQ(null)}>
          <EditorPregunta form={editForm} onChange={setEditForm} />
          <div>
            <CampoSelect label="Dificultad" value={editNivel} onChange={(e) => setEditNivel(Number(e.target.value) as DifficultyLevel)}>
              {([1, 2, 3] as const).map((n) => <option key={n} value={n}>{DIFFICULTY_LABEL[n]}</option>)}
            </CampoSelect>
            <p className={`${TEXT.muted} mt-1.5`}>{origenDeDificultad(editingQ.difficulty_source)}. Si la cambias, queda como puesta por ti y la IA no la vuelve a tocar.</p>
          </div>
          {errorGuardar && <Aviso tono="malo"><p>{errorGuardar}</p></Aviso>}
          <div className="flex flex-wrap gap-2">
            <Boton onClick={handleSaveEdit} disabled={saving} icon={saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Boton>
            <Boton variant="ghost" onClick={() => setEditingQ(null)}>Cerrar</Boton>
          </div>
          <div className="border-t border-linea pt-4 dark:border-noche-linea">
            <Boton variant="danger" disabled={editingQ.status === QUESTION_STATUS.DISABLED || isDeleting === editingQ.id} onClick={() => handleDisable(editingQ.id)}
              icon={isDeleting === editingQ.id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}>
              Descartar del banco
            </Boton>
            <p className={`${TEXT.muted} mt-2`}>Deja de aparecer en los exámenes. No se borra: queda marcada como descartada.</p>
          </div>
        </PanelLateral>
      )}
    </div>
  );
}

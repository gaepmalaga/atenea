'use client';
import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Pencil, Save, Loader2, ShieldAlert } from 'lucide-react';
import { PanelTitulo, Pestanas, Hoja, Etiqueta, Boton, PanelLateral, EmptyState, cx, type Tono } from '../../ui';
import EditorPregunta from './EditorPregunta';

import { 
  getModerationQueue, 
  approveQuestion, 
  disableQuestion, 
  resolveReport,
  updateQuestion 
} from '@/actions';
import type { ModerationCandidate, ModerationQueue, ModerationReport } from '@/app/lib/questions';
import { avisar, confirmar } from '@/app/lib/dialogos';

// Cómo se pinta cada tipo de queja. El color es el del estado: rojo la que
// invalida la pregunta, ámbar la que la deja dudosa, gris lo menor.
const REPORT_BADGES: Record<string, { label: string; tono: Tono }> = {
  wrong_correct_answer: { label: 'Respuesta errónea', tono: 'malo' },
  ambiguous_question: { label: 'Ambigua', tono: 'aviso' },
  bad_explanation: { label: 'Mala explicación', tono: 'aviso' },
  out_of_syllabus: { label: 'Fuera de temario', tono: 'oro' },
  typo_or_format: { label: 'Errata o formato', tono: 'apagado' },
  source_mismatch: { label: 'Fuente incorrecta', tono: 'oro' },
  other: { label: 'Otro', tono: 'apagado' },
};

export default function AdminModeration() {
  const [queue, setQueue] = useState<ModerationQueue>({ candidates: [], reports: [] });
  const [loading, setLoading] = useState(true);

  // --- ESTADOS PARA EL MODAL DE EDICIÓN ---
  const [editingQ, setEditingQ] = useState<ModerationCandidate | null>(null);
  // Guardamos el contexto del reporte si venimos de uno (para mostrar la queja en el editor)
  const [reportContext, setReportContext] = useState<ModerationReport | null>(null);
  
  const [editForm, setEditForm] = useState({
    question_text: '',
    options: ['', '', ''],
    correct_index: 0,
    explanation: ''
  });
  const [saving, setSaving] = useState(false);
  const [pestana, setPestana] = useState<'quejas' | 'aprobar' | null>(null);

  // Sin `setLoading(true)` dentro: `loading` ya arranca en true y un setState
  // sincrono en un efecto dispara un render en cascada. El de abajo va
  // despues del await.
  const load = useCallback(async () => {
    const res = await getModerationQueue();
    if (res.success) setQueue(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // --- ACCIONES RÁPIDAS ---
  async function handleApprove(id: string) {
      // Optimistic UI update
      setQueue((prev) => ({ ...prev, candidates: prev.candidates.filter((q) => q.id !== id) }));
      await approveQuestion(id);
  }

  async function handleDisable(id: string, isReport = false) {
      if(!(await confirmar("¿Confirmas que esta pregunta no tiene salvación y debe ser DESACTIVADA?"))) return;
      
      // Optimistic remove
      if (isReport) {
         setQueue((prev) => ({ ...prev, reports: prev.reports.filter((r) => r.question_id !== id) }));
      } else {
         setQueue((prev) => ({ ...prev, candidates: prev.candidates.filter((q) => q.id !== id) }));
      }

      await disableQuestion(id);
      if (isReport) load(); // Recargar para limpiar cascada si es necesario
  }
  
  async function handleResolveReport(reportId: string) {
      setQueue((prev) => ({ ...prev, reports: prev.reports.filter((r) => r.id !== reportId) }));
      await resolveReport(reportId);
  }

  // --- LÓGICA DE EDICIÓN ---
  function openEditor(q: ModerationCandidate | null | undefined, reportData: ModerationReport | null = null) {
    if (!q) return void avisar("Error: No se han cargado los datos de la pregunta. Revisa actions.ts");
    
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
        setQueue((prev) => ({
            candidates: prev.candidates.map((q) =>
                q.id === editingQ.id ? { ...q, ...editForm } : q
            ),
            reports: prev.reports.map((r) =>
                r.question_id === editingQ.id
                  ? { ...r, question: { ...r.question, ...editForm } as ModerationCandidate }
                  : r
            )
        }));
        
        setEditingQ(null);
        setReportContext(null);
    } else {
        void avisar("Error al guardar: " + res.error);
    }
    setSaving(false);
  }

  if (loading) return <div className="p-20 text-center"><Loader2 className="mx-auto mb-4 animate-spin text-indigo-700 dark:text-indigo-300" /> <p className="font-mono text-sm text-slate-600 dark:text-slate-400">Cargando cola de moderación…</p></div>;

  // Se abre en la cola que tenga algo: las quejas primero, que son lo urgente.
  const activa = pestana ?? (queue.reports.length > 0 || queue.candidates.length === 0 ? 'quejas' : 'aprobar');

  return (
    <div className="space-y-5 pb-20">
      <PanelTitulo titulo="Moderación" sub="Quejas de los alumnos y preguntas candidatas." />

      <Pestanas
        etiqueta="Colas de moderación"
        activa={activa}
        onCambia={setPestana}
        items={[
          { id: 'quejas', etiqueta: 'Requieren atención', cuenta: queue.reports.length },
          { id: 'aprobar', etiqueta: 'Pendientes de aprobación', cuenta: queue.candidates.length },
        ]}
      />

      {/* === QUEJAS DE LOS ALUMNOS === */}
      {activa === 'quejas' && (
        queue.reports.length === 0 ? (
          <EmptyState icon={<ShieldAlert size={36} />} title="Todo tranquilo. Sin quejas." bordered />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {queue.reports.map((r) => {
              // `report_type` puede llegar nulo o con un valor que ya no está en
              // el mapa: sin el respaldo, `badge` sería undefined y la tarjeta
              // reventaría al leer `badge.label`.
              const badge = REPORT_BADGES[r.report_type ?? ''] ?? REPORT_BADGES.other;
              return (
                <Hoja key={r.id} pad="md" className="space-y-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <Etiqueta tono={badge.tono}>{badge.label}</Etiqueta>
                    <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">ID: {r.id.split('-')[0]}</span>
                  </div>

                  <p className="line-clamp-3 text-sm font-medium leading-relaxed text-slate-900 dark:text-slate-100">“{r.question?.question_text || 'Pregunta no encontrada'}”</p>

                  {/* El comentario del alumno es lo primero que hay que leer: va con la línea dorada. */}
                  <div className="border-l-[3px] border-oro py-1 pl-3 text-[13.5px]">
                    <small className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Lo que dijo el alumno</small>
                    <p className="text-slate-900 dark:text-slate-100">{r.message}</p>
                  </div>

                  {/* Las tres acciones, siempre en el mismo orden: corregir,
                      archivar, descartar. Las etiquetas dicen lo que hacen:
                      archivar la queja no toca la pregunta; descartar sí, y
                      es lo único irreversible de la fila. */}
                  <div className="flex flex-wrap gap-2">
                    <Boton size="sm" icon={<Pencil size={14} />} onClick={() => openEditor(r.question, r)} title="Editar y corregir la pregunta">Editar y corregir</Boton>
                    <Boton size="sm" variant="secondary" icon={<CheckCircle2 size={14} />} onClick={() => handleResolveReport(r.id)} title="Archivar la queja sin tocar la pregunta">Archivar la queja</Boton>
                    <Boton size="sm" variant="danger" disabled={!r.question_id} onClick={() => r.question_id && handleDisable(r.question_id, true)} title="Descartar la pregunta del banco">Descartar la pregunta</Boton>
                  </div>
                </Hoja>
              );
            })}
          </div>
        )
      )}

      {/* === CANDIDATAS POR APROBAR === */}
      {activa === 'aprobar' && (
        queue.candidates.length === 0 ? (
          <EmptyState icon={<CheckCircle2 size={36} />} title="Bandeja de entrada limpia." bordered />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {queue.candidates.map((q) => (
              <Hoja key={q.id} pad="md" className="space-y-3.5">
                <div className="flex items-start justify-between gap-3">
                  {/* Sin tema, sin insignia. `topic` es `subject?.title ?? null`:
                      una pregunta puede no tener tema resuelto, y entonces se
                      pintaba una pastilla VACÍA, que es peor que no pintar
                      nada — parece un dato que no se ha cargado (regla 8). */}
                  {q.topic ? <Etiqueta tono="neutro">{q.topic}</Etiqueta> : <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Sin tema</span>}
                  <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">{q.created_at ? new Date(q.created_at).toLocaleDateString() : '—'}</span>
                </div>

                <p className="text-sm font-medium leading-relaxed text-slate-900 dark:text-slate-100">{q.question_text}</p>

                {/* `options` es jsonb: puede no ser un array. Sin esta guarda,
                    una fila corrupta tumba el panel entero. */}
                <div className="space-y-1.5">
                  {(Array.isArray(q.options) ? q.options : []).map((opt: string, i: number) => (
                    <div
                      key={i}
                      className={cx(
                        'flex items-center gap-2 rounded-lg px-3 py-2 text-[13px]',
                        i === q.correct_index
                          ? 'bg-emerald-100 font-medium text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200'
                          : 'bg-hundido text-slate-700 dark:bg-noche-hondo dark:text-slate-300',
                      )}
                    >
                      <b className="font-titulo text-base">{'ABC'[i]}</b> {opt}
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2 border-t border-linea dark:border-noche-linea pt-3.5">
                  <Boton size="sm" icon={<CheckCircle2 size={14} />} onClick={() => handleApprove(q.id)}>Aprobar</Boton>
                  <Boton size="sm" variant="secondary" icon={<Pencil size={14} />} onClick={() => openEditor(q)}>Editar</Boton>
                  <Boton size="sm" variant="danger" onClick={() => handleDisable(q.id)}>Descartar</Boton>
                </div>
              </Hoja>
            ))}
          </div>
        )
      )}

      {/* === EDITOR DE LA PREGUNTA: un panel lateral, no un diálogo === */}
      {editingQ && (
        <PanelLateral
          titulo="Editar la pregunta"
          sub={reportContext ? 'Vienes de una queja de un alumno' : editingQ.topic ?? undefined}
          onCerrar={() => { setEditingQ(null); setReportContext(null); }}
        >
          <EditorPregunta form={editForm} onChange={setEditForm} quejaDelAlumno={reportContext?.message ?? null} />
          <div className="flex flex-wrap gap-2">
            <Boton onClick={saveChanges} disabled={saving} icon={saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Boton>
            <Boton variant="ghost" onClick={() => { setEditingQ(null); setReportContext(null); }}>Cancelar</Boton>
          </div>
        </PanelLateral>
      )}
    </div>
  );
}

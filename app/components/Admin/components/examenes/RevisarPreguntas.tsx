'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2, Loader2, Save } from 'lucide-react';
import { updateQuestion, crearPreguntaDeExamen } from '@/actions';
import type { SyllabusBlock } from '@/app/actions/admin';
import { Aviso, Boton, CampoSelect, Etiqueta, BloqueTitulo } from '../../../ui';
import EditorPregunta, { type FormPregunta } from '../EditorPregunta';
import HistorialPregunta from '../HistorialPregunta';
import { etiquetasQueFaltan, textoFaltan } from '@/app/lib/preguntas-edicion';

export type PreguntaExamen = {
  id: string; enunciado: string; opciones: string[]; correcta: number; tema: string;
  dificultad: number | null; explicacion: string | null; pendiente: boolean;
};

const LETRAS = ['A', 'B', 'C'];
const MAX = 100;
const VACIA: FormPregunta = { question_text: '', options: ['', '', ''], correct_index: 0, explanation: '' };


/**
 * REVISAR Y CORREGIR LAS PREGUNTAS ANTES DE IMPRIMIR (regla 135).
 *
 * Se ve el examen tal como saldrá. Una pregunta se puede corregir aquí mismo y
 * la corrección SOBRESCRIBE la del banco —la ven todos los alumnos—, con su
 * historial para volver atrás. Se puede quitar una pregunta del examen (no se
 * borra del banco) y escribir otra nueva: entra al banco como PENDIENTE, sin
 * explicación ni dificultad, y no se sirve a los alumnos hasta que se completa.
 */
export default function RevisarPreguntas({
  preguntas, onCambia, bloques,
}: { preguntas: PreguntaExamen[]; onCambia: (p: PreguntaExamen[]) => void; bloques: SyllabusBlock[] }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<FormPregunta>(VACIA);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [añadiendo, setAñadiendo] = useState(false);
  const [formNueva, setFormNueva] = useState<FormPregunta>(VACIA);
  const [temaNueva, setTemaNueva] = useState<number | ''>('');

  const pendientes = preguntas.filter((p) => p.pendiente).length;

  function abreEdicion(p: PreguntaExamen) {
    setError(null);
    setEditando(p.id);
    setForm({ question_text: p.enunciado, options: [...p.opciones], correct_index: p.correcta, explanation: p.explicacion ?? '' });
  }

  async function guardaEdicion(p: PreguntaExamen) {
    setGuardando(true);
    setError(null);
    const res = await updateQuestion(p.id, form, 'examen_papel');
    setGuardando(false);
    if (!res.success) { setError(res.error ?? 'No se ha podido guardar.'); return; }
    onCambia(preguntas.map((q) => q.id === p.id
      ? { ...q, enunciado: form.question_text.trim(), opciones: form.options.map((o) => o.trim()), correcta: form.correct_index, explicacion: form.explanation.trim() || null }
      : q));
    setEditando(null);
  }

  async function añade() {
    if (temaNueva === '') { setError('Elige el tema de la pregunta nueva.'); return; }
    setGuardando(true);
    setError(null);
    const res = await crearPreguntaDeExamen({
      subjectId: temaNueva, question: formNueva.question_text, options: formNueva.options, correctIndex: formNueva.correct_index,
    });
    setGuardando(false);
    if (!res.success) { setError(res.error); return; }
    if (preguntas.some((q) => q.id === res.pregunta.id)) { setError('Esa pregunta ya está en el examen.'); return; }
    onCambia([...preguntas, res.pregunta]);
    setAñadiendo(false);
    setFormNueva(VACIA);
  }

  return (
    <div className="space-y-4">
      <BloqueTitulo icon={<Pencil size={15} />}>2 · Revisar las preguntas</BloqueTitulo>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Corrige lo que haga falta antes de imprimir. <b>Lo que cambies aquí se cambia también en el banco</b>, y lo verán los alumnos; queda anotado y se puede deshacer.
      </p>

      {pendientes > 0 && (
        <Aviso tono="info">
          {pendientes === 1 ? 'Hay 1 pregunta nueva' : `Hay ${pendientes} preguntas nuevas`} en este examen. Salen en el papel, pero en la plataforma quedan pendientes en «Banco oficial» hasta que tengan explicación y dificultad: no se sirven a ningún alumno antes.
        </Aviso>
      )}
      {error && <Aviso tono="malo">{error}</Aviso>}

      <ol className="space-y-2">
        {preguntas.map((p, i) => (
          <li key={p.id} className="rounded-lg border border-linea p-3 dark:border-noche-linea">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 w-7 shrink-0 text-right font-titulo text-sm font-bold tabular-nums text-slate-600 dark:text-slate-400">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold text-slate-900 dark:text-white">{p.enunciado}</p>
                <ul className="mt-1 space-y-0.5 text-sm text-slate-700 dark:text-slate-300">
                  {p.opciones.map((o, k) => (
                    <li key={k} className={k === p.correcta ? 'font-semibold text-emerald-800 dark:text-emerald-300' : ''}>
                      <b>{LETRAS[k]})</b> {o}{k === p.correcta ? ' ✓' : ''}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {p.pendiente && <Etiqueta tono="aviso">Pendiente</Etiqueta>}
                  {p.pendiente && <span className="text-xs text-amber-800 dark:text-amber-300">{textoFaltan(etiquetasQueFaltan({ explanation: p.explicacion, difficulty_level: p.dificultad }))}</span>}
                  <span className="min-w-0 max-w-full truncate text-xs text-slate-600 dark:text-slate-400">{p.tema}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                <Boton variant="secondary" onClick={() => (editando === p.id ? setEditando(null) : abreEdicion(p))} icon={<Pencil size={14} />}>{editando === p.id ? 'Cerrar' : 'Editar'}</Boton>
                <Boton variant="ghost" onClick={() => onCambia(preguntas.filter((q) => q.id !== p.id))} icon={<Trash2 size={14} />} aria-label={`Quitar la pregunta ${i + 1} del examen`}>Quitar</Boton>
              </div>
            </div>

            {editando === p.id && (
              <div className="mt-3 space-y-3 border-t border-linea pt-3 dark:border-noche-linea">
                <EditorPregunta form={form} onChange={setForm} />
                <div className="flex flex-wrap gap-2">
                  <Boton onClick={() => guardaEdicion(p)} disabled={guardando} icon={guardando ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}>
                    {guardando ? 'Guardando…' : 'Guardar en el banco'}
                  </Boton>
                </div>
                <HistorialPregunta
                  preguntaId={p.id}
                  onError={setError}
                  onRestaurada={(c) => {
                    onCambia(preguntas.map((q) => q.id === p.id
                      ? { ...q, enunciado: c.question_text, opciones: c.options, correcta: c.correct_index, explicacion: c.explanation }
                      : q));
                    setEditando(null);
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ol>

      {!añadiendo ? (
        <div className="space-y-1.5">
          <Boton variant="secondary" onClick={() => { setAñadiendo(true); setError(null); }} disabled={preguntas.length >= MAX} icon={<Plus size={15} />}>
            Añadir una pregunta nueva
          </Boton>
          {preguntas.length >= MAX && <p className="text-sm text-slate-600 dark:text-slate-400">El examen ya tiene {MAX} preguntas, que es lo que cabe en la hoja: quita una para poder añadir otra.</p>}
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-linea p-4 dark:border-noche-linea">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Pregunta nueva</p>
          <CampoSelect label="Tema" value={temaNueva} onChange={(e) => setTemaNueva(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Elige el tema…</option>
            {bloques.flatMap((b) => b.subjects).map((t) => <option key={t.id} value={t.id}>{t.number}. {t.title}</option>)}
          </CampoSelect>
          <EditorPregunta form={formNueva} onChange={setFormNueva} sinExplicacion />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Para el papel basta con esto. En la plataforma quedará <b>pendiente</b> en «Banco oficial» hasta que tenga explicación y dificultad; mientras tanto no la verá ningún alumno.
          </p>
          <div className="flex flex-wrap gap-2">
            <Boton onClick={añade} disabled={guardando} icon={guardando ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}>{guardando ? 'Añadiendo…' : 'Añadir al examen'}</Boton>
            <Boton variant="ghost" onClick={() => { setAñadiendo(false); setFormNueva(VACIA); }}>Cancelar</Boton>
          </div>
        </div>
      )}
    </div>
  );
}

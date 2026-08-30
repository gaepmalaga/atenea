'use client';

import { useEffect, useState } from 'react';
import { NotebookPen, Loader2, Check } from 'lucide-react';
import { getQuestionNote, saveQuestionNote } from '@/actions';
import { MAX_NOTE_CHARS, normalizeNote } from '@/app/lib/notes';

/**
 * La nota privada del alumno sobre una pregunta (P3.8).
 *
 * Se monta donde el alumno ya está mirando el fallo —el feedback del
 * entrenamiento y la pantalla de repaso—, no en una sección aparte: una nota
 * que hay que ir a buscar a otro sitio no se escribe.
 *
 * Carga la nota existente al montarse, que es la mitad de la funcionalidad:
 * lo que se pedía era un campo suyo **que reaparezca cuando le vuelva a
 * salir** la pregunta.
 */
export default function QuestionNote({ questionId }: { questionId: string | null }) {
  const [texto, setTexto] = useState('');
  const [guardado, setGuardado] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Una pregunta generada en vivo puede no tener fila en el banco, y sin id no
  // hay a qué colgar la nota.
  const activo = !!questionId;

  useEffect(() => {
    let vivo = true;
    if (!questionId) {
      setCargando(false);
      return;
    }
    setCargando(true);
    getQuestionNote(questionId).then((res) => {
      if (!vivo) return;
      if (res.success) {
        setTexto(res.note ?? '');
        setGuardado(res.note ?? '');
      } else {
        setError(res.error ?? 'No se pudo cargar la nota.');
      }
      setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, [questionId]);

  const sucio = normalizeNote(texto) !== normalizeNote(guardado);

  async function guarda() {
    if (!questionId || !sucio) return;
    setGuardando(true);
    setError(null);

    const limpio = normalizeNote(texto);
    const res = await saveQuestionNote({ questionId, note: limpio });

    if (res.success) {
      setGuardado(limpio);
      setTexto(limpio);
    } else {
      // Se enseña. Un fallo de escritura que solo va a la consola deja al
      // alumno creyendo que su nota está guardada.
      setError(res.error ?? 'No se pudo guardar.');
    }
    setGuardando(false);
  }

  if (!activo) return null;

  return (
    <div className="mt-4 bg-amber-50/60 dark:bg-amber-500/5 border border-amber-200/70 dark:border-amber-500/20 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 flex items-center gap-2">
          <NotebookPen size={12} /> Tu nota
        </p>
        <span className="text-[10px] text-amber-700/50 dark:text-amber-500/40 font-medium">
          Privada · vuelve a salir con la pregunta
        </span>
      </div>

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value.slice(0, MAX_NOTE_CHARS))}
        // Se guarda al salir del campo: escribir y pasar a otra cosa es lo
        // normal, y obligar a pulsar un botón es como se pierden las notas.
        onBlur={guarda}
        disabled={cargando}
        placeholder={cargando ? 'Cargando…' : 'Aquí confundo prescripción con caducidad…'}
        className="w-full bg-white/70 dark:bg-slate-950/50 border border-amber-200/70 dark:border-amber-500/20 rounded-xl p-3 text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-amber-400 transition-colors resize-none min-h-[72px] placeholder:text-amber-700/30 dark:placeholder:text-amber-500/25"
      />

      <div className="flex items-center justify-between mt-2 min-h-[18px]">
        <p className="text-[10px] font-medium text-red-500">{error}</p>
        <div className="flex items-center gap-3">
          {texto.length > MAX_NOTE_CHARS - 200 && (
            <span className="text-[10px] font-mono text-amber-700/60">
              {texto.length}/{MAX_NOTE_CHARS}
            </span>
          )}
          {guardando ? (
            <span className="text-[10px] font-bold text-amber-700/60 flex items-center gap-1">
              <Loader2 size={11} className="animate-spin" /> Guardando…
            </span>
          ) : sucio ? (
            <button
              onClick={guarda}
              className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 hover:underline"
            >
              Guardar
            </button>
          ) : guardado ? (
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <Check size={11} /> Guardada
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

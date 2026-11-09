'use client';

import { CheckCircle2 } from 'lucide-react';
import { CampoArea, Aviso, Rotulo, cx } from '../../ui';

export type FormPregunta = { question_text: string; options: string[]; correct_index: number; explanation: string };

/**
 * El formulario de una pregunta del banco: enunciado, tres opciones con la
 * correcta marcada, y la explicación. Lo usan «Moderación» y «Banco oficial»,
 * dentro del panel lateral.
 *
 * `quejaDelAlumno` es el comentario de un reporte, si se llega desde uno: se
 * enseña arriba del todo, porque es lo que hay que leer antes de tocar nada.
 */
export default function EditorPregunta({
  form, onChange, quejaDelAlumno,
}: { form: FormPregunta; onChange: (f: FormPregunta) => void; quejaDelAlumno?: string | null }) {
  return (
    <div className="space-y-5">
      {quejaDelAlumno && (
        <Aviso>
          <div className="min-w-0">
            <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest">Lo que dijo el alumno</p>
            <p className="break-words text-sm">“{quejaDelAlumno}”</p>
          </div>
        </Aviso>
      )}

      <CampoArea
        label="Enunciado de la pregunta"
        rows={3}
        value={form.question_text}
        onChange={(e) => onChange({ ...form, question_text: e.target.value })}
      />

      <div>
        <Rotulo>Opciones · marca la correcta</Rotulo>
        <div className="mt-2 space-y-2">
          {form.options.map((opt, idx) => {
            const letra = idx === 0 ? 'A' : idx === 1 ? 'B' : 'C';
            const correcta = form.correct_index === idx;
            return (
              <div
                key={idx}
                className={cx(
                  'flex items-center gap-2 rounded-lg border p-1.5 transition-colors',
                  correcta ? 'border-emerald-600/50 bg-emerald-50 dark:bg-emerald-500/10' : 'border-linea dark:border-noche-linea',
                )}
              >
                <button
                  type="button"
                  onClick={() => onChange({ ...form, correct_index: idx })}
                  aria-label={`Marcar la opcion ${letra} como correcta`}
                  aria-pressed={correcta}
                  className={cx(
                    'grid h-11 w-11 shrink-0 place-items-center rounded-lg border font-titulo text-lg font-bold transition-colors',
                    correcta ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-linea dark:border-noche-linea bg-hundido dark:bg-noche-hondo text-slate-700 dark:text-slate-300',
                  )}
                >
                  {letra}
                </button>
                <input
                  type="text"
                  aria-label={`Opción ${letra}`}
                  className="min-h-[44px] min-w-0 flex-1 bg-transparent px-2 text-base text-slate-900 outline-none dark:text-white sm:text-sm"
                  value={opt}
                  onChange={(e) => {
                    const nuevas = [...form.options];
                    nuevas[idx] = e.target.value;
                    onChange({ ...form, options: nuevas });
                  }}
                />
                {correcta && <CheckCircle2 size={16} className="mr-1 shrink-0 text-emerald-700 dark:text-emerald-300" />}
              </div>
            );
          })}
        </div>
      </div>

      <CampoArea
        label="Explicación"
        rows={4}
        value={form.explanation}
        onChange={(e) => onChange({ ...form, explanation: e.target.value })}
      />
    </div>
  );
}

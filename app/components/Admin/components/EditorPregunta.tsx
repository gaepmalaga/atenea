'use client';

import { CheckCircle2, ExternalLink } from 'lucide-react';
import { CampoArea, Aviso, Rotulo, cx } from '../../ui';

export type FormPregunta = { question_text: string; options: string[]; correct_index: number; explanation: string };

/**
 * El formulario de una pregunta del banco: enunciado, tres opciones con la
 * correcta marcada, y la explicación. Lo usan «Moderación» y «Banco oficial»,
 * dentro del panel lateral.
 *
 * `sinExplicacion` esconde ese campo: una pregunta nueva del examen en papel
 * (regla 135) no la lleva todavía.
 *
 * `quejaDelAlumno` es el comentario de un reporte, si se llega desde uno: se
 * enseña arriba del todo, porque es lo que hay que leer antes de tocar nada.
 * Si el reporte es un aviso de cambio en la ley (regla 137), no es una cita de
 * nadie: va sin comillas, con su título y con el enlace al artículo aparte.
 */
export default function EditorPregunta({
  form, onChange, quejaDelAlumno, avisosDeLaLey, sinExplicacion,
}: {
  form: FormPregunta;
  onChange: (f: FormPregunta) => void;
  quejaDelAlumno?: string | null;
  /** Los avisos de cambio en la ley abiertos (regla 137), ya separados de su enlace. */
  avisosDeLaLey?: { texto: string; url: string | null; fuente: string | null }[] | null;
  sinExplicacion?: boolean;
}) {
  return (
    <div className="space-y-5">
      {avisosDeLaLey?.length ? (
        <Aviso>
          <div className="min-w-0 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest">Lo que ha cambiado en la ley</p>
            {avisosDeLaLey.map((a, i) => (
              <div key={i}>
                <p className="break-words text-sm">{a.texto}</p>
                {a.url && (
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold underline underline-offset-2">
                    Ver el texto en el {a.fuente} <ExternalLink size={13} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </Aviso>
      ) : quejaDelAlumno && (
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

      {!sinExplicacion && (
        <CampoArea
          label="Explicación"
          rows={4}
          value={form.explanation}
          onChange={(e) => onChange({ ...form, explanation: e.target.value })}
        />
      )}
    </div>
  );
}

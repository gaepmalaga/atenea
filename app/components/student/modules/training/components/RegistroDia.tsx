'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

export type RegistroGuardado = { rpe: number | null; comment: string | null } | null;

/**
 * MARCAR UN DÍA DEL PLAN DE GRUPO COMO HECHO (regla 84).
 *
 * Un toque para lo normal —«hecho»— y, si quiere, el esfuerzo (1-10) y cómo se
 * ha sentido. Las dos cosas son opcionales: se le pide lo mínimo para que lo
 * apunte de verdad (regla 56), y el preparador saca de ahí quién entrena.
 *
 * `editable` es falso cuando el día ya queda fuera de la ventana para apuntar:
 * entonces solo se enseña lo que hubo.
 */
export default function RegistroDia({
  registro, editable, onGuardar,
}: {
  registro: RegistroGuardado;
  editable: boolean;
  onGuardar: (r: { hecho: boolean; rpe: number | null; comment: string | null }) => Promise<{ success: boolean; error?: string }>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [rpe, setRpe] = useState<number | null>(registro?.rpe ?? null);
  const [comentario, setComentario] = useState(registro?.comment ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(hecho: boolean) {
    setGuardando(true);
    setError(null);
    const res = await onGuardar({ hecho, rpe: hecho ? rpe : null, comment: hecho ? comentario.trim() || null : null });
    setGuardando(false);
    if (!res.success) { setError(res.error ?? 'No se ha podido guardar.'); return; }
    setAbierto(false);
    if (!hecho) { setRpe(null); setComentario(''); }
  }

  if (!editable && !registro) return null;

  return (
    <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800/70 bg-slate-50/60 dark:bg-slate-950/30">
      {registro && !abierto && (
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-emerald-700 dark:text-emerald-400 font-bold flex items-start gap-1.5 min-w-0">
            <Check size={14} className="shrink-0 mt-px" />
            <span className="min-w-0">
              Hecho{registro.rpe !== null && <span className="font-mono"> · esfuerzo {registro.rpe}/10</span>}
              {registro.comment && <span className="block font-normal text-slate-600 dark:text-slate-300 break-words">«{registro.comment}»</span>}
            </span>
          </p>
          {editable && (
            <button onClick={() => setAbierto(true)} className="min-h-[44px] px-2 shrink-0 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
              Cambiar
            </button>
          )}
        </div>
      )}

      {!registro && !abierto && editable && (
        <button
          onClick={() => setAbierto(true)}
          className="w-full min-h-[44px] rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-xs font-black text-slate-600 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-400 flex items-center justify-center gap-1.5 transition-colors"
        >
          <Check size={14} /> Marcar como hecho
        </button>
      )}

      {abierto && (
        <div className="space-y-2.5">
          <div>
            <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1.5">¿Cuánto te ha costado? <span className="font-normal text-slate-500">(opcional · 1 muy fácil, 10 al límite)</span></p>
            <div className="grid grid-cols-5 gap-1.5">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setRpe(rpe === n ? null : n)}
                  aria-pressed={rpe === n}
                  className={`h-11 rounded-lg text-xs font-black border transition-colors ${
                    rpe === n
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="¿Cómo te has sentido? (opcional) — p. ej. «me ha costado el último bloque»"
            className="w-full text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => guardar(true)}
              disabled={guardando}
              className="min-h-[44px] px-4 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center gap-1.5 disabled:opacity-60"
            >
              {guardando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Guardar
            </button>
            {registro && (
              <button onClick={() => guardar(false)} disabled={guardando} className="min-h-[44px] px-3 text-xs font-bold text-red-600 dark:text-red-400">
                No lo hice: quitar
              </button>
            )}
            <button onClick={() => { setAbierto(false); setError(null); }} disabled={guardando} className="min-h-[44px] px-3 text-xs font-bold text-slate-500 dark:text-slate-400">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs font-semibold text-red-600 dark:text-red-400 mt-1.5">{error}</p>}
    </div>
  );
}

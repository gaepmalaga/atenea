'use client';

import { useState } from 'react';
import { Check, X, PlayCircle, Loader2, MessageSquare } from 'lucide-react';
import {
  ETIQUETA_TIPO, sePuedeApuntar, formateaMinutos, formateaKm, etiquetaDia, type Sesion, type Apunte,
} from '@/app/lib/sesiones';
import { ESTILO_TIPO } from '@/app/components/fisica/estiloTipo';
import ListaCargas from '@/app/components/fisica/ListaCargas';
import type { RMVigente } from '@/app/actions/fisica';
import { Modal, Button, TextAreaField, TextField, TEXT, cx } from '../../../../ui';

type Cambio = {
  status: 'hecha' | 'no_hecha' | null;
  rpe?: number | null;
  comment?: string | null;
  durationMin?: string | null;
  distanceKm?: string | null;
};

/**
 * UNA SESIÓN ABIERTA: leerla y apuntarla (regla 86).
 *
 * Arriba lo que mandó el preparador, tal cual lo escribió. Debajo, lo que
 * apunta el alumno: si la hizo o no, cuánto le costó (1-10), cómo se sintió, y
 * si quiere el tiempo y la distancia reales. Todo menos «hecha / no hecha» es
 * opcional (regla 56): se pide lo mínimo para que lo apunte de verdad.
 */
export default function DetalleSesion({ sesion, apunte, grupo, hoy, rm, onCerrar, onGuardar }: {
  sesion: Sesion;
  /** Su 1RM vigente, para calcular los kilos de las cargas (regla 89). */
  rm: RMVigente;
  apunte: Apunte | null;
  grupo: string | null;
  hoy: string;
  onCerrar: () => void;
  onGuardar: (c: Cambio) => Promise<{ success: boolean; error?: string }>;
}) {
  const [estado, setEstado] = useState<'hecha' | 'no_hecha' | null>(apunte?.status ?? null);
  const [rpe, setRpe] = useState<number | null>(apunte?.rpe ?? null);
  const [comentario, setComentario] = useState(apunte?.comment ?? '');
  const [minutos, setMinutos] = useState(apunte?.durationMin != null ? String(apunte.durationMin) : '');
  const [km, setKm] = useState(apunte?.distanceKm != null ? String(apunte.distanceKm).replace('.', ',') : '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const E = ESTILO_TIPO[sesion.kind];
  const Icono = E.icono;
  const apuntable = sePuedeApuntar(sesion.fecha, hoy);
  const meta = [formateaMinutos(sesion.durationMin), formateaKm(sesion.distanceKm)].filter(Boolean).join(' · ');

  async function guardar(quitar = false) {
    setGuardando(true);
    setError(null);
    const res = await onGuardar(quitar
      ? { status: null }
      : { status: estado, rpe, comment: comentario, durationMin: minutos, distanceKm: km });
    setGuardando(false);
    if (!res.success) { setError(res.error ?? 'No se ha podido guardar.'); return; }
    onCerrar();
  }

  return (
    <Modal
      title={sesion.title}
      subtitle={`${etiquetaDia(sesion.fecha)} · ${grupo ?? 'Solo para ti'}`}
      onClose={onCerrar}
      footer={apuntable ? (
        <div className="flex flex-wrap items-center gap-2 w-full">
          <Button onClick={() => guardar()} disabled={guardando || !estado} className="flex-1 sm:flex-none">
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Guardar
          </Button>
          {apunte && (
            <Button variant="ghost" onClick={() => guardar(true)} disabled={guardando}>Quitar lo apuntado</Button>
          )}
        </div>
      ) : undefined}
    >
      <div className="space-y-4">
        {/* Lo que mandó el preparador. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={cx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black', E.chip)}>
            <Icono size={13} /> {ETIQUETA_TIPO[sesion.kind]}
          </span>
          {meta && <span className={cx(TEXT.hud, 'text-slate-600 dark:text-slate-300')}>{meta}</span>}
        </div>

        {sesion.description ? (
          <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-words">{sesion.description}</p>
        ) : (
          <p className={TEXT.muted}>El preparador no ha escrito más detalle.</p>
        )}

        <ListaCargas cargas={sesion.cargas} rm={rm} quien="alumno" />

        {sesion.video && (
          <a href={sesion.video} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-sm font-bold text-indigo-700 dark:text-indigo-300 hover:underline">
            <PlayCircle size={18} /> Ver el vídeo
          </a>
        )}

        {apunte?.coachReply && (
          <div className="rounded-2xl bg-indigo-50 dark:bg-indigo-900/25 border border-indigo-100 dark:border-indigo-900/50 p-3">
            <p className="text-[11px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5 mb-1">
              <MessageSquare size={12} /> Tu preparador
            </p>
            <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-words">{apunte.coachReply}</p>
          </div>
        )}

        {/* Lo que apunta el alumno. */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-3">
          {!apuntable ? (
            <p className={TEXT.muted}>
              {sesion.fecha > hoy
                ? 'Podrás apuntarla el día que toque.'
                : 'Esta sesión queda demasiado atrás para apuntarla.'}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setEstado('hecha')}
                  aria-pressed={estado === 'hecha'}
                  className={cx('min-h-[48px] rounded-xl border-2 text-sm font-black flex items-center justify-center gap-1.5 transition-colors',
                    estado === 'hecha' ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-emerald-500')}
                >
                  <Check size={16} /> La he hecho
                </button>
                <button
                  onClick={() => setEstado('no_hecha')}
                  aria-pressed={estado === 'no_hecha'}
                  className={cx('min-h-[48px] rounded-xl border-2 text-sm font-black flex items-center justify-center gap-1.5 transition-colors',
                    estado === 'no_hecha' ? 'bg-slate-700 border-slate-700 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-500')}
                >
                  <X size={16} /> No la he hecho
                </button>
              </div>

              {estado === 'hecha' && (
                <>
                  <div>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                      ¿Cuánto te ha costado? <span className="font-normal text-slate-500 dark:text-slate-400">1 muy fácil · 10 al límite</span>
                    </p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          onClick={() => setRpe(rpe === n ? null : n)}
                          aria-pressed={rpe === n}
                          className={cx('h-11 rounded-lg text-sm font-black border transition-colors',
                            rpe === n ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-400')}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <TextField label="Tiempo (min)" inputMode="numeric" value={minutos} onChange={(e) => setMinutos(e.target.value)} placeholder={sesion.durationMin ? String(sesion.durationMin) : '45'} />
                    <TextField label="Distancia (km)" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} placeholder={sesion.distanceKm ? String(sesion.distanceKm).replace('.', ',') : '—'} />
                  </div>
                </>
              )}

              {estado && (
                <TextAreaField
                  label={estado === 'hecha' ? '¿Cómo te has sentido? (opcional)' : '¿Por qué? (opcional)'}
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder={estado === 'hecha' ? 'Me ha costado el último bloque…' : 'Molestia en el hombro, trabajo…'}
                />
              )}
              {error && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

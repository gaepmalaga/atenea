'use client';

import { useState } from 'react';
import { Dumbbell, Plus, Trash2, Loader2 } from 'lucide-react';
import { EJERCICIOS_FUERZA, rmDe, rmVigentes, formateaKg, MAX_REPS_ESTIMACION, estima1RM, leeKg, type MarcaRM } from '@/app/lib/rm';
import { etiquetaDia } from '@/app/lib/sesiones';
import { Button, TextField, SectionLabel, TEXT, cx } from '../ui';

type Entrada = { ejercicio: string; pesoKg: string; reps: string; fecha: string };

/**
 * EL 1RM DE UN ALUMNO (regla 89): el vigente de cada ejercicio, su histórico y
 * apuntar uno nuevo. La misma pieza en «Mis marcas» y en la ficha que ve el
 * preparador; cambia quién puede borrar qué.
 */
export default function SeccionRM({ marcas, hoy, quien, puedeBorrar, onApuntar, onBorrar }: {
  marcas: MarcaRM[];
  hoy: string;
  quien: 'alumno' | 'preparador';
  puedeBorrar: (m: MarcaRM) => boolean;
  onApuntar: (e: Entrada) => Promise<{ success: boolean; error?: string }>;
  onBorrar: (id: string) => Promise<{ success: boolean; error?: string }>;
}) {
  const vigentes = [...rmVigentes(marcas).values()].sort((a, b) => a.ejercicio.localeCompare(b.ejercicio));
  const [abierto, setAbierto] = useState(false);
  const [e, setE] = useState<Entrada>({ ejercicio: '', pesoKg: '', reps: '1', fecha: hoy });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previa = estima1RM(leeKg(e.pesoKg), Number(e.reps || 1));

  async function guardar() {
    setGuardando(true);
    setError(null);
    const r = await onApuntar(e);
    setGuardando(false);
    if (!r.success) { setError(r.error ?? 'No se ha podido guardar.'); return; }
    setE({ ejercicio: '', pesoKg: '', reps: '1', fecha: hoy });
    setAbierto(false);
  }

  return (
    <div>
      <SectionLabel icon={<Dumbbell size={14} />}>Fuerza: 1RM</SectionLabel>
      <p className={cx(TEXT.muted, 'mb-3')}>
        El peso máximo que {quien === 'alumno' ? 'levantas' : 'levanta'} una vez. Con él, las cargas en % de las sesiones salen en kilos.
        No hace falta probar el máximo: con un peso que {quien === 'alumno' ? 'mueves' : 'mueve'} de 2 a {MAX_REPS_ESTIMACION} veces se calcula.
      </p>

      {vigentes.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
          {vigentes.map((v) => (
            <div key={v.ejercicio} className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 py-2 min-w-0">
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">{v.ejercicio}</p>
              <p className="text-lg font-black text-slate-900 dark:text-white tabular-nums">{formateaKg(v.rm)}</p>
            </div>
          ))}
        </div>
      )}

      {marcas.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 border-y border-slate-100 dark:border-slate-800 mb-3">
          {[...marcas].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((m) => (
            <li key={m.id} className="py-1.5 flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 text-slate-500 dark:text-slate-400">{etiquetaDia(m.fecha)}</span>
              <span className="flex-1 min-w-0 truncate font-bold text-slate-800 dark:text-slate-100">{m.ejercicio}</span>
              <span className="shrink-0 font-mono text-slate-600 dark:text-slate-300">{formateaKg(m.pesoKg)}{m.reps > 1 ? ` × ${m.reps}` : ''}</span>
              <span className="shrink-0 font-mono font-black text-slate-900 dark:text-white w-16 text-right">{rmDe(m) !== null ? formateaKg(rmDe(m)!) : '—'}</span>
              {puedeBorrar(m) ? (
                <button aria-label="Borrar" onClick={async () => { if (confirm('¿Borrar esta marca?')) await onBorrar(m.id); }}
                  className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                  <Trash2 size={14} />
                </button>
              ) : <span className="w-9 shrink-0 text-center text-[9px] font-bold text-slate-400" title="La apuntó el preparador">prep.</span>}
            </li>
          ))}
        </ul>
      )}

      {abierto ? (
        <div className="space-y-2">
          <datalist id="ejercicios-fuerza">{EJERCICIOS_FUERZA.map((x) => <option key={x} value={x} />)}</datalist>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <TextField label="Ejercicio" list="ejercicios-fuerza" value={e.ejercicio} onChange={(ev) => setE({ ...e, ejercicio: ev.target.value })} placeholder="Sentadilla" />
            <TextField label="Peso (kg)" inputMode="decimal" value={e.pesoKg} onChange={(ev) => setE({ ...e, pesoKg: ev.target.value })} placeholder="80" />
            <TextField label="Repeticiones" inputMode="numeric" value={e.reps} onChange={(ev) => setE({ ...e, reps: ev.target.value })} placeholder="1" />
            <TextField label="Fecha" type="date" value={e.fecha} max={hoy} onChange={(ev) => setE({ ...e, fecha: ev.target.value })} />
          </div>
          {previa !== null && Number(e.reps || 1) > 1 && (
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">1RM estimado: {formateaKg(previa)}</p>
          )}
          {error && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={guardar} disabled={guardando || !e.ejercicio.trim() || !e.pesoKg.trim()}>
              {guardando && <Loader2 size={16} className="animate-spin" />} Guardar 1RM
            </Button>
            <Button variant="ghost" onClick={() => { setAbierto(false); setError(null); }}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setAbierto(true)}><Plus size={14} /> Apuntar 1RM</Button>
      )}
    </div>
  );
}

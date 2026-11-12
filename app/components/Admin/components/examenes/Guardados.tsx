'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, ClipboardCheck, FileDown, Trash2 } from 'lucide-react';
import { aplicaExamen, borraExamen, getExamenGuardado, getExamenesGuardados, getGroups } from '@/actions';
import type { ExamenGuardado } from '@/app/actions/examenes-clase';
import type { GroupRow } from '@/app/actions/groups';
import { Hoja, Aviso, Boton, Campo, EmptyState, Etiqueta } from '../../../ui';
import { bajaPdf, datosDeGuardado, type TipoPdf } from './descargas';

const hoyISO = () => new Date().toISOString().slice(0, 10);
const masDias = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const DIF = { easy: 'más fáciles', medium: 'equilibrada', hard: 'más difíciles' } as const;

/**
 * LOS EXÁMENES GUARDADOS (regla 118): reimprimirlos, ponerlos a un turno o
 * borrarlos. Poner un examen a un turno es lo que abre a los alumnos de esos
 * grupos la posibilidad de meter sus respuestas.
 */
export default function Guardados({ onAplicado }: { onAplicado: (id: string) => void }) {
  const [examenes, setExamenes] = useState<ExamenGuardado[] | null>(null);
  const [grupos, setGrupos] = useState<GroupRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [descargando, setDescargando] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState<ExamenGuardado | null>(null);

  const carga = useCallback(async () => {
    const [res, g] = await Promise.all([getExamenesGuardados(), getGroups()]);
    if (res.success) { setExamenes(res.examenes); setError(null); } else { setError(res.error); setExamenes([]); }
    if (g.success) setGrupos(g.groups);
  }, []);
  useEffect(() => { carga(); }, [carga]);

  async function baja(e: ExamenGuardado, que: TipoPdf) {
    setDescargando(`${e.id}:${que}`);
    setError(null);
    const res = await getExamenGuardado(e.id);
    if (!res.success) { setError(res.error); setDescargando(null); return; }
    try { await bajaPdf(que, datosDeGuardado(e, res.preguntas)); } catch (x) { setError(x instanceof Error ? x.message : 'No se ha podido crear el PDF.'); }
    setDescargando(null);
  }

  async function borra(e: ExamenGuardado) {
    if (!confirm(`¿Borrar «${e.titulo}»? No se puede deshacer.`)) return;
    const res = await borraExamen(e.id);
    if (!res.success) { setError(res.error ?? 'No se ha podido borrar.'); return; }
    carga();
  }

  return (
    <div className="space-y-4">
      {error && <Aviso tono="malo">{error}</Aviso>}
      {examenes === null && <p className="text-sm text-slate-600 dark:text-slate-400">Cargando…</p>}
      {examenes !== null && examenes.length === 0 && !error && (
        <EmptyState icon={<ClipboardCheck size={40} />} title="Todavía no has guardado ningún examen" hint="Prepara uno en la pestaña «Preparar» y guárdalo para ponerlo a un turno." bordered />
      )}

      {examenes?.map((e) => (
        <Hoja key={e.id} pad="lg" className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-titulo text-xl font-bold uppercase text-marino dark:text-oro-claro">{e.titulo}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {e.total} preguntas · {e.minutos} min · modelo {e.modelo} · {fechaCorta(e.creado)}
              </p>
              <p className="mt-1 flex flex-wrap gap-1.5">
                <Etiqueta tono="neutro">{e.filtros.temas.length ? `${e.filtros.temas.length} temas` : 'Todo el temario'}</Etiqueta>
                <Etiqueta tono="neutro">Dificultad {DIF[e.filtros.dificultad]}</Etiqueta>
                {e.aplicaciones > 0 && <Etiqueta tono="ok">{e.aplicaciones === 1 ? 'Puesto a 1 turno' : `Puesto a ${e.aplicaciones} turnos`}</Etiqueta>}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Boton onClick={() => setAplicando(aplicando?.id === e.id ? null : e)} icon={<CalendarPlus size={15} />}>Ponerlo a un turno</Boton>
              <Boton variant="secondary" onClick={() => borra(e)} icon={<Trash2 size={15} />} aria-label={`Borrar ${e.titulo}`}>Borrar</Boton>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {([['cuestionario', 'Cuestionario'], ['hoja', 'Hoja de respuestas'], ['plantilla', 'Plantilla de corrección']] as const).map(([que, etiqueta]) => (
              <Boton key={que} variant="secondary" size="sm" disabled={!!descargando} onClick={() => baja(e, que)} icon={<FileDown size={14} />}>
                {descargando === `${e.id}:${que}` ? 'Creando…' : etiqueta}
              </Boton>
            ))}
          </div>

          {aplicando?.id === e.id && <FormAplicar examen={e} grupos={grupos} onListo={onAplicado} onCancelar={() => setAplicando(null)} />}
        </Hoja>
      ))}
    </div>
  );
}

function FormAplicar({ examen, grupos, onListo, onCancelar }: {
  examen: ExamenGuardado; grupos: GroupRow[]; onListo: (id: string) => void; onCancelar: () => void;
}) {
  const [etiqueta, setEtiqueta] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [cierre, setCierre] = useState(masDias(hoyISO(), 7));
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conAlumnos = grupos.filter((g) => g.miembros > 0);

  async function aplica() {
    setEnviando(true);
    setError(null);
    const res = await aplicaExamen({ paperId: examen.id, etiqueta, fecha, cierre: cierre || null, grupos: [...elegidos] });
    setEnviando(false);
    if (!res.success) { setError(res.error); return; }
    onListo(res.id);
  }

  return (
    <div className="space-y-4 rounded-lg border border-linea p-4 dark:border-noche-linea">
      <p className="text-sm font-semibold text-slate-900 dark:text-white">Poner «{examen.titulo}» a un turno</p>
      <Campo label="Cómo lo llamas" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} maxLength={80} placeholder="Turno de mañana, martes y jueves" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Día del examen" type="date" value={fecha} onChange={(e) => { setFecha(e.target.value); if (cierre && cierre < e.target.value) setCierre(masDias(e.target.value, 7)); }} />
        <Campo label="Pueden meter sus respuestas hasta" type="date" value={cierre} min={fecha} onChange={(e) => setCierre(e.target.value)} hint="Vacío = sin límite." />
      </div>

      <div>
        <p className="mb-1.5 text-[12.5px] font-semibold text-slate-800 dark:text-slate-200">Qué grupos lo hacen</p>
        <div className="max-h-56 overflow-y-auto rounded-lg border border-linea p-1 dark:border-noche-linea">
          {conAlumnos.length === 0 && <p className="p-2 text-sm text-slate-600 dark:text-slate-400">Todavía no hay grupos con alumnos: se pondrá a toda la academia.</p>}
          {conAlumnos.map((g) => (
            <label key={g.id} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-black/5 dark:hover:bg-white/5">
              <input type="checkbox" className="h-5 w-5 shrink-0" checked={elegidos.has(g.id)}
                onChange={() => setElegidos((prev) => { const n = new Set(prev); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })} />
              <span className="min-w-0 flex-1 text-sm text-slate-900 dark:text-white">{g.name} <span className="text-slate-600 dark:text-slate-400">· {g.miembros} alumnos{g.kindLabel ? ` · ${g.kindLabel}` : ''}</span></span>
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
          {elegidos.size === 0 ? 'Ninguno marcado: lo harán todos los alumnos de la academia.' : `${elegidos.size} ${elegidos.size === 1 ? 'grupo' : 'grupos'}: los alumnos de esos grupos verán el examen en «Exámenes en clase».`}
        </p>
      </div>

      {error && <Aviso tono="malo">{error}</Aviso>}
      <div className="flex flex-wrap gap-2">
        <Boton onClick={aplica} disabled={enviando || !etiqueta.trim()}>{enviando ? 'Poniéndolo…' : 'Ponerlo'}</Boton>
        <Boton variant="secondary" onClick={onCancelar} disabled={enviando}>Cancelar</Boton>
      </div>
    </div>
  );
}

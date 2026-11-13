'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, FileDown, Loader2, Trash2 } from 'lucide-react';
import { aplicaPsicoExamen, borraPsicoExamen, getGroups, getHojaPsicoExamen, getPsicoGuardados } from '@/actions';
import type { PsicoGuardado } from '@/app/actions/psico-clase';
import type { GroupRow } from '@/app/actions/groups';
import { TIPOS_PSICO, TIPO_PSICO_LABEL } from '@/app/lib/psico';
import { Hoja, Aviso, Boton, Campo, EmptyState, Etiqueta } from '../../../ui';
import { imprimeHojaPsico } from './hojaPsico';

const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const masDias = (f: string, n: number) => { const d = new Date(`${f}T12:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fechaCorta = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

/**
 * LOS PSICOTÉCNICOS GUARDADOS (regla 127): reimprimirlos, ponerlos a un turno
 * (el mismo examen a varios grupos y días) y borrarlos.
 */
export default function GuardadosPsico({ onAplicado }: { onAplicado: (id: string) => void }) {
  const [lista, setLista] = useState<PsicoGuardado[] | null>(null);
  const [grupos, setGrupos] = useState<GroupRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState<string | null>(null);
  const [imprimiendo, setImprimiendo] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [r, g] = await Promise.all([getPsicoGuardados(), getGroups()]);
    if (g.success) setGrupos(g.groups);
    if (!r.success) { setError(r.error); setLista([]); return; }
    setError(null); setLista(r.examenes);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function imprime(id: string) {
    setImprimiendo(id); setAviso(null);
    const r = await getHojaPsicoExamen(id);
    if (!r.success) { setImprimiendo(null); setAviso(r.error); return; }
    const ok = await imprimeHojaPsico({ titulo: r.titulo, fecha: hoyISO(), minutos: r.minutos, preguntas: r.preguntas });
    setImprimiendo(null);
    if (!ok) setAviso('El navegador ha bloqueado la ventana de impresión. Permite las ventanas emergentes para esta página y vuelve a probar.');
  }
  async function borra(e: PsicoGuardado) {
    if (!confirm(`¿Borrar «${e.titulo}»${e.puestos.length ? ' y las notas de los turnos a los que se puso' : ''}? No se puede deshacer.`)) return;
    const r = await borraPsicoExamen(e.id);
    if (!r.success) { setAviso(r.error ?? 'No se ha podido borrar.'); return; }
    cargar();
  }

  if (lista === null) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;
  return (
    <div className="space-y-3">
      {error && <Aviso tono="malo">{error}</Aviso>}
      {aviso && <Aviso tono="aviso">{aviso}</Aviso>}
      {lista.length === 0 && !error && <EmptyState title="Todavía no has guardado ningún psicotécnico" hint="Prepáralo en «Preparar» y guárdalo: luego lo pones a un turno o lo imprimes." bordered />}
      {lista.map((e) => (
        <Hoja key={e.id} pad="md" className="space-y-2">
          <div>
            <p className="font-bold text-slate-900 dark:text-white">{e.titulo}</p>
            <p className="text-[13px] text-slate-600 dark:text-slate-400">{e.total} preguntas · {e.minutos} min{e.puestos.length ? ` · puesto ${e.puestos.length} ${e.puestos.length === 1 ? 'vez' : 'veces'}` : ' · sin poner todavía'}</p>
          </div>
          <div className="flex flex-wrap gap-1">{(e.tipos.length === TIPOS_PSICO.length ? ['Todos los tipos'] : e.tipos.length > 6 ? [`${e.tipos.length} tipos de pregunta`] : e.tipos.map((t) => TIPO_PSICO_LABEL[t])).map((t) => <Etiqueta key={t} tono="neutro">{t}</Etiqueta>)}</div>
          {aplicando === e.id ? (
            <FormAplicar examen={e} grupos={grupos} onCancelar={() => setAplicando(null)} onListo={onAplicado} />
          ) : (
            <div className="flex flex-wrap gap-2">
              <Boton size="sm" icon={<CalendarPlus size={14} />} onClick={() => setAplicando(e.id)}>Ponerlo a un turno</Boton>
              <Boton size="sm" variant="secondary" icon={<FileDown size={14} />} onClick={() => imprime(e.id)} disabled={imprimiendo === e.id}>{imprimiendo === e.id ? 'Preparando…' : 'Imprimir'}</Boton>
              <Boton size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => borra(e)}>Borrar</Boton>
            </div>
          )}
        </Hoja>
      ))}
    </div>
  );
}

function FormAplicar({ examen, grupos, onListo, onCancelar }: { examen: PsicoGuardado; grupos: GroupRow[]; onListo: (id: string) => void; onCancelar: () => void }) {
  const [etiqueta, setEtiqueta] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [cierre, setCierre] = useState(masDias(hoyISO(), 7));
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conAlumnos = grupos.filter((g) => g.miembros > 0);

  // A qué grupos ya se ha puesto, y el día: se ve antes de marcar nada (como en teoría, regla 124).
  const yaPuesto = new Map<string, string[]>();
  let aTodos: string[] = [];
  for (const p of examen.puestos) {
    if (p.classIds.length === 0) aTodos = [...aTodos, fechaCorta(p.fecha)];
    for (const c of p.classIds) yaPuesto.set(c, [...(yaPuesto.get(c) ?? []), fechaCorta(p.fecha)]);
  }

  async function aplica() {
    setEnviando(true); setError(null);
    const r = await aplicaPsicoExamen({ examenId: examen.id, etiqueta, fecha, cierre: cierre || null, grupos: [...elegidos] });
    setEnviando(false);
    if (!r.success) { setError(r.error); return; }
    onListo(r.id);
  }

  return (
    <div className="space-y-4 rounded-lg border border-linea p-4 dark:border-noche-linea">
      <p className="text-sm font-semibold text-slate-900 dark:text-white">Poner «{examen.titulo}» a un turno</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Día del examen" type="date" value={fecha} onChange={(e) => { setFecha(e.target.value); if (cierre && cierre < e.target.value) setCierre(masDias(e.target.value, 7)); }} />
        <Campo label="Pueden entregarlo hasta" type="date" value={cierre} min={fecha} onChange={(e) => setCierre(e.target.value)} hint="Vacío = sin límite." />
      </div>
      <div>
        <p className="mb-1.5 text-[12.5px] font-semibold text-slate-800 dark:text-slate-200">Qué grupos lo hacen</p>
        {aTodos.length > 0 && <p className="mb-1.5 text-xs text-amber-800 dark:text-amber-300">Ya se puso a toda la academia ({aTodos.join(', ')}).</p>}
        <div className="max-h-56 overflow-y-auto rounded-lg border border-linea p-1 dark:border-noche-linea">
          {conAlumnos.length === 0 && <p className="p-2 text-sm text-slate-600 dark:text-slate-400">Todavía no hay grupos con alumnos: se pondrá a toda la academia.</p>}
          {conAlumnos.map((g) => {
            const antes = yaPuesto.get(g.id);
            return (
              <label key={g.id} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-black/5 dark:hover:bg-white/5">
                <input type="checkbox" className="h-5 w-5 shrink-0" checked={elegidos.has(g.id)}
                  onChange={() => setElegidos((prev) => { const n = new Set(prev); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })} />
                <span className="min-w-0 flex-1 text-sm text-slate-900 dark:text-white">
                  {g.name} <span className="text-slate-600 dark:text-slate-400">· {g.miembros} {g.miembros === 1 ? 'alumno' : 'alumnos'}{g.kindLabel ? ` · ${g.kindLabel}` : ''}</span>
                  {antes && <span className="ml-1.5 inline-block"><Etiqueta tono="aviso">Ya puesto el {antes.join(', ')}</Etiqueta></span>}
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">{elegidos.size === 0 ? 'Ninguno marcado: lo harán todos los alumnos de la academia.' : `${elegidos.size} ${elegidos.size === 1 ? 'grupo' : 'grupos'}: sus alumnos lo verán en «Psicotécnicos».`}</p>
      </div>
      <Campo label="Nombre propio (opcional)" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} maxLength={80} placeholder="Si lo dejas vacío se llama como el examen" />
      {error && <Aviso tono="malo">{error}</Aviso>}
      <div className="flex flex-wrap gap-2">
        <Boton onClick={aplica} disabled={enviando}>{enviando ? 'Poniéndolo…' : 'Ponerlo'}</Boton>
        <Boton variant="ghost" onClick={onCancelar}>Cancelar</Boton>
      </div>
    </div>
  );
}

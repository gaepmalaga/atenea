'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users2, RefreshCw, Plus, Trash2, ChevronDown, GraduationCap, Check } from 'lucide-react';
import {
  getGroups, createGroup, updateGroup, deleteGroup, setGroupMembers,
  getAcademyOverview, listStaff,
} from '@/actions';
import type { GroupRow } from '@/app/actions/groups';
import type { StaffMember } from '@/app/lib/academy-settings';
import { GROUP_KINDS, GROUP_KIND_LABEL, etiquetaTipo, type GroupKind } from '@/app/lib/groups';
import { Card, EmptyState, SectionLabel, Button, TEXT, cx } from '../../ui';

/**
 * "Grupos" (P7): crear grupos, meterles alumnos, asignar profesor.
 *
 * Un alumno puede estar en varios grupos. El tipo del grupo (`fisicas`,
 * `teoria`…) decide qué se le puede colgar — el plan de entrenamiento vive en
 * la pestaña «Preparación física».
 */

type Alumno = { id: string; email: string | null; role: string | null };

export default function AdminGroups() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    const [g, ov, st] = await Promise.all([getGroups(), getAcademyOverview(), listStaff()]);
    if (g.success) setGroups(g.groups);
    else setError(g.error);
    if (ov.success) setAlumnos(ov.data.alumnos.filter((a) => a.role !== 'admin').map((a) => ({ id: a.id, email: a.email, role: a.role })));
    if (st.success) setStaff(st.staff.filter((s) => s.active));
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function accion(fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    if (!res.success) setError(res.error ?? 'No se pudo guardar.');
    await cargar();
    setBusy(false);
  }

  return (
    <div className="space-y-4 animate-in fade-in pb-24">
      <Card tone="sunken" pad="md" className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-slate-700/10 dark:bg-white/5 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
            <Users2 size={20} />
          </div>
          <div>
            <h3 className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-tight">Grupos</h3>
            <p className={cx(TEXT.muted, 'mt-0.5')}>Clases, promociones, inglés, físicas. Un alumno puede estar en varios.</p>
          </div>
        </div>
        <button onClick={() => { setLoading(true); cargar(); }} className="w-11 h-11 shrink-0 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400" aria-label="Recargar">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </Card>

      {error && (
        <Card tone="base" pad="md" className="border-red-500/30 text-red-700 dark:text-red-300">
          <p className="text-xs font-medium">{error}</p>
        </Card>
      )}

      <NuevoGrupo staff={staff} busy={busy} onCrear={(input) => accion(() => createGroup(input))} />

      {!loading && groups.length === 0 && (
        <EmptyState icon={<Users2 size={40} />} title="Todavía no hay grupos" hint="Crea el primero arriba." bordered />
      )}

      <div className="space-y-2">
        {groups.map((g) => (
          <FilaGrupo
            key={g.id}
            g={g}
            alumnos={alumnos}
            staff={staff}
            busy={busy}
            onGuardar={(input) => accion(() => updateGroup(g.id, input))}
            onBorrar={() => accion(() => deleteGroup(g.id))}
            onMiembros={(ids) => accion(() => setGroupMembers(g.id, ids))}
          />
        ))}
      </div>
    </div>
  );
}

type GrupoInput = { name: string; kind: GroupKind; schedule: string; staffId: string };

function camposGrupo(g?: GroupRow): GrupoInput {
  return { name: g?.name ?? '', kind: (g?.kind as GroupKind) ?? 'otro', schedule: g?.schedule ?? '', staffId: g?.staffId ?? '' };
}

function FormularioGrupo({
  inicial, staff, busy, onSubmit, textoBoton,
}: {
  inicial: GrupoInput;
  staff: StaffMember[];
  busy: boolean;
  onSubmit: (v: GrupoInput) => void;
  textoBoton: string;
}) {
  const [v, setV] = useState(inicial);
  const claseInput = 'text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input className={cx(claseInput, 'flex-1 min-w-[10rem]')} placeholder="Nombre (p. ej. Promoción 41 tarde)" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      <select className={claseInput} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as GroupKind })}>
        {GROUP_KINDS.map((k) => <option key={k} value={k}>{GROUP_KIND_LABEL[k]}</option>)}
      </select>
      <input className={cx(claseInput, 'w-40')} placeholder="Horario" value={v.schedule} onChange={(e) => setV({ ...v, schedule: e.target.value })} />
      <select className={claseInput} value={v.staffId} onChange={(e) => setV({ ...v, staffId: e.target.value })}>
        <option value="">Sin profesor</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <Button size="sm" disabled={busy || !v.name.trim()} onClick={() => onSubmit(v)}>{textoBoton}</Button>
    </div>
  );
}

function NuevoGrupo({ staff, busy, onCrear }: { staff: StaffMember[]; busy: boolean; onCrear: (v: GrupoInput) => void }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Card tone="base" pad="md">
      <button onClick={() => setAbierto((x) => !x)} className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
        <Plus size={15} /> Nuevo grupo
        <ChevronDown size={14} className={cx('text-slate-400 transition-transform', abierto && 'rotate-180')} />
      </button>
      {abierto && (
        <div className="mt-3">
          <FormularioGrupo inicial={camposGrupo()} staff={staff} busy={busy} textoBoton="Crear" onSubmit={onCrear} />
        </div>
      )}
    </Card>
  );
}

function FilaGrupo({
  g, alumnos, staff, busy, onGuardar, onBorrar, onMiembros,
}: {
  g: GroupRow;
  alumnos: Alumno[];
  staff: StaffMember[];
  busy: boolean;
  onGuardar: (v: GrupoInput) => void;
  onBorrar: () => void;
  onMiembros: (ids: string[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set(g.memberIds));
  useEffect(() => { setSeleccion(new Set(g.memberIds)); }, [g.memberIds]);

  const sucio = seleccion.size !== g.memberIds.length || g.memberIds.some((id) => !seleccion.has(id));

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800">
      <button onClick={() => setAbierto((x) => !x)} className="w-full flex items-center justify-between gap-3 p-3 text-left">
        <span className="min-w-0">
          <span className="block font-bold text-slate-900 dark:text-white truncate">{g.name}</span>
          <span className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-600 dark:text-slate-300">{etiquetaTipo(g.kind)}</span>
            <span className={TEXT.muted}>{g.miembros} {g.miembros === 1 ? 'alumno' : 'alumnos'}</span>
            {g.staffName && <span className={TEXT.muted}>· {g.staffName}</span>}
            {g.schedule && <span className={TEXT.muted}>· {g.schedule}</span>}
            {g.llevaPlan && <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">{g.tienePlan ? 'con plan' : 'sin plan'}</span>}
          </span>
        </span>
        <ChevronDown size={16} className={cx('shrink-0 text-slate-400 transition-transform', abierto && 'rotate-180')} />
      </button>

      {abierto && (
        <div className="px-3 pb-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <FormularioGrupo inicial={camposGrupo(g)} staff={staff} busy={busy} textoBoton="Guardar" onSubmit={onGuardar} />

          <div>
            <SectionLabel icon={<GraduationCap size={13} />} aside={<span className={TEXT.muted}>{seleccion.size} de {alumnos.length}</span>}>Alumnos del grupo</SectionLabel>
            <div className="max-h-56 overflow-y-auto space-y-1 rounded-lg bg-slate-50 dark:bg-slate-900/50 p-2">
              {alumnos.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-xs cursor-pointer py-0.5">
                  <input
                    type="checkbox"
                    checked={seleccion.has(a.id)}
                    onChange={(e) => {
                      const s = new Set(seleccion);
                      if (e.target.checked) s.add(a.id); else s.delete(a.id);
                      setSeleccion(s);
                    }}
                  />
                  <span className="font-mono text-slate-600 dark:text-slate-300 truncate">{a.email ?? a.id.slice(0, 8)}</span>
                </label>
              ))}
            </div>
            <div className="mt-2">
              <Button size="sm" disabled={busy || !sucio} icon={<Check size={13} />} onClick={() => onMiembros([...seleccion])}>
                Guardar miembros
              </Button>
            </div>
          </div>

          <button onClick={onBorrar} disabled={busy} className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5 hover:underline">
            <Trash2 size={13} /> Borrar el grupo
          </button>
        </div>
      )}
    </div>
  );
}

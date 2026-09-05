'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users2, RefreshCw, Plus, Trash2, ChevronDown, Tag } from 'lucide-react';
import {
  getGroups, createGroup, updateGroup, deleteGroup,
  getGroupKinds, saveGroupKind, deleteGroupKind, listStaff,
} from '@/actions';
import type { GroupRow } from '@/app/actions/groups';
import type { StaffMember } from '@/app/lib/academy-settings';
import type { GroupKindRow } from '@/app/lib/groups';
import { Card, EmptyState, SectionLabel, Button, TEXT, cx } from '../../ui';

/**
 * «Grupos» (P7 · rehecho en P8) — aquí se DEFINEN los grupos: nombre, tipo (de
 * una lista que tú editas) y profesores (varios). Meter alumnos NO se hace
 * aquí: se hace desde cada alumno, en «Alumnos».
 */
export default function AdminGroups() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [kinds, setKinds] = useState<GroupKindRow[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    const [g, k, s] = await Promise.all([getGroups(), getGroupKinds(), listStaff()]);
    if (g.success) setGroups(g.groups); else setError(g.error);
    if (k.success) setKinds(k.kinds);
    if (s.success) setStaff(s.staff.filter((x) => x.active));
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
            <p className={cx(TEXT.muted, 'mt-0.5')}>Se definen aquí; los alumnos se asignan en «Alumnos».</p>
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

      <Tipos kinds={kinds} busy={busy} onAccion={accion} />

      <NuevoGrupo kinds={kinds} staff={staff} busy={busy} onCrear={(input) => accion(() => createGroup(input))} />

      {!loading && groups.length === 0 && (
        <EmptyState icon={<Users2 size={40} />} title="Todavía no hay grupos" hint="Crea el primero arriba." bordered />
      )}

      <div className="space-y-2">
        {groups.map((g) => (
          <FilaGrupo key={g.id} g={g} kinds={kinds} staff={staff} busy={busy}
            onGuardar={(input) => accion(() => updateGroup(g.id, input))}
            onBorrar={() => accion(() => deleteGroup(g.id))} />
        ))}
      </div>
    </div>
  );
}

// --- Tipos de grupo (lista editable) ---
function Tipos({ kinds, busy, onAccion }: { kinds: GroupKindRow[]; busy: boolean; onAccion: (fn: () => Promise<{ success: boolean; error?: string }>) => Promise<void> }) {
  const [abierto, setAbierto] = useState(false);
  const [nuevo, setNuevo] = useState('');
  const [llevaPlan, setLlevaPlan] = useState(false);
  return (
    <Card tone="base" pad="md">
      <button onClick={() => setAbierto((x) => !x)} className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
        <Tag size={14} /> Tipos de grupo ({kinds.length})
        <ChevronDown size={14} className={cx('text-slate-400 transition-transform', abierto && 'rotate-180')} />
      </button>
      {abierto && (
        <div className="mt-3 space-y-2">
          {kinds.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-slate-800 dark:text-slate-200">{k.label}</span>
              <span className="flex items-center gap-3">
                {k.lleva_plan && <span className="text-[10px] font-bold text-orange-700 dark:text-orange-400">lleva plan</span>}
                <button onClick={() => onAccion(() => deleteGroupKind(k.id))} disabled={busy} className="text-slate-400 hover:text-red-500" aria-label="Borrar tipo">
                  <Trash2 size={13} />
                </button>
              </span>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nuevo tipo (p. ej. Oposición completa)"
              className="flex-1 min-w-[10rem] text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5" />
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={llevaPlan} onChange={(e) => setLlevaPlan(e.target.checked)} /> lleva plan de entrenamiento
            </label>
            <Button size="sm" disabled={busy || !nuevo.trim()} onClick={() => { onAccion(() => saveGroupKind({ label: nuevo, lleva_plan: llevaPlan })); setNuevo(''); setLlevaPlan(false); }}>Añadir</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

type GrupoInput = { name: string; kind: string; schedule: string; staffIds: string[] };
function campos(g?: GroupRow, kinds: GroupKindRow[] = []): GrupoInput {
  return { name: g?.name ?? '', kind: g?.kind ?? kinds[0]?.id ?? 'otro', schedule: g?.schedule ?? '', staffIds: g?.staffIds ?? [] };
}

function Formulario({ inicial, kinds, staff, busy, onSubmit, textoBoton }: {
  inicial: GrupoInput; kinds: GroupKindRow[]; staff: StaffMember[]; busy: boolean; onSubmit: (v: GrupoInput) => void; textoBoton: string;
}) {
  const [v, setV] = useState(inicial);
  const inp = 'text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input className={cx(inp, 'flex-1 min-w-[10rem]')} placeholder="Nombre (p. ej. Promoción 41 tarde)" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <select className={inp} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>
          {kinds.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        <input className={cx(inp, 'w-36')} placeholder="Horario" value={v.schedule} onChange={(e) => setV({ ...v, schedule: e.target.value })} />
      </div>
      {staff.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className={cx(TEXT.muted, 'w-full')}>Profesores:</span>
          {staff.map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={v.staffIds.includes(s.id)} onChange={(e) => {
                setV({ ...v, staffIds: e.target.checked ? [...v.staffIds, s.id] : v.staffIds.filter((x) => x !== s.id) });
              }} />
              <span className="text-slate-700 dark:text-slate-300">{s.name}</span>
            </label>
          ))}
        </div>
      )}
      <Button size="sm" disabled={busy || !v.name.trim()} onClick={() => onSubmit(v)}>{textoBoton}</Button>
    </div>
  );
}

function NuevoGrupo({ kinds, staff, busy, onCrear }: { kinds: GroupKindRow[]; staff: StaffMember[]; busy: boolean; onCrear: (v: GrupoInput) => void }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Card tone="base" pad="md">
      <button onClick={() => setAbierto((x) => !x)} className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
        <Plus size={15} /> Nuevo grupo
        <ChevronDown size={14} className={cx('text-slate-400 transition-transform', abierto && 'rotate-180')} />
      </button>
      {abierto && <div className="mt-3"><Formulario inicial={campos(undefined, kinds)} kinds={kinds} staff={staff} busy={busy} textoBoton="Crear" onSubmit={onCrear} /></div>}
    </Card>
  );
}

function FilaGrupo({ g, kinds, staff, busy, onGuardar, onBorrar }: {
  g: GroupRow; kinds: GroupKindRow[]; staff: StaffMember[]; busy: boolean; onGuardar: (v: GrupoInput) => void; onBorrar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800">
      <button onClick={() => setAbierto((x) => !x)} className="w-full flex items-center justify-between gap-3 p-3 text-left">
        <span className="min-w-0">
          <span className="block font-bold text-slate-900 dark:text-white truncate">{g.name}</span>
          <span className={cx(TEXT.muted, 'flex items-center gap-2 flex-wrap')}>
            <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-600 dark:text-slate-300">{g.kindLabel}</span>
            <span>{g.miembros} {g.miembros === 1 ? 'alumno' : 'alumnos'}</span>
            {g.staffNames.length > 0 && <span>· {g.staffNames.join(', ')}</span>}
            {g.schedule && <span>· {g.schedule}</span>}
            {g.llevaPlan && <span className="text-orange-700 dark:text-orange-400 font-bold">{g.tienePlan ? 'con plan' : 'sin plan'}</span>}
          </span>
        </span>
        <ChevronDown size={16} className={cx('shrink-0 text-slate-400 transition-transform', abierto && 'rotate-180')} />
      </button>
      {abierto && (
        <div className="px-3 pb-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <Formulario inicial={campos(g, kinds)} kinds={kinds} staff={staff} busy={busy} textoBoton="Guardar" onSubmit={onGuardar} />
          <button onClick={onBorrar} disabled={busy} className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5 hover:underline">
            <Trash2 size={13} /> Borrar el grupo
          </button>
        </div>
      )}
    </div>
  );
}

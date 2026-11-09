'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users2, RefreshCw, Plus, Trash2, ChevronDown, Tag, Euro, Package, Pencil } from 'lucide-react';
import {
  getGroups, createGroup, updateGroup, deleteGroup,
  getGroupKinds, saveGroupKind, deleteGroupKind, listStaff,
  getTarifa, setPrecioTipo, savePack, deletePack,
} from '@/actions';
import type { GroupRow } from '@/app/actions/groups';
import type { StaffMember } from '@/app/lib/academy-settings';
import type { GroupKindRow } from '@/app/lib/groups';
import { DIAS_SEMANA, horarioEnTexto } from '@/app/lib/asistencia';
import { eur, precioSuelto, nombreDePack, cuotaDeAlumno, type Tarifa, type Pack } from '@/app/lib/cuotas';
import { Card, EmptyState, SectionLabel, Button, TEXT, cx } from '../../ui';

/**
 * «Grupos» (P7 · rehecho en P8) — aquí se DEFINEN los grupos: nombre, tipo (de
 * una lista que tú editas) y profesores (varios). Meter alumnos NO se hace
 * aquí: se hace desde cada alumno, en «Alumnos».
 */
export default function AdminGroups() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [kinds, setKinds] = useState<GroupKindRow[]>([]);
  const [tarifa, setTarifa] = useState<Tarifa>({ tipos: [], packs: [] });
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    const [g, k, s, t] = await Promise.all([getGroups(), getGroupKinds(), listStaff(), getTarifa()]);
    if (g.success) setGroups(g.groups); else setError(g.error);
    if (k.success) setKinds(k.kinds);
    if (t.success) setTarifa(t.tarifa);
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

      <Tipos kinds={kinds} tarifa={tarifa} busy={busy} onAccion={accion} />

      <NuevoGrupo kinds={kinds} staff={staff} busy={busy} onCrear={(input) => accion(() => createGroup(input))} />

      {!loading && groups.length === 0 && (
        <EmptyState icon={<Users2 size={40} />} title="Todavía no hay grupos" hint="Crea el primero arriba." bordered />
      )}

      <div className="space-y-2">
        {groups.map((g) => (
          <FilaGrupo key={g.id} g={g} kinds={kinds} staff={staff} busy={busy}
            precio={tarifa.tipos.find((t) => t.id === g.kind)?.precio ?? null}
            onGuardar={(input) => accion(() => updateGroup(g.id, input))}
            onBorrar={() => {
              // Borrar un grupo arrastra sus clases, faltas, multis apuntados y
              // la pertenencia de sus alumnos, y la base de datos del plan
              // gratuito no tiene copias: el 6 nov se perdió así un grupo entero.
              if (confirm(`¿Borrar «${g.name}»? Se pierden también sus clases del cuadrante, las faltas avisadas y quién estaba dentro (${g.miembros} ${g.miembros === 1 ? 'alumno' : 'alumnos'}). No se puede deshacer.`)) {
                accion(() => deleteGroup(g.id));
              }
            }} />
        ))}
      </div>
    </div>
  );
}

// --- Tipos de grupo y sus precios (regla 102) ---
type Accion = (fn: () => Promise<{ success: boolean; error?: string }>) => Promise<void>;

/**
 * Los tipos de grupo con su precio al mes, y los packs. La cuota de cada
 * alumno sale de aquí: la combinación más barata de packs y precios sueltos
 * que cubre los tipos de sus grupos. Plegada: se toca al empezar el curso, no
 * a diario (regla 101); la cabecera ya dice cómo está.
 */
function Tipos({ kinds, tarifa, busy, onAccion }: { kinds: GroupKindRow[]; tarifa: Tarifa; busy: boolean; onAccion: Accion }) {
  const [abierto, setAbierto] = useState(false);
  const [nuevo, setNuevo] = useState('');
  const [llevaPlan, setLlevaPlan] = useState(false);
  const precioDe = (id: string) => tarifa.tipos.find((t) => t.id === id)?.precio ?? null;
  const conPrecio = kinds.filter((k) => precioDe(k.id) !== null);
  const sinPrecio = kinds.filter((k) => precioDe(k.id) === null);
  const resumen = conPrecio.length
    ? conPrecio.map((k) => `${k.label} ${eur(precioDe(k.id))}`).join(' · ') + (tarifa.packs.length ? ` · ${tarifa.packs.length} ${tarifa.packs.length === 1 ? 'pack' : 'packs'}` : '')
    : null;

  return (
    <Card tone="base" pad="md">
      <button onClick={() => setAbierto((x) => !x)} className="w-full flex items-start justify-between gap-3 text-left min-h-[44px]" aria-expanded={abierto}>
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
            <Tag size={14} /> Tipos de grupo y precios
          </span>
          {resumen
            ? <span className={cx(TEXT.muted, 'block mt-0.5')}>{resumen}</span>
            : <span className="block mt-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">Sin precios: ponlos para que «Pagos» calcule la cuota de cada alumno.</span>}
          {resumen && sinPrecio.length > 0 && (
            <span className="block mt-0.5 text-xs text-amber-700 dark:text-amber-300">Sin precio: {sinPrecio.map((k) => k.label).join(', ')}</span>
          )}
        </span>
        <ChevronDown size={16} className={cx('shrink-0 mt-0.5 text-slate-400 transition-transform', abierto && 'rotate-180')} />
      </button>
      {abierto && (
        <div className="mt-4 space-y-5">
          <div className="space-y-1">
            <SectionLabel>Precio al mes de cada tipo</SectionLabel>
            {kinds.map((k) => (
              <div key={k.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <span className="min-w-0">
                  <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">{k.label}</span>
                  {k.lleva_plan && <span className="ml-2 text-[10px] font-bold text-orange-700 dark:text-orange-400">lleva plan</span>}
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <CampoPrecio valor={precioDe(k.id)} busy={busy} etiqueta={`Precio de ${k.label}`}
                    onGuardar={(v) => onAccion(() => setPrecioTipo(k.id, v))} />
                  <button onClick={() => { if (confirm(`¿Borrar el tipo «${k.label}»?`)) onAccion(() => deleteGroupKind(k.id)); }} disabled={busy}
                    className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-red-500" aria-label={`Borrar el tipo ${k.label}`}>
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nuevo tipo (p. ej. Psicotécnicos)"
                className="flex-1 min-w-[10rem] text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2" />
              <label className="flex items-center gap-1.5 text-xs min-h-[44px]">
                <input type="checkbox" checked={llevaPlan} onChange={(e) => setLlevaPlan(e.target.checked)} /> lleva plan de entrenamiento
              </label>
              <Button size="sm" disabled={busy || !nuevo.trim()} onClick={() => { onAccion(() => saveGroupKind({ label: nuevo, lleva_plan: llevaPlan })); setNuevo(''); setLlevaPlan(false); }}>Añadir</Button>
            </div>
          </div>

          <Packs kinds={kinds} tarifa={tarifa} busy={busy} onAccion={onAccion} />

          <Ejemplos tarifa={tarifa} />
        </div>
      )}
    </Card>
  );
}

/** El campo de euros: se guarda al salir de él o con Intro, solo si ha cambiado. Vacío es «sin precio». */
function CampoPrecio({ valor, busy, etiqueta, onGuardar }: { valor: number | null; busy: boolean; etiqueta: string; onGuardar: (v: string) => void }) {
  const inicial = valor === null ? '' : String(valor).replace('.', ',');
  const [texto, setTexto] = useState(inicial);
  const [visto, setVisto] = useState(inicial);
  // Si el dato cambia desde fuera (al recargar), el campo lo sigue.
  if (inicial !== visto) { setVisto(inicial); setTexto(inicial); }
  const guarda = () => { if (texto.trim() !== inicial) onGuardar(texto); };
  return (
    <label className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
      <input value={texto} onChange={(e) => setTexto(e.target.value)} onBlur={guarda}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        disabled={busy} inputMode="decimal" autoComplete="off" placeholder="—" aria-label={etiqueta}
        className="w-20 text-right tabular-nums text-base sm:text-sm font-bold text-slate-900 dark:text-white rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2" />
      €/mes
    </label>
  );
}

/** Los packs: varios tipos juntos por un precio. */
function Packs({ kinds, tarifa, busy, onAccion }: { kinds: GroupKindRow[]; tarifa: Tarifa; busy: boolean; onAccion: Accion }) {
  const [editando, setEditando] = useState<Pack | 'nuevo' | null>(null);
  return (
    <div className="space-y-2">
      <SectionLabel>Packs</SectionLabel>
      {tarifa.packs.length === 0 && !editando && (
        <p className={TEXT.muted}>Ninguno. Un pack junta varios tipos por un precio: «Teoría + Físicas + Inglés, 100 €».</p>
      )}
      {tarifa.packs.map((pk) => {
        if (editando !== 'nuevo' && editando?.id === pk.id) {
          return <FormPack key={pk.id} inicial={pk} kinds={kinds} tarifa={tarifa} busy={busy}
            onCancelar={() => setEditando(null)}
            onGuardar={(v) => { onAccion(() => savePack({ ...v, id: pk.id })); setEditando(null); }} />;
        }
        const suelto = precioSuelto(pk.tipos, tarifa);
        const ahorro = suelto !== null ? suelto - pk.precio : null;
        return (
          <div key={pk.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 px-3 py-2">
            <span className="min-w-0 flex items-start gap-2">
              <Package size={15} className="mt-0.5 shrink-0 text-indigo-500" />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-900 dark:text-white">{pk.nombre} · {eur(pk.precio)}/mes</span>
                <span className={cx(TEXT.muted, 'block')}>
                  {nombreDePack(pk.tipos, tarifa)}
                  {ahorro !== null && ahorro > 0 && <> · suelto serían {eur(suelto)}: ahorra {eur(ahorro)}</>}
                  {ahorro !== null && ahorro < 0 && <span className="text-amber-700 dark:text-amber-300"> · sale MÁS caro que suelto ({eur(suelto)}): no se aplicará</span>}
                </span>
              </span>
            </span>
            <span className="flex shrink-0">
              <button onClick={() => setEditando(pk)} disabled={busy} className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-indigo-600" aria-label={`Cambiar el pack ${pk.nombre}`}><Pencil size={14} /></button>
              <button onClick={() => { if (confirm(`¿Borrar el pack «${pk.nombre}»?`)) onAccion(() => deletePack(pk.id)); }} disabled={busy}
                className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-red-500" aria-label={`Borrar el pack ${pk.nombre}`}><Trash2 size={14} /></button>
            </span>
          </div>
        );
      })}
      {editando === 'nuevo'
        ? <FormPack kinds={kinds} tarifa={tarifa} busy={busy} onCancelar={() => setEditando(null)}
            onGuardar={(v) => { onAccion(() => savePack(v)); setEditando(null); }} />
        : <Button size="sm" variant="secondary" icon={<Plus size={14} />} disabled={busy || kinds.length < 2} onClick={() => setEditando('nuevo')}>Nuevo pack</Button>}
    </div>
  );
}

function FormPack({ inicial, kinds, tarifa, busy, onGuardar, onCancelar }: {
  inicial?: Pack; kinds: GroupKindRow[]; tarifa: Tarifa; busy: boolean;
  onGuardar: (v: { tipos: string[]; precio: string; nombre: string }) => void; onCancelar: () => void;
}) {
  const [tipos, setTipos] = useState<string[]>(inicial?.tipos ?? []);
  const [precio, setPrecio] = useState(inicial ? String(inicial.precio).replace('.', ',') : '');
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const suelto = tipos.length >= 2 ? precioSuelto(tipos, tarifa) : null;
  const inp = 'text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2';
  return (
    <div className="rounded-xl border-2 border-indigo-500/30 p-3 space-y-3">
      <div>
        <span className={cx(TEXT.muted, 'block mb-1.5')}>Qué tipos junta (dos o más):</span>
        <div className="flex flex-wrap gap-1.5">
          {kinds.map((k) => {
            const on = tipos.includes(k.id);
            return (
              <button key={k.id} type="button" aria-pressed={on}
                onClick={() => setTipos(on ? tipos.filter((x) => x !== k.id) : [...tipos, k.id])}
                className={cx('min-h-[44px] px-3 rounded-lg text-sm font-bold border-2 transition-colors',
                  on ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400')}>
                {k.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          Precio <input value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="100" className={cx(inp, 'w-24 text-right tabular-nums font-bold')} /> €/mes
        </label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60}
          placeholder={tipos.length >= 2 ? nombreDePack(tipos, tarifa) : 'Nombre (opcional)'} className={cx(inp, 'flex-1 min-w-[10rem]')} />
      </div>
      {suelto !== null && <p className={TEXT.muted}>Por separado serían {eur(suelto)}.</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || tipos.length < 2 || !precio.trim()} onClick={() => onGuardar({ tipos, precio, nombre })}>{inicial ? 'Guardar' : 'Crear el pack'}</Button>
        <Button size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Button>
      </div>
    </div>
  );
}

/**
 * Lo que pagaría un alumno según sus grupos, con la tarifa de ahora: así el
 * dueño ve el efecto de un pack sin ir a Pagos.
 */
function Ejemplos({ tarifa }: { tarifa: Tarifa }) {
  const ids = tarifa.tipos.map((t) => t.id);
  const combos: string[][] = [
    ...ids.map((id) => [id]),
    ...tarifa.packs.map((p) => p.tipos),
  ];
  const vistos = new Set<string>();
  const filas = combos
    .filter((c) => { const k = [...c].sort().join('+'); if (vistos.has(k)) return false; vistos.add(k); return true; })
    .map((c) => ({ tipos: c, cuota: cuotaDeAlumno({ tipos: c, tarifa }) }))
    .filter((f) => f.cuota.importe !== null);
  if (!filas.length) return null;
  return (
    <div className="space-y-1.5">
      <SectionLabel>Así se calcula la cuota</SectionLabel>
      <p className={TEXT.muted}>Cada alumno paga lo de los tipos de sus grupos (dos grupos del mismo tipo cuentan una vez), con el pack más barato que le encaje. Un alumno concreto puede tener su cuota propia: se pone en «Pagos».</p>
      <ul className="text-xs space-y-1">
        {filas.map((f) => (
          <li key={f.tipos.join('+')} className="flex items-center justify-between gap-3 tabular-nums">
            <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1.5"><Euro size={11} className="text-slate-400" />En {nombreDePack(f.tipos, tarifa)}</span>
            <span className="font-bold text-slate-900 dark:text-white">{eur(f.cuota.importe)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type GrupoInput = {
  name: string; kind: string; schedule: string; staffIds: string[];
  // El horario estructurado (regla 82). Las plazas viajan como texto: un campo
  // vacío es «sin poner», y lo convierte a `null` el servidor (regla 16).
  weekdays: number[]; startTime: string; endTime: string; capacity: string;
  isMulti: boolean;
};
function campos(g?: GroupRow, kinds: GroupKindRow[] = []): GrupoInput {
  return {
    name: g?.name ?? '', kind: g?.kind ?? kinds[0]?.id ?? 'otro', schedule: g?.schedule ?? '', staffIds: g?.staffIds ?? [],
    weekdays: g?.horario.weekdays ?? [], startTime: g?.horario.startTime ?? '', endTime: g?.horario.endTime ?? '',
    capacity: g?.horario.capacity == null ? '' : String(g.horario.capacity),
    isMulti: g?.esMulti ?? false,
  };
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
      </div>
      {(v.isMulti || kinds.find((k) => k.id === v.kind)?.lleva_plan) && <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer min-h-[44px]">
        <input type="checkbox" className="w-5 h-5 mt-0.5 shrink-0" checked={v.isMulti}
          onChange={(e) => setV(e.target.checked
            // Multi no tiene horario propio: se vacía, para que no se cuele.
            ? { ...v, isMulti: true, weekdays: [], startTime: '', endTime: '', capacity: '' }
            : { ...v, isMulti: false })} />
        <span>
          <b>Multidisciplinar (Multi)</b>: sin días propios; sus alumnos se apuntan cada semana a clases de otros grupos.
          Sus sesiones sueltas (las de las 18:30) se ponen en el cuadrante.
        </span>
      </label>}
      {/* EL HORARIO (regla 82). De aquí salen las sesiones en las que el
          alumno puede avisar de que falta, y las plazas libres de cada una.
          Un grupo Multi no tiene: se apuntan a las de los demás (regla 96). */}
      {!v.isMulti && <div className="space-y-2">
        <span className={cx(TEXT.muted, 'block')}>Días de clase:</span>
        <div className="flex flex-wrap gap-1.5">
          {DIAS_SEMANA.map((d) => {
            const activo = v.weekdays.includes(d.n);
            return (
              <button
                key={d.n}
                type="button"
                aria-pressed={activo}
                title={d.largo}
                onClick={() => setV({ ...v, weekdays: activo ? v.weekdays.filter((x) => x !== d.n) : [...v.weekdays, d.n].sort() })}
                className={cx(
                  'w-11 h-11 rounded-lg text-sm font-black border-2 transition-colors',
                  activo
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-400',
                )}
              >
                {d.corto}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Hora escrita, no `type="time"`: en Android salía vacío con una
              flecha (reglas 97 y 99). El servidor entiende «8», «0800», «8.00». */}
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            De <input inputMode="numeric" autoComplete="off" placeholder="08:00" className={cx(inp, 'w-20')} value={v.startTime} onChange={(e) => setV({ ...v, startTime: e.target.value })} />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            a <input inputMode="numeric" autoComplete="off" placeholder="09:00" className={cx(inp, 'w-20')} value={v.endTime} onChange={(e) => setV({ ...v, endTime: e.target.value })} />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            Plazas <input type="number" min={1} max={500} inputMode="numeric" className={cx(inp, 'w-20')} value={v.capacity} onChange={(e) => setV({ ...v, capacity: e.target.value })} />
          </label>
        </div>
      </div>}
      <input className={cx(inp, 'w-full')} placeholder="Nota del horario (opcional: aula, observaciones…)" value={v.schedule} onChange={(e) => setV({ ...v, schedule: e.target.value })} />
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

function FilaGrupo({ g, kinds, staff, busy, precio, onGuardar, onBorrar }: {
  g: GroupRow; kinds: GroupKindRow[]; staff: StaffMember[]; busy: boolean; precio: number | null; onGuardar: (v: GrupoInput) => void; onBorrar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800">
      <button onClick={() => setAbierto((x) => !x)} className="w-full flex items-center justify-between gap-3 p-3 text-left">
        <span className="min-w-0">
          <span className="block font-bold text-slate-900 dark:text-white truncate">{g.name}</span>
          <span className={cx(TEXT.muted, 'flex items-center gap-2 flex-wrap')}>
            <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-600 dark:text-slate-300">{g.kindLabel}{precio !== null && <span className="normal-case font-bold"> · {eur(precio)}/mes</span>}</span>
            <span>{g.miembros} {g.miembros === 1 ? 'alumno' : 'alumnos'}</span>
            {g.staffNames.length > 0 && <span>· {g.staffNames.join(', ')}</span>}
            {horarioEnTexto(g.horario) && <span>· {horarioEnTexto(g.horario)}</span>}
            {g.schedule && <span>· {g.schedule}</span>}
            {/* Un grupo de física sin días no es una clase: no sale en el cuadrante (regla 97). */}
            {g.llevaPlan && !g.esMulti && !g.horario.weekdays?.length && <span className="text-orange-700 dark:text-orange-400 font-bold">sin horario: no sale en el cuadrante</span>}
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

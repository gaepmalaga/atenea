'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users2, RefreshCw, Plus, Trash2, Tag } from 'lucide-react';
import {
  getGroups, createGroup, updateGroup, deleteGroup,
  getGroupKinds, saveGroupKind, deleteGroupKind, listStaff,
} from '@/actions';
import type { GroupRow } from '@/app/actions/groups';
import type { StaffMember } from '@/app/lib/academy-settings';
import type { GroupKindRow } from '@/app/lib/groups';
import { DIAS_SEMANA, horarioEnTexto } from '@/app/lib/asistencia';
import {
  PanelTitulo, Hoja, Rotulo, Aviso, Atras, Boton, Campo, CampoSelect, Filtros, FiltroChip, Etiqueta, EmptyState, TEXT, cx,
} from '../../ui';

/**
 * «Grupos» (P7 · rehecho en P8 · rediseñado en noviembre 2026) — aquí se
 * DEFINEN los grupos: nombre, tipo (de una lista que tú editas), horario y
 * profesores (varios). Meter alumnos NO se hace aquí: se hace desde cada
 * alumno, en «Alumnos».
 *
 * Dos vistas: el CUADRANTE (la semana entera, para ver huecos y reparto) y el
 * EDITOR de un grupo, al que se llega con «Editar grupo».
 */
export default function AdminGroups() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [kinds, setKinds] = useState<GroupKindRow[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // `null` es el cuadrante; `'nuevo'`, el editor en blanco; un id, ese grupo.
  const [editando, setEditando] = useState<string | 'nuevo' | null>(null);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [g, k, s] = await Promise.all([getGroups(), getGroupKinds(), listStaff()]);
    if (g.success) setGroups(g.groups); else setError(g.error);
    if (k.success) setKinds(k.kinds);
    if (s.success) setStaff(s.staff.filter((x) => x.active));
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function accion(fn: () => Promise<{ success: boolean; error?: string }>): Promise<boolean> {
    setBusy(true);
    const res = await fn();
    if (!res.success) setError(res.error ?? 'No se pudo guardar.');
    else setError(null);
    await cargar();
    setBusy(false);
    return res.success;
  }

  const abrir = (id: string | 'nuevo') => { setEditando(id); window.scrollTo({ top: 0 }); };
  const g = editando && editando !== 'nuevo' ? groups.find((x) => x.id === editando) : undefined;

  if (editando) {
    return (
      <div className="space-y-5 animate-in fade-in pb-24">
        <Atras onClick={() => setEditando(null)}>Grupos</Atras>
        <PanelTitulo titulo={editando === 'nuevo' ? 'Nuevo grupo' : 'Editar grupo'} sub="Cambia su horario, sus profesores o su tipo." />
        {error && <Aviso tono="malo">{error}</Aviso>}

        {/* Cambiar de grupo sin volver al cuadrante. */}
        {groups.length > 0 && (
          <div className="max-w-sm">
            <CampoSelect label="Grupo" value={editando === 'nuevo' ? '' : editando} onChange={(e) => setEditando(e.target.value || 'nuevo')}>
              {editando === 'nuevo' && <option value="">Nuevo grupo</option>}
              {groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </CampoSelect>
          </div>
        )}

        {editando !== 'nuevo' && !g ? (
          <EmptyState icon={<Users2 size={36} />} title="Ese grupo ya no existe" bordered />
        ) : (
          <Formulario
            key={editando}
            inicial={campos(g, kinds)}
            kinds={kinds}
            staff={staff}
            busy={busy}
            miembros={g?.miembros ?? 0}
            onSubmit={async (v) => {
              const ok = await accion(() => (g ? updateGroup(g.id, v) : createGroup(v)));
              if (ok && !g) setEditando(null);
            }}
            onDescartar={() => setEditando(null)}
            puedeBorrar={!!g}
            onBorrar={() => {
              // Borrar un grupo arrastra sus clases, faltas, multis apuntados y
              // la pertenencia de sus alumnos, y la base de datos del plan
              // gratuito no tiene copias: el 6 nov se perdió así un grupo entero.
              if (g && confirm(`¿Borrar «${g.name}»? Se pierden también sus clases del cuadrante, las faltas avisadas y quién estaba dentro (${g.miembros} ${g.miembros === 1 ? 'alumno' : 'alumnos'}). No se puede deshacer.`)) {
                accion(() => deleteGroup(g.id)).then((ok) => { if (ok) setEditando(null); });
              }
            }}
          />
        )}
      </div>
    );
  }

  const conHorario = groups.filter((x) => !x.esMulti && x.horario.weekdays?.length && x.horario.startTime && x.horario.endTime);
  const sinHorario = groups.length - conHorario.length;

  return (
    <div className="space-y-5 animate-in fade-in pb-24">
      <PanelTitulo
        titulo="Grupos"
        sub={`${conHorario.length} con horario${sinHorario ? ` y ${sinHorario} sin él` : ''}. Los alumnos se asignan desde «Alumnos».`}
        acciones={
          <>
            <Boton variant="secondary" onClick={() => { setLoading(true); cargar(); }} icon={<RefreshCw size={15} className={loading ? 'animate-spin' : ''} />}>Recargar</Boton>
            <Boton icon={<Plus size={15} />} onClick={() => abrir('nuevo')}>Nuevo grupo</Boton>
          </>
        }
      />

      {error && <Aviso tono="malo">{error}</Aviso>}

      {!loading && groups.length === 0 && (
        <EmptyState icon={<Users2 size={40} />} title="Todavía no hay grupos" hint="Crea el primero con «Nuevo grupo»." bordered />
      )}

      {groups.length > 0 && (
        <Cuadrante
          groups={groups}
          staff={staff}
          seleccionado={seleccionado}
          onSeleccion={setSeleccionado}
          onEditar={abrir}
        />
      )}

      <Tipos kinds={kinds} busy={busy} onAccion={accion} />
    </div>
  );
}

// ─── El cuadrante: la semana tipo ───

const PX_HORA = 48;

/** «08:30» → 8,5. `null` si no se entiende. */
function aHoras(t: string | null | undefined): number | null {
  const m = /^(\d{1,2})(?:[:.]?(\d{2}))?$/.exec((t ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0);
  return h >= 0 && h <= 24 ? h : null;
}

function Cuadrante({ groups, staff, seleccionado, onSeleccion, onEditar }: {
  groups: GroupRow[]; staff: StaffMember[]; seleccionado: string | null; onSeleccion: (id: string) => void; onEditar: (id: string) => void;
}) {
  const [profe, setProfe] = useState('');
  const [dia, setDia] = useState<number | null>(null);

  const clases = groups.flatMap((x) => {
    const ini = aHoras(x.horario.startTime), fin = aHoras(x.horario.endTime);
    if (x.esMulti || ini === null || fin === null || fin <= ini) return [];
    return (x.horario.weekdays ?? []).map((d) => ({ g: x, d, ini, fin }));
  });
  const diasUsados = DIAS_SEMANA.filter((d) => d.n <= 5 || clases.some((c) => c.d === d.n));
  const desde = clases.length ? Math.floor(Math.min(...clases.map((c) => c.ini))) : 8;
  const hasta = clases.length ? Math.ceil(Math.max(...clases.map((c) => c.fin))) : 20;
  const alto = (hasta - desde) * PX_HORA;
  const diaMovil = dia ?? diasUsados.find((d) => clases.some((c) => c.d === d.n))?.n ?? 1;

  const sel = groups.find((x) => x.id === seleccionado) ?? null;
  const oculta = (x: GroupRow) => !!profe && !x.staffIds.includes(profe);
  const bloque = (x: GroupRow) => x.llevaPlan
    ? 'border-oro bg-oro/20 text-oro-oscuro dark:bg-oro/15 dark:text-oro-claro border'
    : 'border-indigo-900 bg-indigo-900 text-white dark:border-indigo-300 dark:bg-indigo-300 dark:text-marino-hondo border';
  const lleno = (x: GroupRow) => x.horario.capacity !== null && x.miembros >= x.horario.capacity;

  return (
    <div className="space-y-4">
      {staff.length > 0 && (
        <Filtros etiqueta="Filtrar por profesor">
          <FiltroChip activo={!profe} onClick={() => setProfe('')}>Todos los profesores</FiltroChip>
          {staff.map((s) => <FiltroChip key={s.id} activo={profe === s.id} onClick={() => setProfe(s.id)}>{s.name}</FiltroChip>)}
        </Filtros>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_17rem]">
        {/* ESCRITORIO Y TABLET: la rejilla de la semana */}
        <Hoja className="hidden overflow-hidden sm:block">
          <div className="grid" style={{ gridTemplateColumns: `3.25rem repeat(${diasUsados.length}, minmax(0, 1fr))` }}>
            <div className="border-b border-linea bg-hundido dark:border-noche-linea dark:bg-noche-hondo" />
            {diasUsados.map((d) => (
              <div key={d.n} className="border-b border-linea bg-hundido py-2.5 text-center font-titulo text-[15px] font-semibold uppercase tracking-widest dark:border-noche-linea dark:bg-noche-hondo">
                <span className="hidden lg:inline">{d.largo}</span><span className="lg:hidden">{d.corto}</span>
              </div>
            ))}
            <div className="relative" style={{ height: alto + 12 }}>
              {Array.from({ length: hasta - desde + 1 }, (_, i) => (
                <span key={i} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-slate-600 dark:text-slate-400" style={{ top: 6 + i * PX_HORA }}>
                  {String(desde + i).padStart(2, '0')}:00
                </span>
              ))}
            </div>
            {diasUsados.map((d) => (
              <div key={d.n} className="relative border-l border-linea dark:border-noche-linea" style={{ height: alto + 12 }}>
                {clases.filter((c) => c.d === d.n).map((c) => (
                  <button
                    key={c.g.id}
                    type="button"
                    onClick={() => onSeleccion(c.g.id)}
                    className={cx(
                      'absolute inset-x-1 overflow-hidden rounded-md px-2 py-1.5 text-left text-xs leading-tight transition-opacity',
                      bloque(c.g),
                      oculta(c.g) && 'opacity-20',
                      seleccionado === c.g.id && 'outline outline-[3px] outline-offset-1 outline-oro',
                    )}
                    style={{ top: 6 + (c.ini - desde) * PX_HORA + 1, height: (c.fin - c.ini) * PX_HORA - 3 }}
                  >
                    <b className="block font-titulo text-[15px] font-semibold leading-none tracking-wide">{c.g.name}</b>
                    <span className="tabular-nums">{c.g.horario.startTime}–{c.g.horario.endTime}</span>
                    {c.g.horario.capacity !== null && <span className="tabular-nums"> · {c.g.miembros}/{c.g.horario.capacity}</span>}
                    {lleno(c.g) && <span className="block text-[10px] font-bold uppercase tracking-wide">Completo</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Hoja>

        {/* MÓVIL: una agenda de un día, con los días arriba */}
        <div className="space-y-3 sm:hidden">
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${diasUsados.length}, minmax(0, 1fr))` }} role="group" aria-label="Día">
            {diasUsados.map((d) => (
              <button
                key={d.n}
                type="button"
                aria-pressed={diaMovil === d.n}
                aria-label={d.largo}
                onClick={() => setDia(d.n)}
                className={cx(
                  'grid min-h-[52px] place-items-center rounded-lg border font-titulo text-lg font-semibold tracking-wide',
                  diaMovil === d.n ? 'border-indigo-900 bg-indigo-900 text-white dark:border-indigo-300 dark:bg-indigo-300 dark:text-marino-hondo' : 'border-linea bg-white dark:border-noche-linea dark:bg-noche-2',
                )}
              >
                {d.corto}
                <small className="-mt-1 font-sans text-[10px] font-normal opacity-80">{clases.filter((c) => c.d === d.n).length} clases</small>
              </button>
            ))}
          </div>
          {clases.filter((c) => c.d === diaMovil && !oculta(c.g)).sort((a, b) => a.ini - b.ini).map((c) => (
            <Hoja key={c.g.id} className={cx('grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 border-l-4 p-3', c.g.llevaPlan ? 'border-l-oro' : 'border-l-indigo-900 dark:border-l-indigo-300')}>
              <div className="font-titulo text-xl font-bold leading-none tabular-nums">{c.g.horario.startTime}<small className="mt-1 block font-sans text-xs font-normal text-slate-600 dark:text-slate-400">{c.g.horario.endTime}</small></div>
              <div className="min-w-0 space-y-2">
                <div className="flex items-start justify-between gap-2"><h4 className="font-titulo text-xl font-bold leading-tight tracking-wide">{c.g.name}</h4>{lleno(c.g) && <Etiqueta tono="malo">Completo</Etiqueta>}</div>
                <p className={TEXT.muted}>{c.g.kindLabel}{c.g.staffNames.length > 0 && ` · ${c.g.staffNames.join(', ')}`}</p>
                {c.g.horario.capacity !== null && <p className="text-xs tabular-nums">Plazas <b>{c.g.miembros}</b> de {c.g.horario.capacity}</p>}
                <Boton size="sm" variant="secondary" onClick={() => onEditar(c.g.id)}>Editar grupo</Boton>
              </div>
            </Hoja>
          ))}
          {clases.filter((c) => c.d === diaMovil && !oculta(c.g)).length === 0 && <Hoja pad="md" className="text-sm text-slate-600 dark:text-slate-400">Ese día no hay clases{profe ? ' con ese profesor' : ''}.</Hoja>}
        </div>

        {/* LO SELECCIONADO, LA LEYENDA Y LOS GRUPOS SIN HORARIO */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          {sel && (
            <Hoja pad="md" className="hidden space-y-2.5 sm:block">
              <Rotulo>Seleccionado</Rotulo>
              <h4 className="font-titulo text-xl font-bold uppercase leading-tight tracking-wide">{sel.name}</h4>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
                <dt className="text-slate-600 dark:text-slate-400">Tipo</dt><dd className="font-medium">{sel.kindLabel}</dd>
                <dt className="text-slate-600 dark:text-slate-400">Horario</dt><dd className="font-medium">{horarioEnTexto(sel.horario) ?? 'Sin horario'}</dd>
                <dt className="text-slate-600 dark:text-slate-400">Alumnos</dt><dd className="font-medium">{sel.miembros}</dd>
                <dt className="text-slate-600 dark:text-slate-400">Profesores</dt><dd className="font-medium">{sel.staffNames.join(', ') || '—'}</dd>
              </dl>
              <Boton size="sm" onClick={() => onEditar(sel.id)}>Editar grupo</Boton>
            </Hoja>
          )}
          <Hoja pad="md" className="space-y-2">
            <Rotulo>Tipos</Rotulo>
            <p className="flex items-center gap-2 text-[13px]"><i className="h-3.5 w-3.5 rounded bg-indigo-900 dark:bg-indigo-300" aria-hidden /> Teoría</p>
            <p className="flex items-center gap-2 text-[13px]"><i className="h-3.5 w-3.5 rounded border border-oro bg-oro/30" aria-hidden /> Lleva plan de entrenamiento</p>
          </Hoja>
          {groups.some((x) => !conClase(x)) && (
            <Hoja pad="md" className="space-y-2 border-dashed">
              <Rotulo>Sin horario propio</Rotulo>
              {groups.filter((x) => !conClase(x)).map((x) => (
                <div key={x.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">{x.name}</p>
                    <p className={TEXT.muted}>{x.esMulti ? `Multi · ${x.miembros} ${x.miembros === 1 ? "alumno" : "alumnos"}` : `${x.miembros} ${x.miembros === 1 ? "alumno" : "alumnos"}`}</p>
                    {/* Un grupo de física sin días no es una clase: no sale en el cuadrante (regla 97). */}
                    {x.llevaPlan && !x.esMulti && <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Sin horario: no sale en el cuadrante</p>}
                  </div>
                  <Boton size="sm" variant="secondary" onClick={() => onEditar(x.id)}>Editar</Boton>
                </div>
              ))}
            </Hoja>
          )}
        </div>
      </div>
    </div>
  );
}

function conClase(x: GroupRow): boolean {
  return !x.esMulti && !!x.horario.weekdays?.length && aHoras(x.horario.startTime) !== null && aHoras(x.horario.endTime) !== null;
}

// ─── Tipos de grupo (lista editable) ───
function Tipos({ kinds, busy, onAccion }: { kinds: GroupKindRow[]; busy: boolean; onAccion: (fn: () => Promise<{ success: boolean; error?: string }>) => Promise<boolean> }) {
  const [nuevo, setNuevo] = useState('');
  const [llevaPlan, setLlevaPlan] = useState(false);
  return (
    <details className="group rounded-lg border border-linea bg-white dark:border-noche-linea dark:bg-noche-2">
      <summary className="flex min-h-[48px] cursor-pointer items-center gap-2 px-4 text-sm font-semibold text-slate-900 dark:text-white"><Tag size={14} /> Tipos de grupo ({kinds.length})</summary>
      <div className="space-y-2 border-t border-linea px-4 py-3 dark:border-noche-linea">
        {kinds.map((k) => (
          <div key={k.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">{k.label}</span>
            <span className="flex items-center gap-2">
              {k.lleva_plan && <Etiqueta tono="oro">lleva plan</Etiqueta>}
              <button type="button" onClick={() => onAccion(() => deleteGroupKind(k.id))} disabled={busy} className="grid h-11 w-11 place-items-center text-slate-500 hover:text-red-700 dark:hover:text-red-300" aria-label={`Borrar el tipo ${k.label}`}>
                <Trash2 size={15} />
              </button>
            </span>
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-3 pt-1">
          <div className="min-w-[12rem] flex-1">
            <Campo label="Nuevo tipo" value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Oposición completa" />
          </div>
          <label className="flex min-h-[46px] items-center gap-2 text-[13px]">
            <input type="checkbox" className="h-5 w-5 accent-indigo-900" checked={llevaPlan} onChange={(e) => setLlevaPlan(e.target.checked)} /> lleva plan de entrenamiento
          </label>
          <Boton disabled={busy || !nuevo.trim()} onClick={() => { onAccion(() => saveGroupKind({ label: nuevo, lleva_plan: llevaPlan })); setNuevo(''); setLlevaPlan(false); }}>Añadir</Boton>
        </div>
      </div>
    </details>
  );
}

// ─── El editor de un grupo ───
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

function Formulario({ inicial, kinds, staff, busy, miembros, onSubmit, onDescartar, onBorrar, puedeBorrar }: {
  inicial: GrupoInput; kinds: GroupKindRow[]; staff: StaffMember[]; busy: boolean; miembros: number;
  onSubmit: (v: GrupoInput) => void; onDescartar: () => void; onBorrar: () => void; puedeBorrar: boolean;
}) {
  const [v, setV] = useState(inicial);
  const sucio = JSON.stringify(v) !== JSON.stringify(inicial);
  const lleva = v.isMulti || kinds.find((k) => k.id === v.kind)?.lleva_plan;

  // La vista previa: lo que saldría de lo escrito, antes de guardarlo.
  const ini = aHoras(v.startTime), fin = aHoras(v.endTime);
  const horas = ini !== null && fin !== null && fin > ini ? (fin - ini) * v.weekdays.length : null;
  const plazas = v.capacity.trim() ? Number(v.capacity) : null;
  const libres = plazas !== null && Number.isFinite(plazas) ? plazas - miembros : null;

  return (
    <Hoja pad="lg" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-titulo text-2xl font-bold leading-none tracking-wide">{v.name || 'Sin nombre'}</h3>
        <Etiqueta tono={sucio ? 'aviso' : 'ok'}>{sucio ? 'Cambios sin guardar' : 'Guardado'}</Etiqueta>
      </div>

      <div className="grid gap-4 sm:grid-cols-[2fr_1.2fr]">
        <Campo label="Nombre" placeholder="Promoción 41 tarde" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <CampoSelect label="Tipo" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>
          {kinds.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </CampoSelect>
      </div>

      {lleva && (
        <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-[13px]">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-indigo-900" checked={v.isMulti}
            onChange={(e) => setV(e.target.checked
              // Multi no tiene horario propio: se vacía, para que no se cuele.
              ? { ...v, isMulti: true, weekdays: [], startTime: '', endTime: '', capacity: '' }
              : { ...v, isMulti: false })} />
          <span>
            <b>Multidisciplinar (Multi)</b>: sin días propios; sus alumnos se apuntan cada semana a clases de otros grupos.
            Sus sesiones sueltas (las de las 18:30) se ponen en el cuadrante.
          </span>
        </label>
      )}

      {/* EL HORARIO (regla 82). De aquí salen las sesiones en las que el
          alumno puede avisar de que falta, y las plazas libres de cada una.
          Un grupo Multi no tiene: se apuntan a las de los demás (regla 96). */}
      {!v.isMulti && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Rotulo>Días de clase</Rotulo>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Días de clase">
              {DIAS_SEMANA.map((d) => {
                const activo = v.weekdays.includes(d.n);
                return (
                  <button
                    key={d.n}
                    type="button"
                    aria-pressed={activo}
                    title={d.largo}
                    aria-label={d.largo}
                    onClick={() => setV({ ...v, weekdays: activo ? v.weekdays.filter((x) => x !== d.n) : [...v.weekdays, d.n].sort() })}
                    className={cx(
                      'h-12 w-12 rounded-lg border-[1.5px] font-titulo text-xl font-bold transition-colors max-sm:flex-1',
                      activo
                        ? 'border-indigo-900 bg-indigo-900 text-white dark:border-indigo-300 dark:bg-indigo-300 dark:text-marino-hondo'
                        : 'border-linea bg-white text-slate-800 hover:border-indigo-700 dark:border-noche-linea dark:bg-noche-2 dark:text-slate-200',
                    )}
                  >
                    {d.corto}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Hora escrita, no `type="time"`: en Android salía vacío con una
              flecha (reglas 97 y 99). El servidor entiende «8», «0800», «8.00». */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Campo label="Empieza" inputMode="numeric" autoComplete="off" placeholder="08:00" value={v.startTime} onChange={(e) => setV({ ...v, startTime: e.target.value })} />
            <Campo label="Termina" inputMode="numeric" autoComplete="off" placeholder="09:00" value={v.endTime} onChange={(e) => setV({ ...v, endTime: e.target.value })} />
            <div className="col-span-2 sm:col-span-1">
              <Campo label="Plazas" type="number" min={1} max={500} inputMode="numeric" value={v.capacity} onChange={(e) => setV({ ...v, capacity: e.target.value })} />
            </div>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-2 rounded-lg border border-linea bg-hundido px-4 py-3 dark:border-noche-linea dark:bg-noche-hondo">
            <div><strong className="block font-titulo text-2xl font-bold leading-tight tabular-nums">{v.weekdays.length}</strong><span className="text-xs text-slate-600 dark:text-slate-400">{v.weekdays.length === 1 ? 'clase' : 'clases'} a la semana</span></div>
            <div><strong className="block font-titulo text-2xl font-bold leading-tight tabular-nums">{horas === null ? '—' : `${Math.round(horas * 10) / 10} h`.replace('.', ',')}</strong><span className="text-xs text-slate-600 dark:text-slate-400">de clase a la semana</span></div>
            <div><strong className={cx('block font-titulo text-2xl font-bold leading-tight tabular-nums', libres !== null && libres <= 0 && 'text-red-700 dark:text-red-300')}>{libres === null ? '—' : libres < 0 ? `Pasa ${-libres}` : libres}</strong><span className="text-xs text-slate-600 dark:text-slate-400">{libres !== null && libres < 0 ? 'alumnos de más que plazas' : 'plazas libres'}</span></div>
          </div>
        </div>
      )}

      <Campo label="Nota del horario (opcional)" placeholder="Aula, observaciones…" value={v.schedule} onChange={(e) => setV({ ...v, schedule: e.target.value })} />

      {staff.length > 0 && (
        <div className="space-y-2">
          <Rotulo>Profesores</Rotulo>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Profesores">
            {staff.map((s) => {
              const on = v.staffIds.includes(s.id);
              return (
                <button key={s.id} type="button" aria-pressed={on}
                  onClick={() => setV({ ...v, staffIds: on ? v.staffIds.filter((x) => x !== s.id) : [...v.staffIds, s.id] })}
                  className={cx('min-h-[44px] rounded-lg border px-3.5 text-[13px] font-medium', on ? 'border-indigo-900 bg-indigo-900 text-white dark:border-indigo-300 dark:bg-indigo-300 dark:text-marino-hondo' : 'border-linea bg-white dark:border-noche-linea dark:bg-noche-2')}>
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className={TEXT.muted}>{miembros} {miembros === 1 ? 'alumno dentro' : 'alumnos dentro'}. Se añaden y se quitan desde su ficha en «Alumnos».</p>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linea pt-5 dark:border-noche-linea">
        <div className="max-w-md">
          {puedeBorrar && (
            <>
              <p className={TEXT.muted}>Borrar un grupo borra también sus clases del cuadrante, las faltas avisadas y quién estaba dentro. No se puede deshacer.</p>
              <Boton variant="danger" className="mt-2" disabled={busy} onClick={onBorrar} icon={<Trash2 size={14} />}>Borrar el grupo</Boton>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:[&>*]:flex-1">
          <Boton variant="secondary" onClick={onDescartar}>{sucio ? 'Descartar' : 'Volver'}</Boton>
          <Boton disabled={busy || !sucio || !v.name.trim()} onClick={() => onSubmit(v)}>{inicial.name ? 'Guardar cambios' : 'Crear grupo'}</Boton>
        </div>
      </div>
    </Hoja>
  );
}

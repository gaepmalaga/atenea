'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users2, RefreshCw, Plus, Trash2, Tag, Package, Pencil } from 'lucide-react';
import {
  getGroups, createGroup, updateGroup, deleteGroup,
  getGroupKinds, saveGroupKind, deleteGroupKind, listStaff,
  getTarifa, setPrecioTipo, savePack, deletePack,
} from '@/actions';
import type { GroupRow } from '@/app/actions/groups';
import type { StaffMember } from '@/app/lib/academy-settings';
import { enCarriles, tramosDeHoras, type GroupKindRow } from '@/app/lib/groups';
import { nombreCorto } from '@/app/lib/cuadrante';
import { eur, precioSuelto, nombreDePack, cuotaDeAlumno, type Tarifa, type Pack } from '@/app/lib/cuotas';
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
  const [tarifa, setTarifa] = useState<Tarifa>({ tipos: [], packs: [] });
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // `null` es el cuadrante; `'nuevo'`, el editor en blanco; un id, ese grupo.
  const [editando, setEditando] = useState<string | 'nuevo' | null>(null);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [g, k, s, t] = await Promise.all([getGroups(), getGroupKinds(), listStaff(), getTarifa()]);
    if (g.success) setGroups(g.groups); else setError(g.error);
    if (k.success) setKinds(k.kinds);
    if (t.success) setTarifa(t.tarifa);
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
          tarifa={tarifa}
        />
      )}

      <Tipos kinds={kinds} tarifa={tarifa} busy={busy} onAccion={accion} />
    </div>
  );
}

// ─── El cuadrante: la semana tipo ───

const PX_HORA = 56;

/** «08:30» → 8,5. `null` si no se entiende. */
function aHoras(t: string | null | undefined): number | null {
  const m = /^(\d{1,2})(?:[:.]?(\d{2}))?$/.exec((t ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0);
  return h >= 0 && h <= 24 ? h : null;
}

const SALTO = 26;

function Cuadrante({ groups, staff, seleccionado, onSeleccion, onEditar, tarifa }: {
  groups: GroupRow[]; staff: StaffMember[]; seleccionado: string | null; onSeleccion: (id: string) => void; onEditar: (id: string) => void; tarifa: Tarifa;
}) {
  const [profe, setProfe] = useState('');
  const [dia, setDia] = useState<number | null>(null);

  const clases = groups.flatMap((x) => {
    const ini = aHoras(x.horario.startTime), fin = aHoras(x.horario.endTime);
    if (x.esMulti || ini === null || fin === null || fin <= ini) return [];
    return (x.horario.weekdays ?? []).map((d) => ({ g: x, d, ini, fin }));
  });
  const diasUsados = DIAS_SEMANA.filter((d) => d.n <= 5 || clases.some((c) => c.d === d.n));
  // Solo las horas con clase; lo de en medio, un salto (de 9 a 20 no hay nada).
  const tramos = clases.length ? tramosDeHoras(clases) : [{ desde: 8, hasta: 14 }];
  const yDe = (h: number) => {
    let y = 6;
    for (const t of tramos) {
      if (h <= t.hasta) return y + (Math.max(h, t.desde) - t.desde) * PX_HORA;
      y += (t.hasta - t.desde) * PX_HORA + SALTO;
    }
    return y - SALTO;
  };
  const alto = yDe(tramos[tramos.length - 1].hasta) - 6;
  const saltos = tramos.slice(0, -1).map((t, i) => ({ y: yDe(t.hasta), de: t.hasta, a: tramos[i + 1].desde }));
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
              {tramos.flatMap((t) => Array.from({ length: t.hasta - t.desde + 1 }, (_, i) => t.desde + i)).map((h, i) => (
                <span key={`${h}-${i}`} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-slate-600 dark:text-slate-400" style={{ top: yDe(h) }}>
                  {String(h).padStart(2, '0')}:00
                </span>
              ))}
            </div>
            {diasUsados.map((d) => (
              <div key={d.n} className="relative border-l border-linea dark:border-noche-linea" style={{ height: alto + 12 }}>
                {saltos.map((x) => (
                  <div key={x.y} className="absolute inset-x-0 border-y border-dashed border-linea bg-hundido/60 dark:border-noche-linea dark:bg-noche-hondo/60" style={{ top: x.y + 2, height: SALTO - 4 }} aria-hidden />
                ))}
                {enCarriles(clases.filter((c) => c.d === d.n)).map((c) => (
                  <button
                    key={c.g.id}
                    type="button"
                    onClick={() => onSeleccion(c.g.id)}
                    className={cx(
                      'absolute overflow-hidden rounded-md px-2 py-1.5 text-left text-xs leading-tight transition-opacity',
                      bloque(c.g),
                      oculta(c.g) && 'opacity-20',
                      seleccionado === c.g.id && 'outline outline-[3px] outline-offset-1 outline-oro',
                    )}
                    style={{
                      top: yDe(c.ini) + 1,
                      height: yDe(c.fin) - yDe(c.ini) - 3,
                      left: `calc(${(c.carril / c.carriles) * 100}% + 3px)`,
                      width: `calc(${100 / c.carriles}% - 6px)`,
                    }}
                  >
                    {/* En un carril estrecho, «Alpha» y no «Promo 44 · Alpha»; el nombre entero, al pasar el ratón y en «Seleccionado». */}
                    <b className="block truncate font-titulo text-[15px] font-semibold leading-none tracking-wide" title={c.g.name}>{c.carriles > 1 ? nombreCorto(c.g.name) : c.g.name}</b>
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
                <dt className="text-slate-600 dark:text-slate-400">Precio</dt><dd className="font-medium">{(() => { const pr = tarifa.tipos.find((t) => t.id === sel.kind)?.precio; return pr == null ? 'Sin precio' : `${eur(pr)}/mes (${sel.kindLabel})`; })()}</dd>
              </dl>
              <Boton size="sm" onClick={() => onEditar(sel.id)}>Editar grupo</Boton>
            </Hoja>
          )}
          <Hoja pad="md" className="space-y-2">
            <Rotulo>Tipos</Rotulo>
            <p className="flex items-center gap-2 text-[13px]"><i className="h-3.5 w-3.5 rounded bg-indigo-900 dark:bg-indigo-300" aria-hidden /> Teoría, Inglés y el resto</p>
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

// ─── Tipos de grupo, sus precios y los packs (regla 104) ───
type Accion = (fn: () => Promise<{ success: boolean; error?: string }>) => Promise<boolean>;

/**
 * Los tipos de grupo con su precio al mes, y los packs. La cuota de cada
 * alumno sale de aquí: la combinación más barata de packs y precios sueltos
 * que cubre los tipos de sus grupos. Plegada: se toca al empezar el curso, no
 * a diario (regla 103); el resumen dice cómo está sin abrirla.
 */
function Tipos({ kinds, tarifa, busy, onAccion }: { kinds: GroupKindRow[]; tarifa: Tarifa; busy: boolean; onAccion: Accion }) {
  const [nuevo, setNuevo] = useState('');
  const [llevaPlan, setLlevaPlan] = useState(false);
  const precioDe = (id: string) => tarifa.tipos.find((t) => t.id === id)?.precio ?? null;
  const conPrecio = kinds.filter((k) => precioDe(k.id) !== null);
  const sinPrecio = kinds.filter((k) => precioDe(k.id) === null);
  return (
    <details className="group rounded-lg border border-linea bg-white dark:border-noche-linea dark:bg-noche-2" open={!conPrecio.length || undefined}>
      <summary className="flex min-h-[52px] cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
        <span className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><Tag size={14} /> Tipos de grupo y precios</span>
        {conPrecio.length > 0
          ? <span className="text-slate-600 dark:text-slate-400">{conPrecio.map((k) => `${k.label} ${eur(precioDe(k.id))}`).join(' · ')}{tarifa.packs.length ? ` · ${tarifa.packs.length} ${tarifa.packs.length === 1 ? 'pack' : 'packs'}` : ''}</span>
          : <Etiqueta tono="aviso">Sin precios: ponlos para que «Pagos» calcule las cuotas</Etiqueta>}
        {conPrecio.length > 0 && sinPrecio.length > 0 && <Etiqueta tono="aviso">Sin precio: {sinPrecio.map((k) => k.label).join(', ')}</Etiqueta>}
      </summary>
      <div className="space-y-6 border-t border-linea px-4 py-4 dark:border-noche-linea">
        <div className="space-y-1">
          <Rotulo>Precio al mes de cada tipo</Rotulo>
          {kinds.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-3 border-b border-linea py-1.5 last:border-0 dark:border-noche-linea">
              <span className="min-w-0 text-sm">
                <span className="font-medium">{k.label}</span>
                {k.lleva_plan && <Etiqueta tono="oro" className="ml-2">lleva plan</Etiqueta>}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <CampoPrecio valor={precioDe(k.id)} busy={busy} etiqueta={`Precio de ${k.label}`} onGuardar={(v) => onAccion(() => setPrecioTipo(k.id, v))} />
                <button type="button" onClick={() => { if (confirm(`¿Borrar el tipo «${k.label}»?`)) onAccion(() => deleteGroupKind(k.id)); }} disabled={busy}
                  className="grid h-11 w-11 place-items-center text-slate-500 hover:text-red-700 dark:hover:text-red-300" aria-label={`Borrar el tipo ${k.label}`}>
                  <Trash2 size={15} />
                </button>
              </span>
            </div>
          ))}
          <p className="pt-1 text-xs text-slate-600 dark:text-slate-400">Vacío es «sin precio», no gratis: sus alumnos salen en «Pagos» como «sin cuota». Cambiar un precio vale desde este mes para quien aún no ha pagado; los meses anteriores no cambian.</p>
          <div className="flex flex-wrap items-end gap-3 pt-2">
            <div className="min-w-[12rem] flex-1">
              <Campo label="Nuevo tipo" value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Psicotécnicos" />
            </div>
            <label className="flex min-h-[46px] items-center gap-2 text-[13px]">
              <input type="checkbox" className="h-5 w-5 accent-indigo-900" checked={llevaPlan} onChange={(e) => setLlevaPlan(e.target.checked)} /> lleva plan de entrenamiento
            </label>
            <Boton disabled={busy || !nuevo.trim()} onClick={() => { onAccion(() => saveGroupKind({ label: nuevo, lleva_plan: llevaPlan })); setNuevo(''); setLlevaPlan(false); }}>Añadir</Boton>
          </div>
        </div>

        <Packs kinds={kinds} tarifa={tarifa} busy={busy} onAccion={onAccion} />
        <Ejemplos tarifa={tarifa} />
      </div>
    </details>
  );
}

/** El campo de euros: se guarda al salir o con Intro, solo si ha cambiado. Vacío es «sin precio». */
function CampoPrecio({ valor, busy, etiqueta, onGuardar }: { valor: number | null; busy: boolean; etiqueta: string; onGuardar: (v: string) => void }) {
  const inicial = valor === null ? '' : String(valor).replace('.', ',');
  const [texto, setTexto] = useState(inicial);
  const [visto, setVisto] = useState(inicial);
  // Si el dato cambia desde fuera (al recargar), el campo lo sigue.
  if (inicial !== visto) { setVisto(inicial); setTexto(inicial); }
  const guarda = () => { if (texto.trim() !== inicial) onGuardar(texto); };
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
      <span className="w-24">
        <Campo value={texto} onChange={(e) => setTexto(e.target.value)} onBlur={guarda} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          disabled={busy} inputMode="decimal" autoComplete="off" placeholder="—" aria-label={etiqueta} className="text-right font-semibold tabular-nums" />
      </span>
      €/mes
    </span>
  );
}

function Packs({ kinds, tarifa, busy, onAccion }: { kinds: GroupKindRow[]; tarifa: Tarifa; busy: boolean; onAccion: Accion }) {
  const [editando, setEditando] = useState<Pack | 'nuevo' | null>(null);
  return (
    <div className="space-y-2">
      <Rotulo>Packs</Rotulo>
      {tarifa.packs.length === 0 && !editando && (
        <p className="text-[13px] text-slate-600 dark:text-slate-400">Ninguno. Un pack junta varios tipos por un precio: «Teoría + Físicas + Inglés, 100 €».</p>
      )}
      {tarifa.packs.map((pk) => {
        if (editando !== 'nuevo' && editando?.id === pk.id) {
          return <FormPack key={pk.id} inicial={pk} kinds={kinds} tarifa={tarifa} busy={busy} onCancelar={() => setEditando(null)}
            onGuardar={(v) => { onAccion(() => savePack({ ...v, id: pk.id })); setEditando(null); }} />;
        }
        const suelto = precioSuelto(pk.tipos, tarifa);
        const ahorro = suelto !== null ? suelto - pk.precio : null;
        return (
          <div key={pk.id} className="flex items-center justify-between gap-3 rounded-lg border border-linea px-3 py-2 dark:border-noche-linea">
            <span className="flex min-w-0 items-start gap-2">
              <Package size={15} className="mt-0.5 shrink-0 text-slate-600 dark:text-slate-400" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{pk.nombre} · {eur(pk.precio)}/mes</span>
                <span className="block text-xs text-slate-600 dark:text-slate-400">
                  {nombreDePack(pk.tipos, tarifa)}
                  {ahorro !== null && ahorro > 0 && <> · suelto serían {eur(suelto)}: ahorra {eur(ahorro)}</>}
                  {ahorro !== null && ahorro < 0 && <span className="text-amber-700 dark:text-amber-300"> · sale MÁS caro que suelto ({eur(suelto)}): no se aplicará</span>}
                </span>
              </span>
            </span>
            <span className="flex shrink-0">
              <button type="button" onClick={() => setEditando(pk)} disabled={busy} className="grid h-11 w-11 place-items-center text-slate-500 hover:text-indigo-900 dark:hover:text-indigo-200" aria-label={`Cambiar el pack ${pk.nombre}`}><Pencil size={14} /></button>
              <button type="button" onClick={() => { if (confirm(`¿Borrar el pack «${pk.nombre}»?`)) onAccion(() => deletePack(pk.id)); }} disabled={busy}
                className="grid h-11 w-11 place-items-center text-slate-500 hover:text-red-700 dark:hover:text-red-300" aria-label={`Borrar el pack ${pk.nombre}`}><Trash2 size={14} /></button>
            </span>
          </div>
        );
      })}
      {editando === 'nuevo'
        ? <FormPack kinds={kinds} tarifa={tarifa} busy={busy} onCancelar={() => setEditando(null)} onGuardar={(v) => { onAccion(() => savePack(v)); setEditando(null); }} />
        : <Boton size="sm" variant="secondary" icon={<Plus size={14} />} disabled={busy || kinds.length < 2} onClick={() => setEditando('nuevo')}>Nuevo pack</Boton>}
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
  return (
    <div className="space-y-3 rounded-lg border-2 border-indigo-900/30 p-3 dark:border-indigo-300/30">
      <div>
        <p className="mb-1.5 text-[12.5px] font-semibold text-slate-800 dark:text-slate-200">Qué tipos junta (dos o más)</p>
        <Filtros etiqueta="Tipos del pack">
          {kinds.map((k) => (
            <FiltroChip key={k.id} activo={tipos.includes(k.id)} onClick={() => setTipos(tipos.includes(k.id) ? tipos.filter((x) => x !== k.id) : [...tipos, k.id])}>{k.label}</FiltroChip>
          ))}
        </Filtros>
      </div>
      <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
        <Campo label="Precio (€/mes)" value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="100" />
        <Campo label="Nombre (opcional)" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} placeholder={tipos.length >= 2 ? nombreDePack(tipos, tarifa) : 'Completo'} />
      </div>
      {suelto !== null && <p className="text-xs text-slate-600 dark:text-slate-400">Por separado serían {eur(suelto)}.</p>}
      <div className="flex flex-wrap gap-2">
        <Boton size="sm" disabled={busy || tipos.length < 2 || !precio.trim()} onClick={() => onGuardar({ tipos, precio, nombre })}>{inicial ? 'Guardar' : 'Crear el pack'}</Boton>
        <Boton size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Boton>
      </div>
    </div>
  );
}

/** Lo que pagaría un alumno según sus grupos, con la tarifa de ahora. */
function Ejemplos({ tarifa }: { tarifa: Tarifa }) {
  const vistos = new Set<string>();
  const filas = [...tarifa.tipos.map((t) => [t.id]), ...tarifa.packs.map((p) => p.tipos)]
    .filter((c) => { const k = [...c].sort().join('+'); if (vistos.has(k)) return false; vistos.add(k); return true; })
    .map((c) => ({ tipos: c, cuota: cuotaDeAlumno({ tipos: c, tarifa }) }))
    .filter((f) => f.cuota.importe !== null);
  if (!filas.length) return null;
  return (
    <div className="space-y-1.5">
      <Rotulo>Así sale la cuota</Rotulo>
      <p className="text-xs text-slate-600 dark:text-slate-400">Cada alumno paga los tipos de sus grupos (dos grupos del mismo tipo cuentan una vez), con el pack más barato que le encaje. Una cuota propia, para un alumno concreto, se pone en «Pagos».</p>
      <ul className="divide-y divide-linea text-[13px] dark:divide-noche-linea">
        {filas.map((f) => (
          <li key={f.tipos.join('+')} className="flex justify-between gap-3 py-1.5 tabular-nums">
            <span className="text-slate-700 dark:text-slate-300">En {nombreDePack(f.tipos, tarifa)}</span>
            <b>{eur(f.cuota.importe)}</b>
          </li>
        ))}
      </ul>
    </div>
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

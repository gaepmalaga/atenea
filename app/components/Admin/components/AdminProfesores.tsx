'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, ArrowUp, Dumbbell, BookOpen, ChevronDown } from 'lucide-react';
import {
  listStaff, saveStaff, deleteStaff, listCuentasAcademia, getAgendaProfesores,
  getClasesHabituales, setClaseHabitual, getTemasProfesores, setTemasProfesor, getGroups,
} from '@/actions';
import type { GroupRow } from '@/app/actions/groups';
import type { StaffMember } from '@/app/lib/academy-settings';
import type { AgendaProfesor } from '@/app/actions/cuadrante';
import type { TemaDeProfesores } from '@/app/actions/profesores';
import {
  claveActividad, formateaTemas, resumenTemas, aciertoDe, MIN_RESPUESTAS_TEMA, type ClaseHabitual,
} from '@/app/lib/profesores';
import { lunesDe, etiquetaSemana } from '@/app/lib/sesiones';
import { sumaDias, etiquetaFecha, DIAS_SEMANA } from '@/app/lib/asistencia';
import { Hoja, Boton, Modal, Campo, CampoSelect, BloqueTitulo, EmptyState, TEXT, cx, PanelTitulo, Pulso, Aviso, Atras, Dato, Etiqueta, Avatar, inicialesDeNombre, TablaDual } from '../../ui';

/**
 * PROFESORES (regla 99): el equipo de la academia, de teoría y de física.
 *
 * Antes vivía al fondo de «Ajustes» y nadie lo encontraba. Cada profesor:
 * sus datos (puesto, contacto, la cuenta con la que entra si la tiene), los
 * GRUPOS que lleva (se asignan en «Grupos») y sus CLASES DE FÍSICA de la
 * semana (las del cuadrante, donde se elige quién da cada una). Lo que lleva
 * se deduce de ahí, no se escribe dos veces (regla 56).
 *
 * Y lo que DA cada uno (regla 100): el profesor habitual de cada clase de
 * física (en el cuadrante se rellena solo al escribir el título) y sus temas
 * de teoría, con cómo van los alumnos de la academia en ellos.
 */

type FormularioProfesor = { id?: string; name: string; role: string; email: string; phone: string; active: boolean; userId: string };
const PROFESOR_VACIO: FormularioProfesor = { name: '', role: 'profesor', email: '', phone: '', active: true, userId: '' };
type Cuenta = { id: string; email: string; role: string };

function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Pide al panel que abra otra pestaña (lo escucha `AdminView`). */
const irAPestana = (id: string) => window.dispatchEvent(new CustomEvent('admin:pestana', { detail: id }));

export default function AdminProfesores() {
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [lunes, setLunes] = useState(() => lunesDe(hoyLocal()));
  const [agenda, setAgenda] = useState<AgendaProfesor[]>([]);
  const [editando, setEditando] = useState<FormularioProfesor | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const [habituales, setHabituales] = useState<ClaseHabitual[]>([]);
  const [temas, setTemas] = useState<TemaDeProfesores[]>([]);
  const [grupos, setGrupos] = useState<GroupRow[]>([]);
  // `null` es la carga semanal; `'nuevo'`, la ficha en blanco; un id, ese profesor.
  const [fichaId, setFichaId] = useState<string | 'nuevo' | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [st, cu, ha, te, gr] = await Promise.all([listStaff(), listCuentasAcademia(), getClasesHabituales(), getTemasProfesores(), getGroups()]);
      if (!vivo) return;
      if (gr.success) setGrupos(gr.groups);
      if (ha.success) setHabituales(ha.clases);
      if (te.success) setTemas(te.temas);
      if (st.success) setStaff(st.staff);
      else { setError(st.error); setStaff([]); }
      if (cu.success) setCuentas(cu.cuentas);
    })();
    return () => { vivo = false; };
  }, [vuelta]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await getAgendaProfesores({ lunes });
      if (vivo && r.success) setAgenda(r.agenda);
    })();
    return () => { vivo = false; };
  }, [lunes, vuelta]);

  const agendaDe = useMemo(() => new Map(agenda.map((a) => [a.profesorId, a])), [agenda]);
  const temasDe = (id: string) => temas.filter((t) => t.profesorIds.includes(id));
  const clasesDe = (id: string) => habituales.filter((h) => h.profesorIds.includes(id)).map((h) => h.actividad);
  // Los exámenes oficiales (46-50) no los «da» nadie: no cuentan como sin profesor.
  const sinProfesor = temas.filter((t) => !t.profesorIds.length && !/ex[aá]menes/i.test(t.bloque ?? '')).map((t) => t.numero);

  async function guardar() {
    if (!editando) return;
    setGuardando(true);
    setError(null);
    const res = await saveStaff(editando);
    setGuardando(false);
    if (!res.success) { setError(res.error ?? 'No se pudo guardar.'); return; }
    if (fichaId === 'nuevo') { setEditando(null); setFichaId(null); }
    setVuelta((n) => n + 1);
  }

  async function borrar(s: StaffMember) {
    const a = agendaDe.get(s.id);
    const aviso = a && (a.grupos.length || a.clases.length)
      ? ` Lleva ${a.grupos.length} ${a.grupos.length === 1 ? 'grupo' : 'grupos'}; sus clases del cuadrante se quedan sin profesor.`
      : '';
    if (!confirm(`¿Borrar a ${s.name}?${aviso} Si solo ha dejado de dar clase, mejor desmárcalo como activo.`)) return;
    setBorrando(s.id);
    const res = await deleteStaff(s.id);
    setBorrando(null);
    if (res.success) { setVuelta((n) => n + 1); setFichaId(null); setEditando(null); }
    else setError(res.error ?? 'No se pudo borrar.');
  }

  // ── La carga semanal: de los horarios de los grupos ──
  const diasSemana = DIAS_SEMANA.slice(0, 5);
  const horas = (t: string | null) => {
    const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(t ?? '');
    return m ? Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0) : null;
  };
  const clasesDeProfe = (id: string) => grupos
    .filter((g) => g.staffIds.includes(id) && !g.esMulti && g.horario.weekdays?.length)
    .flatMap((g) => (g.horario.weekdays ?? []).map((d) => ({ d, g })));
  const horasDe = (id: string) => clasesDeProfe(id).reduce((n, c) => {
    const i = horas(c.g.horario.startTime), f = horas(c.g.horario.endTime);
    return i !== null && f !== null && f > i ? n + (f - i) : n;
  }, 0);
  const fmtH = (x: number) => `${Math.round(x * 10) / 10}`.replace('.', ',');
  const activos = (staff ?? []).filter((s) => s.active);
  const pill = (g: GroupRow) => (
    <span key={g.id} className={cx('mb-1 block rounded px-2 py-1 text-[11.5px] leading-tight', g.llevaPlan ? 'border border-oro bg-oro/20 text-oro-oscuro dark:bg-oro/15 dark:text-oro-claro' : 'bg-indigo-900 text-white dark:bg-indigo-300 dark:text-marino-hondo')}>
      <b className="tabular-nums">{g.horario.startTime}</b> {g.name}
    </span>
  );

  const abreFicha = (s: StaffMember | null) => {
    setError(null);
    setEditando(s ? { id: s.id, name: s.name, role: s.role, email: s.email ?? '', phone: s.phone ?? '', active: s.active, userId: s.userId ?? '' } : PROFESOR_VACIO);
    setFichaId(s ? s.id : 'nuevo');
    window.scrollTo({ top: 0 });
  };
  const volver = () => { setFichaId(null); setEditando(null); setError(null); };

  // ── LA FICHA DE UN PROFESOR: aquí se editan sus datos ──
  const sFicha = fichaId && fichaId !== 'nuevo' ? staff?.find((x) => x.id === fichaId) : undefined;
  if (fichaId && editando) {
    const a = sFicha ? agendaDe.get(sFicha.id) : undefined;
    const original = sFicha ? { id: sFicha.id, name: sFicha.name, role: sFicha.role, email: sFicha.email ?? '', phone: sFicha.phone ?? '', active: sFicha.active, userId: sFicha.userId ?? '' } : PROFESOR_VACIO;
    const sucio = JSON.stringify(editando) !== JSON.stringify(original);
    return (
      <div className="space-y-5 animate-in fade-in pb-24">
        <Atras onClick={volver}>Profesores</Atras>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar size="lg" iniciales={inicialesDeNombre(editando.name || '?')} />
          <div className="min-w-0 flex-1">
            <h2 className="font-titulo text-3xl font-bold uppercase leading-none tracking-wide">{editando.name || 'Nuevo profesor'}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{editando.role || 'Sin puesto'}{!editando.active && ' · inactivo'}</p>
          </div>
          <Etiqueta tono={sucio ? 'aviso' : 'ok'}>{sucio ? 'Cambios sin guardar' : 'Guardado'}</Etiqueta>
        </div>
        {error && <Aviso tono="malo">{error}</Aviso>}

        <div className="grid items-start gap-5 xl:grid-cols-2">
          <Hoja pad="lg" className="space-y-5">
            <BloqueTitulo>Datos</BloqueTitulo>
            <Campo label="Nombre" value={editando.name} onChange={(e) => setEditando({ ...editando, name: e.target.value })} />
            <Campo label="Puesto" value={editando.role} onChange={(e) => setEditando({ ...editando, role: e.target.value })} placeholder="profesor de teoría, preparador físico…" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Correo" type="email" inputMode="email" value={editando.email} onChange={(e) => setEditando({ ...editando, email: e.target.value })} />
              <Campo label="Teléfono" type="tel" inputMode="tel" value={editando.phone} onChange={(e) => setEditando({ ...editando, phone: e.target.value })} />
            </div>
            <CampoSelect label="Cuenta con la que entra (opcional)" value={editando.userId} onChange={(e) => setEditando({ ...editando, userId: e.target.value })}
              hint="Si da clase y tiene cuenta en la plataforma. Sin cuenta, sigue saliendo por su nombre en el cuadrante.">
              <option value="">Sin cuenta</option>
              {cuentas.map((c) => <option key={c.id} value={c.id}>{c.email}{c.role === 'student' ? ' (alumno)' : ''}</option>)}
            </CampoSelect>
            <label className="flex min-h-[44px] items-center gap-3 text-[13.5px]">
              <input type="checkbox" checked={editando.active} onChange={(e) => setEditando({ ...editando, active: e.target.checked })} className="h-5 w-5 accent-indigo-900" />
              Activo (los inactivos no salen al elegir profesor en el cuadrante)
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linea pt-5 dark:border-noche-linea">
              <div className="max-w-xs">
                {sFicha && (
                  <>
                    <p className={TEXT.muted}>Borrar a un profesor lo quita de sus grupos, de sus clases y de sus temas. Si solo ha dejado de dar clase, mejor desmárcalo como activo.</p>
                    <Boton variant="danger" className="mt-2" disabled={borrando === sFicha.id} onClick={() => borrar(sFicha)} icon={borrando === sFicha.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}>Borrar profesor</Boton>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:[&>*]:flex-1">
                <Boton variant="secondary" onClick={() => (sucio ? setEditando(original) : volver())}>{sucio ? 'Descartar' : 'Volver'}</Boton>
                <Boton onClick={guardar} disabled={guardando || !sucio || !editando.name.trim()} icon={guardando ? <Loader2 size={14} className="animate-spin" /> : undefined}>Guardar cambios</Boton>
              </div>
            </div>
          </Hoja>

          {sFicha && (
            <div className="space-y-4">
              <Hoja pad="md" className="grid grid-cols-3 gap-2 text-center">
                <div><strong className="block font-titulo text-2xl font-bold leading-tight tabular-nums">{fmtH(horasDe(sFicha.id))} h</strong><span className="text-xs text-slate-600 dark:text-slate-400">a la semana</span></div>
                <div><strong className="block font-titulo text-2xl font-bold leading-tight tabular-nums">{a?.grupos.length ?? 0}</strong><span className="text-xs text-slate-600 dark:text-slate-400">grupos</span></div>
                <div><strong className="block font-titulo text-2xl font-bold leading-tight tabular-nums">{temasDe(sFicha.id).length}</strong><span className="text-xs text-slate-600 dark:text-slate-400">temas</span></div>
              </Hoja>
              <Hoja pad="md" className="space-y-2.5">
                <div className="flex items-center justify-between gap-2"><BloqueTitulo>Sus grupos</BloqueTitulo>
                  <Boton size="sm" variant="secondary" onClick={() => irAPestana('groups')}>Ir a Grupos</Boton></div>
                {a?.grupos.length ? (
                  <div className="flex flex-wrap gap-1.5">{a.grupos.map((g) => <Dato key={g.id}>{g.nombre} · {g.tipo}</Dato>)}</div>
                ) : <p className={TEXT.muted}>No lleva ningún grupo. Se asignan en «Grupos».</p>}
              </Hoja>
              <Hoja pad="md"><TemasDelProfesor profesorId={sFicha.id} temas={temasDe(sFicha.id)} onCambio={() => setVuelta((n) => n + 1)} /></Hoja>
              {clasesDe(sFicha.id).length > 0 && (
                <Hoja pad="md" className="space-y-2"><BloqueTitulo icon={<Dumbbell size={15} />}>Habitual de</BloqueTitulo>
                  <div className="flex flex-wrap gap-1.5">{clasesDe(sFicha.id).map((c) => <Etiqueta key={c} tono="oro">{c}</Etiqueta>)}</div></Hoja>
              )}
              <Hoja pad="md" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <BloqueTitulo>Física · semana del {etiquetaSemana(lunes)}</BloqueTitulo>
                  <div className="flex items-center gap-1">
                    <Boton size="sm" variant="secondary" aria-label="Semana anterior" onClick={() => setLunes(sumaDias(lunes, -7))} icon={<ChevronLeft size={15} />} />
                    <Boton size="sm" variant="secondary" aria-label="Semana siguiente" onClick={() => setLunes(sumaDias(lunes, 7))} icon={<ChevronRight size={15} />} />
                  </div>
                </div>
                {a?.clases.length ? (
                  <ul className="divide-y divide-linea dark:divide-noche-linea">
                    {a.clases.map((c, i) => (
                      <li key={`${c.fecha}-${c.grupo}-${i}`} className="flex min-w-0 items-center gap-3 py-2 text-sm">
                        <span className="w-24 shrink-0 text-xs capitalize text-slate-600 dark:text-slate-400">{etiquetaFecha(c.fecha)}</span>
                        <span className="w-12 shrink-0 text-xs font-semibold tabular-nums">{c.hora ?? '—'}</span>
                        <span className="min-w-0 truncate"><b>{c.grupo}</b> · {c.titulo}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className={TEXT.muted}>Sin clases de física esa semana en el cuadrante.</p>}
              </Hoja>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── LA CARGA SEMANAL: la vista principal ──
  const filas = staff ?? [];
  return (
    <div className="space-y-5 animate-in fade-in pb-24">
      <PanelTitulo
        titulo="Profesores"
        sub="Quién da clase cuándo. Toca «+» para ver y editar a cada profesor."
        acciones={
          <>
            <Boton variant="secondary" onClick={() => irAPestana('groups')}>Ir a Grupos</Boton>
            <Boton icon={<Plus size={15} />} onClick={() => abreFicha(null)}>Añadir profesor</Boton>
          </>
        }
      />

      {error && <Aviso tono="malo">{error}</Aviso>}
      {staff === null && <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-500" /></div>}

      {staff && staff.length === 0 && (
        <EmptyState icon={<Plus size={36} />} title="Todavía no hay profesores" hint="Añádelos arriba: luego se asignan a sus grupos y a las clases del cuadrante." bordered />
      )}

      {staff && staff.length > 0 && (
        <>
          <Pulso
            cifras={[
              { valor: activos.length, etiqueta: activos.length === 1 ? 'profesor activo' : 'profesores activos' },
              { valor: `${fmtH(activos.reduce((n, s) => n + horasDe(s.id), 0))} h`, etiqueta: 'de clase a la semana' },
              { valor: temas.length ? sinProfesor.length : null, etiqueta: 'temas sin profesor', tono: sinProfesor.length ? 'aviso' : 'ok' },
              { valor: activos.filter((s) => s.userId).length, etiqueta: 'con cuenta en la plataforma' },
            ]}
          />

          {temas.length > 0 && sinProfesor.length > 0 && (
            <Aviso>
              <span>Temas sin profesor: <b>{formateaTemas(sinProfesor)}</b>. Se asignan desde la ficha de cada profesor.</span>
            </Aviso>
          )}

          <TablaDual
            soloLectura
            clave={(s) => s.id}
            filas={filas}
            columnas={[
              { id: 'profe', titulo: 'Profesor', celda: (s) => (
                <div className={cx('flex min-w-0 items-center gap-3', !s.active && 'opacity-60')}>
                  <Avatar iniciales={inicialesDeNombre(s.name)} />
                  <div className="min-w-0"><p className="truncate font-semibold">{s.name}</p><p className={cx(TEXT.muted, 'truncate')}>{s.role}{!s.active && ' · inactivo'}</p></div>
                </div>
              ) },
              ...diasSemana.map((d) => ({
                id: `d${d.n}`, titulo: d.largo.slice(0, 3), sinTarjeta: true,
                celda: (s: StaffMember) => <div className="min-w-[7.5rem] align-top">{clasesDeProfe(s.id).filter((c) => c.d === d.n).map((c) => pill(c.g))}{!clasesDeProfe(s.id).some((c) => c.d === d.n) && <span className="text-slate-500">—</span>}</div>,
              })),
              { id: 'semana', titulo: 'Semana', soloTarjeta: true, celda: (s) => (
                <div className="text-left">{clasesDeProfe(s.id).length === 0 && <span className="text-slate-500">Sin clases</span>}{clasesDeProfe(s.id).sort((a, b) => a.d - b.d).map((c) => <p key={`${c.g.id}-${c.d}`} className="mb-1 flex gap-2 text-[13px]"><span className="w-8 shrink-0 text-slate-600 dark:text-slate-400">{DIAS_SEMANA[c.d - 1].largo.slice(0, 3)}</span>{pill(c.g)}</p>)}</div>
              ) },
              { id: 'total', titulo: 'Total', celda: (s) => <span className="whitespace-nowrap font-titulo text-xl font-bold tabular-nums">{fmtH(horasDe(s.id))} h</span> },
              { id: 'ficha', titulo: '', acciones: true, derecha: true, celda: (s) => (
                <button type="button" onClick={() => abreFicha(s)} aria-label={`Abrir la ficha de ${s.name}`} title="Ficha del profesor"
                  className="grid h-11 w-11 place-items-center rounded-lg border border-linea bg-white text-2xl leading-none text-indigo-900 hover:border-indigo-700 dark:border-noche-linea dark:bg-noche-2 dark:text-indigo-200">+</button>
              ) },
            ]}
          />

          <ClasesHabituales habituales={habituales} staff={staff} onCambio={() => setVuelta((n) => n + 1)} />
        </>
      )}
    </div>
  );
}

// ── Física: las clases y su profesor habitual (regla 100) ──

/**
 * «Boxeo → Juan», «FLK → José, luego Olivares». En el cuadrante, al escribir
 * el título, el profesor se rellena solo con el primero libre a esa hora; se
 * cambia a mano cuando haga falta.
 */
function ClasesHabituales({ habituales, staff, onCambio }: { habituales: ClaseHabitual[]; staff: StaffMember[]; onCambio: () => void }) {
  const [editando, setEditando] = useState<{ actividad: string; nueva: boolean; ids: string[] } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nombre = (id: string) => staff.find((s) => s.id === id)?.name ?? '—';
  const activos = staff.filter((s) => s.active);

  async function guarda(ids: string[]) {
    if (!editando) return;
    setGuardando(true); setError(null);
    const r = await setClaseHabitual({ actividad: editando.actividad, profesorIds: ids });
    setGuardando(false);
    if (!r.success) { setError(r.error); return; }
    setEditando(null);
    onCambio();
  }

  const repetida = editando?.nueva && habituales.some((h) => claveActividad(h.actividad) === claveActividad(editando.actividad));

  return (
    <Hoja pad="md" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BloqueTitulo icon={<Dumbbell size={14} />}>Clases de física y su profesor habitual</BloqueTitulo>
        <Boton size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setEditando({ actividad: '', nueva: true, ids: [] })}>Añadir clase</Boton>
      </div>
      <p className={TEXT.muted}>En el cuadrante, al escribir «Boxeo», el profesor se pone solo. Si ese día lo da otro, se cambia en la celda. «FLK» vale para FLK 5.0, 5.1…</p>
      {habituales.length === 0 ? (
        <p className={TEXT.muted}>Aún no hay ninguna.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {habituales.map((h) => (
            <li key={h.actividad}>
              <button onClick={() => setEditando({ actividad: h.actividad, nueva: false, ids: h.profesorIds })}
                className="w-full min-h-[44px] py-2 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg px-1">
                <span className="font-black text-sm text-slate-900 dark:text-white">{h.actividad}</span>
                <span className="text-sm text-slate-600 dark:text-slate-300 text-right">
                  {h.profesorIds.map(nombre).join(' · luego ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editando && (
        <Modal title={editando.nueva ? 'Nueva clase' : editando.actividad} subtitle="Sus profesores habituales, el primero el preferido" onClose={() => setEditando(null)} width="sm"
          footer={
            <div className="flex gap-2 w-full">
              {!editando.nueva && (
                <Boton variant="ghost" icon={<Trash2 size={14} />} disabled={guardando}
                  onClick={() => { if (confirm(`¿Quitar «${editando.actividad}» de la lista? Las celdas ya escritas no cambian.`)) guarda([]); }}>
                  Quitar
                </Boton>
              )}
              <div className="flex-1" />
              <Boton variant="secondary" disabled={guardando} onClick={() => setEditando(null)}>Cancelar</Boton>
              <Boton disabled={guardando || !editando.actividad.trim() || !editando.ids.length || !!repetida} onClick={() => guarda(editando.ids)}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </Boton>
            </div>
          }>
          <div className="space-y-3">
            {editando.nueva && (
              <Campo label="Clase" value={editando.actividad} maxLength={60} placeholder="Boxeo, Jiujitsu, FLK…"
                onChange={(e) => setEditando({ ...editando, actividad: e.target.value })}
                hint={repetida ? 'Esa clase ya está en la lista.' : 'Como empieza el título en el cuadrante.'} />
            )}
            <ol className="space-y-1.5">
              {editando.ids.map((id, i) => (
                <li key={id} className="flex items-center gap-2">
                  <span className="w-6 text-xs font-black text-slate-500 dark:text-slate-400">{i + 1}.</span>
                  <span className="flex-1 min-w-0 truncate text-sm font-bold text-slate-800 dark:text-slate-100">{nombre(id)}</span>
                  <button disabled={i === 0} aria-label={`Subir a ${nombre(id)}`}
                    onClick={() => { const ids = [...editando.ids]; [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; setEditando({ ...editando, ids }); }}
                    className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-500 disabled:opacity-30">
                    <ArrowUp size={15} />
                  </button>
                  <button aria-label={`Quitar a ${nombre(id)}`} onClick={() => setEditando({ ...editando, ids: editando.ids.filter((x) => x !== id) })}
                    className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-500 hover:text-red-600">
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ol>
            {activos.some((p) => !editando.ids.includes(p.id)) && (
              <CampoSelect label={editando.ids.length ? 'Si no puede, después…' : 'Profesor habitual'} value=""
                onChange={(e) => e.target.value && setEditando({ ...editando, ids: [...editando.ids, e.target.value] })}>
                <option value="">— Elegir —</option>
                {activos.filter((p) => !editando.ids.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </CampoSelect>
            )}
            {error && <p className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p>}
          </div>
        </Modal>
      )}
    </Hoja>
  );
}

// ── Teoría: sus temas y cómo van sus alumnos en ellos (regla 100) ──

function TemasDelProfesor({ profesorId, temas, onCambio }: { profesorId: string; temas: TemaDeProfesores[]; onCambio: () => void }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const numeros = temas.map((t) => t.numero);
  const r = resumenTemas(temas);

  async function guarda() {
    if (editando === null) return;
    setGuardando(true); setError(null);
    const res = await setTemasProfesor({ profesorId, temas: editando });
    setGuardando(false);
    if (!res.success) { setError(res.error); return; }
    setEditando(null);
    onCambio();
  }

  return (
    <div className="space-y-1.5">
      <BloqueTitulo icon={<BookOpen size={14} />}>Sus temas de teoría</BloqueTitulo>
      {editando !== null ? (
        <div className="space-y-2">
          <Campo label="Temas" value={editando} onChange={(e) => setEditando(e.target.value)} placeholder="1-10, 14, 17, 18" autoFocus
            hint="Números y rangos, separados por comas. Vacío, ninguno." />
          <div className="flex gap-2">
            <Boton size="sm" disabled={guardando} onClick={guarda}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
            <Boton size="sm" variant="ghost" onClick={() => { setEditando(null); setError(null); }}>Cancelar</Boton>
          </div>
          {error && <p className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p>}
        </div>
      ) : (
        <button onClick={() => setEditando(formateaTemas(numeros).replace(/–/g, '-'))}
          className="min-h-[44px] w-full text-left text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2 hover:underline">
          {numeros.length ? <b>{formateaTemas(numeros)}</b> : <span className="text-slate-500 dark:text-slate-400">Sin temas. Toca para ponerlos.</span>}
          <Pencil size={13} className="text-slate-400 shrink-0" />
        </button>
      )}
      {numeros.length > 0 && editando === null && (
        <>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {r.acierto === null
              ? 'Sus alumnos aún no han respondido preguntas de estos temas.'
              : <>Sus alumnos aciertan el <b>{r.acierto} %</b> en estos temas ({r.contestadas.toLocaleString('es-ES')} respuestas).</>}
            {r.masFlojo && <> El más flojo: <b>tema {r.masFlojo.numero}</b> ({r.masFlojo.acierto} %).</>}
          </p>
          <button onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}
            className="min-h-[44px] text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
            Tema a tema <ChevronDown size={14} className={cx('transition-transform', abierto && 'rotate-180')} />
          </button>
          {abierto && (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {temas.map((t) => {
                const a = aciertoDe(t);
                return (
                  <li key={t.subjectId} className="py-1.5 flex items-center gap-2 text-xs min-w-0">
                    <span className="w-8 shrink-0 font-black text-slate-700 dark:text-slate-200">{t.numero}</span>
                    <span className="flex-1 min-w-0 truncate text-slate-600 dark:text-slate-300">{t.titulo}</span>
                    <span className={cx('shrink-0 tabular-nums font-bold', a === null ? 'text-slate-400' : t.contestadas < MIN_RESPUESTAS_TEMA ? 'text-slate-500' : a < 50 ? 'text-red-700 dark:text-red-400' : 'text-slate-800 dark:text-slate-100')}
                      title={t.contestadas < MIN_RESPUESTAS_TEMA ? 'Pocas respuestas todavía' : undefined}>
                      {a === null ? 'sin datos' : `${a} %`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}


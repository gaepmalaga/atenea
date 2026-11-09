'use client';

import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, Loader2, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Users2, ArrowUp, Dumbbell, BookOpen, ChevronDown } from 'lucide-react';
import {
  listStaff, saveStaff, deleteStaff, listCuentasAcademia, getAgendaProfesores,
  getClasesHabituales, setClaseHabitual, getTemasProfesores, setTemasProfesor,
} from '@/actions';
import type { StaffMember } from '@/app/lib/academy-settings';
import type { AgendaProfesor } from '@/app/actions/cuadrante';
import type { TemaDeProfesores } from '@/app/actions/profesores';
import {
  claveActividad, formateaTemas, resumenTemas, aciertoDe, MIN_RESPUESTAS_TEMA, type ClaseHabitual,
} from '@/app/lib/profesores';
import { lunesDe, etiquetaSemana } from '@/app/lib/sesiones';
import { sumaDias, etiquetaFecha } from '@/app/lib/asistencia';
import { Card, Button, Modal, TextField, SelectField, SectionLabel, EmptyState, TEXT, cx } from '../../ui';

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

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [st, cu, ha, te] = await Promise.all([listStaff(), listCuentasAcademia(), getClasesHabituales(), getTemasProfesores()]);
      if (!vivo) return;
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
  const correoDe = (id: string | null) => (id ? cuentas.find((c) => c.id === id)?.email ?? 'una cuenta' : null);

  async function guardar() {
    if (!editando) return;
    setGuardando(true);
    setError(null);
    const res = await saveStaff(editando);
    setGuardando(false);
    if (!res.success) { setError(res.error ?? 'No se pudo guardar.'); return; }
    setEditando(null);
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
    if (res.success) setVuelta((n) => n + 1);
    else setError(res.error ?? 'No se pudo borrar.');
  }

  return (
    <div className="space-y-4 animate-in fade-in pb-24">
      <Card tone="sunken" pad="md" className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-slate-700/10 dark:bg-white/5 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
          <GraduationCap size={20} />
        </div>
        <div className="min-w-0">
          <h3 className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-tight">Profesores</h3>
          <p className={cx(TEXT.muted, 'mt-0.5')}>
            El equipo de teoría y de física. Los grupos de cada uno se asignan en «Grupos»; quién da cada clase de física, en el cuadrante.
          </p>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditando(PROFESOR_VACIO)}>Añadir profesor</Button>
        <Button size="sm" variant="ghost" icon={<Users2 size={14} />} onClick={() => irAPestana('groups')}>Ir a «Grupos»</Button>
        <div className="flex items-center gap-1 sm:ml-auto">
          <button onClick={() => setLunes(sumaDias(lunes, -7))} aria-label="Semana anterior" className="w-11 h-11 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"><ChevronLeft size={18} /></button>
          <span className="px-2 text-sm font-black text-slate-900 dark:text-white text-center min-w-[120px]">Física · {etiquetaSemana(lunes)}</span>
          <button onClick={() => setLunes(sumaDias(lunes, 7))} aria-label="Semana siguiente" className="w-11 h-11 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"><ChevronRight size={18} /></button>
        </div>
      </div>

      {error && <p className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p>}
      {staff === null && <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>}
      {staff && staff.length > 0 && (
        <ClasesHabituales habituales={habituales} staff={staff} onCambio={() => setVuelta((n) => n + 1)} />
      )}
      {staff && staff.length > 0 && temas.length > 0 && (
        <p className={cx(TEXT.muted, 'px-1')}>
          {sinProfesor.length
            ? <>Temas sin profesor: <b className="text-slate-800 dark:text-slate-100">{formateaTemas(sinProfesor)}</b>.</>
            : 'Todos los temas tienen profesor.'}
        </p>
      )}

      {staff && staff.length === 0 && (
        <EmptyState icon={<GraduationCap size={36} />} title="Todavía no hay profesores" hint="Añádelos arriba: luego se asignan a sus grupos y a las clases del cuadrante." bordered />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {staff?.map((s) => {
          const a = agendaDe.get(s.id);
          return (
            <Card key={s.id} pad="md" className={cx('space-y-3', !s.active && 'opacity-60')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-900 dark:text-white leading-snug">
                    {s.name} <span className="font-normal text-slate-500 dark:text-slate-400">· {s.role}</span>
                    {!s.active && <span className="ml-2 text-[10px] uppercase font-black text-slate-500 dark:text-slate-400">inactivo</span>}
                  </p>
                  {/* Sin `truncate`: el contacto es justo el dato que hace falta entero. */}
                  <p className={cx(TEXT.muted, 'break-words')}>{[s.email, s.phone].filter(Boolean).join(' · ') || 'Sin contacto'}</p>
                  {s.userId && <p className={cx(TEXT.muted, 'break-words')}>Entra con {correoDe(s.userId)}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setEditando({ id: s.id, name: s.name, role: s.role, email: s.email ?? '', phone: s.phone ?? '', active: s.active, userId: s.userId ?? '' })}
                    className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label={`Editar a ${s.name}`}>
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => borrar(s)} disabled={borrando === s.id}
                    className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40"
                    aria-label={`Borrar a ${s.name}`}>
                    {borrando === s.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  </button>
                </div>
              </div>

              <TemasDelProfesor profesorId={s.id} temas={temasDe(s.id)} onCambio={() => setVuelta((n) => n + 1)} />

              {clasesDe(s.id).length > 0 && (
                <p className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                  <Dumbbell size={13} className="mt-0.5 shrink-0" />
                  <span>Profesor habitual de <b>{clasesDe(s.id).join(', ')}</b></span>
                </p>
              )}

              <div>
                <SectionLabel>Sus grupos</SectionLabel>
                {a?.grupos.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {a.grupos.map((g) => (
                      <span key={g.id} className="text-xs font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {g.nombre} <span className="font-medium text-slate-500 dark:text-slate-400">· {g.tipo}</span>
                      </span>
                    ))}
                  </div>
                ) : <p className={TEXT.muted}>No lleva ningún grupo. Se asignan en «Grupos».</p>}
              </div>

              <div>
                <SectionLabel>Física · semana del {etiquetaSemana(lunes)}</SectionLabel>
                {a?.clases.length ? (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {a.clases.map((c, i) => (
                      <li key={`${c.fecha}-${c.grupo}-${i}`} className="py-1.5 flex items-center gap-2 text-sm min-w-0">
                        <span className="w-24 shrink-0 capitalize text-slate-500 dark:text-slate-400 text-xs">{etiquetaFecha(c.fecha)}</span>
                        <span className="w-12 shrink-0 font-mono text-xs text-slate-600 dark:text-slate-300">{c.hora ?? '—'}</span>
                        <span className="min-w-0 truncate text-slate-800 dark:text-slate-100"><b>{c.grupo}</b> · {c.titulo}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className={TEXT.muted}>Sin clases de física esa semana en el cuadrante.</p>}
              </div>
            </Card>
          );
        })}
      </div>

      {editando && (
        <Modal
          title={editando.id ? 'Editar profesor' : 'Nuevo profesor'}
          onClose={() => setEditando(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button onClick={guardar} disabled={guardando || !editando.name.trim()}>
                {guardando ? <Loader2 size={14} className="animate-spin" /> : 'Guardar'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <TextField label="Nombre" value={editando.name} onChange={(e) => setEditando({ ...editando, name: e.target.value })} autoFocus />
            <TextField label="Puesto" value={editando.role} onChange={(e) => setEditando({ ...editando, role: e.target.value })} placeholder="profesor de teoría, preparador físico…" />
            <TextField label="Correo" type="email" value={editando.email} onChange={(e) => setEditando({ ...editando, email: e.target.value })} />
            <TextField label="Teléfono" value={editando.phone} onChange={(e) => setEditando({ ...editando, phone: e.target.value })} />
            <SelectField label="Cuenta con la que entra (opcional)" value={editando.userId} onChange={(e) => setEditando({ ...editando, userId: e.target.value })}
              hint="Si da clase y tiene cuenta en la plataforma. Sin cuenta, sigue saliendo por su nombre en el cuadrante.">
              <option value="">Sin cuenta</option>
              {cuentas.map((c) => <option key={c.id} value={c.id}>{c.email}{c.role === 'student' ? ' (alumno)' : ''}</option>)}
            </SelectField>
            <label className="flex items-center gap-2 min-h-[44px] text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={editando.active} onChange={(e) => setEditando({ ...editando, active: e.target.checked })} className="w-5 h-5" />
              Activo (los inactivos no salen al elegir profesor en el cuadrante)
            </label>
            {error && <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>}
          </div>
        </Modal>
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
    <Card pad="md" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel icon={<Dumbbell size={14} />}>Clases de física y su profesor habitual</SectionLabel>
        <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setEditando({ actividad: '', nueva: true, ids: [] })}>Añadir clase</Button>
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
                <Button variant="ghost" icon={<Trash2 size={14} />} disabled={guardando}
                  onClick={() => { if (confirm(`¿Quitar «${editando.actividad}» de la lista? Las celdas ya escritas no cambian.`)) guarda([]); }}>
                  Quitar
                </Button>
              )}
              <div className="flex-1" />
              <Button variant="secondary" disabled={guardando} onClick={() => setEditando(null)}>Cancelar</Button>
              <Button disabled={guardando || !editando.actividad.trim() || !editando.ids.length || !!repetida} onClick={() => guarda(editando.ids)}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          }>
          <div className="space-y-3">
            {editando.nueva && (
              <TextField label="Clase" value={editando.actividad} maxLength={60} placeholder="Boxeo, Jiujitsu, FLK…"
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
              <SelectField label={editando.ids.length ? 'Si no puede, después…' : 'Profesor habitual'} value=""
                onChange={(e) => e.target.value && setEditando({ ...editando, ids: [...editando.ids, e.target.value] })}>
                <option value="">— Elegir —</option>
                {activos.filter((p) => !editando.ids.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </SelectField>
            )}
            {error && <p className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p>}
          </div>
        </Modal>
      )}
    </Card>
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
      <SectionLabel icon={<BookOpen size={14} />}>Sus temas de teoría</SectionLabel>
      {editando !== null ? (
        <div className="space-y-2">
          <TextField label="Temas" value={editando} onChange={(e) => setEditando(e.target.value)} placeholder="1-10, 14, 17, 18" autoFocus
            hint="Números y rangos, separados por comas. Vacío, ninguno." />
          <div className="flex gap-2">
            <Button size="sm" disabled={guardando} onClick={guarda}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditando(null); setError(null); }}>Cancelar</Button>
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


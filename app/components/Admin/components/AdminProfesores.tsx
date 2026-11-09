'use client';

import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, Loader2, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Users2 } from 'lucide-react';
import { listStaff, saveStaff, deleteStaff, listCuentasAcademia, getAgendaProfesores } from '@/actions';
import type { StaffMember } from '@/app/lib/academy-settings';
import type { AgendaProfesor } from '@/app/actions/cuadrante';
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

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [st, cu] = await Promise.all([listStaff(), listCuentasAcademia()]);
      if (!vivo) return;
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

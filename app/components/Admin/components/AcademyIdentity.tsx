'use client';

import { useEffect, useState } from 'react';
import { Building2, Loader2, Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import {
  getAcademySettings,
  saveAcademySettings,
  listStaff,
  saveStaff,
  deleteStaff,
} from '@/actions';
import type { AcademySettings, StaffMember } from '@/app/lib/academy-settings';
import { Card, Button, Modal, TextField, TextAreaField, SectionLabel, TEXT, cx } from '../../ui';

/**
 * Los datos de la academia: nombre, dirección, horario, contacto, y quién da
 * clase. Salió de una pregunta directa del dueño: "algún lugar para poner el
 * nombre de la academia, dirección, horarios, emails, profesores...?".
 *
 * Requiere `docs/sql/academia-ajustes.sql` ejecutado — mientras no lo esté,
 * las lecturas fallan con un error de esquema y aquí se enseña sin romper
 * nada (mismo patrón que `admin_audit_log`).
 */
export default function AcademyIdentity() {
  const [settings, setSettings] = useState<AcademySettings | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [cargando, setCargando] = useState(true);
  const [tablaFalta, setTablaFalta] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([getAcademySettings(), listStaff()]).then(([s, st]) => {
      if (!vivo) return;
      if (s.success) setSettings(s.settings);
      else setError(s.error);
      if (st.success) setStaff(st.staff);
      else if (/could not find the table/i.test(st.error)) setTablaFalta(true);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, []);

  if (cargando) {
    return (
      <Card tone="sunken" pad="lg" className="flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
        <Loader2 size={16} className="animate-spin" /> Cargando…
      </Card>
    );
  }

  if (tablaFalta) {
    return (
      <Card pad="md" className="border-amber-500/30 text-amber-800 dark:text-amber-200 flex items-start gap-3">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed">
          Falta ejecutar{' '}
          <code className="font-mono bg-black/10 dark:bg-white/10 px-1 rounded">docs/sql/academia-ajustes.sql</code>{' '}
          en el editor SQL de Supabase. En cuanto se ejecute, esta sección deja de estar vacía.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <FichaAcademia inicial={settings} error={error} />
      <ListaProfesores staff={staff} onCambio={setStaff} />
    </div>
  );
}

function FichaAcademia({ inicial, error }: { inicial: AcademySettings | null; error: string | null }) {
  const [name, setName] = useState(inicial?.name ?? '');
  const [address, setAddress] = useState(inicial?.address ?? '');
  const [schedule, setSchedule] = useState(inicial?.schedule ?? '');
  const [contactEmail, setContactEmail] = useState(inicial?.contactEmail ?? '');
  const [contactPhone, setContactPhone] = useState(inicial?.contactPhone ?? '');
  const [guardando, setGuardando] = useState(false);
  const [guardadoError, setGuardadoError] = useState<string | null>(error);
  const [guardadoOk, setGuardadoOk] = useState(false);

  async function guardar() {
    setGuardando(true);
    setGuardadoOk(false);
    setGuardadoError(null);
    const res = await saveAcademySettings({ name, address, schedule, contactEmail, contactPhone });
    if (res.success) setGuardadoOk(true);
    else setGuardadoError(res.error ?? 'No se pudo guardar.');
    setGuardando(false);
  }

  return (
    <Card pad="md" className="space-y-4">
      <SectionLabel icon={<Building2 size={16} />}>Datos de la academia</SectionLabel>

      <div className="grid sm:grid-cols-2 gap-4">
        <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="Academia Atenea" />
        <TextField label="Horario" value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="L-V 10:00-14:00 y 17:00-21:00" />
      </div>
      <TextAreaField label="Dirección" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="Calle, número, ciudad" />
      <div className="grid sm:grid-cols-2 gap-4">
        <TextField label="Correo de contacto" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="info@academia.es" />
        <TextField label="Teléfono de contacto" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="600 000 000" />
      </div>

      {guardadoError && <p className="text-xs text-red-600 dark:text-red-400 font-medium">{guardadoError}</p>}
      {guardadoOk && <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Guardado.</p>}

      <div className="flex justify-end">
        <Button onClick={guardar} disabled={guardando} icon={guardando ? <Loader2 size={14} className="animate-spin" /> : null}>
          Guardar
        </Button>
      </div>
    </Card>
  );
}

type FormularioProfesor = { id?: string; name: string; role: string; email: string; phone: string; active: boolean };
const PROFESOR_VACIO: FormularioProfesor = { name: '', role: 'profesor', email: '', phone: '', active: true };

function ListaProfesores({ staff, onCambio }: { staff: StaffMember[]; onCambio: (s: StaffMember[]) => void }) {
  const [editando, setEditando] = useState<FormularioProfesor | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);

  async function guardar() {
    if (!editando) return;
    setGuardando(true);
    setError(null);
    const res = await saveStaff(editando);
    if (res.success) {
      const fresh = await listStaff();
      if (fresh.success) onCambio(fresh.staff);
      setEditando(null);
    } else {
      setError(res.error ?? 'No se pudo guardar.');
    }
    setGuardando(false);
  }

  async function borrar(id: string) {
    setBorrando(id);
    const res = await deleteStaff(id);
    if (res.success) onCambio(staff.filter((s) => s.id !== id));
    setBorrando(null);
  }

  return (
    <Card pad="md" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Profesores</SectionLabel>
        <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setEditando(PROFESOR_VACIO)}>
          Añadir
        </Button>
      </div>

      {staff.length === 0 && (
        <p className={cx(TEXT.muted)}>Todavía no hay ningún profesor dado de alta.</p>
      )}

      <div className="space-y-2">
        {staff.map((s) => (
          <div
            key={s.id}
            className={cx(
              'flex items-center justify-between gap-3 p-3 rounded-2xl border',
              s.active ? 'border-slate-200 dark:border-slate-800' : 'border-slate-100 dark:border-slate-900 opacity-60',
            )}
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                {s.name} <span className="font-normal text-slate-500 dark:text-slate-400">· {s.role}</span>
                {!s.active && <span className="ml-2 text-[10px] uppercase font-black text-slate-400">inactivo</span>}
              </p>
              {/* Sin `truncate`: un correo largo se corta a media palabra y el
                  contacto es justo el dato que hace falta entero. Envuelve a
                  una segunda linea en vez de esconderse. */}
              <p className={cx(TEXT.muted, 'break-words')}>{[s.email, s.phone].filter(Boolean).join(' · ') || 'Sin contacto'}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setEditando({ id: s.id, name: s.name, role: s.role, email: s.email ?? '', phone: s.phone ?? '', active: s.active })}
                className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label={`Editar a ${s.name}`}
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => borrar(s.id)}
                disabled={borrando === s.id}
                className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40"
                aria-label={`Borrar a ${s.name}`}
              >
                {borrando === s.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              </button>
            </div>
          </div>
        ))}
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
            <TextField label="Puesto" value={editando.role} onChange={(e) => setEditando({ ...editando, role: e.target.value })} placeholder="profesor, coordinador, entrenador…" />
            <TextField label="Correo" type="email" value={editando.email} onChange={(e) => setEditando({ ...editando, email: e.target.value })} />
            <TextField label="Teléfono" value={editando.phone} onChange={(e) => setEditando({ ...editando, phone: e.target.value })} />
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={editando.active} onChange={(e) => setEditando({ ...editando, active: e.target.checked })} className="w-5 h-5" />
              Activo
            </label>
            {error && <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>}
          </div>
        </Modal>
      )}
    </Card>
  );
}

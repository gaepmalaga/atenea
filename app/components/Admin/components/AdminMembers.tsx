'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  KeyRound, RefreshCw, AlertTriangle, UserCheck, UserX, Clock,
  BadgeEuro, Plus, Trash2, ChevronDown,
} from 'lucide-react';
import {
  getMembershipOverview,
  getMemberPayments,
  setMembershipRequired,
  setMemberAccess,
  setMemberPaymentStatus,
  recordPayment,
  deletePayment,
  activateAllCurrentStudents,
} from '@/actions';
import type { MembershipOverview, MiembroFila, PagoFila } from '@/app/actions/membership';
import { formateaEUR } from '@/app/lib/membership';
import { Card, EmptyState, SectionLabel, StatTile, Button, TEXT, cx } from '../../ui';

/**
 * "Acceso & Pagos" (P6): la puerta que el administrador abre y cierra, y el
 * registro de los pagos en efectivo.
 *
 * No cobra nada. El acceso NO caduca solo — lo corta el administrador a mano
 * (regla: un despiste apuntando un pago no puede dejar fuera a quien sí pagó).
 */
export default function AdminMembers() {
  const [data, setData] = useState<MembershipOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tablaFalta, setTablaFalta] = useState(false);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    const res = await getMembershipOverview();
    if (res.success) {
      setData(res.data);
      setError(null);
      setTablaFalta(false);
    } else {
      setError(res.error);
      setTablaFalta(res.tablaFalta ?? false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

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
            <KeyRound size={20} />
          </div>
          <div>
            <h3 className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-tight">Acceso &amp; Pagos</h3>
            <p className={cx(TEXT.muted, 'mt-0.5')}>
              Quién entra y quién ha pagado. El cobro es en efectivo; esto solo lo registra.
            </p>
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); cargar(); }}
          className="w-11 h-11 shrink-0 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          aria-label="Recargar"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </Card>

      {tablaFalta && (
        <Card tone="base" pad="md" className="border-amber-500/30 text-amber-800 dark:text-amber-200 flex items-start gap-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed">
            Todavía no existen las tablas del control de acceso. Hay que ejecutar{' '}
            <code className="font-mono bg-black/10 dark:bg-white/10 px-1 rounded">docs/sql/P6-acceso-y-pagos.sql</code>{' '}
            en el editor SQL de Supabase. Mientras tanto la plataforma sigue abierta para todos y nada se ha roto.
          </p>
        </Card>
      )}

      {error && !tablaFalta && (
        <Card tone="base" pad="md" className="border-red-500/30 text-red-700 dark:text-red-300">
          <p className="text-xs font-medium">{error}</p>
        </Card>
      )}

      {!error && data && (
        <>
          <InterruptorGlobal data={data} busy={busy} onAccion={accion} />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <StatTile label="Activos" value={data.cuenta.activos} tone="success" />
            <StatTile label="Pendientes" value={data.cuenta.pendientes} tone={data.cuenta.pendientes ? 'warning' : 'neutral'} />
            <StatTile label="Suspendidos" value={data.cuenta.suspendidos} tone={data.cuenta.suspendidos ? 'danger' : 'neutral'} />
            <StatTile label="Deben" value={data.cuenta.deben} tone={data.cuenta.deben ? 'danger' : 'neutral'} />
          </div>

          {data.miembros.length === 0 ? (
            <EmptyState icon={<UserCheck size={40} />} title="No hay alumnos todavía" bordered />
          ) : (
            <Card tone="base" pad="md">
              <SectionLabel aside={<span className={TEXT.muted}>{data.miembros.length}</span>}>Alumnos</SectionLabel>
              <div className="space-y-2">
                {data.miembros.map((m) => (
                  <FilaMiembro key={m.id} m={m} busy={busy} onAccion={accion} />
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function InterruptorGlobal({
  data,
  busy,
  onAccion,
}: {
  data: MembershipOverview;
  busy: boolean;
  onAccion: (fn: () => Promise<{ success: boolean; error?: string }>) => Promise<void>;
}) {
  return (
    <Card tone={data.required ? 'brand' : 'sunken'} pad="md" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-slate-900 dark:text-white text-sm">
            {data.required ? 'Control de acceso ENCENDIDO' : 'Control de acceso apagado'}
          </p>
          <p className={cx(TEXT.muted, 'mt-1 max-w-md')}>
            {data.required
              ? 'Solo entran los alumnos activados. Un alumno nuevo se registra y espera a que le des acceso.'
              : 'La plataforma está abierta para todos. Enciéndelo cuando quieras que solo entren los que pagan.'}
          </p>
        </div>
        <Button
          size="sm"
          variant={data.required ? 'secondary' : 'primary'}
          disabled={busy}
          onClick={() => onAccion(() => setMembershipRequired(!data.required))}
        >
          {data.required ? 'Apagar' : 'Encender'}
        </Button>
      </div>

      {data.required && data.cuenta.pendientes > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
          <p className="text-xs text-amber-800 dark:text-amber-200 leading-snug">
            Hay {data.cuenta.pendientes} sin activar. Si son alumnos que ya tenías, dales acceso de golpe.
          </p>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onAccion(async () => activateAllCurrentStudents())}
          >
            Activar a todos
          </Button>
        </div>
      )}
    </Card>
  );
}

const ACCESO_BADGE: Record<MiembroFila['acceso'], { label: string; cls: string; icon: typeof UserCheck }> = {
  active: { label: 'Activo', cls: 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10', icon: UserCheck },
  pending: { label: 'Pendiente', cls: 'text-amber-700 dark:text-amber-400 bg-amber-500/10', icon: Clock },
  suspended: { label: 'Suspendido', cls: 'text-red-700 dark:text-red-400 bg-red-500/10', icon: UserX },
};

function FilaMiembro({
  m,
  busy,
  onAccion,
}: {
  m: MiembroFila;
  busy: boolean;
  onAccion: (fn: () => Promise<{ success: boolean; error?: string }>) => Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const badge = ACCESO_BADGE[m.acceso];
  const Icon = badge.icon;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-3 text-left"
      >
        <span className="min-w-0">
          <span className="block font-mono text-xs text-slate-700 dark:text-slate-200 truncate">
            {m.email ?? m.id.slice(0, 8)}
          </span>
          <span className="flex items-center gap-2 mt-1">
            <span className={cx('inline-flex items-center gap-1 text-[10px] font-black uppercase px-1.5 py-0.5 rounded', badge.cls)}>
              <Icon size={11} />
              {badge.label}
            </span>
            {m.pago === 'debe' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-1.5 py-0.5 rounded text-red-700 dark:text-red-400 bg-red-500/10">
                <BadgeEuro size={11} />
                Debe
              </span>
            )}
            {m.pagos.ultimo && (
              <span className={TEXT.muted}>último pago {m.pagos.ultimo}</span>
            )}
          </span>
        </span>
        <ChevronDown size={16} className={cx('shrink-0 text-slate-400 transition-transform', abierto && 'rotate-180')} />
      </button>

      {abierto && (
        <div className="px-3 pb-3 space-y-3 border-t border-slate-200 dark:border-slate-800 pt-3">
          <div className="flex flex-wrap gap-2">
            {m.acceso !== 'active' && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAccion(() => setMemberAccess(m.id, 'active'))}>
                Dar acceso
              </Button>
            )}
            {m.acceso !== 'suspended' && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAccion(() => setMemberAccess(m.id, 'suspended'))}>
                Suspender
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => onAccion(() => setMemberPaymentStatus(m.id, m.pago === 'debe' ? 'al_dia' : 'debe'))}
            >
              {m.pago === 'debe' ? 'Marcar al día' : 'Marcar que debe'}
            </Button>
          </div>

          <PagosDelAlumno studentId={m.id} busy={busy} onAccion={onAccion} />
        </div>
      )}
    </div>
  );
}

function PagosDelAlumno({
  studentId,
  busy,
  onAccion,
}: {
  studentId: string;
  busy: boolean;
  onAccion: (fn: () => Promise<{ success: boolean; error?: string }>) => Promise<void>;
}) {
  const [pagos, setPagos] = useState<PagoFila[] | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const cargar = useCallback(async () => {
    const res = await getMemberPayments(studentId);
    setPagos(res.success ? res.pagos : []);
  }, [studentId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function apuntar() {
    await onAccion(async () => recordPayment({ studentId, amount, note }));
    setAmount('');
    setNote('');
    cargar();
  }

  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 p-3 space-y-2">
      <p className={TEXT.label + ' text-slate-500 dark:text-slate-400'}>Pagos en efectivo</p>

      {pagos && pagos.length > 0 && (
        <div className="space-y-1">
          {pagos.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                {p.paidOn} · {formateaEUR(p.amountEur)}
                {p.note ? <span className="text-slate-400"> · {p.note}</span> : null}
              </span>
              <button
                onClick={() => onAccion(async () => { const r = await deletePayment(p.id); cargar(); return r; })}
                disabled={busy}
                className="shrink-0 text-slate-400 hover:text-red-500 transition-colors"
                aria-label="Borrar pago"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {pagos && pagos.length === 0 && <p className={TEXT.muted}>Sin pagos apuntados.</p>}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="€ (opcional)"
          className="w-24 text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5"
        />
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="nota (mes, concepto…)"
          className="flex-1 min-w-[8rem] text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5"
        />
        <Button size="sm" disabled={busy} icon={<Plus size={13} />} onClick={apuntar}>
          Apuntar
        </Button>
      </div>
    </div>
  );
}

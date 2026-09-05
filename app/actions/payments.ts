'use server'

import { supabaseAdmin } from './core';
import { requireAdmin } from '../lib/auth';
import { registraAccion } from '../lib/admin-audit';
import {
  resumeMes,
  periodoActual,
  periodosRecientes,
  type MonthlyPaymentRow,
  type ResumenMes,
} from '../lib/payments';

/**
 * PAGOS MENSUALES EN EFECTIVO (P8).
 *
 * El dueño cobra en persona. Rejilla por mes: elige un mes, ve a los alumnos
 * con acceso activo, y va marcando quién paga. `monthly_payments` guarda una
 * fila por (alumno, mes).
 *
 * Todo con la clave de servicio y `requireAdmin` (regla 34/35). La aritmética
 * del resumen vive en `lib/payments.ts`.
 *
 * QUIÉN ENTRA EN EL MES: los alumnos con `memberships.access_status = 'active'`.
 * Un alumno suspendido deja de aparecer en los meses siguientes.
 */

const MAX_PERFILES = 5_000;

export type MonthlyPaymentsOverview = ResumenMes & {
  filas: (ResumenMes['filas'][number] & { email: string | null })[];
  /** Los meses que se pueden elegir en el desplegable. */
  periodos: string[];
};

export async function getMonthlyPayments(
  period?: string,
): Promise<{ success: true; data: MonthlyPaymentsOverview } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const p = typeof period === 'string' && /^\d{4}-\d{2}$/.test(period) ? period : periodoActual();

  const [perfilesRes, membresiasRes, pagosRes] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, email, role').eq('role', 'student').limit(MAX_PERFILES),
    supabaseAdmin.from('memberships').select('user_id, access_status'),
    supabaseAdmin.from('monthly_payments').select('user_id, period, paid, amount_eur, paid_on').eq('period', p),
  ]);

  if (perfilesRes.error) {
    console.error('getMonthlyPayments:', perfilesRes.error.message);
    return { success: false as const, error: perfilesRes.error.message };
  }

  // El roster del mes: alumnos cuyo `access_status` es 'active'. Sin fila en
  // `memberships` = pendiente = NO entra todavía (regla de P6/P8).
  const activos = new Set<string>();
  for (const m of membresiasRes.data ?? []) {
    if (m.access_status === 'active') activos.add(m.user_id as string);
  }
  const roster = (perfilesRes.data ?? [])
    .filter((u) => activos.has(u.id as string))
    .map((u) => ({ id: u.id as string, email: (u.email as string) ?? null }));

  const resumen = resumeMes(p, roster, (pagosRes.data ?? []) as MonthlyPaymentRow[]);
  const emailPorId = new Map(roster.map((r) => [r.id, r.email]));

  return {
    success: true as const,
    data: {
      ...resumen,
      filas: resumen.filas
        .map((f) => ({ ...f, email: emailPorId.get(f.userId) ?? null }))
        .sort((a, b) => Number(a.paid) - Number(b.paid) || (a.email ?? '').localeCompare(b.email ?? '')),
      periodos: periodosRecientes(12),
    },
  };
}

/**
 * Marca (o desmarca) el pago de un alumno para un mes. `paid_on` se pone al
 * marcar y se limpia al desmarcar. El importe vacío es `null`, nunca `0` (regla 16).
 */
export async function setPayment(input: unknown) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const raw = (input ?? {}) as Record<string, unknown>;
  const studentId = typeof raw.studentId === 'string' ? raw.studentId : '';
  const period = typeof raw.period === 'string' && /^\d{4}-\d{2}$/.test(raw.period) ? raw.period : '';
  if (!studentId || !period) return { success: false as const, error: 'Falta el alumno o el mes.' };

  const paid = raw.paid === true;

  const bruto = typeof raw.amount === 'string' ? raw.amount.trim() : raw.amount;
  const amount =
    bruto === '' || bruto === null || bruto === undefined ? null : Number(String(bruto).replace(',', '.'));
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    return { success: false as const, error: 'El importe no es válido.' };
  }
  const note = typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : null;

  const { error } = await supabaseAdmin.from('monthly_payments').upsert(
    {
      user_id: studentId,
      period,
      paid,
      amount_eur: amount,
      paid_on: paid ? new Date().toISOString().slice(0, 10) : null,
      note,
      recorded_by: auth.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,period' },
  );

  if (!error) {
    registraAccion({ actorId: auth.user.id, action: 'set_payment', target: studentId, detail: { period, paid } });
  }
  return { success: !error, error: error?.message };
}

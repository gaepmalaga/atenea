'use server'

import { supabaseAdmin } from './core';
import { requireAdmin } from '../lib/auth';
import { olvidaMembershipRequired } from '../lib/auth';
import { registraAccion } from '../lib/admin-audit';
import {
  ACCESS_STATUS,
  PAYMENT_STATUS,
  resumePagosPorAlumno,
  type AccessStatus,
  type PaymentStatus,
  type PagoRow,
} from '../lib/membership';

/**
 * CONTROL DE ACCESO Y PAGOS EN EFECTIVO (P6).
 *
 * La academia cobra en persona. Esto no cobra nada: es la puerta que el
 * administrador abre y cierra, y el registro de lo que cada alumno ha pagado.
 *
 * Todo va con la clave de servicio y `requireAdmin` (regla 34/35): las tres
 * tablas tienen RLS y cero políticas porque son de administración. Con la
 * sesión del alumno devolverían cero filas — el modo de fallo que hay que
 * evitar.
 *
 * La decisión de si un alumno entra NO está aquí: vive en `lib/membership.ts`
 * (`decideAccess`) y la aplica `auth.ts`. Aquí solo se lee y se escribe.
 */

const MAX_PERFILES = 5_000;

type EstadoTabla = { tablaFalta?: boolean };

function faltaTabla(mensaje: string): boolean {
  return /could not find the table/i.test(mensaje);
}

// ============================================================
// EL PANEL
// ============================================================

export type MiembroFila = {
  id: string;
  email: string | null;
  /** `active` | `suspended` según `memberships`, o `pending` si no hay fila. */
  acceso: 'active' | 'suspended' | 'pending';
  pago: PaymentStatus;
  note: string | null;
  /** Resumen de `academy_payments`: total pagado, nº de pagos, fecha del último. */
  pagos: { total: number; cuenta: number; ultimo: string | null };
};

export type MembershipOverview = {
  required: boolean;
  miembros: MiembroFila[];
  cuenta: { activos: number; pendientes: number; suspendidos: number; deben: number };
};

export async function getMembershipOverview(): Promise<
  ({ success: true; data: MembershipOverview } | { success: false; error: string }) & EstadoTabla
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const [ajustesRes, perfilesRes, membresiasRes, pagosRes] = await Promise.all([
    supabaseAdmin.from('membership_settings').select('required').eq('id', 1).maybeSingle(),
    supabaseAdmin.from('profiles').select('id, email, role').eq('role', 'student').limit(MAX_PERFILES),
    supabaseAdmin.from('memberships').select('user_id, access_status, payment_status, note'),
    supabaseAdmin.from('academy_payments').select('user_id, amount_eur, paid_on, note'),
  ]);

  const errTabla =
    [ajustesRes.error, membresiasRes.error, pagosRes.error].find((e) => e && faltaTabla(e.message)) ?? null;
  if (errTabla) {
    return { success: false as const, error: errTabla.message, tablaFalta: true };
  }
  if (perfilesRes.error) {
    console.error('getMembershipOverview:', perfilesRes.error.message);
    return { success: false as const, error: perfilesRes.error.message };
  }

  const membresias = new Map<string, { access_status: string; payment_status: string; note: string | null }>();
  for (const m of membresiasRes.data ?? []) {
    membresias.set(m.user_id as string, {
      access_status: (m.access_status as string) ?? ACCESS_STATUS.ACTIVE,
      payment_status: (m.payment_status as string) ?? PAYMENT_STATUS.AL_DIA,
      note: (m.note as string) ?? null,
    });
  }

  const pagosPorAlumno = resumePagosPorAlumno((pagosRes.data ?? []) as PagoRow[]);

  const miembros: MiembroFila[] = (perfilesRes.data ?? []).map((p) => {
    const m = membresias.get(p.id as string);
    const resumen = pagosPorAlumno.get(p.id as string);
    return {
      id: p.id as string,
      email: (p.email as string) ?? null,
      acceso: m ? (m.access_status === ACCESS_STATUS.SUSPENDED ? 'suspended' : 'active') : 'pending',
      pago: (m?.payment_status === PAYMENT_STATUS.DEBE ? PAYMENT_STATUS.DEBE : PAYMENT_STATUS.AL_DIA),
      note: m?.note ?? null,
      pagos: {
        total: resumen?.total ?? 0,
        cuenta: resumen?.cuenta ?? 0,
        ultimo: resumen?.ultimo ?? null,
      },
    };
  });

  // Orden: primero lo que pide atención — pendientes, luego los que deben,
  // luego suspendidos, y al final los activos al día. Una lista alfabética
  // obliga a leerla entera para encontrar a quién hay que llamar (regla 35).
  const peso = (m: MiembroFila) =>
    m.acceso === 'pending' ? 0
    : m.pago === PAYMENT_STATUS.DEBE ? 1
    : m.acceso === 'suspended' ? 2
    : 3;
  miembros.sort((a, b) => peso(a) - peso(b) || (a.email ?? '').localeCompare(b.email ?? ''));

  return {
    success: true as const,
    data: {
      required: ajustesRes.data?.required === true,
      miembros,
      cuenta: {
        activos: miembros.filter((m) => m.acceso === 'active').length,
        pendientes: miembros.filter((m) => m.acceso === 'pending').length,
        suspendidos: miembros.filter((m) => m.acceso === 'suspended').length,
        deben: miembros.filter((m) => m.pago === PAYMENT_STATUS.DEBE).length,
      },
    },
  };
}

export type PagoFila = {
  id: string;
  amountEur: number | null;
  paidOn: string;
  note: string | null;
};

/** El historial de pagos de un alumno. Se carga al desplegar su ficha. */
export async function getMemberPayments(
  studentId: string
): Promise<{ success: true; pagos: PagoFila[] } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!studentId) return { success: false as const, error: 'Falta el alumno.' };

  const { data, error } = await supabaseAdmin
    .from('academy_payments')
    .select('id, amount_eur, paid_on, note')
    .eq('user_id', studentId)
    .order('paid_on', { ascending: false });

  if (error) return { success: false as const, error: error.message };

  return {
    success: true as const,
    pagos: (data ?? []).map((p) => ({
      id: p.id as string,
      amountEur: p.amount_eur === null ? null : Number(p.amount_eur),
      paidOn: p.paid_on as string,
      note: (p.note as string) ?? null,
    })),
  };
}

// ============================================================
// LAS ESCRITURAS
// ============================================================

/** El interruptor global. Al cambiarlo se tira la caché para verlo al momento. */
export async function setMembershipRequired(required: boolean) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const { error } = await supabaseAdmin
    .from('membership_settings')
    .upsert({ id: 1, required: required === true, updated_at: new Date().toISOString() });

  if (!error) {
    olvidaMembershipRequired();
    registraAccion({ actorId: auth.user.id, action: 'set_membership_required', detail: { required } });
  }
  return { success: !error, error: error?.message };
}

async function upsertMiembro(
  actorId: string,
  studentId: string,
  fila: Record<string, unknown>,
  accion: 'set_member_access' | 'set_member_payment',
  detail: Record<string, unknown>,
) {
  const { error } = await supabaseAdmin
    .from('memberships')
    .upsert(
      { user_id: studentId, updated_at: new Date().toISOString(), ...fila },
      { onConflict: 'user_id' },
    );

  if (!error) registraAccion({ actorId, action: accion, target: studentId, detail });
  return { success: !error, error: error?.message };
}

/** Da o quita el acceso a un alumno. Crear la fila = activarlo por primera vez. */
export async function setMemberAccess(studentId: string, status: AccessStatus) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!studentId) return { success: false as const, error: 'Falta el alumno.' };

  const valor = status === ACCESS_STATUS.SUSPENDED ? ACCESS_STATUS.SUSPENDED : ACCESS_STATUS.ACTIVE;
  return upsertMiembro(auth.user.id, studentId, { access_status: valor }, 'set_member_access', { status: valor });
}

/** Marca a un alumno como al día o como que debe. Es un aviso, no corta el acceso. */
export async function setMemberPaymentStatus(studentId: string, status: PaymentStatus) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!studentId) return { success: false as const, error: 'Falta el alumno.' };

  const valor = status === PAYMENT_STATUS.DEBE ? PAYMENT_STATUS.DEBE : PAYMENT_STATUS.AL_DIA;
  return upsertMiembro(auth.user.id, studentId, { payment_status: valor }, 'set_member_payment', { status: valor });
}

/**
 * Apunta un pago en efectivo. El importe puede ir vacío: a veces solo interesa
 * dejar constancia de que ese mes pagó.
 */
export async function recordPayment(input: unknown) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const raw = (input ?? {}) as Record<string, unknown>;
  const studentId = typeof raw.studentId === 'string' ? raw.studentId : '';
  if (!studentId) return { success: false as const, error: 'Falta el alumno.' };

  // `Number('')` es 0, y un pago de 0 € por un campo vacío es justo el fallo de
  // la regla 16. Vacío -> null.
  const bruto = typeof raw.amount === 'string' ? raw.amount.trim() : raw.amount;
  const amount =
    bruto === '' || bruto === null || bruto === undefined ? null : Number(bruto);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    return { success: false as const, error: 'El importe no es válido.' };
  }

  const paidOn =
    typeof raw.paidOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.paidOn)
      ? raw.paidOn
      : new Date().toISOString().slice(0, 10);
  const note = typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : null;

  const { error } = await supabaseAdmin.from('academy_payments').insert({
    user_id: studentId,
    amount_eur: amount,
    paid_on: paidOn,
    note,
    recorded_by: auth.user.id,
  });

  if (!error) registraAccion({ actorId: auth.user.id, action: 'record_payment', target: studentId });
  return { success: !error, error: error?.message };
}

export async function deletePayment(paymentId: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!paymentId) return { success: false as const, error: 'Falta el pago.' };

  const { error } = await supabaseAdmin.from('academy_payments').delete().eq('id', paymentId);
  if (!error) registraAccion({ actorId: auth.user.id, action: 'delete_payment', target: paymentId });
  return { success: !error, error: error?.message };
}

/**
 * Da acceso de golpe a todos los alumnos que ya existen. Es el botón que se
 * pulsa ANTES de encender el interruptor global: sin él, encenderlo dejaría
 * fuera a toda la academia hasta activarlos uno a uno.
 */
export async function activateAllCurrentStudents() {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const { data: perfiles, error: leer } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('role', 'student')
    .limit(MAX_PERFILES);
  if (leer) return { success: false as const, error: leer.message };

  const filas = (perfiles ?? []).map((p) => ({
    user_id: p.id as string,
    access_status: ACCESS_STATUS.ACTIVE,
    updated_at: new Date().toISOString(),
  }));
  if (!filas.length) return { success: true as const, error: undefined, activados: 0 };

  // `ignoreDuplicates`: no se pisa a quien ya tiene fila —podría estar
  // suspendido a propósito, y este botón no es para resucitar bajas.
  const { error } = await supabaseAdmin
    .from('memberships')
    .upsert(filas, { onConflict: 'user_id', ignoreDuplicates: true });

  if (!error) registraAccion({ actorId: auth.user.id, action: 'activate_all_students', detail: { total: filas.length } });
  return { success: !error, error: error?.message, activados: filas.length };
}

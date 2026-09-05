/**
 * CONTROL DE ACCESO Y PAGOS EN EFECTIVO (P6).
 *
 * La academia cobra en persona. Esto no es una pasarela: es un registro de
 * pagos que lleva el administrador y una puerta que él abre y cierra.
 *
 * ES LÓGICA PURA (regla 21). La lectura de la base de datos la hace `auth.ts`
 * (para la puerta) y `actions/membership.ts` (para el panel); aquí solo está la
 * decisión y la aritmética, que es lo que se puede testear.
 */

export const ACCESS_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
} as const;
export type AccessStatus = (typeof ACCESS_STATUS)[keyof typeof ACCESS_STATUS];

export const PAYMENT_STATUS = {
  AL_DIA: 'al_dia',
  DEBE: 'debe',
} as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

/** Lo que la puerta le dice al alumno. `pending` = registrado, sin activar. */
export type AccessDecision = 'ok' | 'pending' | 'suspended';

/** Una fila de `memberships`, o `null` si el alumno no tiene ninguna todavía. */
export type MembershipRow = {
  access_status?: string | null;
  payment_status?: string | null;
} | null;

/**
 * ¿Puede entrar este usuario?
 *
 * El ORDEN de las reglas es la decisión, y no es negociable:
 *
 *  1. Un ADMIN entra siempre. Cerrarle la puerta al que gestiona la puerta es
 *     cómo te quedas fuera de tu propia plataforma.
 *  2. Con el interruptor GLOBAL apagado (`required === false`), entra todo el
 *     mundo — es el estado de hoy, y encender el control de acceso no puede ser
 *     un efecto colateral de ejecutar el guion SQL.
 *  3. Si la LECTURA falló (la tabla no existe todavía, la BD no contesta), se
 *     abre la puerta. Un fallo de lectura no puede dejar a la academia entera
 *     fuera sin que nadie lo haya decidido — misma regla que `module-guard`,
 *     pero aquí el coste de equivocarse es mayor: son alumnos que SÍ han pagado.
 *  4. SIN FILA = pendiente. Un alumno recién registrado no entra hasta que el
 *     administrador lo active.
 *  5. Fila con `suspended` = fuera. Es lo que el administrador pone cuando
 *     alguien deja de pagar o pide la baja.
 *  6. Cualquier otra cosa (fila `active`) = dentro.
 */
export function decideAccess(params: {
  required: boolean;
  role: 'admin' | 'student';
  row: MembershipRow;
  /** `false` si la consulta a `memberships`/`membership_settings` dio error. */
  readOk: boolean;
}): AccessDecision {
  const { required, role, row, readOk } = params;

  if (role === 'admin') return 'ok';
  if (!required) return 'ok';
  if (!readOk) return 'ok';
  if (!row) return 'pending';
  if (row.access_status === ACCESS_STATUS.SUSPENDED) return 'suspended';
  return 'ok';
}

// ============================================================
// EL REGISTRO DE PAGOS, PARA EL PANEL
// ============================================================

/** Un pago, tal y como lo guarda `academy_payments`. */
export type PagoRow = {
  user_id?: string | null;
  amount_eur?: number | string | null;
  paid_on?: string | null;
  note?: string | null;
};

export type ResumenPagosAlumno = {
  userId: string;
  /** Suma de los importes anotados. Los pagos sin importe suman 0. */
  total: number;
  /** Cuántos pagos hay anotados (con importe o sin él). */
  cuenta: number;
  /** Fecha (`YYYY-MM-DD`) del pago más reciente, o `null` si no hay ninguno. */
  ultimo: string | null;
};

/** Número o cadena numérica -> número. Lo que no se lee cuenta 0, nunca NaN. */
function num(v: number | string | null | undefined): number {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
  if (typeof v === 'string') {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return 0;
}

/**
 * Agrupa los pagos por alumno: cuánto lleva pagado, cuántas veces y cuándo fue
 * la última. `null` como `ultimo` significa «ningún pago», que en pantalla no es
 * lo mismo que «0 €» (regla 8).
 */
export function resumePagosPorAlumno(pagos: PagoRow[]): Map<string, ResumenPagosAlumno> {
  const porAlumno = new Map<string, ResumenPagosAlumno>();

  for (const pago of pagos ?? []) {
    const uid = typeof pago.user_id === 'string' && pago.user_id ? pago.user_id : null;
    if (!uid) continue;

    const acc = porAlumno.get(uid) ?? { userId: uid, total: 0, cuenta: 0, ultimo: null };
    acc.total += num(pago.amount_eur);
    acc.cuenta += 1;

    const fecha = typeof pago.paid_on === 'string' && pago.paid_on ? pago.paid_on.slice(0, 10) : null;
    if (fecha && (acc.ultimo === null || fecha > acc.ultimo)) acc.ultimo = fecha;

    porAlumno.set(uid, acc);
  }

  return porAlumno;
}

/** Importe en euros para pantalla. Un importe vacío se enseña como «—», no «0 €». */
export function formateaEUR(valor: number | null): string {
  if (valor === null) return '—';
  if (!Number.isFinite(valor) || valor <= 0) return '0,00 €';
  return `${valor.toFixed(2).replace('.', ',')} €`;
}

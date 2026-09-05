/**
 * PAGOS MENSUALES EN EFECTIVO (P8).
 *
 * El dueño cobra en persona y quiere una rejilla por mes: «elijo septiembre, me
 * salen los alumnos activos, voy marcando quién paga, y veo el recuento y lo
 * cobrado». Una fila por (alumno, mes) en `monthly_payments`.
 *
 * Módulo puro (regla 21): el cálculo del resumen del mes se testea aquí. Es la
 * regla 8 otra vez —«sin importe» no es «0 €»— y en dinero importa.
 */

/** Una fila de `monthly_payments`. `amount_eur` llega como cadena desde PostgREST. */
export type MonthlyPaymentRow = {
  user_id?: string | null;
  period?: string | null;
  paid?: boolean | null;
  amount_eur?: number | string | null;
  paid_on?: string | null;
};

/** El mes actual como `YYYY-MM`. */
export function periodoActual(hoy: Date = new Date()): string {
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
}

/** Los últimos `n` meses (incluido el actual), del más reciente al más antiguo. */
export function periodosRecientes(n = 12, hoy: Date = new Date()): string[] {
  const out: string[] = [];
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** `2026-09` -> «septiembre de 2026». `null` si no se puede leer. */
export function formateaPeriodo(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  const mes = MESES[Number(m[2]) - 1] ?? m[2];
  return `${mes} de ${m[1]}`;
}

/** Número o cadena numérica -> número. Lo ilegible cuenta 0, nunca NaN. */
function num(v: number | string | null | undefined): number {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
  if (typeof v === 'string') {
    const n = Number.parseFloat(v.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return 0;
}

export type FilaPagoMes = {
  userId: string;
  email: string | null;
  paid: boolean;
  /** `null` si no se ha anotado importe (regla 8): no es lo mismo que 0 €. */
  amount: number | null;
  paidOn: string | null;
};

export type ResumenMes = {
  period: string;
  filas: FilaPagoMes[];
  /** Cuántos han pagado y cuántos no, sobre el total del roster. */
  pagados: number;
  porPagar: number;
  total: number;
  /** Suma de los importes de los que han pagado (los que traen importe). */
  cobrado: number;
};

/**
 * Cruza el ROSTER de alumnos activos con lo que hay en `monthly_payments` para
 * ese mes. Un alumno sin fila cuenta como «no pagado» — el mes nace con todos
 * a cero y se van marcando.
 */
export function resumeMes(
  period: string,
  roster: { id: string; email: string | null }[],
  pagos: MonthlyPaymentRow[],
): ResumenMes {
  const porAlumno = new Map<string, MonthlyPaymentRow>();
  for (const p of pagos ?? []) {
    if (p.period === period && typeof p.user_id === 'string' && p.user_id) porAlumno.set(p.user_id, p);
  }

  const filas: FilaPagoMes[] = (roster ?? []).map((a) => {
    const p = porAlumno.get(a.id);
    const amountRaw = p?.amount_eur;
    return {
      userId: a.id,
      email: a.email ?? null,
      paid: p?.paid === true,
      amount: amountRaw === null || amountRaw === undefined || amountRaw === '' ? null : num(amountRaw),
      paidOn: typeof p?.paid_on === 'string' ? p.paid_on.slice(0, 10) : null,
    };
  });

  const pagados = filas.filter((f) => f.paid).length;
  const cobrado = filas.reduce((s, f) => s + (f.paid ? (f.amount ?? 0) : 0), 0);

  return {
    period,
    filas,
    pagados,
    porPagar: filas.length - pagados,
    total: filas.length,
    cobrado,
  };
}

/** Importe para pantalla. `null` -> «—»; por debajo de un céntimo con gasto -> «< 0,01 €». */
export function formateaEUR(valor: number | null): string {
  if (valor === null) return '—';
  if (!Number.isFinite(valor) || valor <= 0) return '0,00 €';
  return `${valor.toFixed(2).replace('.', ',')} €`;
}

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  periodoActual,
  periodosRecientes,
  formateaPeriodo,
  resumeMes,
  resumeHistorico,
  formateaEUR,
  type MonthlyPaymentRow,
} from '../app/lib/payments';

/**
 * PAGOS MENSUALES EN EFECTIVO (P8).
 *
 * «Elijo septiembre, me salen los alumnos activos, marco quién paga, y veo el
 * recuento y lo cobrado.» La aritmética del resumen se testea aquí — regla 8
 * («sin importe» no es «0 €») y en dinero importa.
 */

describe('los periodos', () => {
  it('periodoActual es YYYY-MM', () => {
    expect(periodoActual(new Date(2026, 8, 15))).toBe('2026-09');
    expect(periodoActual(new Date(2026, 0, 1))).toBe('2026-01');
  });

  it('periodosRecientes va del mes actual hacia atrás y cruza el año', () => {
    const ps = periodosRecientes(4, new Date(2026, 1, 10)); // febrero 2026
    expect(ps).toEqual(['2026-02', '2026-01', '2025-12', '2025-11']);
  });

  it('formateaPeriodo en español', () => {
    expect(formateaPeriodo('2026-09')).toBe('septiembre de 2026');
    expect(formateaPeriodo('nada')).toBe('nada');
  });
});

describe('resumeMes', () => {
  const roster = [
    { id: 'a', email: 'a@x.com' },
    { id: 'b', email: 'b@x.com' },
    { id: 'c', email: 'c@x.com' },
  ];

  it('un alumno sin fila cuenta como NO pagado', () => {
    const r = resumeMes('2026-09', roster, []);
    expect(r.pagados).toBe(0);
    expect(r.porPagar).toBe(3);
    expect(r.total).toBe(3);
    expect(r.cobrado).toBe(0);
  });

  it('suma lo cobrado de los que han pagado', () => {
    const pagos: MonthlyPaymentRow[] = [
      { user_id: 'a', period: '2026-09', paid: true, amount_eur: '45' },
      { user_id: 'b', period: '2026-09', paid: true, amount_eur: 30 },
      { user_id: 'c', period: '2026-09', paid: false, amount_eur: null },
    ];
    const r = resumeMes('2026-09', roster, pagos);
    expect(r.pagados).toBe(2);
    expect(r.porPagar).toBe(1);
    expect(r.cobrado).toBeCloseTo(75, 2);
  });

  it('pagó sin anotar importe: cuenta como pagado, importe null (regla 8), suma 0', () => {
    const r = resumeMes('2026-09', roster, [{ user_id: 'a', period: '2026-09', paid: true, amount_eur: null }]);
    const filaA = r.filas.find((f) => f.userId === 'a')!;
    expect(filaA.paid).toBe(true);
    expect(filaA.amount).toBeNull();
    expect(r.cobrado).toBe(0);
  });

  it('las filas de OTRO mes no cuentan', () => {
    const r = resumeMes('2026-09', roster, [{ user_id: 'a', period: '2026-08', paid: true, amount_eur: 45 }]);
    expect(r.pagados).toBe(0);
  });

  it('lee el importe como cadena con coma (numeric de PostgREST)', () => {
    const r = resumeMes('2026-09', roster, [{ user_id: 'a', period: '2026-09', paid: true, amount_eur: '29,90' }]);
    expect(r.cobrado).toBeCloseTo(29.9, 2);
  });
});

describe('resumeHistorico · la rejilla de todos los meses', () => {
  const roster = [
    { id: 'a', email: 'a@x.com' },
    { id: 'b', email: 'b@x.com' },
  ];
  const periodos = ['2026-07', '2026-08', '2026-09'];

  it('un mes sin fila no aparece en el mapa de celdas', () => {
    const h = resumeHistorico(periodos, roster, [
      { user_id: 'a', period: '2026-08', paid: true, amount_eur: '40' },
    ]);
    const filaA = h.filas.find((f) => f.userId === 'a')!;
    expect(filaA.celdas['2026-08']).toEqual({ paid: true, amount: 40 });
    expect(filaA.celdas['2026-07']).toBeUndefined();
    expect(filaA.pagadosEnRango).toBe(1);
  });

  it('el recuento por columna suma los pagados y lo cobrado de ese mes', () => {
    const h = resumeHistorico(periodos, roster, [
      { user_id: 'a', period: '2026-09', paid: true, amount_eur: '45' },
      { user_id: 'b', period: '2026-09', paid: true, amount_eur: null },
      { user_id: 'a', period: '2026-07', paid: false, amount_eur: null },
    ]);
    const sep = h.columnas.find((c) => c.period === '2026-09')!;
    expect(sep.pagados).toBe(2);
    expect(sep.total).toBe(2);
    expect(sep.cobrado).toBeCloseTo(45, 2); // b pagó sin importe: suma 0 (regla 8)
    const jul = h.columnas.find((c) => c.period === '2026-07')!;
    expect(jul.pagados).toBe(0);
  });

  it('las filas de meses fuera del rango se ignoran', () => {
    const h = resumeHistorico(periodos, roster, [
      { user_id: 'a', period: '2026-01', paid: true, amount_eur: '99' },
    ]);
    expect(h.filas.find((f) => f.userId === 'a')!.pagadosEnRango).toBe(0);
    expect(h.columnas.every((c) => c.cobrado === 0)).toBe(true);
  });
});

describe('formateaEUR', () => {
  it('null -> «—» (regla 8)', () => {
    expect(formateaEUR(null)).toBe('—');
  });
  it('coma decimal', () => {
    expect(formateaEUR(29.9)).toBe('29,90 €');
    expect(formateaEUR(0)).toBe('0,00 €');
  });
});

describe('las guardas de la acción', () => {
  const src = readFileSync(join(__dirname, '..', 'app', 'actions', 'payments.ts'), 'utf-8');

  it('todo requireAdmin + clave de servicio', () => {
    const exportadas = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
    for (const n of exportadas) {
      expect(src.slice(src.indexOf(`export async function ${n}`), src.indexOf(`export async function ${n}`) + 300)).toMatch(/requireAdmin\(\)/);
    }
    expect(src).toContain('supabaseAdmin');
    expect(src).not.toMatch(/\bdb\.from\(/);
  });

  it('el importe vacío se guarda como null, nunca 0 (regla 16)', () => {
    const fn = src.slice(src.indexOf('export async function setPayment'));
    expect(fn).toMatch(/=== ''|=== null|=== undefined/);
  });

  it('el roster del mes son los alumnos con acceso activo', () => {
    expect(src).toMatch(/access_status === 'active'/);
  });
});

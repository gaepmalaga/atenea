import { describe, it, expect } from 'vitest';
import {
  resumeMes, resumeHistorico, ingresosPorMes, resumenAnual, lineasCaja, totalesPorMetodo, csvCaja, esMetodo,
} from '../app/lib/payments';

/**
 * LA CONTABILIDAD DEL PANEL DE PAGOS (regla 102).
 *
 * Es dinero, y la regla 8 vuelve a mandar: «sin importe anotado» no es «0 €», y
 * un exento no es ni «pagó» ni «debe». Estos tests fijan esa aritmética.
 */
const roster = [
  { id: 'a', email: 'a@x.es' },
  { id: 'b', email: 'b@x.es' },
  { id: 'c', email: 'c@x.es' },
  { id: 'e', email: 'exento@x.es', exempt: true },
];

describe('ingresos por mes', () => {
  const h = resumeHistorico(['2026-09', '2026-10'], roster, [
    { user_id: 'a', period: '2026-09', paid: true, amount_eur: '90' },
    { user_id: 'b', period: '2026-09', paid: true, amount_eur: '80' },
    { user_id: 'a', period: '2026-10', paid: true, amount_eur: null },
  ]);
  const meses = ingresosPorMes(h);

  it('suma lo cobrado y cuenta a los exentos fuera', () => {
    expect(meses[0]).toMatchObject({ period: '2026-09', cobrado: 170, pagados: 2, total: 3 });
  });

  it('estima el pendiente con el importe medio de los que pagaron', () => {
    // 170 / 2 = 85 de media, y falta 1 por pagar.
    expect(meses[0].pendienteEstimado).toBe(85);
  });

  it('un pago sin importe cuenta como pagado pero suma 0, y no inventa una media', () => {
    expect(meses[1].pagados).toBe(1);
    expect(meses[1].cobrado).toBe(0);
    expect(meses[1].pendienteEstimado).toBeNull();
  });

  it('si nadie ha pagado, el pendiente es null y no 0 (regla 8)', () => {
    const vacio = ingresosPorMes(resumeHistorico(['2026-11'], roster, []));
    expect(vacio[0].pendienteEstimado).toBeNull();
  });
});

describe('resumen del periodo', () => {
  it('la media no cuenta los meses sin cobro', () => {
    const r = resumenAnual([
      { period: '2026-08', cobrado: 0, pagados: 0, total: 3, pendienteEstimado: null },
      { period: '2026-09', cobrado: 100, pagados: 2, total: 3, pendienteEstimado: 50 },
      { period: '2026-10', cobrado: 200, pagados: 3, total: 3, pendienteEstimado: 0 },
    ]);
    expect(r.cobrado).toBe(300);
    expect(r.mediaMensual).toBe(150);
    expect(r.mejorMes).toEqual({ period: '2026-10', cobrado: 200 });
  });

  it('sin ningún cobro no hay media ni mejor mes', () => {
    const r = resumenAnual([]);
    expect(r).toEqual({ cobrado: 0, mediaMensual: null, mejorMes: null });
  });
});

describe('la caja del mes', () => {
  const mes = resumeMes('2026-11', roster, [
    { user_id: 'b', period: '2026-11', paid: true, amount_eur: 80, paid_on: '2026-11-05', method: 'bizum', receipt_no: 12 },
    { user_id: 'a', period: '2026-11', paid: true, amount_eur: 90, paid_on: '2026-11-03', method: 'efectivo' },
    { user_id: 'c', period: '2026-11', paid: false },
    { user_id: 'e', period: '2026-11', paid: true, amount_eur: 50, paid_on: '2026-11-04' },
  ]);
  const lineas = lineasCaja(mes);

  it('solo sale lo cobrado, por fecha, y un exento no cobra', () => {
    expect(lineas.map((l) => l.email)).toEqual(['a@x.es', 'b@x.es']);
  });

  it('reparte por método y deja aparte lo que no tiene método', () => {
    const t = totalesPorMetodo([...lineas, { userId: 'z', email: 'z@x.es', fecha: '2026-11-06', importe: 10, metodo: null, recibo: null }]);
    expect(t.find((x) => x.metodo === 'efectivo')?.importe).toBe(90);
    expect(t.find((x) => x.metodo === 'bizum')?.importe).toBe(80);
    expect(t.find((x) => x.metodo === 'sin_metodo')).toMatchObject({ importe: 10, cobros: 1 });
  });

  it('un método desconocido no se acepta', () => {
    expect(esMetodo('bizum')).toBe(true);
    expect(esMetodo('cheque')).toBe(false);
    expect(esMetodo(null)).toBe(false);
  });
});

describe('el CSV para el gestor', () => {
  const l = (email: string, importe: number | null) => ({ userId: 'u', email, fecha: '2026-11-03', importe, metodo: null, recibo: 7 });

  it('abre bien en Excel en español: BOM, punto y coma y coma decimal', () => {
    const csv = csvCaja('2026-11', [l('a@x.es', 90.5)]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Fecha;Alumno;Concepto;Importe (€);Método;Recibo');
    expect(csv).toContain('2026-11-03;a@x.es;Mensualidad 2026-11;90,50;;00007');
  });

  it('un importe sin anotar sale vacío, no 0', () => {
    expect(csvCaja('2026-11', [l('a@x.es', null)])).toContain(';Mensualidad 2026-11;;;00007');
  });

  it('un correo que empieza por = no se convierte en una fórmula', () => {
    const csv = csvCaja('2026-11', [l('=HYPERLINK("http://x")@x.es', 1)]);
    expect(csv).not.toMatch(/;=HYPERLINK/);
    expect(csv).toContain("'=HYPERLINK");
  });
});

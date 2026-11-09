import { describe, it, expect } from 'vitest';
import {
  leeImporte,
  eur,
  cuotaDeAlumno,
  precioSuelto,
  nombreDePack,
  tiposDePack,
  estadoDe,
  leeApunte,
  aplicaCobro,
  cambiosParaAbrirMes,
  resumeCuotasMes,
  resumeHistoricoCuotas,
  periodoEnZona,
  sumaMeses,
  mesesHasta,
  esPeriodo,
  csvHistorico,
  celdaCsv,
  leeCobro,
  cobradoSegunLibro,
  filaSegunLibro,
  cajaDelMes,
  csvCaja,
  htmlRecibo,
  type Tarifa,
  type Cobro,
} from '../app/lib/cuotas';
import { periodoActual } from '../app/lib/payments';

/**
 * LAS CUOTAS (regla 102). El dueño pone el precio de cada tipo de grupo y los
 * packs; la cuota de cada alumno sale de sus grupos. Es dinero: «sin precio»
 * no es 0 € (reglas 8 y 16), y un pack nunca cobra más que ir suelto.
 */

const TARIFA: Tarifa = {
  tipos: [
    { id: 'teoria', label: 'Teoría', precio: 60 },
    { id: 'ingles', label: 'Inglés', precio: 20 },
    { id: 'fisicas', label: 'Físicas', precio: 50 },
    { id: 'otro', label: 'Otro', precio: null },
  ],
  packs: [{ id: 'p1', nombre: 'Completo', tipos: ['fisicas', 'ingles', 'teoria'], precio: 100 }],
};

describe('los importes que escribe el dueño', () => {
  it('entiende 50, 49,90, 49.9 y «50 €»; vacío es null, no 0', () => {
    expect(leeImporte('50')).toEqual({ ok: true, valor: 50 });
    expect(leeImporte('49,90')).toEqual({ ok: true, valor: 49.9 });
    expect(leeImporte('49.9')).toEqual({ ok: true, valor: 49.9 });
    expect(leeImporte(' 50 € ')).toEqual({ ok: true, valor: 50 });
    expect(leeImporte('')).toEqual({ ok: true, valor: null });
    expect(leeImporte(null)).toEqual({ ok: true, valor: null });
    expect(leeImporte('0')).toEqual({ ok: true, valor: 0 });
  });

  it('rechaza lo que no es un importe, el separador de miles y lo que no cabe', () => {
    expect(leeImporte('1.000').ok).toBe(false);
    expect(leeImporte('-5').ok).toBe(false);
    expect(leeImporte('cincuenta').ok).toBe(false);
    expect(leeImporte('10000').ok).toBe(false);
    expect(leeImporte(Number.NaN).ok).toBe(false);
    expect(leeImporte({}).ok).toBe(false);
  });

  it('eur pinta sin decimales si son enteros y «—» si no hay dato', () => {
    expect(eur(50)).toBe('50 €');
    expect(eur(49.9)).toBe('49,90 €');
    expect(eur(0)).toBe('0 €');
    expect(eur(null)).toBe('—');
    expect(eur(2675)).toBe('2.675 €');
  });
});

describe('la cuota de cada alumno', () => {
  it('un tipo: su precio', () => {
    const c = cuotaDeAlumno({ tipos: ['teoria'], tarifa: TARIFA });
    expect(c).toMatchObject({ importe: 60, origen: 'tarifa', detalle: 'Teoría 60 €' });
  });

  it('dos grupos del mismo tipo cuentan una vez', () => {
    expect(cuotaDeAlumno({ tipos: ['fisicas', 'fisicas'], tarifa: TARIFA }).importe).toBe(50);
  });

  it('varios tipos sin pack que los cubra: la suma', () => {
    const c = cuotaDeAlumno({ tipos: ['teoria', 'ingles'], tarifa: TARIFA });
    expect(c.importe).toBe(80);
    expect(c.detalle).toBe('Teoría 60 € + Inglés 20 €');
  });

  it('los tres: el pack de 100 €, no los 130 € sueltos', () => {
    const c = cuotaDeAlumno({ tipos: ['teoria', 'fisicas', 'ingles'], tarifa: TARIFA });
    expect(c.importe).toBe(100);
    expect(c.partes).toEqual([{ nombre: 'Completo', precio: 100, esPack: true }]);
  });

  it('un pack que sale más caro que ir suelto no se aplica', () => {
    const t: Tarifa = { ...TARIFA, packs: [{ id: 'x', nombre: 'Caro', tipos: ['ingles', 'teoria'], precio: 95 }] };
    expect(cuotaDeAlumno({ tipos: ['teoria', 'ingles'], tarifa: t }).importe).toBe(80);
  });

  it('pack + suelto, y entre packs que se solapan, la combinación más barata', () => {
    const t: Tarifa = {
      ...TARIFA,
      packs: [
        { id: 'a', nombre: 'Teoría + Físicas', tipos: ['fisicas', 'teoria'], precio: 90 },
        { id: 'b', nombre: 'Teoría + Inglés', tipos: ['ingles', 'teoria'], precio: 70 },
      ],
    };
    // Teoría + Físicas + Inglés: 90 + 20 = 110, o 70 + 50 = 120 → 110.
    const c = cuotaDeAlumno({ tipos: ['teoria', 'fisicas', 'ingles'], tarifa: t });
    expect(c.importe).toBe(110);
    expect(c.detalle).toBe('Teoría + Físicas 90 € + Inglés 20 €');
  });

  it('un tipo sin precio: la cuota NO se calcula (no es 0 €) y se dice cuál falta', () => {
    const c = cuotaDeAlumno({ tipos: ['teoria', 'otro'], tarifa: TARIFA });
    expect(c.importe).toBeNull();
    expect(c.origen).toBe('sin_precio');
    expect(c.detalle).toBe('Falta el precio de Otro');
  });

  it('un tipo sin precio que cubre un pack no falta', () => {
    const t: Tarifa = { ...TARIFA, packs: [{ id: 'p', nombre: 'Teoría + Otro', tipos: ['otro', 'teoria'], precio: 65 }] };
    expect(cuotaDeAlumno({ tipos: ['teoria', 'otro'], tarifa: t }).importe).toBe(65);
  });

  it('sin grupos, sin cuota; exento, sin cuota; la propia manda sobre la tarifa', () => {
    expect(cuotaDeAlumno({ tipos: [], tarifa: TARIFA })).toMatchObject({ importe: null, origen: 'sin_grupos' });
    expect(cuotaDeAlumno({ tipos: ['teoria'], tarifa: TARIFA, exento: true })).toMatchObject({ importe: null, origen: 'exento' });
    expect(cuotaDeAlumno({ tipos: ['teoria'], tarifa: TARIFA, propia: 45 })).toMatchObject({ importe: 45, origen: 'propia' });
    expect(cuotaDeAlumno({ tipos: [], tarifa: TARIFA, propia: 0 })).toMatchObject({ importe: 0, origen: 'propia' });
  });

  it('los céntimos no se tuercen al sumar', () => {
    const t: Tarifa = { tipos: [{ id: 'a', label: 'A', precio: 0.1 }, { id: 'b', label: 'B', precio: 0.2 }], packs: [] };
    expect(cuotaDeAlumno({ tipos: ['a', 'b'], tarifa: t }).importe).toBe(0.3);
  });

  it('precio suelto, nombre y tipos de un pack', () => {
    expect(precioSuelto(['teoria', 'ingles'], TARIFA)).toBe(80);
    expect(precioSuelto(['teoria', 'otro'], TARIFA)).toBeNull();
    expect(nombreDePack(['ingles', 'teoria'], TARIFA)).toBe('Teoría + Inglés');
    expect(tiposDePack(['teoria', 'ingles', 'teoria', 'nada', 3], ['teoria', 'ingles'])).toEqual(['ingles', 'teoria']);
  });
});

describe('lo que debía y lo que pagó cada mes', () => {
  it('los estados', () => {
    expect(estadoDe(50, 50)).toBe('pagado');
    expect(estadoDe(50, 30)).toBe('parcial');
    expect(estadoDe(50, 0)).toBe('debe');
    expect(estadoDe(0, 0)).toBe('no_paga');
    expect(estadoDe(null, 0)).toBe('sin_cuota');
    expect(estadoDe(null, 40)).toBe('pagado');
  });

  it('un pago a medias: pagado 30 de 50, faltan 20', () => {
    const a = leeApunte({ due_eur: '50.00', amount_eur: '30.00', paid: false });
    expect(a).toMatchObject({ debido: 50, cobrado: 30, pendiente: 20, estado: 'parcial' });
  });

  it('una fila de antes de las cuotas («Pagó», sin importe) cobró lo que debía', () => {
    expect(leeApunte({ due_eur: 50, amount_eur: null, paid: true })).toMatchObject({ cobrado: 50, estado: 'pagado' });
    expect(leeApunte({ due_eur: null, amount_eur: null, paid: true })).toMatchObject({ cobrado: 0, estado: 'pagado' });
  });

  it('sin fila, cuenta la cuota de hoy', () => {
    expect(leeApunte(null, 60)).toMatchObject({ debido: 60, cobrado: 0, pendiente: 60, estado: 'debe' });
    expect(leeApunte(null, null)).toMatchObject({ debido: null, pendiente: 0, estado: 'sin_cuota' });
  });

  it('cobrar de un toque es lo que falta; con cantidad, se suma', () => {
    expect(aplicaCobro({ debido: 50, cobrado: 0 }, null)).toEqual({ ok: true, cobrado: 50, estado: 'pagado' });
    expect(aplicaCobro({ debido: 50, cobrado: 30 }, null)).toEqual({ ok: true, cobrado: 50, estado: 'pagado' });
    expect(aplicaCobro({ debido: 50, cobrado: 0 }, 30)).toEqual({ ok: true, cobrado: 30, estado: 'parcial' });
    expect(aplicaCobro({ debido: 50, cobrado: 30 }, 20)).toEqual({ ok: true, cobrado: 50, estado: 'pagado' });
    expect(aplicaCobro({ debido: 50, cobrado: 50 }, null).ok).toBe(false);
    expect(aplicaCobro({ debido: null, cobrado: 0 }, null).ok).toBe(false);
    expect(aplicaCobro({ debido: 0, cobrado: 0 }, null).ok).toBe(false);
    expect(aplicaCobro({ debido: 50, cobrado: 0 }, 0).ok).toBe(false);
  });
});

describe('abrir el mes', () => {
  it('crea la fila que falta y pone al día solo las que nadie ha tocado', () => {
    const r = cambiosParaAbrirMes(
      [
        { userId: 'nuevo', importe: 60 },
        { userId: 'igual', importe: 60 },
        { userId: 'cambia', importe: 100 },
        { userId: 'cobrado', importe: 100 },
        { userId: 'mano', importe: 100 },
        { userId: 'a-medias', importe: 100 },
        { userId: 'sin-precio', importe: null },
        { userId: 'era-cero', importe: 50 },
      ],
      [
        { user_id: 'igual', due_eur: '60.00', paid: false, amount_eur: null },
        { user_id: 'cambia', due_eur: 60, paid: false, amount_eur: null },
        { user_id: 'cobrado', due_eur: 60, paid: true, amount_eur: 60 },
        { user_id: 'mano', due_eur: 0, due_manual: true, paid: false, amount_eur: null },
        { user_id: 'a-medias', due_eur: 60, paid: false, amount_eur: 30 },
        { user_id: 'sin-precio', due_eur: 60, paid: false, amount_eur: null },
        { user_id: 'se-fue', due_eur: 60, paid: false, amount_eur: null },
        { user_id: 'era-cero', due_eur: 0, paid: true, amount_eur: null },
      ],
    );
    expect(r.nuevas).toEqual([{ userId: 'nuevo', due: 60 }]);
    expect(r.cambiar).toEqual([{ userId: 'cambia', due: 100 }, { userId: 'sin-precio', due: null }, { userId: 'era-cero', due: 50 }]);
  });
});

describe('el resumen del mes', () => {
  it('previsto, cobrado, pendiente y los recuentos; un «sin cuota» no suma como 0 € previsto', () => {
    const r = resumeCuotasMes('2026-11', [
      { userId: 'a', email: 'ana@x', activo: true, cuota: null, fila: { due_eur: 50, amount_eur: 50, paid: true } },
      { userId: 'b', email: 'bea@x', activo: true, cuota: null, fila: { due_eur: 100, amount_eur: 30, paid: false } },
      { userId: 'c', email: 'carlos@x', activo: true, cuota: null, fila: { due_eur: 60, amount_eur: null, paid: false } },
      { userId: 'd', email: 'dani@x', activo: true, cuota: null, fila: { due_eur: 0, due_manual: true, paid: false } },
      { userId: 'e', email: 'eva@x', activo: true, cuota: null, fila: { due_eur: null, paid: false } },
    ]);
    expect(r).toMatchObject({ previsto: 210, cobrado: 80, pendiente: 130, porcentaje: 38, alumnos: 5, pagados: 1, parciales: 1, deben: 1, noPagan: 1, sinCuota: 1 });
    // Primero a quién cobrar.
    expect(r.filas.map((f) => f.userId)).toEqual(['b', 'c', 'e', 'a', 'd']);
  });

  it('sin nada previsto, el porcentaje es null, no 0', () => {
    expect(resumeCuotasMes('2026-11', []).porcentaje).toBeNull();
  });
});

describe('el histórico y quién debe', () => {
  const h = resumeHistoricoCuotas(
    ['2026-09', '2026-10', '2026-11'],
    '2026-11',
    [
      { userId: 'a', email: 'ana@x', activo: true },
      { userId: 'b', email: 'bea@x', activo: true },
      { userId: 'c', email: 'carlos@x', activo: false },
      { userId: 'n', email: 'nuevo@x', activo: true },
    ],
    [
      { user_id: 'a', period: '2026-09', due_eur: 50, amount_eur: 50, paid: true },
      { user_id: 'a', period: '2026-10', due_eur: 50, amount_eur: 20, paid: false },
      { user_id: 'a', period: '2026-11', due_eur: 50, amount_eur: null, paid: false },
      { user_id: 'b', period: '2026-10', due_eur: 100, amount_eur: 100, paid: true },
      { user_id: 'b', period: '2026-11', due_eur: 100, amount_eur: 100, paid: true },
      { user_id: 'c', period: '2026-09', due_eur: 60, amount_eur: null, paid: false },
      { user_id: 'c', period: '2025-01', due_eur: 60, amount_eur: null, paid: false },
    ],
  );

  it('cada mes con lo previsto, lo cobrado y lo pendiente', () => {
    expect(h.meses).toEqual([
      { periodo: '2026-09', previsto: 110, cobrado: 50, pendiente: 60, porcentaje: 45, alumnos: 2, pagados: 1 },
      { periodo: '2026-10', previsto: 150, cobrado: 120, pendiente: 30, porcentaje: 80, alumnos: 2, pagados: 1 },
      { periodo: '2026-11', previsto: 150, cobrado: 100, pendiente: 50, porcentaje: 67, alumnos: 2, pagados: 1 },
    ]);
  });

  it('la deuda es de los meses cerrados; lo del mes en curso es pendiente', () => {
    const a = h.alumnos.find((x) => x.userId === 'a')!;
    expect(a).toMatchObject({ deudaAnterior: 30, mesesDebe: ['2026-10'], pendienteActual: 50, cobradoTotal: 70 });
    expect(h.deudores.map((d) => [d.userId, d.deudaAnterior])).toEqual([['c', 60], ['a', 30]]);
    expect(h.totales.deudaAnterior).toBe(90);
  });

  it('un mes en que no estaba no sale como deuda, y un activo sin filas sale en blanco', () => {
    expect(h.alumnos.find((x) => x.userId === 'b')!.celdas['2026-09']).toBeUndefined();
    expect(h.alumnos.find((x) => x.userId === 'n')!.celdas).toEqual({});
    // La fila de fuera del rango no cuenta.
    expect(h.alumnos.find((x) => x.userId === 'c')!.mesesDebe).toEqual(['2026-09']);
  });

  it('el CSV: una fila por alumno y mes, con ; y coma decimal', () => {
    const csv = csvHistorico(h);
    expect(csv.startsWith('﻿Alumno;Mes;Cuota;Cobrado;Pendiente;Estado')).toBe(true);
    expect(csv).toContain('ana@x;2026-10;50,00;20,00;30,00;A medias;;');
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(1 + 6);
  });
});

describe('los meses', () => {
  it('el mes en curso es el de la academia, no el del servidor', () => {
    // 30 nov 23:30 en UTC ya es 1 de diciembre en Madrid.
    expect(periodoEnZona(Date.UTC(2026, 10, 30, 23, 30))).toBe('2026-12');
    expect(periodoActual(new Date(Date.UTC(2026, 10, 30, 23, 30)))).toBe('2026-12');
    expect(periodoEnZona(Date.UTC(2026, 10, 30, 22, 30))).toBe('2026-11');
  });

  it('sumar meses cruza el año, y mesesHasta va en orden', () => {
    expect(sumaMeses('2026-11', 2)).toBe('2027-01');
    expect(sumaMeses('2026-01', -1)).toBe('2025-12');
    expect(mesesHasta('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(esPeriodo('2026-13')).toBe(false);
    expect(esPeriodo('2026-11')).toBe(true);
  });
});

describe('el libro de cobros: recibos, método y caja', () => {
  const c = (n: number, extra: Partial<Cobro> = {}): Cobro => ({
    id: `c${n}`, userId: 'a', alumno: 'ana@x', periodo: '2026-11', importe: 30, metodo: 'efectivo', recibo: n, fecha: '2026-11-03', anulado: false, ...extra,
  });

  it('lee una fila de PostgREST, y una rota no cuela', () => {
    expect(leeCobro({ id: 'x', user_id: 'a', alumno: 'ana@x', period: '2026-11', amount_eur: '30.00', method: 'bizum', receipt_no: 7, paid_on: '2026-11-03', voided_at: null }))
      .toMatchObject({ importe: 30, metodo: 'bizum', recibo: 7, anulado: false });
    expect(leeCobro({ id: 'x', period: '2026-11', amount_eur: null, receipt_no: 7, paid_on: '2026-11-03' })).toBeNull();
    expect(leeCobro({ id: 'x', period: '2026-11', amount_eur: 5, method: 'cheque', receipt_no: 7, paid_on: '2026-11-03' })!.metodo).toBe('efectivo');
  });

  it('un mes pagado en dos veces suma los dos cobros; uno anulado no cuenta', () => {
    const m = cobradoSegunLibro([c(1), c(2, { importe: 20, metodo: 'bizum', fecha: '2026-11-15' }), c(3, { importe: 99, anulado: true })]);
    expect(m.get('a 2026-11')).toBe(50);
  });

  it('el libro manda sobre el resumen guardado; sin cobros, la fila se queda como estaba', () => {
    expect(filaSegunLibro({ due_eur: 50, amount_eur: 50, paid: true }, 0)).toMatchObject({ amount_eur: null, paid: false });
    expect(filaSegunLibro({ due_eur: 50, amount_eur: null, paid: false }, 50)).toMatchObject({ amount_eur: 50, paid: true });
    const vieja = { due_eur: 50, amount_eur: 50, paid: true };
    expect(filaSegunLibro(vieja, undefined)).toBe(vieja);
  });

  it('la caja es por la FECHA del cobro: totales por método y por día, y el anulado sale sin sumar', () => {
    const caja = cajaDelMes('2026-11', [
      c(1),
      c(2, { importe: 20, metodo: 'bizum', fecha: '2026-11-15' }),
      c(3, { importe: 60, periodo: '2026-10', fecha: '2026-11-03' }),
      c(4, { importe: 99, anulado: true }),
      c(5, { fecha: '2026-10-31' }),
    ]);
    expect(caja).toMatchObject({ total: 110, cobros: 3, anulados: 1 });
    expect(caja.porMetodo).toEqual([{ metodo: 'efectivo', importe: 90, cobros: 2 }, { metodo: 'bizum', importe: 20, cobros: 1 }]);
    expect(caja.porDia).toEqual([{ fecha: '2026-11-03', importe: 90, cobros: 2 }, { fecha: '2026-11-15', importe: 20, cobros: 1 }]);
    expect(caja.lineas.map((x) => x.recibo)).toEqual([2, 4, 3, 1]);
  });

  it('el CSV del gestor: por número de recibo, el anulado marcado y el total', () => {
    const csv = csvCaja(cajaDelMes('2026-11', [c(2, { importe: 20, metodo: 'bizum' }), c(1), c(3, { anulado: true })]));
    const filas = csv.replace('\uFEFF', '').trim().split('\r\n');
    expect(filas[0]).toBe('Recibo;Fecha;Alumno;Concepto;Método;Importe;Estado');
    expect(filas[1]).toBe('1;03/11/2026;ana@x;Mensualidad de noviembre de 2026;Efectivo;30,00;Cobrado');
    expect(filas[3]).toContain(';Anulado');
    expect(filas[4]).toBe(';;;;Total;50,00;');
  });

  it('un texto que empieza por =, +, - o @ no puede ser una fórmula en Excel', () => {
    expect(celdaCsv('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(celdaCsv('+34 600')).toBe("'+34 600");
    expect(celdaCsv('@ana')).toBe("'@ana");
    expect(celdaCsv('ana@x.es')).toBe('ana@x.es');
    expect(celdaCsv('a;b')).toBe('"a;b"');
  });

  it('el recibo escapa lo que viene de la base de datos y dice si está anulado', () => {
    const html = htmlRecibo(c(12, { alumno: '<img src=x onerror=alert(1)>@x' }), 'Alphapol');
    expect(html).toContain('Recibo nº 12');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;@x');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('Mensualidad de noviembre de 2026');
    expect(htmlRecibo(c(1, { anulado: true }), 'Alphapol')).toContain('Anulado');
  });
});

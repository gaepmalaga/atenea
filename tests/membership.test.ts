import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  decideAccess,
  resumePagosPorAlumno,
  formateaEUR,
  ACCESS_STATUS,
  type PagoRow,
} from '../app/lib/membership';

/**
 * CONTROL DE ACCESO Y PAGOS EN EFECTIVO (P6).
 *
 * La academia cobra en persona. Esto no es una pasarela: es una puerta que el
 * administrador abre y cierra, y un registro de lo que cada alumno ha pagado.
 * La decisión de si alguien entra es `decideAccess`, y su orden de reglas es lo
 * que importa.
 */

describe('decideAccess · quién entra', () => {
  const base = { required: true, role: 'student' as const, row: null, readOk: true };

  it('un admin entra SIEMPRE, pase lo que pase con su fila', () => {
    expect(decideAccess({ ...base, role: 'admin', row: { access_status: 'suspended' } })).toBe('ok');
    expect(decideAccess({ ...base, role: 'admin', row: null, readOk: false })).toBe('ok');
  });

  it('con el interruptor global apagado, entra todo el mundo', () => {
    // Ejecutar el guion SQL no puede cerrar la plataforma como efecto colateral.
    expect(decideAccess({ ...base, required: false, row: null })).toBe('ok');
    expect(decideAccess({ ...base, required: false, row: { access_status: 'suspended' } })).toBe('ok');
  });

  it('si la LECTURA falló, se abre la puerta', () => {
    // La tabla aún no existe, o la BD no contesta. Dejar fuera a la academia
    // entera por un fallo de lectura es peor que colar a alguien sin activar.
    expect(decideAccess({ ...base, readOk: false, row: null })).toBe('ok');
    expect(decideAccess({ ...base, readOk: false, row: { access_status: 'suspended' } })).toBe('ok');
  });

  it('sin fila = pendiente', () => {
    expect(decideAccess({ ...base, row: null })).toBe('pending');
  });

  it('fila suspendida = fuera', () => {
    expect(decideAccess({ ...base, row: { access_status: ACCESS_STATUS.SUSPENDED } })).toBe('suspended');
  });

  it('fila activa = dentro', () => {
    expect(decideAccess({ ...base, row: { access_status: ACCESS_STATUS.ACTIVE } })).toBe('ok');
  });

  it('el orden es admin > interruptor > fallo de lectura > sin fila > suspendido', () => {
    // Un suspendido no entra... salvo que el interruptor esté apagado.
    expect(decideAccess({ required: false, role: 'student', row: { access_status: 'suspended' }, readOk: true })).toBe('ok');
    // ...o salvo que la lectura fallara.
    expect(decideAccess({ required: true, role: 'student', row: { access_status: 'suspended' }, readOk: false })).toBe('ok');
  });
});

describe('resumePagosPorAlumno', () => {
  const pago = (p: Partial<PagoRow>): PagoRow => ({
    user_id: 'a', amount_eur: 30, paid_on: '2026-09-01', ...p,
  });

  it('suma los importes y cuenta los pagos por alumno', () => {
    const r = resumePagosPorAlumno([
      pago({ user_id: 'a', amount_eur: 30 }),
      pago({ user_id: 'a', amount_eur: 30 }),
      pago({ user_id: 'b', amount_eur: 45 }),
    ]);
    expect(r.get('a')).toMatchObject({ total: 60, cuenta: 2 });
    expect(r.get('b')).toMatchObject({ total: 45, cuenta: 1 });
  });

  it('un pago sin importe cuenta como pago pero suma 0', () => {
    const r = resumePagosPorAlumno([
      pago({ amount_eur: null }),
      pago({ amount_eur: 30 }),
    ]);
    expect(r.get('a')).toMatchObject({ total: 30, cuenta: 2 });
  });

  it('lee el importe cuando viene como cadena (numeric de PostgREST)', () => {
    const r = resumePagosPorAlumno([pago({ amount_eur: '29,90'.replace(',', '.') })]);
    expect(r.get('a')!.total).toBeCloseTo(29.9, 2);
  });

  it('`ultimo` es la fecha del pago más reciente', () => {
    const r = resumePagosPorAlumno([
      pago({ paid_on: '2026-09-01' }),
      pago({ paid_on: '2026-10-15' }),
      pago({ paid_on: '2026-08-20' }),
    ]);
    expect(r.get('a')!.ultimo).toBe('2026-10-15');
  });

  it('sin ningún pago con fecha, `ultimo` es null, no una fecha inventada', () => {
    const r = resumePagosPorAlumno([pago({ paid_on: null })]);
    expect(r.get('a')!.ultimo).toBeNull();
  });

  it('ignora los pagos sin alumno', () => {
    const r = resumePagosPorAlumno([pago({ user_id: null }), pago({ user_id: '' })]);
    expect(r.size).toBe(0);
  });
});

describe('formateaEUR', () => {
  it('un importe vacío se enseña como «—», no como 0 € (regla 8)', () => {
    expect(formateaEUR(null)).toBe('—');
  });
  it('con coma decimal', () => {
    expect(formateaEUR(29.9)).toBe('29,90 €');
    expect(formateaEUR(30)).toBe('30,00 €');
  });
  it('cero es cero', () => {
    expect(formateaEUR(0)).toBe('0,00 €');
  });
});

describe('las guardas de la acción', () => {
  const src = readFileSync(join(__dirname, '..', 'app', 'actions', 'membership.ts'), 'utf-8');
  const auth = readFileSync(join(__dirname, '..', 'app', 'lib', 'auth.ts'), 'utf-8');

  it('cada acción exportada exige requireAdmin', () => {
    const exportadas = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
    expect(exportadas.length).toBeGreaterThan(5);
    for (const nombre of exportadas) {
      const i = src.indexOf(`export async function ${nombre}`);
      const cuerpo = src.slice(i, i + 400);
      expect(cuerpo, `${nombre} sin requireAdmin`).toMatch(/requireAdmin\(\)/);
    }
  });

  it('todo va con la clave de servicio, nunca con la sesión (regla 34)', () => {
    expect(src).toContain('supabaseAdmin');
    expect(src).not.toMatch(/createSupabaseServerClient|\bdb\.from\(/);
  });

  it('el importe vacío se guarda como null, nunca como 0 (regla 16)', () => {
    const fn = src.slice(src.indexOf('export async function recordPayment'));
    expect(fn).toMatch(/=== ''|=== null|=== undefined/);
    expect(fn).toMatch(/null/);
  });

  it('la puerta la decide auth.ts con decideAccess, no la acción', () => {
    expect(auth).toMatch(/decideAccess\(/);
    expect(auth).toMatch(/requireUser[\s\S]{0,400}access !== 'ok'/);
  });

  it('cambiar el interruptor tira la caché para verlo al momento', () => {
    const fn = src.slice(src.indexOf('export async function setMembershipRequired'));
    expect(fn.slice(0, 500)).toMatch(/olvidaMembershipRequired\(\)/);
  });

  it('está en el barril de acciones', () => {
    const index = readFileSync(join(__dirname, '..', 'app', 'actions', 'index.ts'), 'utf-8');
    expect(index).toMatch(/membership/);
  });
});

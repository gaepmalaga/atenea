import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decideAccess, ACCESS_STATUS } from '../app/lib/membership';

/**
 * LA PUERTA DE ACCESO (P6 · afinado en P8).
 *
 * El registro de pagos se movió a `lib/payments.ts` (rejilla mensual, ver
 * `payments.test.ts`). Aquí queda solo `decideAccess`, y su orden de reglas es
 * lo que importa.
 */

describe('decideAccess · quién entra', () => {
  const base = { required: true, role: 'student' as const, row: null, readOk: true };

  it('un admin entra SIEMPRE', () => {
    expect(decideAccess({ ...base, role: 'admin', row: { access_status: 'suspended' } })).toBe('ok');
    expect(decideAccess({ ...base, role: 'admin', readOk: false })).toBe('ok');
  });

  it('con el interruptor global apagado, entra todo el mundo', () => {
    expect(decideAccess({ ...base, required: false, row: { access_status: 'suspended' } })).toBe('ok');
  });

  it('si la LECTURA falló, se abre la puerta', () => {
    expect(decideAccess({ ...base, readOk: false, row: { access_status: 'suspended' } })).toBe('ok');
  });

  it('sin fila = pendiente', () => {
    expect(decideAccess({ ...base, row: null })).toBe('pending');
  });

  it('fila suspendida = fuera; fila activa = dentro', () => {
    expect(decideAccess({ ...base, row: { access_status: ACCESS_STATUS.SUSPENDED } })).toBe('suspended');
    expect(decideAccess({ ...base, row: { access_status: ACCESS_STATUS.ACTIVE } })).toBe('ok');
  });

  it('el orden: admin > interruptor > fallo de lectura > sin fila > suspendido', () => {
    expect(decideAccess({ required: false, role: 'student', row: { access_status: 'suspended' }, readOk: true })).toBe('ok');
    expect(decideAccess({ required: true, role: 'student', row: { access_status: 'suspended' }, readOk: false })).toBe('ok');
  });
});

describe('las guardas de las acciones de acceso', () => {
  const src = readFileSync(join(__dirname, '..', 'app', 'actions', 'membership.ts'), 'utf-8');
  const auth = readFileSync(join(__dirname, '..', 'app', 'lib', 'auth.ts'), 'utf-8');

  it('cada acción exportada exige requireAdmin + clave de servicio', () => {
    const exportadas = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
    expect(exportadas.length).toBeGreaterThan(2);
    for (const n of exportadas) {
      expect(src.slice(src.indexOf(`export async function ${n}`), src.indexOf(`export async function ${n}`) + 300)).toMatch(/requireAdmin\(\)/);
    }
    expect(src).toContain('supabaseAdmin');
    expect(src).not.toMatch(/createSupabaseServerClient|\bdb\.from\(/);
  });

  it('la puerta la decide auth.ts con decideAccess, y requireUser corta a un suspendido', () => {
    expect(auth).toMatch(/decideAccess\(/);
    expect(auth).toMatch(/requireUser[\s\S]{0,400}access !== 'ok'/);
  });

  it('cambiar el interruptor tira la caché', () => {
    const fn = src.slice(src.indexOf('export async function setMembershipRequired'));
    expect(fn.slice(0, 500)).toMatch(/olvidaMembershipRequired\(\)/);
  });
});

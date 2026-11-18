import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { masReciente, combinaAccesos } from '../app/lib/accesos';

/** Regla 133 · El último acceso es cuándo USÓ la app, no cuándo escribió la clave. */

const quita = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const lee = (ruta: string) => quita(readFileSync(join(__dirname, '..', ruta), 'utf-8').replace(/\r\n/g, '\n'));

describe('el último acceso', () => {
  it('se queda con la fecha más reciente de las dos', () => {
    expect(masReciente('2026-11-14T19:14:00Z', '2026-11-18T17:09:00Z')).toBe('2026-11-18T17:09:00Z');
    expect(masReciente('2026-11-18T17:09:00Z', '2026-11-14T19:14:00Z')).toBe('2026-11-18T17:09:00Z');
  });
  it('si falta una, vale la otra; si faltan las dos, null', () => {
    expect(masReciente(null, '2026-11-14T19:14:00Z')).toBe('2026-11-14T19:14:00Z');
    expect(masReciente('2026-11-14T19:14:00Z', undefined)).toBe('2026-11-14T19:14:00Z');
    expect(masReciente(null, null)).toBeNull();
  });
  it('el caso del dueño: inició sesión hace 4 días pero su sesión se renovó hoy', () => {
    const m = combinaAccesos(
      [{ id: 'dueño', last_sign_in_at: '2026-11-14T19:14:00Z' }, { id: 'otro', last_sign_in_at: '2026-11-10T08:00:00Z' }],
      [{ user_id: 'dueño', ultimo_acceso: '2026-11-18T17:09:00Z' }],
    );
    expect(m.get('dueño')).toBe('2026-11-18T17:09:00Z');
    expect(m.get('otro')).toBe('2026-11-10T08:00:00Z');
  });
  it('sin la función en la base de datos (sin filas) sigue valiendo el último inicio de sesión', () => {
    const m = combinaAccesos([{ id: 'a', last_sign_in_at: '2026-11-14T19:14:00Z' }], null);
    expect(m.get('a')).toBe('2026-11-14T19:14:00Z');
  });
});

describe('dónde se usa', () => {
  it('Logs y el panel Alumnos cruzan los dos orígenes', () => {
    for (const f of ['app/actions/audit.ts', 'app/actions/academy.ts']) {
      const s = lee(f);
      expect(s).toContain("rpc('ultimo_acceso_usuarios')");
      expect(s).toContain('combinaAccesos(');
    }
  });
  it('el guion SQL solo lo puede llamar la clave de servicio', () => {
    const sql = readFileSync(join(__dirname, '..', 'docs/sql/ultimo-acceso.sql'), 'utf-8');
    expect(sql).toContain('security definer');
    expect(sql).toMatch(/revoke all on function public\.ultimo_acceso_usuarios\(\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.ultimo_acceso_usuarios\(\) to service_role/);
  });
});

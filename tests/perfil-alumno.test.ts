import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { limpiaNombre, limpiaTelefono, telefonoLegible, leeFoto, nombreVisible, FOTO_MAX_BYTES } from '../app/lib/perfil-alumno';

/** Regla 114 · el perfil del alumno: nombre, teléfono y foto. */

const RAIZ = join(__dirname, '..');
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const lee = (ruta: string) => stripComments(readFileSync(join(RAIZ, ruta), 'utf-8'));

const jpeg = (bytes: number) => {
  const b = new Uint8Array(bytes);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  return 'data:image/jpeg;base64,' + Buffer.from(b).toString('base64');
};

describe('el nombre', () => {
  it('vacío es null, no cadena vacía (regla 16)', () => {
    expect(limpiaNombre('')).toEqual({ ok: true, valor: null });
    expect(limpiaNombre('   ')).toEqual({ ok: true, valor: null });
    expect(limpiaNombre(undefined)).toEqual({ ok: true, valor: null });
  });

  it('se limpia de espacios de más y de caracteres de control (regla 71)', () => {
    expect(limpiaNombre('  Ana   Ruiz\u0000 López ')).toEqual({ ok: true, valor: 'Ana Ruiz López' });
  });

  it('rechaza lo que no es un nombre', () => {
    expect(limpiaNombre('A').ok).toBe(false);
    expect(limpiaNombre('12345').ok).toBe(false);
    expect(limpiaNombre('<script>alert(1)</script>').ok).toBe(false);
    expect(limpiaNombre('x'.repeat(81)).ok).toBe(false);
  });

  it('admite tildes, eñes y apellidos compuestos', () => {
    expect(limpiaNombre('María José Núñez-Ibáñez')).toEqual({ ok: true, valor: 'María José Núñez-Ibáñez' });
  });
});

describe('el teléfono', () => {
  it('se guarda sin espacios, con su prefijo si lo traía', () => {
    expect(limpiaTelefono('600 12 34 56')).toEqual({ ok: true, valor: '600123456' });
    expect(limpiaTelefono('+34 600-123-456')).toEqual({ ok: true, valor: '+34600123456' });
    expect(limpiaTelefono('')).toEqual({ ok: true, valor: null });
  });

  it('rechaza letras y números imposibles', () => {
    expect(limpiaTelefono('llámame').ok).toBe(false);
    expect(limpiaTelefono('12345').ok).toBe(false);
    expect(limpiaTelefono('1'.repeat(16)).ok).toBe(false);
  });

  it('se enseña de tres en tres', () => {
    expect(telefonoLegible('600123456')).toBe('600 123 456');
    expect(telefonoLegible('+34600123456')).toBe('+34600123456');
    expect(telefonoLegible(null)).toBe('');
  });
});

describe('la foto', () => {
  it('admite un JPEG pequeño', () => {
    expect(leeFoto(jpeg(5000)).ok).toBe(true);
  });

  it('mira los bytes, no la cabecera: un PNG disfrazado no pasa', () => {
    const png = 'data:image/jpeg;base64,' + Buffer.from(new Uint8Array(500).fill(0x89)).toString('base64');
    expect(leeFoto(png).ok).toBe(false);
  });

  it('rechaza otros formatos, lo que pesa de más y lo que no es una imagen', () => {
    expect(leeFoto('data:image/svg+xml;base64,AAAA').ok).toBe(false);
    expect(leeFoto(jpeg(FOTO_MAX_BYTES + 1)).ok).toBe(false);
    expect(leeFoto('https://ejemplo.com/foto.jpg').ok).toBe(false);
    expect(leeFoto(null).ok).toBe(false);
  });
});

describe('el nombre que se enseña', () => {
  it('el que puso el alumno, y si no el deducido del correo', () => {
    expect(nombreVisible('Ana Ruiz López', 'aruiz99@gmail.com')).toBe('Ana Ruiz López');
    expect(nombreVisible(null, 'ana.ruiz@gmail.com')).toBe('Ana Ruiz');
    expect(nombreVisible('  ', 'ana.ruiz@gmail.com')).toBe('Ana Ruiz');
  });
});

describe('las acciones', () => {
  const datos = lee('app/actions/datos.ts');

  it('el alumno escribe SU fila: el id sale de la sesión (regla 1)', () => {
    for (const accion of ['saveMisDatos', 'saveMiFoto', 'quitaMiFoto']) {
      const desde = datos.indexOf(`export async function ${accion}`);
      const cuerpo = datos.slice(desde, datos.indexOf('\nexport async function', desde + 10));
      expect(cuerpo, accion).toContain('requireUser()');
      expect(cuerpo, accion).toContain(".eq('id', auth.user.id)");
    }
  });

  it('la academia solo toca a un alumno suyo (regla 65)', () => {
    const desde = datos.indexOf('export async function setDatosAlumno');
    const cuerpo = datos.slice(desde);
    expect(cuerpo).toContain('requireAdmin()');
    expect(cuerpo).toContain(".eq('academy_id', organizationId).eq('user_id', d.alumnoId)");
    expect(cuerpo.indexOf("from('academy_members')")).toBeLessThan(cuerpo.indexOf('.update('));
  });

  it('solo se escriben las columnas de la lista blanca (regla 2)', () => {
    expect(datos).not.toMatch(/\.update\(\{\s*\.\.\./);
    expect(datos).not.toContain('role:');
  });

  it('la política de contenido deja pintar las fotos de Supabase', () => {
    expect(lee('next.config.ts')).toMatch(/img-src 'self' data: blob:\$\{supabase \? ` \$\{supabase\.https\}` : ''\}/);
  });
});

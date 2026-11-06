import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { leeCorreos, claveProvisional, csvDeAltas, MAX_POR_CORREO } from '../app/lib/alta-masiva';

/**
 * ALTA DE VARIOS ALUMNOS (regla 83): leer la lista pegada, las contraseñas
 * provisionales y el CSV para repartirlas.
 */

describe('leeCorreos', () => {
  it('un correo por línea, en minúsculas y sin repetir', () => {
    const r = leeCorreos('Ana@Gmail.com\nluis@hotmail.com\n\nana@gmail.com\n');
    expect(r.correos).toEqual(['ana@gmail.com', 'luis@hotmail.com']);
    expect(r.repetidos).toBe(1);
  });

  it('filas copiadas de Excel y listas con comas o punto y coma', () => {
    const r = leeCorreos('Ana Ruiz;ana@x.com;Promo 43\nluis@x.com, eva@x.com; pepe@x.com\n"Marta" <marta@x.es>');
    expect(r.correos).toEqual(['ana@x.com', 'luis@x.com', 'eva@x.com', 'pepe@x.com', 'marta@x.es']);
  });

  it('una línea sin correo no desaparece: sale con su número (regla 27)', () => {
    const r = leeCorreos('ana@x.com\nJuan Pérez sin correo\nluis@x\n');
    expect(r.correos).toEqual(['ana@x.com']);
    expect(r.sinCorreo).toEqual([{ linea: 2, texto: 'Juan Pérez sin correo' }, { linea: 3, texto: 'luis@x' }]);
  });

  it('el punto final de una frase no se queda pegado al correo', () => {
    expect(leeCorreos('escribid a ana@x.com.').correos).toEqual(['ana@x.com']);
  });
});

describe('claveProvisional', () => {
  it('tiene la forma Alpha-xxxx-xxxx y sale de los bytes que se le dan', () => {
    const c = claveProvisional(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(c).toMatch(/^Alpha-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    expect(claveProvisional(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]))).toBe(c);
  });

  it('sin caracteres que se confundan al leerlos de un papel', () => {
    // Solo la parte al azar: «Alpha» es una palabra fija, no se lee letra a letra.
    const azar = Array.from({ length: 256 }, (_, i) => claveProvisional(new Uint8Array(8).fill(i)).slice('Alpha-'.length).replace('-', '')).join('');
    expect(azar).not.toMatch(/[0O1lI]/);
  });

  it('pide bytes suficientes', () => {
    expect(() => claveProvisional(new Uint8Array(4))).toThrow();
  });
});

describe('csvDeAltas', () => {
  it('punto y coma, BOM para Excel, y el estado de cada uno', () => {
    const csv = csvDeAltas([
      { correo: 'ana@x.com', estado: 'creada', clave: 'Alpha-abcd-efgh' },
      { correo: 'luis@x.com', estado: 'ya_tenia_cuenta' },
      { correo: 'mal@x.com', estado: 'error', error: 'límite; reintenta' },
    ], 'https://campus.alphapol.es');
    expect(csv.startsWith('﻿')).toBe(true);
    const filas = csv.slice(1).split('\r\n');
    expect(filas[0]).toBe('correo;contraseña provisional;estado;dónde entrar');
    expect(filas[1]).toBe('ana@x.com;Alpha-abcd-efgh;Cuenta creada;https://campus.alphapol.es');
    expect(filas[2]).toContain('luis@x.com;;Ya tenía cuenta');
    // Un `;` dentro de un campo va entre comillas, o partiría la columna.
    expect(filas[3]).toContain('"No se pudo: límite; reintenta"');
  });
});

describe('guardas de la acción', () => {
  const src = readFileSync(join(__dirname, '..', 'app', 'actions', 'membership.ts'), 'utf-8');
  const i = src.indexOf('export async function altaMasivaAlumnos');
  const cuerpo = src.slice(i);

  it('exige admin, academia, y vuelve a leer la lista en el servidor', () => {
    expect(cuerpo).toContain('requireAdmin()');
    expect(cuerpo).toContain('leeCorreos(params?.texto');
  });

  it('el modo correo respeta el tope por el límite de 30 correos por hora', () => {
    expect(cuerpo).toMatch(/modo === 'correo' \? MAX_POR_CORREO : MAX_POR_CLAVE/);
    expect(MAX_POR_CORREO).toBeLessThan(30);
  });

  it('solo grupos de su academia, y el rol solo se pone a cuentas RECIÉN creadas', () => {
    expect(cuerpo).toMatch(/from\('class_groups'\)\.select\('id'\)\.eq\('organization_id', organizationId\)/);
    const creacion = cuerpo.indexOf("estado = 'creada'");
    const rol = cuerpo.indexOf("role: 'student'");
    expect(rol).toBeGreaterThan(creacion);
    expect(rol).toBeLessThan(cuerpo.indexOf("} else {", creacion));
  });

  it('las cuentas nuevas en modo clave nacen confirmadas (sin correo)', () => {
    expect(cuerpo).toContain('email_confirm: true');
  });
});

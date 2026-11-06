import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  planLimpieza, trozos,
  TABLAS_POR_USUARIO, TABLAS_POR_GRUPO, TABLAS_POR_PREGUNTA, TABLAS_POR_ACADEMIA, TABLAS_DE_PRUEBA_DE_LA_ACADEMIA,
} from '../app/lib/limpieza';

/**
 * LA LIMPIEZA PARA DEJAR LA BASE DE DATOS SOLO DE ALPHAPOL (regla 81).
 *
 * Lo que más importa vigilar: que nunca te deje sin una cuenta con la que
 * entrar, y que ninguna tabla con filas de un usuario o de una academia se
 * quede fuera de la lista (se quedarían filas colgando de cuentas borradas).
 */

const raiz = join(__dirname, '..');
const esquema = JSON.parse(readFileSync(join(raiz, 'supabase/schema.json'), 'utf-8')).tablas as Record<string, { columnas: string[] }>;
const conColumna = (col: string) => Object.entries(esquema).filter(([, t]) => t.columnas.includes(col)).map(([n]) => n);

const academias = [
  { id: 'a1', slug: 'alphapol', name: 'Alphapol' },
  { id: 'a2', slug: 'atenea', name: 'Atenea (casa)' },
  { id: 'a3', slug: 'demo', name: 'Demo' },
];
const cuentas = [
  { id: 'u1', email: 'dueno@x.com', role: 'superadmin' },
  { id: 'u2', email: 'morato@atenea.com', role: 'admin' },
  { id: 'u3', email: 'alumno@atenea.com', role: 'student' },
  { id: 'u4', email: 'Profe@Alphapol.es', role: 'admin' },
];

describe('planLimpieza', () => {
  it('conserva a los superadmin y borra el resto de cuentas', () => {
    const p = planLimpieza({ cuentas, academias, academiaSlug: 'alphapol' });
    expect(p.error).toBeNull();
    expect(p.conservar.map((c) => c.id)).toEqual(['u1']);
    expect(p.borrarCuentas.map((c) => c.id)).toEqual(['u2', 'u3', 'u4']);
  });

  it('conserva a mano las que se pidan, sin distinguir mayúsculas', () => {
    const p = planLimpieza({ cuentas, academias, academiaSlug: 'alphapol', conservarEmails: ['profe@alphapol.es '] });
    expect(p.conservar.map((c) => c.id)).toEqual(['u1', 'u4']);
  });

  it('borra todas las academias menos la de la marca', () => {
    const p = planLimpieza({ cuentas, academias, academiaSlug: 'alphapol' });
    expect(p.academia?.slug).toBe('alphapol');
    expect(p.borrarAcademias.map((a) => a.slug)).toEqual(['atenea', 'demo']);
  });

  it('se niega si la academia no existe', () => {
    const p = planLimpieza({ cuentas, academias, academiaSlug: 'no-existe' });
    expect(p.error).toMatch(/No existe la academia/);
  });

  it('se niega si no quedaría ninguna cuenta con la que entrar', () => {
    const sinSuper = cuentas.filter((c) => c.role !== 'superadmin');
    const p = planLimpieza({ cuentas: sinSuper, academias, academiaSlug: 'alphapol' });
    expect(p.error).toMatch(/sin acceso/);
  });

  it('trozos parte sin perder nada', () => {
    expect(trozos([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(trozos([], 2)).toEqual([]);
  });
});

describe('las listas de tablas cubren el esquema real', () => {
  it('toda tabla con user_id está en TABLAS_POR_USUARIO', () => {
    expect([...TABLAS_POR_USUARIO].sort()).toEqual(conColumna('user_id').sort());
  });

  it('toda tabla con class_id o question_id está en su lista', () => {
    expect([...TABLAS_POR_GRUPO].sort()).toEqual(conColumna('class_id').sort());
    expect([...TABLAS_POR_PREGUNTA].sort()).toEqual(conColumna('question_id').sort());
  });

  it('toda tabla con organization_id está cubierta (class_groups y question_bank van aparte)', () => {
    const cubiertas = new Set<string>([...TABLAS_POR_ACADEMIA, 'class_groups', 'question_bank']);
    expect(conColumna('organization_id').filter((t) => !cubiertas.has(t))).toEqual([]);
    for (const t of TABLAS_POR_ACADEMIA) expect(esquema[t]?.columnas, t).toContain('organization_id');
    for (const t of TABLAS_DE_PRUEBA_DE_LA_ACADEMIA) expect(TABLAS_POR_ACADEMIA).toContain(t);
  });

  it('NO borra el temario ni el banco común', () => {
    const todas = new Set<string>([...TABLAS_POR_USUARIO, ...TABLAS_POR_ACADEMIA, ...TABLAS_POR_GRUPO, ...TABLAS_POR_PREGUNTA]);
    for (const t of ['subjects', 'blocks', 'documents', 'document_chunks', 'flashcard_bank']) expect(todas.has(t), t).toBe(false);
  });
});

describe('el guion', () => {
  const src = readFileSync(join(raiz, 'scripts/operacion/limpiar-para-alphapol.mjs'), 'utf-8');

  it('es un ensayo salvo con --hazlo, y pide la palabra', () => {
    expect(src).toContain("args.includes('--hazlo')");
    expect(src).toContain("escrito.trim() !== 'ALPHAPOL'");
  });

  it('decide con la lógica de app/lib (no una copia) y se para si el plan lo dice', () => {
    expect(src).toContain("from '../../app/lib/limpieza.ts'");
    expect(src).toMatch(/if \(plan\.error\)[\s\S]{0,80}process\.exit\(1\)/);
  });

  it('el banco común solo se toca por academia, nunca entero', () => {
    expect(src).not.toMatch(/from\('question_bank'\)\.delete\(\)\.not\(/);
    expect(src).toMatch(/tabla: 'question_bank', aplica: \(q\) => q\.eq\('organization_id'/);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  planLimpieza, trozos, listaDeIds, pasosLimpiezaSql, sqlDeConteo, sqlDeBorrado,
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

describe('el borrado en SQL', () => {
  const U = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
  const ac = [
    { id: U(1), slug: 'alphapol', name: 'Alphapol' },
    { id: U(2), slug: 'atenea', name: 'Atenea' },
  ];
  const cu = [
    { id: U(5), email: 'dueno@x.com', role: 'superadmin' },
    { id: U(6), email: 'prueba@x.com', role: 'student' },
  ];
  const plan = planLimpieza({ cuentas: cu, academias: ac, academiaSlug: 'alphapol' });
  const pasos = pasosLimpiezaSql(plan);
  const sql = sqlDeBorrado(pasos);

  it('solo interpola UUID: cualquier otra cosa no llega al SQL', () => {
    expect(listaDeIds([U(1), U(2)])).toBe(`'${U(1)}', '${U(2)}'`);
    expect(() => listaDeIds(["x'); drop table academies; --"])).toThrow(/no válido/);
  });

  it('la cuenta que se conserva no aparece en ningún paso, la de prueba sí (también en auth.users)', () => {
    expect(sql).not.toContain(U(5));
    expect(sql).toContain(`delete from auth.users where id in ('${U(6)}');`);
  });

  it('la academia que se queda solo pierde lo de prueba; la otra se borra entera', () => {
    const deAlphapol = pasos.filter((p) => p.donde.includes(U(1))).map((p) => p.tabla);
    expect(deAlphapol.sort()).toEqual(['public.admin_audit_log', 'public.membership_exemptions']);
    expect(sql).toContain(`delete from public.academies where id = '${U(2)}';`);
  });

  it('el banco solo se borra por academia, nunca entero', () => {
    for (const p of pasos.filter((x) => x.tabla === 'public.question_bank')) expect(p.donde).toMatch(/^organization_id = '/);
  });

  it('va en una transacción, y lo hijo antes que lo padre', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql.trim().endsWith('commit;')).toBe(true);
    const pos = (frag: string) => sql.indexOf(frag);
    expect(pos('delete from public.workout_logs')).toBeLessThan(pos('delete from public.training_plans'));
    expect(pos('delete from public.chat_messages')).toBeLessThan(pos('delete from public.chat_conversations'));
    expect(pos('delete from public.question_reports')).toBeLessThan(pos('delete from public.question_bank'));
    expect(pos('delete from public.profiles ')).toBeLessThan(pos('delete from auth.users'));
    // `admin_audit_log.actor_id` es NOT NULL con «set null»: si quedara una
    // acción de una cuenta borrada, el borrado de la cuenta revienta.
    expect(sql).toContain(`delete from public.admin_audit_log where actor_id in ('${U(6)}');`);
    expect(pos('where actor_id in')).toBeLessThan(pos('delete from auth.users'));
  });

  it('el conteo usa los mismos WHERE que el borrado', () => {
    const conteo = sqlDeConteo(pasos);
    for (const p of pasos) expect(conteo).toContain(`from ${p.tabla} where ${p.donde}`);
  });

  it('un plan con error no produce ningún paso', () => {
    expect(pasosLimpiezaSql(planLimpieza({ cuentas: cu, academias: ac, academiaSlug: 'no-existe' }))).toEqual([]);
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

  it('guarda una copia de lo que va a borrar ANTES de borrarlo', () => {
    expect(src.indexOf('writeFileSync(rutaCopia')).toBeLessThan(src.indexOf('await sql(sqlDeBorrado(pasos))'));
  });
});

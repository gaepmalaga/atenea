import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizaTemas, normalizaNotaTeoria, textoTemas, leeTemas, fechasDeGrupoEntre, clasesDeTeoria, sinRellenar,
  choquesDeTeoria, temasDeAsignaciones, avanceDeGrupo, horasDeTeoria, type GrupoTeoria, type AsignacionTeoria,
} from '../app/lib/teoria';

/** Regla 131 · El cuadrante de teoría: un profesor y los temas de cada clase, programable y editable. */

const quita = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const lee = (ruta: string) => quita(readFileSync(join(__dirname, '..', ruta), 'utf-8').replace(/\r\n/g, '\n'));

// 2026-11-16 es lunes
const LUN = '2026-11-16';
const manana: GrupoTeoria = { id: 'a', nombre: 'M-J MAÑANAS', weekdays: [2, 4], inicio: '10:00', fin: '14:00' };
const tarde: GrupoTeoria = { id: 'b', nombre: 'M-J TARDE', weekdays: [2, 4], inicio: '16:00', fin: '20:00' };

describe('temas', () => {
  it('normaliza: enteros 1..200, sin repetir y en orden', () => {
    expect(normalizaTemas([9, 8, 8, '10', 0, -1, 201, 1.5, 'x', null])).toEqual([8, 9, 10]);
    expect(normalizaTemas('8')).toEqual([]);
    expect(normalizaTemas(Array.from({ length: 30 }, (_, i) => i + 1))).toHaveLength(8);
  });
  it('lee lo que se teclea, con rangos', () => {
    expect(leeTemas('8')).toEqual([8]);
    expect(leeTemas('8, 9')).toEqual([8, 9]);
    expect(leeTemas('1-3 y 5')).toEqual([1, 2, 3, 5]);
    expect(leeTemas('tema ocho')).toEqual([]);
  });
  it('lo escribe en castellano y limpia la nota', () => {
    expect(textoTemas([8])).toBe('8');
    expect(textoTemas([8, 9])).toBe('8 y 9');
    expect(textoTemas([1, 2, 3])).toBe('1, 2 y 3');
    expect(normalizaNotaTeoria('  hola \0  mundo ')).toBe('hola mundo');
    expect(normalizaNotaTeoria('   ')).toBeNull();
  });
});

describe('las clases de la semana', () => {
  it('salen vacías, una por grupo y día de horario, ordenadas', () => {
    const c = clasesDeTeoria({ grupos: [tarde, manana], asignaciones: [], desde: LUN, hasta: '2026-11-22' });
    expect(c.map((x) => `${x.fecha} ${x.grupo}`)).toEqual([
      '2026-11-17 M-J MAÑANAS', '2026-11-17 M-J TARDE', '2026-11-19 M-J MAÑANAS', '2026-11-19 M-J TARDE',
    ]);
    expect(c.every((x) => x.vacia)).toBe(true);
    expect(sinRellenar(c)).toBe(4);
  });
  it('lo apuntado se pone sobre su clase y no la deja vacía', () => {
    const asig: AsignacionTeoria[] = [{ classId: 'a', fecha: '2026-11-17', profesorId: 'lucio', temas: [8], nota: null }];
    const c = clasesDeTeoria({ grupos: [manana], asignaciones: asig, desde: LUN, hasta: '2026-11-22' });
    expect(c[0]).toMatchObject({ profesorId: 'lucio', temas: [8], vacia: false });
    expect(c[1].vacia).toBe(true);
  });
  it('un día sin clase no sale', () => {
    const c = clasesDeTeoria({ grupos: [manana], asignaciones: [], sinClase: [{ classId: 'a', fecha: '2026-11-19' }], desde: LUN, hasta: '2026-11-22' });
    expect(c.map((x) => x.fecha)).toEqual(['2026-11-17']);
  });
  it('fechas por días de la semana (lunes = 1)', () => {
    expect(fechasDeGrupoEntre([1, 7], LUN, '2026-11-22')).toEqual([LUN, '2026-11-22']);
  });
  it('un profesor no puede dar dos clases a la vez, pero sí una por la mañana y otra por la tarde', () => {
    const solapa: GrupoTeoria = { ...tarde, id: 'c', nombre: 'SOLAPE', inicio: '12:00', fin: '15:00' };
    const asig = (id: string, f: string): AsignacionTeoria => ({ classId: id, fecha: f, profesorId: 'lucio', temas: [1], nota: null });
    const nombres = new Map([['lucio', 'Lucio']]);
    const ok = clasesDeTeoria({ grupos: [manana, tarde], asignaciones: [asig('a', '2026-11-17'), asig('b', '2026-11-17')], desde: LUN, hasta: '2026-11-22' });
    expect(choquesDeTeoria(ok, nombres).size).toBe(0);
    const mal = clasesDeTeoria({ grupos: [manana, solapa], asignaciones: [asig('a', '2026-11-17'), asig('c', '2026-11-17')], desde: LUN, hasta: '2026-11-22' });
    expect(choquesDeTeoria(mal, nombres).size).toBe(2);
  });
});

describe('el avance del temario', () => {
  const asig: AsignacionTeoria[] = [
    { classId: 'a', fecha: '2026-11-10', profesorId: 'x', temas: [1, 2], nota: null },
    { classId: 'a', fecha: '2026-11-24', profesorId: 'y', temas: [3], nota: null },
    { classId: 'b', fecha: '2026-11-10', profesorId: 'x', temas: [1], nota: null },
  ];
  it('separa dado, programado y pendiente por grupo', () => {
    const av = avanceDeGrupo(temasDeAsignaciones(asig), 'a', [1, 2, 3, 4, 5], '2026-11-18');
    expect(av.dado.map((d) => d.tema)).toEqual([1, 2]);
    expect(av.programado.map((d) => d.tema)).toEqual([3]);
    expect(av.pendientes).toEqual([4, 5]);
  });
  it('un tema repetido cuenta con su última fecha', () => {
    const t = temasDeAsignaciones([
      { classId: 'a', fecha: '2026-11-03', profesorId: 'x', temas: [1], nota: null },
      { classId: 'a', fecha: '2026-11-10', profesorId: 'y', temas: [1], nota: null },
    ]);
    expect(t).toEqual([{ classId: 'a', tema: 1, fecha: '2026-11-10', profesorId: 'y' }]);
  });
  it('las horas salen de lo que da de verdad', () => {
    const c = clasesDeTeoria({
      grupos: [manana, tarde], desde: LUN, hasta: '2026-11-22',
      asignaciones: [{ classId: 'a', fecha: '2026-11-17', profesorId: 'lucio', temas: [8], nota: null }, { classId: 'b', fecha: '2026-11-17', profesorId: 'lucio', temas: [9], nota: null }],
    });
    expect(horasDeTeoria(c, 'lucio')).toBe(8);
    expect(horasDeTeoria(c, 'otro')).toBe(0);
  });
});

describe('seguridad de las acciones', () => {
  const src = lee('app/actions/teoria.ts');
  const cuerpo = (nombre: string) => {
    const i = src.indexOf(`export async function ${nombre}`);
    const j = src.indexOf('export async function', i + 10);
    return src.slice(i, j === -1 ? undefined : j);
  };
  it('cada acción exige admin y acota por academia', () => {
    for (const f of ['getTeoria', 'saveClaseTeoria', 'copiarSemanaTeoria']) {
      expect(cuerpo(f)).toContain('requireAdmin()');
      expect(cuerpo(f)).toMatch(/organization_id/);
    }
  });
  it('comprueba que el grupo es de teoría y de su academia, y que quien da clase da clase', () => {
    const c = cuerpo('saveClaseTeoria');
    expect(c).toMatch(/\.eq\('organization_id', org\)\.eq\('id', classId\)/);
    expect(c).toContain("g.kind !== 'teoria'");
    expect(c).toContain('daClase(');
    expect(c).toContain('diaSemanaDe(fecha)');
  });
  it('el profesor, el grupo y la fecha no salen de nada que no esté validado', () => {
    const c = cuerpo('saveClaseTeoria');
    expect(c).toContain('esUuid(classId)');
    expect(c).toContain('esFecha(fecha)');
    expect(c).toContain('normalizaTemas(');
  });
  it('lo que va al navegador pasa por fallo() y la lista del avance se pagina', () => {
    expect(src).not.toMatch(/error: [a-z]+\.error\.message/);
    expect(cuerpo('getTeoria')).toContain('paginaCompleta');
  });
  it('el guion SQL deja la tabla con RLS y sin políticas', () => {
    const sql = readFileSync(join(__dirname, '..', 'docs/sql/teoria-cuadrante.sql'), 'utf-8');
    expect(sql).toContain('enable row level security');
    expect(sql).not.toMatch(/create policy/i);
  });
});

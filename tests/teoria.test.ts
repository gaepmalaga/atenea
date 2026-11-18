import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizaTemas, normalizaNotaTeoria, textoTemas, leeTemas, diasDados, temasDeAsignaciones, avanceDeGrupo, type AsignacionTeoria,
} from '../app/lib/teoria';

/** Regla 131 · El cuadrante de teoría: un profesor y los temas de cada clase, programable y editable. */

const quita = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const lee = (ruta: string) => quita(readFileSync(join(__dirname, '..', ruta), 'utf-8').replace(/\r\n/g, '\n'));

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
});

describe('seguridad de las acciones', () => {
  const src = lee('app/actions/teoria.ts');
  const cuerpo = (nombre: string) => {
    const i = src.indexOf(`export async function ${nombre}`);
    const j = src.indexOf('export async function', i + 10);
    return src.slice(i, j === -1 ? undefined : j);
  };
  it('cada acción exige admin y acota por academia', () => {
    for (const f of ['getAvanceTeoria', 'saveClaseTeoria', 'copiarSemanaTeoria']) {
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
    expect(cuerpo('getAvanceTeoria')).toContain('paginaCompleta');
  });
  it('el guion SQL deja la tabla con RLS y sin políticas', () => {
    const sql = readFileSync(join(__dirname, '..', 'docs/sql/teoria-cuadrante.sql'), 'utf-8');
    expect(sql).toContain('enable row level security');
    expect(sql).not.toMatch(/create policy/i);
  });
});

describe('clases dadas (lo que se paga)', () => {
  const c = (profesorId: string, fecha: string, tipo: 'teoria' | 'fisica', classId = 'g1') => ({ profesorId, classId, fecha, tipo });
  it('dos clases de teoría el mismo día (mañana y tarde) son DOS: cada clase suma 1', () => {
    const d = diasDados([c('l', '2026-11-17', 'teoria', 'manana'), c('l', '2026-11-17', 'teoria', 'tarde'), c('l', '2026-11-19', 'teoria', 'manana')], '2026-11-30').get('l')!;
    expect(d.teoria).toBe(3);
  });
  it('la misma clase repetida (mismo identificador y día) cuenta una vez', () => {
    expect(diasDados([c('l', '2026-11-17', 'fisica'), c('l', '2026-11-17', 'fisica')], '2026-11-30').get('l')!.fisica).toBe(1);
  });
  it('el ejemplo del dueño: física de lunes a jueves una al día y teoría martes y jueves = 4 físicas y 2 teorías', () => {
    const fis = ['16', '17', '18', '19'].map((d) => c('lucio', `2026-11-${d}`, 'fisica', `s${d}`));
    const teo = ['17', '19'].map((d) => c('lucio', `2026-11-${d}`, 'teoria', 'tarde'));
    expect(diasDados([...fis, ...teo], '2026-11-30').get('lucio')).toMatchObject({ fisica: 4, teoria: 2 });
  });
  it('teoría y física el mismo día suman cada una: se cobran aparte', () => {
    const d = diasDados([c('l', '2026-11-17', 'teoria'), c('l', '2026-11-17', 'fisica')], '2026-11-30').get('l')!;
    expect([d.teoria, d.fisica]).toEqual([1, 1]);
  });
  it('solo teoría o solo física deja el otro en cero', () => {
    const m = diasDados([c('a', '2026-11-03', 'fisica'), c('b', '2026-11-04', 'teoria')], '2026-11-30');
    expect(m.get('a')).toMatchObject({ teoria: 0, fisica: 1 });
    expect(m.get('b')).toMatchObject({ teoria: 1, fisica: 0 });
  });
  it('hasta hoy (incluido) es dado; lo posterior, programado', () => {
    const d = diasDados([c('l', '2026-11-18', 'teoria'), c('l', '2026-11-19', 'teoria'), c('l', '2026-11-20', 'fisica')], '2026-11-18').get('l')!;
    expect(d).toMatchObject({ teoria: 1, teoriaProgramada: 1, fisica: 0, fisicaProgramada: 1 });
  });
  it('la acción exige admin, acota por academia y descuenta los días sin clase', () => {
    const src = lee('app/actions/profesores.ts');
    const i = src.indexOf('export async function getDiasDados');
    const cuerpo = src.slice(i);
    expect(cuerpo).toContain('requireAdmin()');
    expect(cuerpo.match(/\.eq\('organization_id', org\)/g)!.length).toBeGreaterThanOrEqual(3);
    expect(cuerpo).toContain('class_days_off');
    expect(cuerpo.match(/filter\(\(r\) => !quitados\.has\(/g)).toHaveLength(2);
  });

  it('el calendario lee lo apuntado de SU academia y no ofrece a gabinete ni secretaría como profesores', () => {
    const cal = lee('app/actions/calendario.ts');
    const i = cal.indexOf("from('theory_sessions')");
    expect(i).toBeGreaterThan(-1);
    expect(cal.slice(i, i + 300)).toContain(".eq('organization_id', org)");
    expect(cal).toMatch(/filter\(\(s\) => s\.active !== false && daClase\(/);
  });
  it('la ficha de una clase de teoría del calendario se programa desde ahí', () => {
    const ui = lee('app/components/Admin/components/AdminCalendario.tsx');
    expect(ui).toMatch(/e\.esTeoria && <ProgramaTeoria/);
    expect(ui).toContain('copiarSemanaTeoria');
    const admin = lee('app/components/Admin/AdminView.tsx');
    expect(admin).not.toContain('AdminTeoria');
  });
});

describe('la física de grupo se programa desde el Calendario (regla 132)', () => {
  const cal = lee('app/components/Admin/components/AdminCalendario.tsx');
  const fis = lee('app/components/Admin/components/AdminPhysical.tsx');
  it('«Prep. física» ya no tiene el cuadrante: solo Planificar y Marcas', () => {
    expect(fis).not.toMatch(/from '\.\/fisica\/Cuadrante'/);
    expect(fis).not.toContain("id: 'cuadrante'");
    expect(fis).toContain("id: 'planificar'");
    expect(fis).toContain("id: 'marcas'");
  });
  it('pulsar una sesión de física o de Multi en el calendario abre el editor del cuadrante', () => {
    expect(cal).toMatch(/\(e\.tipo === 'fisica' \|\| e\.tipo === 'suelta'\) && e\.grupoId\) setPeticion\(/);
    expect(cal).toMatch(/<ProgramacionFisica/);
  });
  it('la barra de la semana solo sale en la vista semana', () => {
    expect(cal).toMatch(/barra=\{vista === 'semana'\}/);
  });
  it('«Copiar la semana anterior» copia física y teoría', () => {
    const i = cal.indexOf('async function copiaSemana');
    const cuerpo = cal.slice(i, i + 900);
    expect(cuerpo).toContain('copiarSemanaTeoria(');
    expect(cuerpo).toContain('copiarCuadrante(');
  });
  it('un día «sin clase» se devuelve desde su ficha, sea de teoría o de física', () => {
    expect(cal).toMatch(/e\.tipo === 'sin_clase' && e\.grupoId[\s\S]{0,300}sinClase: false/);
  });
});

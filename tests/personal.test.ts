import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { daClase, etiquetaPuesto, soloQuienDaClase, soloApoyo, PUESTOS } from '../app/lib/personal';

/** Regla 130 · Gabinete y secretaría son del equipo, pero no dan clase. */

const quita = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const lee = (ruta: string) => quita(readFileSync(join(__dirname, '..', ruta), 'utf-8').replace(/\r\n/g, '\n'));

describe('quién da clase', () => {
  it('el puesto de siempre, vacío o escrito a mano cuenta como quien da clase', () => {
    for (const p of ['profesor', 'Profesor/a', '', '   ', null, undefined, 'profesor de teoría', 'preparador físico', 'instructor de artes marciales']) {
      expect(daClase(p)).toBe(true);
    }
  });

  it('gabinete y secretaría no dan clase, aunque cambien las mayúsculas, los acentos o los espacios', () => {
    for (const p of ['gabinete', 'Gabinete', ' GABINETE ', 'secretaria', 'Secretaría', 'secretaria de dirección', 'Administrativa', 'recepción']) {
      expect(daClase(p)).toBe(false);
    }
  });

  it('no confunde un puesto que solo se parece (el error caro es esconder a un profesor)', () => {
    expect(daClase('profesor de gabinete psicotécnico')).toBe(true);
    expect(daClase('preparador de oposiciones')).toBe(true);
  });

  it('los puestos del formulario dicen cuál da clase y cuál no', () => {
    expect(PUESTOS.map((p) => p.valor)).toEqual(['profesor', 'gabinete', 'secretaria']);
    for (const p of PUESTOS) expect(daClase(p.valor)).toBe(p.daClase);
    expect(PUESTOS[0].valor).toBe('profesor');
  });

  it('etiqueta el puesto con su nombre, y lo escrito a mano tal cual', () => {
    expect(etiquetaPuesto('gabinete')).toBe('Gabinete');
    expect(etiquetaPuesto('secretaria')).toBe('Secretaría');
    expect(etiquetaPuesto('profesor')).toBe('Profesor/a');
    expect(etiquetaPuesto('preparador físico')).toBe('preparador físico');
    expect(etiquetaPuesto('')).toBe('Profesor/a');
  });

  it('separa un equipo en quien da clase y quien no', () => {
    const equipo = [
      { name: 'Sofía', role: 'profesor' }, { name: 'Mariana', role: 'gabinete' },
      { name: 'Lucio', role: 'preparador físico' }, { name: 'Sara', role: 'secretaria' },
    ];
    expect(soloQuienDaClase(equipo).map((p) => p.name)).toEqual(['Sofía', 'Lucio']);
    expect(soloApoyo(equipo).map((p) => p.name)).toEqual(['Mariana', 'Sara']);
  });
});

describe('todo lo que ofrece «elegir profesor» deja fuera al equipo de apoyo', () => {
  it('el desplegable del cuadrante', () => {
    const f = lee('app/actions/cuadrante.ts');
    const i = f.indexOf('async function profesoresDe');
    expect(i).toBeGreaterThan(-1);
    // Solo el cuerpo de esa función: hasta su llave de cierre en columna 0.
    const cuerpo = f.slice(i, f.indexOf('\n}\n', i));
    expect(cuerpo).toMatch(/\.filter\(\(p\) => daClase\(/);
  });

  it('el servidor no deja asignar a una sesión a quien no da clase', () => {
    const f = lee('app/actions/cuadrante.ts');
    expect(f).toMatch(/select\('id, role'\)\.eq\('id', c\.valor\.profesorId\)[\s\S]*?!daClase\(prof\.role/);
  });

  it('las clases habituales y los temas', () => {
    const f = lee('app/actions/profesores.ts');
    expect(f).toMatch(/setClaseHabitual[\s\S]*?!daClase\(p\.role/);
    expect(f).toMatch(/setTemasProfesor[\s\S]*?!daClase\(profe\.role/);
  });

  it('el selector de profesores de un grupo y el recuento de «Ajustes»', () => {
    expect(lee('app/components/Admin/components/AdminGroups.tsx')).toMatch(/x\.active && daClase\(x\.role\)/);
    expect(lee('app/components/Admin/components/AcademyIdentity.tsx')).toMatch(/daClase\(s\.role\)/);
  });

  it('la pantalla de profesores cuenta horas y reparte clases solo con quien da clase', () => {
    const f = lee('app/components/Admin/components/AdminProfesores.tsx');
    expect(f).toMatch(/const profesorado = useMemo\(\(\) => soloQuienDaClase/);
    expect(f).toMatch(/const filas = profesorado;/);
    expect(f).toMatch(/const activos = profesorado\.filter/);
    expect(f).toMatch(/<ClasesHabituales habituales=\{habituales\} staff=\{profesorado\}/);
    expect(f).toMatch(/staff=\{profesorado\} onCambio/);
    expect(f).toMatch(/Gabinete y secretaría/);
  });
});

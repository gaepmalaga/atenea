import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { agrupaAlumnos, quienEs, type GrupoPlan } from '../app/lib/planificar';

const quita = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const lee = (rel: string) => quita(readFileSync(join(__dirname, '..', rel), 'utf-8').replace(/\r\n/g, '\n'));

const g: GrupoPlan = { id: 'g', nombre: 'Kappa', esMulti: false, conHorario: true };

describe('Planificar y Marcas llaman al alumno por su nombre', () => {
  it('quienEs: el nombre, y el correo si no lo ha puesto', () => {
    expect(quienEs({ email: 'a@x.es', nombre: ' Lucía ' })).toBe('Lucía');
    expect(quienEs({ email: 'a@x.es', nombre: null })).toBe('a@x.es');
    expect(quienEs({ email: 'a@x.es', nombre: '   ' })).toBe('a@x.es');
    expect(quienEs({ email: 'a@x.es' })).toBe('a@x.es');
  });
  it('la búsqueda encuentra por nombre sin acentos y por correo', () => {
    const al = [
      { id: '1', email: 'uno@x.es', nombre: 'Lucía Fernández', grupos: ['g'] },
      { id: '2', email: 'dos@x.es', nombre: null, grupos: ['g'] },
    ];
    expect(agrupaAlumnos(al, [g], 'lucia')[0].alumnos.map((a) => a.id)).toEqual(['1']);
    expect(agrupaAlumnos(al, [g], 'dos@')[0].alumnos.map((a) => a.id)).toEqual(['2']);
  });
  it('se ordenan por nombre', () => {
    const al = [
      { id: '1', email: 'a@x.es', nombre: 'Zoe', grupos: ['g'] },
      { id: '2', email: 'z@x.es', nombre: 'Ana', grupos: ['g'] },
    ];
    expect(agrupaAlumnos(al, [g])[0].alumnos.map((a) => a.id)).toEqual(['2', '1']);
  });
  it('las dos acciones leen full_name del perfil', () => {
    const a = lee('app/actions/fisica.ts');
    expect(a.match(/from\('profiles'\)\.select\('id, email, full_name, role'\)/g)?.length).toBe(2);
    expect(a.match(/nombre: nombreLimpio\(p\.full_name\)/g)?.length).toBe(2);
  });
});

describe('la lista de Planificar es compacta y se explica', () => {
  const p = lee('app/components/Admin/components/fisica/Planificador.tsx');
  it('cada estado tiene su cuadradito y hay leyenda', () => {
    for (const e of ['sin_planificar', 'por_apuntar', 'al_dia', 'planificada']) expect(p).toMatch(new RegExp(`${e}: '`));
    expect(p).toContain('Leyenda de los cuadraditos');
  });
  it('el grupo cuenta alumnos y la cabecera nombra las columnas', () => {
    expect(p).toMatch(/alumnos\.length\} \{alumnos\.length === 1 \? 'alumno' : 'alumnos'\}/);
    expect(p).toContain('>Sig.<');
  });
  it('«A quiénes» dice alumnos: no parece una cuenta de grupos', () => {
    expect(p).toMatch(/A quiénes \(\$\{destinos\.size\} \$\{destinos\.size === 1 \? 'alumno' : 'alumnos'\}\)/);
  });
  it('ya no pinta las pastillas largas de antes', () => {
    expect(p).not.toContain('ESTILO_ESTADO');
  });
});

describe('Marcas es una tabla con una columna por prueba', () => {
  const m = lee('app/components/Admin/components/fisica/MarcasAcademia.tsx');
  it('tiene las columnas y escribe «Eliminado», no «Elim.»', () => {
    for (const c of ['Agilidad', 'Fuerza', '1.000 m', 'Nota']) expect(m).toContain(`>${c}<`);
    expect(m).toContain("'Eliminado'");
    expect(m).not.toContain("'Elim.'");
  });
  it('dentro de un contenedor con scroll, no desborda la página en el móvil', () => {
    expect(m).toContain('overflow-x-auto');
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { armaCalendario, type GrupoCal } from '../app/lib/calendario';
import { armaCuadranteTeoria, textoCuadranteTeoria, textoTemaConParte, rangoDeSemana, PALETA_GRUPOS } from '../app/lib/cuadrante-teoria';
import { partesDeTema, romano, profesoresDeClase, diasDados, type AsignacionTeoria } from '../app/lib/teoria';
import { normalizaTituloExtra, normalizaAudiencia, normalizaHoraExtra, horasDeExtra } from '../app/lib/extras';

/**
 * EL CUADRANTE SEMANAL DE TEORÍA (regla 142), con la semana de la imagen que
 * Alphapol manda por WhatsApp (23-27 de noviembre): tres grupos (azul, verde,
 * rojo), una clase con DOS profesores, notas como «Simulacro +» y el Curso
 * OSINT como franja de extras.
 */
const raiz = join(__dirname, '..');
const H = (weekdays: number[], startTime: string, endTime: string) => ({ weekdays, startTime, endTime, capacity: 35 });
const G = (id: string, nombre: string, horario: ReturnType<typeof H>): GrupoCal =>
  ({ id, nombre, kind: 'teoria', kindLabel: 'Teoría', llevaPlan: false, esMulti: false, horario, profesorIds: [] });

const GRUPOS = [
  G('lx', 'L-X MAÑANAS', H([1, 3], '10:00', '13:00')),
  G('mj', 'M-J MAÑANAS', H([2, 4], '10:00', '13:00')),
  G('mjt', 'M-J TARDE', H([2, 4], '16:30', '19:30')),
];
const A = (classId: string, fecha: string, profesorId: string, temas: number[], nota: string | null = null, profesor2Id: string | null = null): AsignacionTeoria =>
  ({ classId, fecha, profesorId, profesor2Id, temas, nota });

// La semana de la imagen.
const SEMANA: AsignacionTeoria[] = [
  A('lx', '2026-11-23', 'lucio', [6]),
  A('mj', '2026-11-24', 'morato', [8], 'Organigrama'),
  A('mjt', '2026-11-24', 'lucio', [6]),
  A('lx', '2026-11-25', 'morato', [6], 'Simulacro +', 'enrique'),
  A('mj', '2026-11-26', 'morato', [8], 'Simulacro +'),
  A('mjt', '2026-11-26', 'dorado', [6], 'Simulacro +'),
];
const NOMBRES = new Map([['lucio', 'Lucio'], ['morato', 'Morato'], ['enrique', 'Enrique'], ['dorado', 'Dorado'], ['sergio', 'Sergio']]);

const eventos = armaCalendario({
  desde: '2026-11-23', hasta: '2026-11-29', grupos: GRUPOS, sesiones: [], sinClase: [], profesores: NOMBRES, alumnos: new Map(),
  examen: null, teoria: SEMANA,
  extras: [
    { id: 'x1', fecha: '2026-11-24', inicio: null, fin: null, titulo: 'Curso OSINT', profesorIds: ['sergio'], audiencia: 'ambos', nota: null },
    { id: 'x2', fecha: '2026-11-25', inicio: null, fin: null, titulo: 'Curso OSINT', profesorIds: ['dorado'], audiencia: 'alumnos', nota: null },
  ],
});
const partes = partesDeTema(SEMANA);
const c = armaCuadranteTeoria({ lunes: '2026-11-23', eventos, partes, ordenGrupos: ['lx', 'mj', 'mjt'] });
const dia = (n: number) => c.dias.find((d) => d.titulo.endsWith(` ${n}`))!;

describe('el cuadrante de la semana de la imagen', () => {
  it('de lunes a viernes, con su rango', () => {
    expect(c.dias.map((d) => d.titulo)).toEqual(['Lunes 23', 'Martes 24', 'Miércoles 25', 'Jueves 26', 'Viernes 27']);
    expect(c.rango).toBe('Semana del 23 al 27 de noviembre');
    expect(dia(27).clases).toEqual([]);
  });

  it('cada clase con su hora, grupo, tema, nota y profesor', () => {
    const lunes = dia(23).clases;
    expect(lunes).toHaveLength(1);
    expect(lunes[0]).toMatchObject({ grupo: 'L-X MAÑANAS', hora: '10:00 – 13:00', tema: 'Tema 6 (I)', nota: null, profesores: ['Lucio'] });
    const martes = dia(24).clases;
    expect(martes.map((k) => [k.hora, k.nota, k.tema, k.profesores])).toEqual([
      ['10:00 – 13:00', 'Organigrama', 'Tema 8 (I)', ['Morato']],
      ['16:30 – 19:30', null, 'Tema 6 (I)', ['Lucio']],
    ]);
  });

  it('una clase con dos profesores los lleva a los dos', () => {
    expect(dia(25).clases[0]).toMatchObject({ nota: 'Simulacro +', tema: 'Tema 6 (II)', profesores: ['Morato', 'Enrique'] });
  });

  it('el color es el del grupo: azul, verde y rojo, siempre el mismo', () => {
    const color = (g: string) => dia(24).clases.concat(dia(23).clases).find((k) => k.grupoId === g)!.color;
    expect(color('lx')).toBe(PALETA_GRUPOS[0]);
    expect(color('mj')).toBe(PALETA_GRUPOS[1]);
    expect(color('mjt')).toBe(PALETA_GRUPOS[2]);
  });

  it('las formaciones extras salen arriba de su día, con su profesor', () => {
    expect(dia(24).extras).toEqual([{ id: 'extra|x1', titulo: 'Curso OSINT', hora: null, profesores: ['Sergio'], externos: true }]);
    expect(dia(25).extras[0]).toMatchObject({ profesores: ['Dorado'], externos: false });
    expect(dia(23).extras).toEqual([]);
  });

  it('una clase sin programar se dice, y se cuenta', () => {
    const sin = armaCuadranteTeoria({ lunes: '2026-11-23', eventos: armaCalendario({ desde: '2026-11-23', hasta: '2026-11-29', grupos: GRUPOS, sesiones: [], sinClase: [], profesores: NOMBRES, alumnos: new Map(), examen: null, teoria: [] }), partes: new Map(), ordenGrupos: ['lx'] });
    expect(sin.sinPlanificar).toBe(6);
    expect(sin.dias[0].clases[0]).toMatchObject({ sinPlanificar: true, tema: null, profesores: [] });
    expect(textoCuadranteTeoria(sin)).toContain('Sin programar');
  });

  it('el texto de WhatsApp lleva lo mismo que la imagen', () => {
    const t = textoCuadranteTeoria(c);
    expect(t).toContain('Semana del 23 al 27 de noviembre');
    expect(t).toContain('*Martes 24*');
    expect(t).toContain('Curso OSINT (Sergio)');
    expect(t).toContain('10:00 – 13:00 · Organigrama Tema 8 (I) — Morato');
    expect(t).toContain('Simulacro + Tema 6 (II) — Morato y Enrique');
  });

  it('un día sin clase no sale; el sábado solo si tiene algo', () => {
    const sinClase = armaCalendario({ desde: '2026-11-23', hasta: '2026-11-29', grupos: GRUPOS, sesiones: [], sinClase: [{ classId: 'lx', fecha: '2026-11-23', motivo: 'Festivo' }], profesores: NOMBRES, alumnos: new Map(), examen: null, teoria: [],
      extras: [{ id: 'x3', fecha: '2026-11-28', inicio: '10:00', fin: '12:00', titulo: 'Taller', profesorIds: [], audiencia: 'externos', nota: null }] });
    const q = armaCuadranteTeoria({ lunes: '2026-11-23', eventos: sinClase, partes: new Map(), ordenGrupos: ['lx', 'mj', 'mjt'] });
    expect(q.dias.find((d) => d.fecha === '2026-11-23')!.clases).toEqual([]);
    expect(q.dias.map((d) => d.titulo)).toContain('Sábado 28');
    expect(q.dias.map((d) => d.titulo)).not.toContain('Domingo 29');
    expect(q.rango).toBe('Semana del 23 al 28 de noviembre');
  });
});

describe('(I) y (II): dos clases del mismo tema', () => {
  it('un tema dado en dos clases lleva I y II, por orden de fecha; en una sola, nada', () => {
    const p = partesDeTema([A('g', '2026-11-25', 'x', [6]), A('g', '2026-11-23', 'x', [6, 9]), A('h', '2026-11-23', 'x', [6])]);
    expect(p.get('g|2026-11-23|6')).toBe('I');
    expect(p.get('g|2026-11-25|6')).toBe('II');
    expect(p.has('g|2026-11-23|9')).toBe(false);
    expect(p.has('h|2026-11-23|6')).toBe(false);
  });

  it('números romanos y varios temas en una clase', () => {
    expect([1, 2, 4, 9, 14, 40].map(romano)).toEqual(['I', 'II', 'IV', 'IX', 'XIV', '40']);
    expect(textoTemaConParte([6, 8], (t) => (t === 6 ? 'II' : ''))).toBe('Temas 6 (II) y 8');
    expect(textoTemaConParte([], () => '')).toBeNull();
  });

  it('el rango cambia de mes cuando la semana lo cruza', () => {
    expect(rangoDeSemana('2026-11-30', '2026-12-04')).toBe('Semana del 30 de noviembre al 4 de diciembre');
  });
});

describe('dos profesores en una clase: cada uno suma 1', () => {
  it('los profesores de una clase, sin vacíos ni repetidos', () => {
    expect(profesoresDeClase({ profesorId: 'a', profesor2Id: 'b' })).toEqual(['a', 'b']);
    expect(profesoresDeClase({ profesorId: 'a', profesor2Id: 'a' })).toEqual(['a']);
    expect(profesoresDeClase({ profesorId: null, profesor2Id: 'b' })).toEqual(['b']);
  });

  it('las clases dadas cuentan una por profesor', () => {
    const clases = profesoresDeClase({ profesorId: 'morato', profesor2Id: 'enrique' }).map((profesorId) => ({ profesorId, classId: 'lx', fecha: '2026-11-25', tipo: 'teoria' as const }));
    const d = diasDados(clases, '2026-12-01');
    expect(d.get('morato')?.teoria).toBe(1);
    expect(d.get('enrique')?.teoria).toBe(1);
  });

  it('el pago por clase dada cuenta al segundo profesor', () => {
    const codigo = readFileSync(join(raiz, 'app/actions/profesores.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, '$1');
    expect(codigo).toMatch(/select\('teacher_id, teacher2_id, session_date, class_id'\)/);
    expect(codigo).toMatch(/profesoresDeClase\(\{ profesorId: \(r\.teacher_id as string \| null\) \?\? null, profesor2Id: \(r\.teacher2_id as string \| null\) \?\? null \}\)/);
  });
});

describe('las formaciones extras', () => {
  it('el título y la audiencia se normalizan', () => {
    expect(normalizaTituloExtra('  Curso   OSINT \0 ')).toBe('Curso OSINT');
    expect(normalizaTituloExtra('a')).toBeNull();
    expect(normalizaTituloExtra(null)).toBeNull();
    expect(normalizaAudiencia('externos')).toBe('externos');
    expect(normalizaAudiencia('cualquiera')).toBe('alumnos');
  });

  it('la hora es HH:MM válida; el fin tiene que ir después del inicio', () => {
    expect(normalizaHoraExtra('16:30:00')).toBe('16:30');
    expect(normalizaHoraExtra('25:00')).toBeNull();
    expect(horasDeExtra('10:00', '12:00')).toEqual({ inicio: '10:00', fin: '12:00' });
    expect(horasDeExtra('', '12:00')).toEqual({ inicio: null, fin: null });
    expect(horasDeExtra('12:00', '10:00').error).toMatch(/posterior/);
  });
});

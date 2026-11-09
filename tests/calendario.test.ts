import { describe, it, expect } from 'vitest';
import {
  armaCalendario, filtraEventos, rangoDeVista, mueveVista, fechasEntre, sumaMinutos, queEs, FILTRO_INICIAL,
  type GrupoCal, type SesionCal,
} from '../app/lib/calendario';

/**
 * EL CALENDARIO (regla 105): todo lo que tiene fecha, derivado de lo que ya
 * existe. Si el calendario se inventara algo, contradiría al cuadrante, a
 * Asistencia o al alumno.
 */

const H = (weekdays: number[] | null, startTime: string | null, endTime: string | null, capacity: number | null = null) => ({ weekdays, startTime, endTime, capacity });

const GRUPOS: GrupoCal[] = [
  { id: 'teo', nombre: 'Teoría mañana', kind: 'teoria', kindLabel: 'Teoría', llevaPlan: false, esMulti: false, horario: H([1, 3], '09:00', '11:00', 20), profesorIds: ['marta'] },
  { id: 'alpha', nombre: 'Promo 44 · Alpha', kind: 'fisicas', kindLabel: 'Físicas', llevaPlan: true, esMulti: false, horario: H([1, 3], '08:00', '09:00', 30), profesorIds: ['juan'] },
  { id: 'kappa', nombre: 'Promo 44 · Kappa', kind: 'fisicas', kindLabel: 'Físicas', llevaPlan: true, esMulti: false, horario: H([1, 3], '08:00', '09:00', 30), profesorIds: [] },
  { id: 'multi', nombre: 'Promo 44 · Multi', kind: 'fisicas', kindLabel: 'Físicas', llevaPlan: true, esMulti: true, horario: H(null, null, null), profesorIds: [] },
  { id: 'plan', nombre: 'Físicas (plan común)', kind: 'fisicas', kindLabel: 'Físicas', llevaPlan: true, esMulti: false, horario: H(null, null, null), profesorIds: [] },
];

const S = (id: string, extra: Partial<SesionCal>): SesionCal => ({ id, classId: null, userId: null, fecha: '2026-11-09', inicio: null, titulo: '', profesorId: null, duracionMin: null, ...extra });

const SESIONES: SesionCal[] = [
  S('s1', { classId: 'alpha', titulo: 'Boxeo', profesorId: 'juan' }),
  S('s2', { classId: 'multi', titulo: 'Jiujitsu', inicio: '18:30:00', fecha: '2026-11-10', profesorId: 'lucas' }),
  S('s3', { classId: 'alpha', titulo: 'FLK 5.0', fecha: '2026-11-14', profesorId: 'jose' }), // un sábado añadido
  S('s4', { userId: 'ana', titulo: 'Carrera 5 km', fecha: '2026-11-10' }),
];

const cal = armaCalendario({
  desde: '2026-11-09', hasta: '2026-11-15',
  grupos: GRUPOS,
  sesiones: SESIONES,
  sinClase: [{ classId: 'kappa', fecha: '2026-11-11', motivo: 'Festivo' }],
  profesores: new Map([['marta', 'Marta'], ['juan', 'Juan'], ['jose', 'José'], ['lucas', 'Lucas']]),
  alumnos: new Map([['ana', 'ana@x.es']]),
  cuentas: new Map([['alpha|2026-11-09', { inscritos: 28, faltan: 2, multis: 3 }]]),
  inscritos: new Map([['alpha', 28], ['kappa', 10], ['teo', 18]]),
  examen: '2026-11-14',
});
const de = (id: string) => cal.find((e) => e.id === id);

describe('qué sale en el calendario', () => {
  it('una clase de teoría por cada día de su horario, con sus profesores', () => {
    const teo = cal.filter((e) => e.grupoId === 'teo');
    expect(teo.map((e) => e.fecha)).toEqual(['2026-11-09', '2026-11-11']);
    expect(teo[0]).toMatchObject({ tipo: 'clase', inicio: '09:00', fin: '11:00', titulo: 'Teoría mañana', profesores: ['Marta'] });
  });

  it('en física, la sesión del cuadrante: su título y SU profesor', () => {
    expect(de('ses|s1')).toMatchObject({ tipo: 'fisica', titulo: 'Boxeo', grupo: 'Promo 44 · Alpha', profesores: ['Juan'], inicio: '08:00', fin: '09:00' });
  });

  it('las plazas cuentan faltas y multis', () => {
    expect(de('ses|s1')!.plazas).toMatchObject({ aforo: 30, inscritos: 28, faltan: 2, asisten: 29, libres: 1 });
  });

  it('un día de física sin sesión sale «sin planificar», no vacío', () => {
    const k = cal.find((e) => e.grupoId === 'kappa' && e.fecha === '2026-11-09')!;
    expect(k).toMatchObject({ tipo: 'fisica', sinPlanificar: true, titulo: 'Sin planificar' });
  });

  it('un día sin clase sale como tal, con su motivo, y no como clase', () => {
    const k = cal.filter((e) => e.grupoId === 'kappa' && e.fecha === '2026-11-11');
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ tipo: 'sin_clase', motivo: 'Festivo' });
  });

  it('las sueltas de Multi y las de un día añadido también salen, a su hora', () => {
    expect(de('ses|s2')).toMatchObject({ tipo: 'suelta', inicio: '18:30', fin: '19:30', profesores: ['Lucas'] });
    expect(de('ses|s3')).toMatchObject({ tipo: 'fisica', fecha: '2026-11-14', inicio: '08:00', titulo: 'FLK 5.0' });
  });

  it('el entreno de un alumno y el examen', () => {
    expect(de('ent|s4')).toMatchObject({ tipo: 'entreno', alumno: 'ana@x.es', titulo: 'Carrera 5 km', inicio: null });
    expect(de('examen|2026-11-14')).toMatchObject({ tipo: 'examen', inicio: null });
  });

  it('un grupo sin horario (plan común) y uno Multi no tienen clases propias', () => {
    expect(cal.some((e) => e.grupoId === 'plan')).toBe(false);
    expect(cal.filter((e) => e.grupoId === 'multi').map((e) => e.id)).toEqual(['ses|s2']);
  });

  it('ninguna sesión sale dos veces (la del horario no se repite como «añadida»)', () => {
    expect(new Set(cal.map((e) => e.id)).size).toBe(cal.length);
    expect(cal.filter((e) => e.grupoId === 'alpha' && e.fecha === '2026-11-09')).toHaveLength(1);
  });

  it('ordenado por día y hora, con lo de todo el día primero', () => {
    const sab = cal.filter((e) => e.fecha === '2026-11-14').map((e) => e.tipo);
    expect(sab).toEqual(['examen', 'fisica']);
    const claves = cal.map((e) => `${e.fecha} ${e.inicio ?? ''}`);
    expect([...claves].sort()).toEqual(claves);
  });
});

describe('los filtros', () => {
  it('de entrada se esconden los entrenos de cada alumno, y nada más', () => {
    const v = filtraEventos(cal, FILTRO_INICIAL);
    expect(v.some((e) => e.tipo === 'entreno')).toBe(false);
    expect(v).toHaveLength(cal.length - 1);
  });

  it('por qué (tipo de grupo), por grupo y por profesor', () => {
    const sinTeoria = filtraEventos(cal, { ...FILTRO_INICIAL, ocultosQue: ['teoria'] });
    expect(sinTeoria.some((e) => e.kind === 'teoria')).toBe(false);
    const sinAlpha = filtraEventos(cal, { ...FILTRO_INICIAL, ocultosGrupos: ['alpha'] });
    expect(sinAlpha.some((e) => e.grupoId === 'alpha')).toBe(false);
    const sinJuan = filtraEventos(cal, { ...FILTRO_INICIAL, ocultosProfesores: ['juan'] });
    expect(sinJuan.some((e) => e.id === 'ses|s1')).toBe(false);
    // «Sin profesor» esconde lo que no tiene ninguno, y el examen se queda.
    const sinNadie = filtraEventos(cal, { ...FILTRO_INICIAL, ocultosProfesores: [''] });
    expect(sinNadie.some((e) => e.grupoId === 'kappa' && e.sinPlanificar)).toBe(false);
    // Alpha sin sesión el miércoles lleva a su profesor habitual: se queda.
    expect(sinNadie.some((e) => e.grupoId === 'alpha' && e.sinPlanificar)).toBe(true);
    expect(sinNadie.some((e) => e.tipo === 'examen')).toBe(true);
  });

  it('buscar, sin acentos ni mayúsculas, en título, grupo, profesor o alumno', () => {
    expect(filtraEventos(cal, { ...FILTRO_INICIAL, busca: 'jose' }).map((e) => e.id)).toEqual(['ses|s3']);
    expect(filtraEventos(cal, { ...FILTRO_INICIAL, ocultosQue: [], busca: 'ANA@' }).map((e) => e.id)).toEqual(['ent|s4']);
  });

  it('la categoría «qué» de cada evento', () => {
    expect(queEs({ tipo: 'clase', kind: 'teoria' })).toBe('teoria');
    expect(queEs({ tipo: 'sin_clase', kind: 'fisicas' })).toBe('sin_clase');
    expect(queEs({ tipo: 'entreno', kind: null })).toBe('entreno');
  });
});

describe('las vistas', () => {
  it('día, semana de lunes a domingo, y el mes en semanas enteras', () => {
    expect(rangoDeVista('dia', '2026-11-12')).toEqual({ desde: '2026-11-12', hasta: '2026-11-12' });
    expect(rangoDeVista('semana', '2026-11-12')).toEqual({ desde: '2026-11-09', hasta: '2026-11-15' });
    expect(rangoDeVista('mes', '2026-11-12')).toEqual({ desde: '2026-10-26', hasta: '2026-12-06' });
  });

  it('moverse un día, una semana o un mes, cruzando el año', () => {
    expect(mueveVista('dia', '2026-12-31', 1)).toBe('2027-01-01');
    expect(mueveVista('semana', '2026-11-12', -1)).toBe('2026-11-05');
    expect(mueveVista('mes', '2026-12-15', 1)).toBe('2027-01-01');
    expect(fechasEntre('2026-11-29', '2026-12-01')).toEqual(['2026-11-29', '2026-11-30', '2026-12-01']);
    expect(sumaMinutos('18:30', 90)).toBe('20:00');
  });
});

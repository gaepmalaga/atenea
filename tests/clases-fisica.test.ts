import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { armaClasesAlumno, daClases, clasesPorDia, type GrupoClase, type SesionDeClase } from '../app/lib/clases-fisica';
import { claseFisicaDeHoy, claseDeHoy } from '../app/lib/dia';

/**
 * LAS CLASES DE GRUPO EN EL CALENDARIO DEL ALUMNO (regla 97). Dos capas que no
 * se mezclan: las clases (del horario, con profesor) y los entrenos (suyos).
 * El caso: la semana del 9 al 15 de noviembre de 2026, un lunes a las 07:00.
 */

const LUNES = '2026-11-09';
const DOMINGO = '2026-11-15';
const AHORA = { fecha: LUNES, minutos: 7 * 60 };

const g = (id: string, nombre: string, weekdays: number[] | null, startTime: string | null, esMulti = false): GrupoClase => ({
  id, nombre, esMulti, horario: { weekdays, startTime, endTime: null, capacity: 30 },
});
const KAPPA = g('g-kappa', 'Promo 44 · Kappa', [1, 3], '08:00');
const OMEGA = g('g-omega', 'Promo 44 · Omega', [2, 4], '08:00');
const MULTI = g('g-multi', 'Promo 44 · Multi', null, null, true);
const PROMO43 = g('g-43', 'Promo 43 · Físicas', null, null);

let n = 0;
const ses = (classId: string, fecha: string, title: string, profesorId: string | null = null, horaPropia: string | null = null): SesionDeClase => ({
  id: `s${++n}`, classId, userId: null, fecha, kind: 'otro', title, description: null, durationMin: null, distanceKm: null,
  video: null, position: 0, cargas: [], profesorId, horaPropia,
});
const base = {
  desde: LUNES, hasta: DOMINGO, gruposAjenos: [], uniones: [], sesiones: [], sinClase: [], faltas: [],
  profesores: { jose: 'José Morato', lucas: 'Lucas' }, ahora: AHORA,
};

describe('las clases salen del horario (regla 97)', () => {
  it('Kappa: lunes y miércoles aunque el preparador no haya escrito nada', () => {
    const c = armaClasesAlumno({ ...base, grupos: [KAPPA] });
    expect(c.map((x) => [x.fecha, x.grupo, x.hora, x.sesion])).toEqual([
      ['2026-11-09', 'Kappa', '08:00', null],
      ['2026-11-11', 'Kappa', '08:00', null],
    ]);
  });

  it('con lo escrito en el cuadrante: qué toca y el profesor', () => {
    const c = armaClasesAlumno({ ...base, grupos: [KAPPA], sesiones: [ses('g-kappa', LUNES, 'FLK 5.0', 'jose')] });
    expect(c[0]).toMatchObject({ sesion: { title: 'FLK 5.0' }, profesor: 'José Morato', origen: 'grupo' });
    expect(c[1].sesion).toBeNull();
  });

  it('un grupo sin horario (un plan común) no da clases: sus sesiones son entrenos', () => {
    expect(daClases(PROMO43)).toBe(false);
    const c = armaClasesAlumno({ ...base, grupos: [PROMO43], sesiones: [ses('g-43', LUNES, 'Dominadas: pirámide'), ses('g-43', DOMINGO, 'Descanso')] });
    expect(c).toEqual([]);
  });

  it('una sesión de su grupo fuera de su horario es una clase extra', () => {
    const c = armaClasesAlumno({ ...base, grupos: [KAPPA], sesiones: [ses('g-kappa', '2026-11-13', 'Carrera larga')] });
    expect(c.map((x) => x.fecha)).toEqual(['2026-11-09', '2026-11-11', '2026-11-13']);
  });

  it('lo de fuera del rango no entra', () => {
    const c = armaClasesAlumno({ ...base, desde: '2026-11-10', hasta: '2026-11-10', grupos: [KAPPA] });
    expect(c).toEqual([]);
  });
});

describe('sin clase, faltas y hasta cuándo se puede avisar', () => {
  it('el miércoles festivo se ve como «sin clase», con su motivo, y no se puede avisar', () => {
    const c = armaClasesAlumno({ ...base, grupos: [KAPPA], sinClase: [{ classId: 'g-kappa', fecha: '2026-11-11', motivo: 'Festivo' }] });
    expect(c[1]).toMatchObject({ fecha: '2026-11-11', sinClase: true, motivo: 'Festivo', editable: false });
    expect(c[0].sinClase).toBe(false);
  });

  it('la falta avisada se ve; la clase de hoy a las 08:00 aún se puede avisar a las 07:00', () => {
    const c = armaClasesAlumno({ ...base, grupos: [KAPPA], faltas: [{ classId: 'g-kappa', fecha: LUNES }] });
    expect(c[0]).toMatchObject({ falta: true, editable: true });
  });

  it('empezada la clase, ya no', () => {
    const c = armaClasesAlumno({ ...base, grupos: [KAPPA], ahora: { fecha: LUNES, minutos: 8 * 60 + 5 } });
    expect(c[0].editable).toBe(false);
    expect(c[1].editable).toBe(true);
  });
});

describe('el multi', () => {
  it('ve las sesiones de Multi con su hora propia, y las clases a las que se ha apuntado', () => {
    const c = armaClasesAlumno({
      ...base,
      grupos: [MULTI],
      gruposAjenos: [OMEGA],
      uniones: [{ classId: 'g-omega', fecha: '2026-11-12' }],
      sesiones: [ses('g-multi', '2026-11-10', 'Jiujitsu', 'lucas', '18:30'), ses('g-omega', '2026-11-12', 'FLK 5.1')],
    });
    expect(c.map((x) => [x.fecha, x.grupo, x.hora, x.origen])).toEqual([
      ['2026-11-10', 'Multi', '18:30', 'grupo'],
      ['2026-11-12', 'Omega', '08:00', 'multi'],
    ]);
    // Su propia sesión de Multi no tiene horario fijo: no hay falta que avisar.
    expect(c[0].editable).toBe(false);
    // De la de Omega se puede quitar mientras no empiece.
    expect(c[1].editable).toBe(true);
    expect(c[1].sesion?.title).toBe('FLK 5.1');
  });

  it('una falta no cuenta en la clase de otro grupo: ahí se quita, no avisa', () => {
    const c = armaClasesAlumno({ ...base, grupos: [], gruposAjenos: [OMEGA], uniones: [{ classId: 'g-omega', fecha: '2026-11-10' }], faltas: [{ classId: 'g-omega', fecha: '2026-11-10' }] });
    expect(c[0]).toMatchObject({ origen: 'multi', falta: false });
  });

  it('por día, y ordenadas por hora', () => {
    const c = armaClasesAlumno({
      ...base, grupos: [KAPPA, MULTI], sesiones: [ses('g-multi', LUNES, 'Boxeo', null, '18:30')],
    });
    expect(clasesPorDia(c).get(LUNES)?.map((x) => x.hora)).toEqual(['08:00', '18:30']);
  });
});

describe('una semana sin publicar es un borrador (regla 98)', () => {
  const datos = {
    ...base,
    grupos: [KAPPA, MULTI],
    sesiones: [ses('g-kappa', LUNES, 'FLK 5.0', 'jose'), ses('g-multi', '2026-11-10', 'Jiujitsu', 'lucas', '18:30')],
    sinClase: [{ classId: 'g-kappa', fecha: '2026-11-11', motivo: 'Festivo' }],
  };

  it('sin publicar: el alumno ve su clase y su hora, pero ni qué toca, ni el profesor, ni el festivo, ni la sesión suelta de Multi', () => {
    const c = armaClasesAlumno({ ...datos, publicadas: new Set() });
    expect(c.map((x) => [x.fecha, x.grupo, x.hora, x.sesion, x.profesor, x.sinClase])).toEqual([
      ['2026-11-09', 'Kappa', '08:00', null, null, false],
      ['2026-11-11', 'Kappa', '08:00', null, null, false],
    ]);
  });

  it('publicada: todo', () => {
    const c = armaClasesAlumno({ ...datos, publicadas: new Set([LUNES]) });
    expect(c.map((x) => [x.fecha, x.grupo, x.sesion?.title ?? null, x.profesor, x.sinClase])).toEqual([
      ['2026-11-09', 'Kappa', 'FLK 5.0', 'José Morato', false],
      ['2026-11-10', 'Multi', 'Jiujitsu', 'Lucas', false],
      ['2026-11-11', 'Kappa', null, null, true],
    ]);
  });

  it('la que se publica es la semana, no el día: la siguiente sigue en borrador', () => {
    const c = armaClasesAlumno({ ...datos, hasta: '2026-11-16', sesiones: [...datos.sesiones, ses('g-kappa', '2026-11-16', 'Boxeo')], publicadas: new Set([LUNES]) });
    expect(c.find((x) => x.fecha === '2026-11-16')?.sesion).toBeNull();
  });

  it('sin el dato de qué está publicado (el preparador), se ve todo', () => {
    expect(armaClasesAlumno({ ...datos }).find((x) => x.fecha === LUNES)?.sesion?.title).toBe('FLK 5.0');
  });
});

describe('Inicio: la clase de física de hoy', () => {
  const c = armaClasesAlumno({ ...base, grupos: [KAPPA], sesiones: [ses('g-kappa', LUNES, 'FLK 5.0', 'jose')] });

  it('dice el grupo, la hora, qué toca y con quién', () => {
    expect(claseFisicaDeHoy(c, LUNES)).toEqual({ grupo: 'Kappa', hora: '08:00', titulo: 'FLK 5.0', profesor: 'José Morato', sinClase: false, motivo: null, falta: false });
  });

  it('un día sin clase también se dice; sin nada ese día, no hay fila', () => {
    const off = armaClasesAlumno({ ...base, grupos: [KAPPA], sinClase: [{ classId: 'g-kappa', fecha: LUNES, motivo: 'Festivo' }] });
    expect(claseFisicaDeHoy(off, LUNES)).toMatchObject({ sinClase: true, motivo: 'Festivo' });
    expect(claseFisicaDeHoy(c, '2026-11-10')).toBeNull();
  });

  it('la clase de teoría de hoy no cuenta si está quitada', () => {
    const clases = [{ classId: 'g1', nombre: 'Teoría', sesiones: [{ fecha: LUNES, hora: '10:00', falta: false, sinClase: true }] }];
    expect(claseDeHoy(clases, LUNES)).toBeNull();
  });
});

describe('las acciones (guardas estáticas)', () => {
  const lee = (f: string) => readFileSync(join(__dirname, '..', 'app', 'actions', f), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const cuerpo = (src: string, nombre: string) => {
    const i = src.indexOf(`export async function ${nombre}`);
    const j = src.indexOf('\nexport async function', i + 10);
    return src.slice(i, j === -1 ? undefined : j);
  };
  const fisica = lee('fisica.ts');
  const asistencia = lee('asistencia.ts');

  it('los entrenos del alumno no traen las clases de grupo: solo lo suyo y los planes comunes', () => {
    const c = cuerpo(fisica, 'getMiFisica');
    // `true`: el alumno solo ve lo publicado (regla 98).
    expect(c).toContain('clasesDelAlumno(auth.user.id, org, desde, hasta, true)');
    expect(c).toContain('filtroAlumno(auth.user.id, gruposPlan)');
    expect(c).not.toMatch(/const filtro = filtroAlumno\(auth\.user\.id, grupos\)/);
  });

  it('las clases son solo de grupos de física con horario o de Multi, y respetan «sin clase»', () => {
    const c = fisica.slice(fisica.indexOf('async function clasesDelAlumno'), fisica.indexOf('async function correos'));
    expect(c).toContain("g.kind === 'fisicas'");
    expect(c).toContain('.filter(daClases)');
    expect(c).toContain("from('class_days_off')");
    expect(c).toMatch(/\.eq\('user_id', userId\)/);
  });

  it('en «Planificar», la vista de un alumno trae sus clases aparte', () => {
    // `false`: el preparador ve también lo que aún no ha publicado.
    expect(cuerpo(fisica, 'getPlanificador')).toContain('clasesDelAlumno(destino.id, org, desde, hasta, false)');
  });

  it('un multi puede apuntar la sesión de la clase a la que se apuntó, y solo esa', () => {
    const c = cuerpo(fisica, 'setMiApunte');
    expect(c).toContain("from('class_session_joins')");
    expect(c).toMatch(/\.eq\('user_id', auth\.user\.id\)\.eq\('session_date'/);
  });

  it('«Mis clases» deja la física a su calendario si la academia la lleva aquí', () => {
    const c = cuerpo(asistencia, 'getMisClases');
    expect(c).toContain("requireModule('training')");
    expect(c).toContain("g.kind !== 'fisicas'");
    expect(c).toContain("from('class_days_off')");
  });

  it('la asistencia de la academia no cuenta un día quitado', () => {
    expect(cuerpo(asistencia, 'getAsistenciaAcademia')).toContain('if (quitadas.has(');
  });
});
